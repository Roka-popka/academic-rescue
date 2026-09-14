// Выдуманные данные для проверки программы. Сроки указаны в днях от запуска.
const students = [
  {
    id: 's1', name: 'Timur',
    gradesByCourse: { 'Database Systems': [75, 68, 57, 48, 42], 'Программирование': [80, 82, 81, 84, 85] },
    attendanceByCourse: { 'Database Systems': 61, 'Программирование': 90 },
    missedDeadlines: { 'Database Systems': 2, 'Программирование': 0 },
    weakTopics: { 'Database Systems': ['JOIN', 'Indexes'], 'Программирование': [] },
    upcomingDeadlines: [{ courseName: 'Database Systems', title: 'Практика по JOIN', daysLeft: 2 }],
  },
  {
    id: 's2', name: 'Amina',
    gradesByCourse: { 'Database Systems': [85, 86, 85, 87, 86], 'Программирование': [90, 91, 90, 92, 93] },
    attendanceByCourse: { 'Database Systems': 96, 'Программирование': 98 },
    missedDeadlines: { 'Database Systems': 0, 'Программирование': 0 },
    weakTopics: { 'Database Systems': [], 'Программирование': [] },
    upcomingDeadlines: [{ courseName: 'Программирование', title: 'Практическая работа', daysLeft: 5 }],
  },
  {
    id: 's3', name: 'Alina',
    // Demo: steady decline while the current risk remains LOW.
    gradesByCourse: { 'Database Systems': [88, 84, 80, 76, 72], 'Программирование': [82, 83, 84, 85, 86] },
    attendanceByCourse: { 'Database Systems': 35, 'Программирование': 40 },
    missedDeadlines: { 'Database Systems': 0, 'Программирование': 0 },
    weakTopics: { 'Database Systems': [], 'Программирование': [] },
    upcomingDeadlines: [{ courseName: 'Database Systems', title: 'Работа с таблицами', daysLeft: 4 }],
  },
  {
    id: 's4', name: 'Nursultan',
    gradesByCourse: { 'Database Systems': [50, 45, 40, 30, 20], 'Программирование': [65, 64, 63, 62, 61] },
    attendanceByCourse: { 'Database Systems': 50, 'Программирование': 80 },
    missedDeadlines: { 'Database Systems': 3, 'Программирование': 1 },
    weakTopics: { 'Database Systems': ['JOIN', 'Indexes'], 'Программирование': ['Циклы'] },
    upcomingDeadlines: [{ courseName: 'Database Systems', title: 'Запросы к базе данных', daysLeft: 1 }],
  },
];

// Материалы храним прямо здесь, без внешних сайтов.
const courseMaterials = [
  { courseName: 'Database Systems', topic: 'JOIN', title: 'Соединение таблиц', content: 'JOIN соединяет строки двух таблиц по общему полю. Соедините таблицы студентов и курсов по course_id.' },
  { courseName: 'Database Systems', topic: 'Indexes', title: 'Поиск с помощью индексов', content: 'Индекс ускоряет поиск, но занимает место и замедляет запись. Выберите поле для индекса в запросе поиска студента.' },
  { courseName: 'Программирование', topic: 'Циклы', title: 'Повторение действий', content: 'Цикл повторяет действие. Посчитайте сумму пяти оценок с помощью for.' },
];
// Эти записи исчезнут после завершения программы.
const notifications = [];
const followUps = [];
students.forEach((student) => { student.interventionHistory = []; });
const screenings = {};
module.exports = { students, courseMaterials, notifications, followUps, screenings };
