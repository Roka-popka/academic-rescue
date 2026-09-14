const { executeTool } = require('./toolExecutor');
const { createAgentState } = require('./agentState');
const { agentTools } = require('./agentTools');
const { systemPrompt } = require('./agentPrompt');
const data = require('./data');
const { screenStudent, evaluateInterventionResponse } = require('./academicScreening');
const MAX_STEPS = 20;
const riskNames = { LOW: 'низкий', MEDIUM: 'средний', HIGH: 'высокий', CRITICAL: 'критический' };

function getPriorityStudents(state) {
  return getKnownDetails(state)
    .filter((item) => item.screening.status !== 'NORMAL')
    .sort((a, b) => b.risk.riskScore - a.risk.riskScore);
}

function getReasons(item) {
  const course = item.risk.courses[0];
  const reasons = [];
  if (course.projectedFinalGrade !== null && course.projectedFinalGrade < 60) reasons.push(`прогноз ${course.projectedFinalGrade.toFixed(2)} ниже 60`);
  if (course.currentAverage !== null && course.currentAverage < 60) reasons.push('средний балл ниже 60');
  if (course.recentTrend < 0) reasons.push('оценки снижаются');
  if (item.attendance && item.attendance.attendanceByCourse[course.courseName] < 75) reasons.push('низкая посещаемость');
  if (item.deadlines && item.deadlines.missedDeadlines[course.courseName] > 0) reasons.push('есть пропущенные сроки сдачи');
  return reasons;
}

function chooseNextTool(state) {
  // Каждый раз заново смотрим, что уже известно и чего ещё не хватает.
  if (!state.knownStudents) return { toolName: 'getStudents', args: {}, reason: 'получить список студентов', saveAs: 'students' };
  for (const item of getPriorityStudents(state)) {
    const studentId = item.id;
    const call = (toolName, saveAs, reason, args = { studentId }) => ({ toolName, args, studentId, saveAs, reason: `${item.name}: ${reason}` });
    // WATCHLIST gets soft prevention only, even after an earlier study plan.
    if (item.screening.status === 'WATCHLIST') {
      if (item.response?.response === 'IMPROVING') continue;
      if (!item.notification) return call('notifyStudent', 'notification', 'подготовить мягкое предупреждение', {
        studentId, message: `${item.name}, давайте обратим внимание на последние результаты по курсу «${item.risk.mainCourse}». Попробуйте уделить немного времени повторению сложных тем. Проверим прогресс через 7 дней.` });
      if (!item.followUp) return call('scheduleFollowUp', 'followUp', 'проверить прогресс через неделю', { studentId, days: 7 });
      continue;
    }
    const adapt = ['NO_CHANGE', 'WORSENING'].includes(item.response?.response);
    const needsPlan = item.screening.canIntervene && item.screening.status === 'INTERVENTION_REQUIRED';
    if (needsPlan && !item.plan) return call('createStudyPlan', 'plan', adapt ? 'ADAPT: пересмотреть план по новым результатам' : 'подготовить план помощи');
    if (!item.notification) {
      const message = item.plan
        ? `${item.name}, по курсу «${item.risk.mainCourse}» предлагаем план: ${item.plan.steps.join(' ')}`
        : `${item.name}, давайте обсудим последние результаты по курсу «${item.risk.mainCourse}». ${item.screening.earlyWarning.reason || 'Продолжим наблюдать за результатами.'}`;
      return call('notifyStudent', 'notification', 'сохранить сообщение с планом', { studentId, message });
    }
    // При критическом риске проверяем раньше, чем при высоком.
    if (!item.followUp) return call('scheduleFollowUp', 'followUp', 'назначить повторную проверку', {
      studentId, days: item.screening.status === 'INTERVENTION_REQUIRED' ? (item.risk.riskLevel === 'CRITICAL' ? 1 : 3) : 7 });
  }
  // При среднем риске не готовим полный план. Уточняем только неясную причину.
  for (const item of getKnownDetails(state).filter((student) => student.screening.needsAIAnalysis && student.risk.riskLevel === 'MEDIUM')) {
    if (getReasons(item).length > 0) continue;
    if (!item.attendance) return { toolName: 'getAttendance', args: { studentId: item.id }, studentId: item.id, saveAs: 'attendance', reason: `${item.name}: кратко уточнить причину среднего риска` };
    if (!item.deadlines) return { toolName: 'getDeadlines', args: { studentId: item.id }, studentId: item.id, saveAs: 'deadlines', reason: `${item.name}: проверить пропущенные сроки` };
  }
  return null;
}

