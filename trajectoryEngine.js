function calculateTrajectory(grades) {
  if (grades.length < 2) return { direction: 'STABLE', slope: 0, severity: 'NONE' };
  // Later results carry more weight in the fitted line.
  const totalWeight = grades.reduce((sum, _, i) => sum + i + 1, 0);
  const meanX = grades.reduce((sum, _, i) => sum + i * (i + 1), 0) / totalWeight;
  const meanY = grades.reduce((sum, grade, i) => sum + grade * (i + 1), 0) / totalWeight;
  let numerator = 0;
  let denominator = 0;
  grades.forEach((grade, i) => {
    numerator += (i + 1) * (i - meanX) * (grade - meanY);
    denominator += (i + 1) * (i - meanX) ** 2;
  });
  const slope = Number((numerator / denominator).toFixed(2));
  const direction = slope < -1.5 ? 'DECLINING' : slope > 1.5 ? 'IMPROVING' : 'STABLE';
  const recent = grades.slice(-4);
  const drops = recent.slice(1).filter((grade, i) => grade <= recent[i] - 3).length;
  let severity = direction === 'DECLINING' ? 'MILD' : 'NONE';
  if (direction === 'DECLINING' && drops >= 2 && slope <= -3) severity = 'MODERATE';
  if (direction === 'DECLINING' && drops >= 3 && slope <= -5) severity = 'SEVERE';
  return { direction, slope, severity };
}

function detectEarlyWarning(grades, currentWeek) {
  const values = grades.slice(0, currentWeek);
  const none = { warning: false, type: null, reason: null };
  if (currentWeek <= 2) {
    const anomaly = values.length >= 2 && values.at(-1) - values.at(-2) <= -25;
    const poorResults = values.filter((grade) => grade <= 40).length >= 2;
    return anomaly || poorResults
      ? { warning: true, type: 'SERIOUS_ANOMALY', reason: 'Check in gently: a large drop or two very poor results need context.' }
      : none;
  }
  const trajectory = calculateTrajectory(values);
  if (['MODERATE', 'SEVERE'].includes(trajectory.severity)) {
    return { warning: true, type: trajectory.severity === 'SEVERE' ? 'SEVERE_DECLINE' : 'NEGATIVE_TREND', reason: 'Repeated recent results show a meaningful decline.' };
  }
  return none;
}

module.exports = { calculateTrajectory, detectEarlyWarning };
