const express = require('express');
const cors = require('cors');
const data = require('./data');
const { screenStudent } = require('./academicScreening');
const { executeTool } = require('./toolExecutor');

const app = express();
const CURRENT_WEEK = 5;
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '10kb' }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

function summary(screening) {
  return {
    id: screening.studentId, name: screening.name, course: screening.mainCourse,
    riskScore: screening.riskScore, riskLevel: screening.riskLevel,
    trajectory: screening.trajectory, projectedFinal: screening.projectedFinal, status: screening.status,
  };
}

app.get('/api/students', (req, res) => {
  res.json(data.students.map((student) => summary(screenStudent(student.id, CURRENT_WEEK))));
});

app.get('/api/students/:id', (req, res) => {
  const student = data.students.find((item) => item.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'Студент не найден.' });
  const screening = screenStudent(student.id, CURRENT_WEEK);
  const course = screening.courses[0];
  const attendance = student.attendanceByCourse[course.courseName];
  const missedDeadlines = student.missedDeadlines[course.courseName];
  const followUp = data.followUps.find((item) => item.studentId === student.id && !item.completed) || null;
  const previousPlan = student.interventionHistory.filter((item) => item.courseName === course.courseName).at(-1)?.plan;
  const riskFactors = [];
  if (course.trajectory.direction === 'DECLINING') riskFactors.push('Снижение оценок');
  if (screening.status !== 'NORMAL') riskFactors.push(`Посещаемость: ${attendance}%`);
  if (missedDeadlines > 0) riskFactors.push(`Пропущенные дедлайны: ${missedDeadlines}`);
  // GET only reads existing plans; it never creates interventions.
  const recommendation = screening.status === 'NORMAL' ? ['Вмешательство не требуется. Продолжить наблюдение.']
    : screening.status === 'WATCHLIST' ? ['Мягко обратить внимание на учебную динамику и продолжить наблюдение. Полный учебный план не требуется.']
    : previousPlan?.steps || [];
  res.json({ ...summary(screening), gradeHistory: course.grades, attendance, missedDeadlines,
    weakTopics: student.weakTopics[course.courseName] || [],
    upcomingDeadlines: student.upcomingDeadlines.filter((item) => item.courseName === course.courseName),
    riskFactors, followUp, followUpDays: followUp?.days ?? null, recommendation,
    materials: executeTool('getCourseMaterials', { courseName: course.courseName, topics: student.weakTopics[course.courseName] || [] }).materials });
});

app.get('/api/screening', (req, res) => {
  const screenings = data.students.map((student) => screenStudent(student.id, CURRENT_WEEK));
  const count = (status) => screenings.filter((student) => student.status === status).length;
  res.json({ studentsScanned: screenings.length, normal: count('NORMAL'), watchlist: count('WATCHLIST'),
    interventionRequired: count('INTERVENTION_REQUIRED'),
    deepAnalyses: screenings.filter((student) => student.status === 'INTERVENTION_REQUIRED' && student.needsAIAnalysis).length,
    briefReviews: screenings.filter((student) => student.status === 'WATCHLIST' && student.needsAIAnalysis).length });
});

function studentActions(student) {
  const notifications = data.notifications.filter((item) => item.studentId === student.id);
  return { studentId: student.id,
    approvedPlans: student.interventionHistory.filter((item) => item.approvedAt),
    notifications, warnings: notifications.filter((item) => item.kind === 'WARNING'),
    followUps: data.followUps.filter((item) => item.studentId === student.id) };
}

app.get('/api/students/:id/actions', (req, res) => {
  const student = data.students.find((item) => item.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'Студент не найден.' });
  res.json(studentActions(student));
});

app.get('/api/students/:id/responses', (req, res) => {
  const student = data.students.find((item) => item.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'Студент не найден.' });
  res.json(student.responses || []);
});

app.post('/api/students/:id/responses', (req, res) => {
  const student = data.students.find((item) => item.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'Студент не найден.' });
  const body = req.body;
  const types = ['PLAN_UNDERSTOOD', 'NEED_TEACHER_HELP', 'TASK_COMPLETED'];
  if (!body || Array.isArray(body) || !types.includes(body.type)
    || Object.keys(body).some((key) => !['type', 'message'].includes(key))
    || (body.message !== undefined && (typeof body.message !== 'string' || body.message.length > 1000))) {
    return res.status(400).json({ error: 'Укажите допустимый тип ответа и сообщение длиной до 1000 символов.' });
  }
  // Responses are context only; no grades or screening values are changed.
  student.responses ||= [];
  const response = { id: `${student.id}-${student.responses.length + 1}`, studentId: student.id,
    type: body.type, message: body.message?.trim() || '', createdAt: new Date().toISOString() };
  student.responses.push(response);
  res.status(201).json(response);
});