function summarizeResult(decision, result) {
  if (result.error) return result.error;
  if (result.skipped) return result.reason || 'Existing action reused; no duplicate created.';
  switch (decision.toolName) {
    case 'getStudents': return `студентов найдено: ${result.students.length}`;
    case 'calculateStudentRisk': return `риск ${riskNames[result.riskLevel]} — ${result.riskScore}/100; проблемный курс: ${result.mainCourse}`;
    case 'getAttendance': return 'получена посещаемость по курсам';
    case 'getDeadlines': return `получены пропущенные сроки и ближайшие работы: ${result.upcomingDeadlines.length}`;
    case 'getWeakTopics': return `темы: ${Object.values(result.weakTopics).flat().join(', ') || 'не указаны'}`;
    case 'getCourseMaterials': return `материалов найдено: ${result.materials.length}; тем без материалов: ${result.missingTopics.length}`;
    case 'createStudyPlan': return `создан план, пунктов: ${result.steps.length}`;
    case 'notifyStudent': return 'сообщение поддержки сохранено локально, без отправки';
    case 'scheduleFollowUp': return `проверка через ${result.followUp.days} дн. записана в памяти`;
    default: return 'данные получены';
  }
}


// Собираем удобный вид памяти из сохранённых ответов, не копируя их в состояние.
function getKnownDetails(state) {
  return (state.knownStudents || []).map((student) => {
    const screening = state.screenings[student.id];
    const item = { ...student, screening, risk: screening, attendance: screening.attendance,
      deadlines: screening.deadlines, topics: screening.topics,
      response: state.followUpResults.find((result) => result.studentId === student.id) };
    for (const entry of state.toolResults) {
      if (entry.decision.studentId === student.id && !entry.result.error) item[entry.decision.saveAs] = entry.result;
    }
    return item;
  });
}

function buildFinalFindings(state, status) {
  const risky = getKnownDetails(state)
    .sort((a, b) => b.risk.riskScore - a.risk.riskScore);
  return {
    status,
    checked: state.analyzedStudents.length,
    scanned: state.knownStudents?.length || 0,
    interventions: state.completedActions.filter((action) => action.tool === 'createStudyPlan').length,
    followUps: state.completedActions.filter((action) => action.tool === 'scheduleFollowUp').length,
    students: risky.map((item) => ({
      name: item.name,
      status: item.screening.status,
      trajectory: item.screening.trajectory,
      needsAIAnalysis: item.screening.needsAIAnalysis,
      preventionStopped: item.screening.status === 'WATCHLIST' && item.response?.response === 'IMPROVING',
      riskScore: item.risk.riskScore,
      riskLevel: item.risk.riskLevel,
      projection: item.risk.courses[0].projectedFinalGrade,
      reasons: getReasons(item),
      intervention: item.plan ? item.plan.steps.join(' ') : item.response?.response === 'IMPROVING' || item.screening.status === 'NORMAL'
        ? 'Дополнительные действия не нужны.' : 'Мягкое предупреждение и проверка прогресса через 7 дней.',
      planPrepared: Boolean(item.plan),
      messagePrepared: Boolean(item.notification) || state.pendingActions.some((action) => action.args.studentId === item.id && action.tool === 'notifyStudent'),
      messageCompleted: Boolean(item.notification?.notification),
      followUpDays: item.followUp ? item.followUp.followUp.days : null,
      recommendedDays: item.risk.riskLevel === 'CRITICAL' ? 1 : item.risk.riskLevel === 'HIGH' ? 3 : 7,
    })),
  };
}

