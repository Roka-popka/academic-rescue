const data = require('./data');
const engine = require('./riskEngine');
const { screenStudent, recordIntervention, evaluateInterventionResponse } = require('./academicScreening');
const NOTIFICATION_COOLDOWN_DAYS = 7;

// Ищем студента по его номеру.
function findStudent(studentId) {
  return data.students.find((student) => student.id === studentId);
}

function getStudents() {
  return { students: data.students.map(({ id, name }) => ({ id, name })) };
}

function getStudentGrades(studentId) {
  const student = findStudent(studentId);
  return student ? { studentId, gradesByCourse: student.gradesByCourse } : { error: 'Студент не найден' };
}

function getAttendance(studentId) {
  const student = findStudent(studentId);
  return student ? { studentId, attendanceByCourse: student.attendanceByCourse } : { error: 'Студент не найден' };
}

function getDeadlines(studentId) {
  const student = findStudent(studentId);
  return student ? { studentId, missedDeadlines: student.missedDeadlines, upcomingDeadlines: student.upcomingDeadlines } : { error: 'Студент не найден' };
}

function getWeakTopics(studentId) {
  const student = findStudent(studentId);
  return student ? { studentId, weakTopics: student.weakTopics } : { error: 'Студент не найден' };
}

function calculateStudentRisk(studentId) {
  const student = findStudent(studentId);
  if (!student) return { error: 'Студент не найден' };
  // Проверяем каждый курс отдельно по прежним формулам.
  const courses = Object.entries(student.gradesByCourse).map(([courseName, grades]) => {
    const riskScore = engine.calculateRiskScore({
      grades,
      attendance: student.attendanceByCourse[courseName],
      missedDeadlines: student.missedDeadlines[courseName],
    });
    return {
      courseName, riskScore,
      riskLevel: engine.getRiskLevel(riskScore),
      currentAverage: engine.calculateAverage(grades),
      recentTrend: engine.calculateRecentTrend(grades),
      projectedFinalGrade: engine.predictFinalGrade(grades),
      requiredAverage: engine.calculateRequiredAverage(grades, 60),
    };
  });
  // Берём самый высокий риск, чтобы хорошие курсы не скрыли проблемный.
  courses.sort((a, b) => b.riskScore - a.riskScore);
  return { studentId, riskScore: courses[0].riskScore, riskLevel: courses[0].riskLevel, mainCourse: courses[0].courseName, courses };
}

function getCourseMaterials(courseName, topics) {
  const materials = data.courseMaterials.filter((item) => item.courseName === courseName && topics.includes(item.topic));
  return { courseName, materials, missingTopics: topics.filter((topic) => !materials.some((item) => item.topic === topic)) };
}

function createStudyPlan(studentId) {
  const week = data.screenings[studentId]?.currentWeek || 5;
  const risk = screenStudent(studentId, week);
  if (risk.error) return risk;
  const student = findStudent(studentId);
  if (!risk.canIntervene) return { skipped: true, reason: 'Collect baseline and monitor before planning interventions.' };
  if (risk.status !== 'INTERVENTION_REQUIRED') return { skipped: true, reason: 'Full study plans require INTERVENTION_REQUIRED status.' };
  const latest = student.interventionHistory.at(-1);
  const response = evaluateInterventionResponse(studentId, week);
  if (latest?.plan && (latest.week === week || !response.response || response.response === 'IMPROVING')) {
    return { ...latest.plan, skipped: true, reason: 'Continue the existing plan.' };
  }
  const courseName = risk.mainCourse;
  const topics = student.weakTopics[courseName];
  const { materials } = getCourseMaterials(courseName, topics);
  const deadlines = student.upcomingDeadlines
    .filter((item) => item.courseName === courseName)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const steps = [];
  // Сначала напоминаем о ближайших сроках, затем добавляем занятия по темам.
  for (const deadline of deadlines) {
    steps.push(`Подготовить «${deadline.title}»: осталось дней — ${deadline.daysLeft}.`);
  }
  for (const topic of topics) {
    const material = materials.find((item) => item.topic === topic);
    steps.push(material
      ? `Повторить ${topic}: «${material.title}». ${material.content}`
      : `Попросить преподавателя дать материал по теме ${topic}.`);
  }
  if (student.attendanceByCourse[courseName] < 75) steps.push('Посетить ближайшее занятие и разобрать пропущенное с преподавателем.');
  if (student.missedDeadlines[courseName] > 0) steps.push('Согласовать с преподавателем сроки сдачи пропущенных работ.');
  if (steps.length === 0) steps.push('Продолжать занятия и сдавать работы вовремя.');
  if (response.response === 'NO_CHANGE') steps.unshift('Review which study tasks were completed and adjust the workload with the student.');
  if (response.response === 'WORSENING') steps.unshift('Escalate support: propose a teacher or advisor meeting and review barriers with the student.');
  const plan = { studentId, courseName, requiredAverage: risk.courses[0].requiredAverage, steps };
  recordIntervention(studentId, week, 'STUDY_PLAN', risk.riskScore,
    response.response ? `Adapted plan: ${response.recommendation}` : `Created personalized ${courseName} study plan`, plan);
  return plan;
}

function notifyStudent(studentId, message) {
  if (!findStudent(studentId)) return { error: 'Студент не найден' };
  if (typeof message !== 'string' || !message.trim()) return { error: 'Сообщение не должно быть пустым' };
  const screening = screenStudent(studentId, data.screenings[studentId]?.currentWeek || 5);
  const latest = data.notifications.filter((item) => item.studentId === studentId).at(-1);
  if (latest) {
    const elapsedDays = (Date.now() - new Date(latest.sentAt).getTime()) / 86400000;
    const escalation = screening.riskLevel === 'CRITICAL' && Number.isFinite(latest.riskScore)
      && screening.riskScore >= latest.riskScore + 15;
    if (elapsedDays < NOTIFICATION_COOLDOWN_DAYS && !escalation) {
      return { skipped: true, reason: 'Notification cooldown is active.' };
    }
  }
  // Только сохраняем сообщение в памяти. Настоящей отправки нет.
  const notification = { studentId, message, sentAt: new Date().toISOString(),
    riskScore: screening.riskScore, riskLevel: screening.riskLevel, simulated: true };
  data.notifications.push(notification);
  return { notification };
}

function scheduleFollowUp(studentId, days) {
  if (!findStudent(studentId)) return { error: 'Студент не найден' };
  if (!Number.isInteger(days) || days <= 0) return { error: 'Число дней должно быть целым и больше нуля' };
  const currentWeek = data.screenings[studentId]?.currentWeek || 5;
  const existing = data.followUps.find((item) => item.studentId === studentId && !item.completed);
  if (existing && existing.days <= days) return { followUp: existing, skipped: true };
  if (existing) existing.completed = true;
  // Запоминаем дату. Программа сама не запустится в этот день.
  const date = new Date();
  date.setDate(date.getDate() + days);
  const gradeCounts = Object.fromEntries(Object.entries(findStudent(studentId).gradesByCourse)
    .map(([course, grades]) => [course, Math.min(grades.length, currentWeek)]));
  const followUp = { studentId, days, week: currentWeek, gradeCounts, completed: false, scheduledFor: date.toISOString(), simulated: true };
  data.followUps.push(followUp);
  return { followUp };
}

module.exports = { getStudents, getStudentGrades, getAttendance, getDeadlines, getWeakTopics, calculateStudentRisk, getCourseMaterials, createStudyPlan, notifyStudent, scheduleFollowUp, NOTIFICATION_COOLDOWN_DAYS };
