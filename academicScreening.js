const data = require('./data');
const risk = require('./riskEngine');
const { calculateTrajectory, detectEarlyWarning } = require('./trajectoryEngine');
const TARGET_FINAL_GRADE = 60;

function screenStudent(studentId, currentWeek) {
  const student = data.students.find((item) => item.id === studentId);
  if (!student) return { error: 'Student not found' };
  if (!Number.isInteger(currentWeek) || currentWeek < 1 || currentWeek > 14) return { error: 'Week must be between 1 and 14' };
  const courses = Object.entries(student.gradesByCourse).map(([courseName, allGrades]) => {
    // Demo data has one grade per week; never read future results.
    const grades = allGrades.slice(0, currentWeek);
    const trajectory = calculateTrajectory(grades);
    const earlyWarning = detectEarlyWarning(grades, currentWeek);
    const riskScore = grades.length ? risk.calculateRiskScore({ grades,
      attendance: student.attendanceByCourse[courseName], missedDeadlines: student.missedDeadlines[courseName] }) : 0;
    const riskLevel = risk.getRiskLevel(riskScore);
    const projectedFinal = grades.length ? risk.predictFinalGrade(grades) : null;
    const significantDecline = ['MODERATE', 'SEVERE'].includes(trajectory.severity);
    const strongEvidence = grades.length >= 4 && (significantDecline || grades.slice(-3).every((grade) => grade < TARGET_FINAL_GRADE));
    let status = 'NORMAL';
    if (currentWeek <= 2) {
      if (earlyWarning.warning) status = 'WATCHLIST';
    } else if (currentWeek >= 4 && (['HIGH', 'CRITICAL'].includes(riskLevel)
      || (projectedFinal < TARGET_FINAL_GRADE && strongEvidence)
      || (grades.length >= 4 && trajectory.severity === 'SEVERE'))) {
      status = 'INTERVENTION_REQUIRED';
    } else if (riskLevel !== 'LOW' || significantDecline || earlyWarning.warning
      || (projectedFinal !== null && projectedFinal < TARGET_FINAL_GRADE + 5)) {
      status = 'WATCHLIST';
    }
    return { courseName, grades, riskScore, riskLevel, projectedFinal, trajectory, earlyWarning, status,
      significantDecline, needsAIAnalysis: currentWeek >= 3 && (status === 'INTERVENTION_REQUIRED' || (status === 'WATCHLIST' && significantDecline)),
      currentAverage: grades.length ? risk.calculateAverage(grades) : null,
      recentTrend: risk.calculateRecentTrend(grades), projectedFinalGrade: projectedFinal,
      requiredAverage: grades.length ? risk.calculateRequiredAverage(grades, TARGET_FINAL_GRADE) : null };
  });
  if (!courses.length) return { error: 'Student has no courses' };
  const priority = { NORMAL: 0, WATCHLIST: 1, INTERVENTION_REQUIRED: 2 };
  courses.sort((a, b) => priority[b.status] - priority[a.status] || b.riskScore - a.riskScore);
  const main = courses[0];
  const screening = { studentId, name: student.name, currentWeek,
    riskScore: Math.max(...courses.map((course) => course.riskScore)),
    riskLevel: risk.getRiskLevel(Math.max(...courses.map((course) => course.riskScore))),
    projectedFinal: main.projectedFinal, trajectory: main.trajectory, earlyWarning: main.earlyWarning,
    status: main.status, needsAIAnalysis: courses.some((course) => course.needsAIAnalysis),
    canIntervene: currentWeek >= 4, mainCourse: main.courseName, courses,
    attendance: { attendanceByCourse: student.attendanceByCourse },
    deadlines: { missedDeadlines: student.missedDeadlines, upcomingDeadlines: student.upcomingDeadlines },
    topics: { weakTopics: student.weakTopics } };
  data.screenings[studentId] = screening;
  return screening;
}

function recordIntervention(studentId, week, type, riskBefore, note, plan) {
  const student = data.students.find((item) => item.id === studentId);
  if (!student) return null;
  const existing = student.interventionHistory.find((item) => item.week === week && item.type === type);
  if (existing) return existing;
  const screening = screenStudent(studentId, week);
  const record = { week, type, riskBefore, note, plan, courseName: screening.mainCourse,
    trajectoryBefore: screening.trajectory, gradesBefore: [...screening.courses[0].grades] };
  student.interventionHistory.push(record);
  return record;
}

function evaluateInterventionResponse(studentId, currentWeek) {
  const screening = screenStudent(studentId, currentWeek);
  if (screening.error) return screening;
  const student = data.students.find((item) => item.id === studentId);
  const latest = student.interventionHistory.filter((item) => item.week <= currentWeek).at(-1);
  const base = { studentId, hasPreviousIntervention: Boolean(latest), response: null,
    riskBefore: latest?.riskBefore ?? null, riskNow: screening.riskScore };
  if (!latest) return { ...base, recommendation: 'No previous intervention.' };
  const course = screening.courses.find((item) => item.courseName === latest.courseName) || screening.courses[0];
  const baselineCount = latest.gradesBefore?.length ?? latest.week;
  if (currentWeek <= latest.week || course.grades.length <= baselineCount) {
    return { ...base, recommendation: 'Wait for new results before evaluating the plan.' };
  }
  const change = screening.riskScore - latest.riskBefore;
  const previousGrade = latest.gradesBefore?.at(-1) ?? course.grades[baselineCount - 1];
  const responseTrajectory = calculateTrajectory([previousGrade, ...course.grades.slice(baselineCount)]);
  let response = 'NO_CHANGE';
  if ((change <= -3 && responseTrajectory.direction !== 'DECLINING')
    || (change < 3 && responseTrajectory.slope >= 3)) response = 'IMPROVING';
  if (change >= 3 || responseTrajectory.slope <= -3) response = 'WORSENING';
  const recommendations = { IMPROVING: 'Continue current plan and monitor.',
    NO_CHANGE: 'Review the intervention plan.', WORSENING: 'Escalate support. Consider teacher or advisor contact.' };
  return { ...base, response, trajectoryBefore: latest.trajectoryBefore, trajectoryNow: course.trajectory, responseTrajectory,
    recommendation: recommendations[response] };
}

module.exports = { screenStudent, recordIntervention, evaluateInterventionResponse };
