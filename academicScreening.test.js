const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const data = require('./data');
const { calculateTrajectory, detectEarlyWarning } = require('./trajectoryEngine');
const { screenStudent, recordIntervention, evaluateInterventionResponse } = require('./academicScreening');
const tools = require('./tools');
const { executeTool } = require('./toolExecutor');
const { runMockAgent } = require('./mockAgent');
const originalStudents = structuredClone(data.students);

beforeEach(() => {
  data.students.splice(0, data.students.length, ...structuredClone(originalStudents));
  data.notifications.length = 0;
  data.followUps.length = 0;
  for (const key of Object.keys(data.screenings)) delete data.screenings[key];
});

function run(options = {}) {
  const log = console.log;
  console.log = () => {};
  try { return runMockAgent('Test academic screening', options); }
  finally { console.log = log; }
}

test('trajectory weighs recent results and resists a single bad grade', () => {
  assert.equal(calculateTrajectory([]).severity, 'NONE');
  assert.equal(calculateTrajectory([80]).direction, 'STABLE');
  assert.equal(calculateTrajectory([88, 84, 80, 76, 72]).severity, 'MODERATE');
  assert.equal(calculateTrajectory([90, 89, 88, 30]).severity, 'MILD');
  assert.equal(calculateTrajectory([90, 80, 70, 60]).severity, 'SEVERE');
  assert.ok(calculateTrajectory([60, 60, 60, 90]).slope > calculateTrajectory([60, 90, 90, 90]).slope);
  assert.equal(calculateTrajectory([60, 70, 80]).direction, 'IMPROVING');
});

test('stages exclude future grades and defer strong intervention claims', () => {
  assert.equal(detectEarlyWarning([90, 80, 70], 2).warning, false);
  assert.equal(detectEarlyWarning([90, 40], 2).warning, true);
  assert.equal(detectEarlyWarning([35, 38], 2).warning, true);
  assert.equal(detectEarlyWarning([90, 80, 70], 3).warning, true);
  for (const week of [1, 2, 3]) {
    for (const student of data.students) {
      const screening = screenStudent(student.id, week);
      assert.notEqual(screening.status, 'INTERVENTION_REQUIRED');
      assert.equal(screening.canIntervene, false);
      assert.equal(screening.courses[0].grades.length, week);
      if (week <= 2) assert.equal(screening.needsAIAnalysis, false);
    }
  }
  assert.equal(screenStudent('s1', 3).status, 'WATCHLIST');
  assert.equal(screenStudent('s1', 4).status, 'INTERVENTION_REQUIRED');
  assert.ok(screenStudent('missing', 5).error);
  assert.ok(screenStudent('s1', 0).error);
});

test('demo includes low-risk decline without deep analysis for normal students', () => {
  const state = run();
  assert.equal(state.finalFindings.status, 'complete');
  assert.equal(state.screenings.s3.riskLevel, 'LOW');
  assert.equal(state.screenings.s3.status, 'WATCHLIST');
  assert.equal(state.screenings.s2.status, 'NORMAL');
  assert.equal(state.analyzedStudents.length, 3);
  assert.equal(state.finalFindings.interventions, 2);
  assert.equal(state.finalFindings.followUps, 3);
  assert.equal(state.step, 9);
  assert.deepEqual(state.toolResults.filter((entry) => entry.decision.toolName.startsWith('get')).map((entry) => entry.decision.toolName), ['getStudents']);
  const again = run();
  assert.equal(again.finalFindings.interventions, 0);
  assert.equal(again.finalFindings.followUps, 0);
  assert.equal(data.notifications.length, 3);
  assert.equal(data.students[0].interventionHistory.length, 1);
});

test('approval remains required and resumes without repeating completed actions', () => {
  const state = run({ autoApprove: false });
  assert.equal(state.finalFindings.status, 'waiting');
  assert.equal(data.notifications.length, 0);
  assert.equal(data.followUps.length, 0);
  assert.equal(executeTool('notifyStudent', { studentId: 's4', message: 'Check in' }).requiresApproval, true);
  state.pendingActions[0].status = 'approved';
  run({ state, autoApprove: false });
  assert.equal(data.notifications.length, 1);
  assert.equal(data.students[3].interventionHistory.length, 1);
  assert.equal(state.pendingActions[0].tool, 'scheduleFollowUp');
});

test('cooldown blocks repeats, expires after seven days, and permits critical escalation', () => {
  screenStudent('s3', 5);
  assert.ok(tools.notifyStudent('s3', 'First').notification);
  assert.equal(tools.notifyStudent('s3', 'Changed wording').skipped, true);
  data.notifications[0].sentAt = new Date(Date.now() - 7 * 86400000 - 1).toISOString();
  assert.ok(tools.notifyStudent('s3', 'Weekly check').notification);
  data.students[2].gradesByCourse['Database Systems'] = [50, 40, 30, 20, 10];
  assert.ok(tools.notifyStudent('s3', 'Critical escalation').notification);
  assert.equal(tools.notifyStudent('s3', 'Repeated critical escalation').skipped, true);
});

