const { executeTool } = require('./toolExecutor');
const { createAgentState } = require('./agentState');
const { agentTools } = require('./agentTools');
const { systemPrompt } = require('./agentPrompt');
const MAX_STEPS = 20;
const riskNames = { LOW: 'низкий', MEDIUM: 'средний', HIGH: 'высокий', CRITICAL: 'критический' };

function getPriorityStudents(state) {
  return getKnownDetails(state)
    .filter((item) => item.risk && ['HIGH', 'CRITICAL'].includes(item.risk.riskLevel))
    .sort((a, b) => b.risk.riskScore - a.risk.riskScore);
}

function getReasons(item) {
  const course = item.risk.courses[0];
  const reasons = [];
  if (course.projectedFinalGrade < 60) reasons.push(`прогноз ${course.projectedFinalGrade.toFixed(2)} ниже 60`);
  if (course.currentAverage < 60) reasons.push('средний балл ниже 60');
  if (course.recentTrend < 0) reasons.push('оценки снижаются');
  if (item.attendance && item.attendance.attendanceByCourse[course.courseName] < 75) reasons.push('низкая посещаемость');
  if (item.deadlines && item.deadlines.missedDeadlines[course.courseName] > 0) reasons.push('есть пропущенные сроки сдачи');
  return reasons;
}

function chooseNextTool(state) {
  // Каждый раз заново смотрим, что уже известно и чего ещё не хватает.
  if (!state.knownStudents) return { toolName: 'getStudents', args: {}, reason: 'получить список студентов', saveAs: 'students' };
  const pending = state.knownStudents.filter((student) => !state.analyzedStudents.includes(student.id));
  if (pending.length > 0) {
    const studentId = pending[0].id;
    return { toolName: 'calculateStudentRisk', args: { studentId }, studentId, saveAs: 'risk', reason: `проверить риск ${pending[0].name}` };
  }
  for (const item of getPriorityStudents(state)) {
    const studentId = item.id;
    const call = (toolName, saveAs, reason, args = { studentId }) => ({ toolName, args, studentId, saveAs, reason: `${item.name}: ${reason}` });
    if (!item.attendance) return call('getAttendance', 'attendance', 'проверить пропуски занятий');
    if (!item.deadlines) return call('getDeadlines', 'deadlines', 'узнать сроки работ');
    if (!item.topics) return call('getWeakTopics', 'topics', 'найти темы для повторения');
    const topics = item.topics.weakTopics[item.risk.mainCourse] || [];
    // Если слабых тем нет, отдельный поиск материалов не нужен.
    if (topics.length > 0 && !item.materials) return call('getCourseMaterials', 'materials', 'подобрать материалы', { courseName: item.risk.mainCourse, topics });
    if (!item.plan) return call('createStudyPlan', 'plan', 'подготовить план помощи');
    if (!item.notification) {
      const message = `${item.name}, по курсу «${item.risk.mainCourse}» нужна помощь: ${getReasons(item).join(', ')}. Предлагаем план: ${item.plan.steps.join(' ')}`;
      return call('notifyStudent', 'notification', 'сохранить сообщение с планом', { studentId, message });
    }
    // При критическом риске проверяем раньше, чем при высоком.
    if (!item.followUp) return call('scheduleFollowUp', 'followUp', 'назначить повторную проверку', { studentId, days: item.risk.riskLevel === 'CRITICAL' ? 1 : 3 });
  }
  // При среднем риске не готовим полный план. Уточняем только неясную причину.
  for (const item of getKnownDetails(state).filter((student) => student.risk.riskLevel === 'MEDIUM')) {
    if (getReasons(item).length > 0) continue;
    if (!item.attendance) return { toolName: 'getAttendance', args: { studentId: item.id }, studentId: item.id, saveAs: 'attendance', reason: `${item.name}: кратко уточнить причину среднего риска` };
    if (!item.deadlines) return { toolName: 'getDeadlines', args: { studentId: item.id }, studentId: item.id, saveAs: 'deadlines', reason: `${item.name}: проверить пропущенные сроки` };
  }
  return null;
}