const allowedActions = {
  'approve-plan': ['INTERVENTION_REQUIRED'],
  'send-intervention': ['INTERVENTION_REQUIRED'],
  'send-warning': ['WATCHLIST'],
  'follow-up': ['WATCHLIST', 'INTERVENTION_REQUIRED'],
};

app.post('/api/students/:id/:action', (req, res) => {
  const student = data.students.find((item) => item.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'Студент не найден.' });
  const action = req.params.action;
  if (!Object.hasOwn(allowedActions, action)) return res.status(404).json({ error: 'Действие не найдено.' });
  const screening = screenStudent(student.id, CURRENT_WEEK);
  if (!allowedActions[action].includes(screening.status)) return res.status(400).json({ error: 'Действие недоступно при текущем статусе студента.' });
  const body = req.body ?? {};
  if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => action !== 'follow-up' || key !== 'days')) {
    return res.status(400).json({ error: 'Неверные параметры действия.' });
  }
  // The explicit teacher POST approves exactly these server-generated arguments.
  const runApproved = (tool, args) => executeTool(tool, args, { tool, args, status: 'approved' });
  let result;
  let message;
  let actionName;
  if (action === 'approve-plan') {
    result = executeTool('createStudyPlan', { studentId: student.id });
    if (result.error || !result.steps) return res.status(400).json({ error: result.error || 'Не удалось подготовить план.' });
    const record = student.interventionHistory.at(-1);
    record.approvedAt ||= new Date().toISOString();
    message = 'План помощи подтверждён.';
    actionName = 'PLAN_APPROVED';
  } else if (action === 'follow-up') {
    const days = body.days === undefined ? (screening.status === 'WATCHLIST' ? 7 : screening.riskLevel === 'CRITICAL' ? 1 : 3) : body.days;
    if (!Number.isInteger(days) || days < 1 || days > 365 || (screening.status === 'WATCHLIST' && days !== 7)) {
      return res.status(400).json({ error: 'Укажите от 1 до 365 дней. Для наблюдения — 7 дней.' });
    }
    result = runApproved('scheduleFollowUp', { studentId: student.id, days });
    if (result.followUp) result.followUp.createdAt ||= new Date().toISOString();
    message = result.skipped ? 'Повторная проверка уже назначена.' : 'Повторная проверка назначена.';
    actionName = 'FOLLOW_UP_SCHEDULED';
  } else {
    const plan = student.interventionHistory.at(-1);
    if (action === 'send-intervention' && (!plan?.approvedAt || !plan.plan || plan.courseName !== screening.mainCourse)) {
      return res.status(400).json({ error: 'Сначала подтвердите план помощи.' });
    }
    const text = action === 'send-warning'
      ? 'Обратите внимание на последние учебные результаты. Предлагаем повторить сложные темы и проверить прогресс через неделю.'
      : `План академической поддержки: ${plan.plan.steps.join(' ')}`;
    result = runApproved('notifyStudent', { studentId: student.id, message: text });
    if (result.skipped) return res.status(429).json({ error: 'Повторное уведомление заблокировано: действует интервал 7 дней между сообщениями.' });
    if (result.notification) result.notification.kind = action === 'send-warning' ? 'WARNING' : 'INTERVENTION';
    message = action === 'send-warning' ? 'Мягкое предупреждение сохранено в демо-режиме.' : 'Сообщение сохранено в демо-режиме.';
    actionName = action === 'send-warning' ? 'WARNING_SAVED' : 'INTERVENTION_SAVED';
  }
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ success: true, action: actionName, studentId: student.id, message, local: true, actions: studentActions(student) });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Ресурс не найден.' }));
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный JSON.' });
  console.error(error);
  res.status(500).json({ error: 'Не удалось загрузить данные Academic Rescue.' });
});

if (require.main === module) app.listen(3001, '127.0.0.1', () => console.log('Academic Rescue API: http://localhost:3001'));
module.exports = { app };
