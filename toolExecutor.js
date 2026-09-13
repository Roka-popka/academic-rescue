const tools = require('./tools');
const { agentTools } = require('./agentTools');

// Явно перечисляем доступные действия и порядок их аргументов.
const handlers = {
  getStudents: () => tools.getStudents(),
  getStudentGrades: (args) => tools.getStudentGrades(args.studentId),
  getAttendance: (args) => tools.getAttendance(args.studentId),
  getDeadlines: (args) => tools.getDeadlines(args.studentId),
  getWeakTopics: (args) => tools.getWeakTopics(args.studentId),
  calculateStudentRisk: (args) => tools.calculateStudentRisk(args.studentId),
  getCourseMaterials: (args) => tools.getCourseMaterials(args.courseName, args.topics),
  createStudyPlan: (args) => tools.createStudyPlan(args.studentId),
  notifyStudent: (args) => tools.notifyStudent(args.studentId, args.message),
  scheduleFollowUp: (args) => tools.scheduleFollowUp(args.studentId, args.days),
};

function executeTool(toolName, args = {}, approval = null) {
  const definition = agentTools.find((tool) => tool.name === toolName);
  if (!definition) return { error: `Неизвестный инструмент: ${toolName}` };
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { error: 'Аргументы должны быть объектом' };
  // Проверяем входные данные до вызова функции. Здесь нужны только простые типы.
  const properties = definition.parameters.properties;
  if (Object.keys(args).some((key) => !Object.hasOwn(properties, key))) return { error: 'Передан лишний аргумент' };
  for (const [key, rule] of Object.entries(properties)) {
    const value = args[key];
    const valid = rule.type === 'string' ? typeof value === 'string' && value.trim().length > 0
      : rule.type === 'integer' ? Number.isInteger(value) && value >= rule.minimum
      : Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0);
    if (!valid) return { error: `Неверный или отсутствующий аргумент: ${key}` };
  }
  // Подтверждение должно относиться именно к этому действию и его аргументам.
  if (definition.requiresApproval && (!approval || approval.status !== 'approved'
    || approval.tool !== toolName || JSON.stringify(approval.args) !== JSON.stringify(args))) {
    return { error: 'Действие требует подтверждения', requiresApproval: true };
  }
  try {
    return handlers[toolName](args);
  } catch (error) {
    return { error: `Не удалось выполнить ${toolName}: ${error.message}` };
  }
}
module.exports = { executeTool };