function printFinalAnswer(state) {
  const report = state.finalFindings;
  console.log('\nAcademic Screening Summary');
  if (state.currentWeek <= 2) console.log('Baseline collection: risk scores are provisional; only soft anomaly warnings are enabled.');
  console.log(`Normal: ${report.students.filter((item) => item.status === 'NORMAL').length}`);
  console.log(`Watchlist: ${report.students.filter((item) => item.status === 'WATCHLIST').length}`);
  console.log(`Intervention Required: ${report.students.filter((item) => item.status === 'INTERVENTION_REQUIRED').length}`);
  console.log('\nStudent | Risk | Trajectory | Status | AI Analysis');
  for (const item of report.students) console.log(`${item.name} | ${item.riskLevel} (${item.riskScore}) | ${item.trajectory.direction} | ${item.status} | ${item.needsAIAnalysis ? (item.status === 'WATCHLIST' ? 'brief (mock)' : 'deep (mock)') : 'no'}`);
  console.log(`\nStudents scanned: ${report.scanned}`);
  console.log(`Students selected for deeper analysis: ${report.students.filter((item) => item.status === 'INTERVENTION_REQUIRED' && item.needsAIAnalysis).length}`);
  console.log(`Students selected for brief analysis: ${report.students.filter((item) => item.status === 'WATCHLIST' && item.needsAIAnalysis).length}`);
  console.log(`Interventions: ${report.interventions}`);
  console.log(`Follow-ups: ${report.followUps}`);
  console.log(`Total agent steps: ${state.step}`);
  for (const result of state.followUpResults.filter((item) => item.hasPreviousIntervention)) {
    console.log(`Follow-up ${result.studentId}: ${result.response || 'PENDING'} — ${result.recommendation}`);
  }
  for (const item of report.students) {
    if (item.status === 'NORMAL') continue;
    console.log(`\n${item.name}: риск ${riskNames[item.riskLevel]} — ${item.riskScore}/100; прогноз — ${item.projection?.toFixed(2) ?? 'нет данных'}.`);
    console.log(`Главная причина по данным: ${item.reasons.join('; ') || 'пока не установлена'}.`);
    console.log(`Рекомендуемая помощь: ${item.intervention}`);
    console.log(`Подготовлены: план — ${item.planPrepared ? 'да' : 'нет'}, сообщение — ${item.messagePrepared ? 'да' : 'нет'}.`);
    console.log(`Сообщение сохранено после подтверждения: ${item.messageCompleted ? 'да' : 'нет'}.`);
    console.log(item.preventionStopped ? 'Результаты улучшаются; профилактические действия прекращены.'
      : item.followUpDays !== null ? `Повторная проверка записана через ${item.followUpDays} дн.` : `Рекомендуется проверка через ${item.recommendedDays} дн.; ещё не назначена.`);
  }
  if (report.status === 'limit') console.log('Достигнут предел 20 шагов. Работа завершена не полностью.');
  if (report.status === 'error') console.log('Работа остановлена из-за ошибки инструмента.');
  if (report.status === 'waiting') console.log('Агент ожидает подтверждения подготовленного действия.');
  console.log(`Шагов: ${state.step}. Это локальная симуляция: реальной отправки и автоматических проверок нет.`);
}

