const data = require('./data');
const engine = require('./riskEngine');

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
  const risk = calculateStudentRisk(studentId);
  if (risk.error) return risk;
  const student = findStudent(studentId);
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
  return { studentId, courseName, requiredAverage: risk.courses[0].requiredAverage, steps };
}

function notifyStudent(studentId, message) {
  if (!findStudent(studentId)) return { error: 'Студент не найден' };
  if (typeof message !== 'string' || !message.trim()) return { error: 'Сообщение не должно быть пустым' };
  // Только сохраняем сообщение в памяти. Настоящей отправки нет.
  const notification = { studentId, message, simulated: true };
  data.notifications.push(notification);
  return { notification };
}

function scheduleFollowUp(studentId, days) {
  if (!findStudent(studentId)) return { error: 'Студент не найден' };
  if (!Number.isInteger(days) || days <= 0) return { error: 'Число дней должно быть целым и больше нуля' };
  // Запоминаем дату. Программа сама не запустится в этот день.
  const date = new Date();
  date.setDate(date.getDate() + days);
  const followUp = { studentId, days, scheduledFor: date.toISOString(), simulated: true };
  data.followUps.push(followUp);
  return { followUp };
}

module.exports = { getStudents, getStudentGrades, getAttendance, getDeadlines, getWeakTopics, calculateStudentRisk, getCourseMaterials, createStudyPlan, notifyStudent, scheduleFollowUp };
