// Это описания для будущей модели, а не сами действия.
// parameters описывает объект с входными данными для функции.
const studentId = { type: 'string', description: 'Номер студента из getStudents, например s1.' };
function describeTool(name, description, properties = {}) {
  const toolType = ['createStudyPlan', 'notifyStudent', 'scheduleFollowUp'].includes(name) ? 'ACTION' : 'READ';
  const requiresApproval = ['notifyStudent', 'scheduleFollowUp'].includes(name);
  return {
    toolType, requiresApproval,
    type: 'function', name, description, strict: true,
    parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
  };
}
const agentTools = [
  describeTool('getStudents', 'Используй в начале анализа, чтобы получить номера и имена студентов.'),
  describeTool('getStudentGrades', 'Используй, когда нужны отдельные оценки по неделям и курсам, а не только средний балл.', { studentId }),
  describeTool('getAttendance', 'Используй для проверки, связаны ли проблемы студента с пропусками занятий.', { studentId }),
  describeTool('getDeadlines', 'Используй перед подготовкой помощи, чтобы узнать пропущенные работы и ближайшие сроки.', { studentId }),
  describeTool('getWeakTopics', 'Используй для выбора тем, которые студенту нужно повторить.', { studentId }),
  describeTool('calculateStudentRisk', 'Используй для проверки риска студента. Возвращает риск, главный проблемный курс, средний балл, тренд и прогноз по курсам.', { studentId }),
  describeTool('getCourseMaterials', 'Используй после определения проблемного курса и слабых тем для поиска локальных учебных материалов.', {
    courseName: { type: 'string', description: 'Точное название курса из результатов анализа.' },
    topics: { type: 'array', items: { type: 'string' }, description: 'Слабые темы этого курса.' },
  }),
  describeTool('createStudyPlan', 'Используй для подготовки помощи студенту. Возвращает план по самому рискованному курсу с учётом тем, посещаемости и сроков.', { studentId }),
  describeTool('notifyStudent', 'Используй после подготовки плана и понятного сообщения. Сейчас только сохраняет сообщение в памяти, без отправки.', {
    studentId, message: { type: 'string', description: 'Понятное сообщение на русском языке с причинами риска и планом помощи.' },
  }),
  describeTool('scheduleFollowUp', 'Используй после подготовки помощи, чтобы записать повторную проверку. Сейчас это только запись в памяти, без автоматического запуска.', {
    studentId, days: { type: 'integer', minimum: 1, description: 'Через сколько дней проверить прогресс.' },
  }),
];
// Наши служебные поля не нужно отправлять в API вместе с описанием функции.
const openAITools = agentTools.map(({ toolType, requiresApproval, ...definition }) => definition);
module.exports = { agentTools, openAITools };