test('follow-up waits for new evidence and detects improvement despite older decline', () => {
  screenStudent('s1', 4);
  tools.createStudyPlan('s1');
  assert.equal(evaluateInterventionResponse('s1', 4).response, null);
  assert.equal(evaluateInterventionResponse('s1', 5).response, 'WORSENING');
  data.students[0].gradesByCourse['Database Systems'][4] = 85;
  assert.equal(evaluateInterventionResponse('s1', 5).response, 'IMPROVING');
  screenStudent('s4', 5);
  tools.createStudyPlan('s4');
  assert.equal(evaluateInterventionResponse('s4', 6).response, null);
});

test('unchanged results recommend review; future runs adapt failed interventions', () => {
  const amina = data.students[1];
  amina.gradesByCourse['Database Systems'] = [85, 85, 85, 85, 85];
  recordIntervention('s2', 4, 'STUDY_PLAN', 0, 'Previous plan');
  assert.equal(evaluateInterventionResponse('s2', 5).response, 'NO_CHANGE');
  const state = run({ currentWeek: 4 });
  run({ state, currentWeek: 5 });
  const history = data.students[0].interventionHistory;
  assert.equal(history.length, 2);
  assert.match(history[1].note, /Adapted plan/);
  assert.match(history[1].plan.steps[0], /Escalate support/);
  assert.equal(state.previousRuns.length, 1);
  assert.ok(state.step <= 20);
});

test('a declining course is not hidden by a higher-risk stable course', () => {
  const student = data.students[1];
  student.gradesByCourse = { Stable: [75, 75, 75, 75, 75], Declining: [98, 95, 92, 89, 86] };
  student.attendanceByCourse = { Stable: 40, Declining: 100 };
  student.missedDeadlines = { Stable: 0, Declining: 0 };
  const screening = screenStudent(student.id, 5);
  assert.equal(screening.status, 'WATCHLIST');
  assert.equal(screening.mainCourse, 'Declining');
  assert.equal(screening.riskScore, 20);
});

test('missing grades do not produce NaN or unsupported interventions', () => {
  data.students[1].gradesByCourse = { Empty: [] };
  const screening = screenStudent('s2', 4);
  assert.equal(screening.projectedFinal, null);
  assert.equal(screening.needsAIAnalysis, false);
  assert.equal(screening.riskScore, 0);
});

test('WATCHLIST receives only soft prevention; NORMAL receives no actions', () => {
  const state = run();
  const actions = state.completedActions.filter((action) => action.studentId === 's3');
  assert.deepEqual(actions.map((action) => action.tool), ['notifyStudent', 'scheduleFollowUp']);
  assert.equal(data.followUps.find((item) => item.studentId === 's3').days, 7);
  assert.equal(data.students[2].interventionHistory.length, 0);
  assert.equal(tools.createStudyPlan('s3').skipped, true);
  assert.equal(tools.createStudyPlan('s2').skipped, true);
  assert.equal(state.completedActions.some((action) => action.studentId === 's2'), false);
  assert.equal(state.analyzedStudents.includes('s2'), false);
  const message = data.notifications.find((item) => item.studentId === 's3').message;
  assert.doesNotMatch(message, /план|преподавател|консультант|advisor|escalat/i);
  assert.match(message, /7 дней/);
});

test('previous failed intervention cannot override NORMAL or WATCHLIST status', () => {
  recordIntervention('s3', 4, 'STUDY_PLAN', 0, 'Old plan');
  recordIntervention('s2', 4, 'STUDY_PLAN', 0, 'Old plan');
  const state = run();
  assert.equal(state.screenings.s3.status, 'WATCHLIST');
  assert.equal(data.students[2].interventionHistory.length, 1);
  assert.equal(state.completedActions.some((action) => action.studentId === 's2'), false);
  assert.doesNotMatch(state.finalFindings.students.find((item) => item.name === 'Alina').intervention, /преподавател|advisor|escalat/i);
});

test('WATCHLIST improvement stops actions; continued decline stays preventive', () => {
  // A separate stable MEDIUM-risk course keeps the student on WATCHLIST.
  data.students[2].gradesByCourse.Other = [65, 65, 65, 65, 65, 65];
  data.students[2].attendanceByCourse.Other = 50;
  data.students[2].missedDeadlines.Other = 2;
  const state = run({ currentWeek: 4 });
  run({ state, currentWeek: 5 });
  assert.equal(state.screenings.s3.status, 'WATCHLIST');
  assert.equal(data.students[2].interventionHistory.length, 0);
  assert.equal(data.followUps.filter((item) => item.studentId === 's3' && !item.completed).length, 1);
  data.students[2].gradesByCourse['Database Systems'].push(74);
  data.students[2].gradesByCourse['Программирование'].push(87);
  run({ state, currentWeek: 6 });
  assert.equal(state.screenings.s3.status, 'WATCHLIST');
  assert.equal(state.followUpResults.find((item) => item.studentId === 's3').response, 'IMPROVING');
  assert.equal(state.completedActions.some((action) => action.studentId === 's3'), false);
  assert.equal(data.followUps.some((item) => item.studentId === 's3' && !item.completed), false);
});

test('WATCHLIST upgrade enables full intervention through screening', () => {
  const state = run();
  data.students[2].gradesByCourse['Database Systems'].push(40);
  run({ state, currentWeek: 6 });
  assert.equal(state.screenings.s3.status, 'INTERVENTION_REQUIRED');
  assert.ok(state.completedActions.some((action) => action.studentId === 's3' && action.tool === 'createStudyPlan'));
  assert.equal(data.students[2].interventionHistory.length, 1);
});
