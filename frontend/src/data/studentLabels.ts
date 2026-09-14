export const statusLabels = { NORMAL: 'В НОРМЕ', WATCHLIST: 'НАБЛЮДЕНИЕ', INTERVENTION_REQUIRED: 'ТРЕБУЕТ ВМЕШАТЕЛЬСТВА' };
export const riskLabels = { LOW: 'НИЗКИЙ', MEDIUM: 'СРЕДНИЙ', HIGH: 'ВЫСОКИЙ', CRITICAL: 'КРИТИЧЕСКИЙ' };
export const trajectoryLabels = { DECLINING: 'Снижается', STABLE: 'Стабильная', IMPROVING: 'Улучшается' };
const names: Record<string, string> = { Timur: 'Тимур', Nursultan: 'Нурсултан', Alina: 'Алина', Amina: 'Амина' };
export const studentName = (name: string) => names[name] ?? name;
export const courseName = (course: string) => course === 'Database Systems' ? 'Базы данных' : course;
export const responseLabels = { PLAN_UNDERSTOOD: 'План понятен', NEED_TEACHER_HELP: 'Нужна помощь преподавателя', TASK_COMPLETED: 'Задание отмечено как выполненное' };
