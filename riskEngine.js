// Здесь считаем риск по оценкам одного курса.
const semesterWeeks = 14;
const targetFinalGrade = 60;

function calculateAverage(grades) {
  // Складываем все оценки и делим на их количество.
  return grades.reduce((sum, grade) => sum + grade, 0) / grades.length;
}

function calculateTrend(grades) {
  // По одной оценке ещё нельзя увидеть изменение.
  if (grades.length < 2) return 0;
  // Считаем, на сколько баллов в среднем меняется оценка за неделю.
  return (grades[grades.length - 1] - grades[0]) / (grades.length - 1);
}

function calculateRecentTrend(grades) {
  // Берём последние три оценки. Если их меньше, берём все доступные.
  return calculateTrend(grades.slice(-3));
}

function getTrajectory(trend) {
  // Рост больше 3 — улучшение, падение больше 3 — ухудшение.
  if (trend > 3) return 'IMPROVING';
  if (trend < -3) return 'DECLINING';
  return 'STABLE';
}

function predictFinalGrade(grades) {
  const remainingWeeks = semesterWeeks - grades.length;
  const average = calculateAverage(grades);
  const recentTrend = calculateRecentTrend(grades);
  // От текущего среднего продолжаем только 35% изменения за неделю.
  const prediction = average + recentTrend * 0.35 * remainingWeeks;
  // Прогноз не может быть ниже 0 или выше 100.
  return Math.min(100, Math.max(0, prediction));
}

function calculateRequiredAverage(grades, targetFinalGrade) {
  const remainingWeeks = semesterWeeks - grades.length;
  // Все недели имеют одинаковый вес в итоговом среднем.
  const currentTotal = grades.reduce((sum, grade) => sum + grade, 0);

  if (remainingWeeks === 0) {
    // Если семестр закончился, цель либо уже достигнута, либо недостижима.
    // Infinity означает, что получить нужный средний уже невозможно.
    return calculateAverage(grades) >= targetFinalGrade ? 0 : Infinity;
  }

  // Находим недостающую сумму баллов и делим на оставшиеся недели.
  const requiredAverage = (targetFinalGrade * semesterWeeks - currentTotal) / remainingWeeks;
  // Сохраняем число даже выше 100, чтобы показать, сколько не хватает.
  // Если баллов уже достаточно, даже нули позволят достичь цели.
  return Math.max(0, requiredAverage);
}

function getRecoveryStatus(requiredAverage) {
  // Чем меньше нужно получать дальше, тем проще достичь цели.
  if (requiredAverage <= 65) return 'EASY TO RECOVER';
  if (requiredAverage <= 75) return 'RECOVERABLE';
  if (requiredAverage <= 90) return 'DIFFICULT';
  if (requiredAverage <= 100) return 'VERY DIFFICULT';
  return 'IMPOSSIBLE';
}

function getRiskFactors(student) {
  const factors = [];
  // Для этой версии считаем посещаемость ниже 75% низкой.
  if (student.attendance < 75) factors.push('Low attendance');
  if (calculateAverage(student.grades) < targetFinalGrade) factors.push('Current average below target');
  if (calculateRecentTrend(student.grades) < 0) factors.push('Declining grades');
  if (student.missedDeadlines > 0) factors.push('Missed deadlines');
  if (predictFinalGrade(student.grades) < targetFinalGrade) factors.push('Projected final grade below target');
  else if (predictFinalGrade(student.grades) < targetFinalGrade + 10) factors.push('Projected final grade close to target');
  return factors;
}

function calculateRiskScore(student) {
  const average = calculateAverage(student.grades);
  const prediction = predictFinalGrade(student.grades);
  const trend = calculateRecentTrend(student.grades);

  // Это пробные правила: их ещё нужно проверить на реальных данных.
  // Начинаем добавлять риск, когда прогноз ниже цели плюс 10 баллов.
  // При прогнозе 70 риск равен 0, при 60 — 20, при 50 и ниже — 40.
  const predictionRisk = Math.min(40, Math.max(0, (targetFinalGrade + 10 - prediction) * 2));
  // За каждый балл среднего ниже цели добавляем 0.5 риска, всего до 10.
  const gradeRisk = Math.min(10, Math.max(0, (targetFinalGrade - average) * 0.5));
  // За каждый процент посещаемости ниже 75 добавляем 1 балл, всего до 20.
  const attendanceRisk = Math.min(20, Math.max(0, 75 - student.attendance));
  // Каждый пропущенный срок добавляет 5 баллов, всего не больше 10.
  const deadlineRisk = Math.min(10, Math.max(0, student.missedDeadlines * 5));
  // Падение на 1 балл за неделю добавляет 2 балла риска, всего до 20.
  const trendRisk = Math.min(20, Math.max(0, -trend * 2));

  // Складываем баллы, округляем и оставляем результат в пределах 0–100.
  const totalRisk = gradeRisk + predictionRisk + attendanceRisk + deadlineRisk + trendRisk;
  return Math.min(100, Math.max(0, Math.round(totalRisk)));
}

function getRiskLevel(score) {
  // Выбираем название уровня по набранным баллам риска.
  if (score < 40) return 'LOW';
  if (score < 70) return 'MEDIUM';
  if (score < 85) return 'HIGH';
  return 'CRITICAL';
}

module.exports = { calculateAverage, calculateRecentTrend, predictFinalGrade, calculateRequiredAverage, calculateRiskScore, getRiskLevel };