function summarizeResult(decision, result) {
  if (result.error) return result.error;
  switch (decision.toolName) {
    case 'getStudents': return `студентов найдено: ${result.students.length}`;
    case 'calculateStudentRisk': return `риск ${riskNames[result.riskLevel]} — ${result.riskScore}/100; проблемный курс: ${result.mainCourse}`;
    case 'getAttendance': return 'получена посещаемость по курсам';
    case 'getDeadlines': return `получены пропущенные сроки и ближайшие работы: ${result.upcomingDeadlines.length}`;
    case 'getWeakTopics': return `темы: ${Object.values(result.weakTopics).flat().join(', ') || 'не указаны'}`;
    case 'getCourseMaterials': return `материалов найдено: ${result.materials.length}; тем без материалов: ${result.missingTopics.length}`;
    case 'createStudyPlan': return `создан план, пунктов: ${result.steps.length}`;
    case 'notifyStudent': return 'сообщение с планом сохранено локально, без отправки';
    case 'scheduleFollowUp': return `проверка через ${result.followUp.days} дн. записана в памяти`;
    default: return 'данные получены';
  }
}


// Собираем удобный вид памяти из сохранённых ответов, не копируя их в состояние.
function getKnownDetails(state) {
  return (state.knownStudents || []).map((student) => {
    const item = { ...student };
    for (const entry of state.toolResults) {
      if (entry.decision.studentId === student.id && !entry.result.error) item[entry.decision.saveAs] = entry.result;
    }
    return item;
  });
}

function buildFinalFindings(state, status) {
  const risky = getKnownDetails(state)
    .filter((item) => item.risk && item.risk.riskLevel !== 'LOW')
    .sort((a, b) => b.risk.riskScore - a.risk.riskScore);
  return {
    status,
    checked: state.analyzedStudents.length,
    students: risky.map((item) => ({
      name: item.name,
      riskScore: item.risk.riskScore,
      riskLevel: item.risk.riskLevel,
      projection: item.risk.courses[0].projectedFinalGrade,
      reasons: getReasons(item),
      intervention: item.plan ? item.plan.steps.join(' ') : 'Кратко обсудить результат с преподавателем; данных о причине может быть недостаточно.',
      planPrepared: Boolean(item.plan),
      messagePrepared: Boolean(item.notification) || state.pendingActions.some((action) => action.args.studentId === item.id && action.tool === 'notifyStudent'),
      messageCompleted: Boolean(item.notification),
      followUpDays: item.followUp ? item.followUp.followUp.days : null,
      recommendedDays: item.risk.riskLevel === 'CRITICAL' ? 1 : item.risk.riskLevel === 'HIGH' ? 3 : 7,
    })),
  };
}

function printFinalAnswer(state) {
  const report = state.finalFindings;
  console.log('\nИтог анализа');
  console.log(`Проверено студентов: ${report.checked}`);
  console.log(`Требуют внимания: ${report.students.length}`);
  console.log(`Критический риск: ${report.students.filter((item) => item.riskLevel === 'CRITICAL').map((item) => item.name).join(', ') || 'не найден'}`);
  for (const item of report.students) {
    console.log(`\n${item.name}: риск ${riskNames[item.riskLevel]} — ${item.riskScore}/100; прогноз — ${item.projection.toFixed(2)}.`);
    console.log(`Главная причина по данным: ${item.reasons.join('; ') || 'пока не установлена'}.`);
    console.log(`Рекомендуемая помощь: ${item.intervention}`);
    console.log(`Подготовлены: план — ${item.planPrepared ? 'да' : 'нет'}, сообщение — ${item.messagePrepared ? 'да' : 'нет'}.`);
    console.log(`Сообщение сохранено после подтверждения: ${item.messageCompleted ? 'да' : 'нет'}.`);
    console.log(item.followUpDays !== null ? `Повторная проверка записана через ${item.followUpDays} дн.` : `Рекомендуется проверка через ${item.recommendedDays} дн.; ещё не назначена.`);
  }
  if (report.status === 'limit') console.log('Достигнут предел 20 шагов. Работа завершена не полностью.');
  if (report.status === 'error') console.log('Работа остановлена из-за ошибки инструмента.');
  if (report.status === 'waiting') console.log('Агент ожидает подтверждения подготовленного действия.');
  console.log(`Шагов: ${state.step}. Это локальная симуляция: реальной отправки и автоматических проверок нет.`);
}

function runMockAgent(goal, options = {}) {
  // Передав это же состояние снова, можно продолжить после нажатия кнопки.
  const state = options.state || createAgentState(goal);
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
    if (decision.toolName === 'getStudents') state.knownStudents = result.students;
    if (decision.toolName === 'calculateStudentRisk') state.analyzedStudents.push(decision.studentId);
    if (definition.toolType === 'ACTION') {
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