function runMockAgent(goal, options = {}) {
  // Передав это же состояние снова, можно продолжить после нажатия кнопки.
  const state = options.state || createAgentState(goal);
  const currentWeek = options.currentWeek ?? state.currentWeek;
  if (!Number.isInteger(currentWeek) || currentWeek < 1 || currentWeek > 14) throw new Error('Week must be between 1 and 14');
  if (currentWeek !== state.currentWeek && state.knownStudents) {
    state.previousRuns = [...(state.previousRuns || []), { currentWeek: state.currentWeek,
      toolResults: state.toolResults, completedActions: state.completedActions, pendingActions: state.pendingActions }];
    state.step = 0;
    state.knownStudents = null;
    state.analyzedStudents = [];
    state.toolResults = [];
    state.completedActions = [];
    state.pendingActions = [];
  }
  state.currentWeek = currentWeek;
  const autoApprove = options.autoApprove ?? true;
  let status = 'running';
  console.log(`Цель: ${state.goal}`);
  // Модель позже получит эти правила; сейчас решения выбирает chooseNextTool.
  if (!systemPrompt) throw new Error('Не заданы правила агента');

  while (state.step < MAX_STEPS) {
    const decision = chooseNextTool(state);
    if (!decision) { status = 'complete'; break; }
    const definition = agentTools.find((tool) => tool.name === decision.toolName);
    let pendingAction = null;
    if (definition.requiresApproval) {
      pendingAction = state.pendingActions.find((action) => action.tool === decision.toolName
        && JSON.stringify(action.args) === JSON.stringify(decision.args));
      if (!pendingAction) {
        // Сначала готовим действие. Здесь ещё ничего не выполняется.
        pendingAction = { tool: decision.toolName, reason: decision.reason, args: { ...decision.args }, status: 'pending' };
        state.pendingActions.push(pendingAction);
        console.log(`Подготовлено действие: ${decision.reason}. Требуется подтверждение.`);
      }
      if (autoApprove && pendingAction.status === 'pending') {
        pendingAction.status = 'approved';
        console.log('Учебный режим: подтверждение автоматически принято.');
      }
      if (pendingAction.status !== 'approved') { status = 'waiting'; break; }
    }
    state.step += 1;
    console.log(`\nШаг ${state.step}\nРешение агента: ${decision.reason}\nИнструмент: ${decision.toolName}`);
    const result = executeTool(decision.toolName, decision.args, pendingAction);
    state.toolResults.push({ decision, result });
    console.log(`Результат: ${summarizeResult(decision, result)}`);
    if (result.error) { status = 'error'; break; }
    if (decision.toolName === 'getStudents') {
      state.knownStudents = result.students;
      state.followUpResults = [];
      for (const student of state.knownStudents) {
        const screening = screenStudent(student.id, state.currentWeek);
        state.screenings[student.id] = screening;
        let response = evaluateInterventionResponse(student.id, state.currentWeek);
        const previousCheck = data.followUps.filter((item) => item.studentId === student.id && item.week < state.currentWeek).at(-1);
        if (screening.status === 'WATCHLIST' && previousCheck) {
          const observed = screening.courses.filter((course) => course.grades.length > (previousCheck.gradeCounts?.[course.courseName] ?? previousCheck.week));
          const changes = observed.map((course) => course.grades.at(-1) - course.grades[(previousCheck.gradeCounts?.[course.courseName] ?? previousCheck.week) - 1]);
          if (changes.length && changes.every((change) => change >= 0) && changes.some((change) => change > 0)) {
            response = { ...response, response: 'IMPROVING', recommendation: 'Stop preventive actions; results are improving.' };
          } else {
            response = { ...response, response: null, recommendation: 'Continue lightweight monitoring.' };
          }
        }
        if (screening.status === 'WATCHLIST') response.recommendation = response.response === 'IMPROVING'
          ? 'Stop preventive actions; results are improving.' : 'Continue lightweight monitoring.';
        state.followUpResults.push(response);
        for (const followUp of data.followUps.filter((item) => item.studentId === student.id && item.week < state.currentWeek)) {
          if (screening.courses.some((course) => course.grades.length > (followUp.gradeCounts?.[course.courseName] ?? followUp.week))) followUp.completed = true;
        }
        if (screening.needsAIAnalysis) {
          state.analyzedStudents.push(student.id);
          console.log(`${screening.status === 'WATCHLIST' ? 'Brief preventive review' : 'Mock deep analysis'}: ${student.name}; ${screening.mainCourse}; ${screening.trajectory.severity} decline; ${getReasons({ risk: screening, ...screening }).join('; ')}`);
        }
      }
    }
    if (decision.toolName === 'calculateStudentRisk') state.analyzedStudents.push(decision.studentId);
    if (definition.toolType === 'ACTION' && !result.skipped) {
      state.completedActions.push({ tool: decision.toolName, studentId: decision.studentId, step: state.step });
    }
    if (pendingAction) state.pendingActions.splice(state.pendingActions.indexOf(pendingAction), 1);
  }
  if (status === 'running') status = chooseNextTool(state) ? 'limit' : 'complete';
  state.finalFindings = buildFinalFindings(state, status);
  printFinalAnswer(state);
  return state;
}
module.exports = { runMockAgent };
