import { useEffect, useState } from 'react';
import Header, { type DemoRole } from './Header';
import GradeTrajectory from './GradeTrajectory';
import { getStudentById, getStudentActions, getStudentResponses, sendStudentResponse,
  type StudentDetails, type StudentActions, type StudentResponse, type StudentResponseType } from '../api/academicApi';
import { courseName, responseLabels, studentName } from '../data/studentLabels';
import './studentPortal.css';

const STUDENT_ID = 's1';
const navigation = [ ['student-home', 'Главная'], ['student-progress', 'Моя успеваемость'], ['student-plan', 'План помощи'], ['student-materials', 'Материалы'], ['student-messages', 'Сообщения'] ];
const taskStatuses = ['Не начато', 'В процессе', 'Выполнено'];

export default function StudentDashboard({ onRoleChange }: { onRoleChange: (role: DemoRole) => void }) {
  const [student, setStudent] = useState<StudentDetails | null>(null);
  const [actions, setActions] = useState<StudentActions | null>(null);
  const [responses, setResponses] = useState<StudentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('student-home');
  const [taskState, setTaskState] = useState<Record<string, string>>({});
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [sending, setSending] = useState<StudentResponseType | null>(null);
  const [responseError, setResponseError] = useState('');
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getStudentById(STUDENT_ID, controller.signal), getStudentActions(STUDENT_ID, controller.signal), getStudentResponses(STUDENT_ID, controller.signal)])
      .then(([details, history, replies]) => {
        if (controller.signal.aborted) return;
        setStudent(details); setActions(history); setResponses(replies);
      })
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function respond(type: StudentResponseType) {
    if (sending) return;
    setSending(type); setResponseError(''); setConfirmation('');
    try {
      const response = await sendStudentResponse(STUDENT_ID, type);
      setResponses((previous) => [...previous, response]);
      setConfirmation('Ответ сохранён. Преподаватель увидит его в вашей карточке.');
    } catch (error) { setResponseError(error instanceof Error ? error.message : 'Не удалось сохранить ответ.'); }
    finally { setSending(null); }
  }

  const approvedPlan = actions?.approvedPlans.at(-1)?.plan.steps;
  const suggestedTasks = student ? [
    ...student.weakTopics.map((topic) => topic === 'Indexes' ? 'Изучить работу индексов' : `Повторить тему ${topic}`),
    ...student.upcomingDeadlines.map((deadline) => `Выполнить ближайшее задание «${deadline.title}»`),
    'Посетить следующее занятие',
    ...(student.missedDeadlines > 0 ? ['Разобрать пропущенные работы'] : []),
  ] : [];
  const tasks = approvedPlan?.length ? approvedPlan : suggestedTasks;
  const followUp = actions?.followUps.find((item) => !item.completed);
  const lastMessage = actions?.notifications.at(-1);
  const material = student?.materials.find((item) => item.topic === openTopic);

  return <div className="app-layout student-portal">
    <a href="#student-home" className="skip-link">Перейти к содержимому</a>
    <aside className="sidebar">
      <a className="brand" href="#student-home"><span className="brand-mark" aria-hidden="true">A<span>+</span></span><span>Academic Rescue<small>ВАША УЧЕБНАЯ ПОДДЕРЖКА</small></span></a>
      <div className="workspace-label">КАБИНЕТ СТУДЕНТА</div>
      <nav aria-label="Навигация студента">{navigation.map(([id, label]) => <a key={id} href={`#${id}`} className={`nav-item ${activeSection === id ? 'active' : ''}`} aria-current={activeSection === id ? 'location' : undefined} onClick={() => setActiveSection(id)}>{label}</a>)}</nav>
      <div className="sidebar-footer">Шаг за шагом к лучшим результатам</div>
    </aside>
    <div className="main-layout">
      <Header role="student" onRoleChange={onRoleChange} />
      <main id="student-home">
        <div className="page-heading"><div><div className="eyebrow">МОЯ УЧЁБА / ГЛАВНАЯ</div><h1>Добро пожаловать, {student ? studentName(student.name) : 'Тимур'}</h1><p>Academic Rescue помогает следить за учебной динамикой и вовремя получать поддержку.</p></div></div>
        {loading && <p role="status">Загрузка данных...</p>}
        {error && <p role="alert">{error}</p>}
        {student && actions && <>
          <div className="summary-grid student-overview">
            <article className="summary-card"><h2>Текущий статус</h2><strong>{student.status === 'NORMAL' ? 'Всё в порядке' : 'Требуется внимание'}</strong><p>{courseName(student.course)}</p></article>
            <article className="summary-card"><h2>Прогноз итоговой оценки</h2><strong>{student.projectedFinal?.toFixed(2) ?? 'Нет данных'}</strong><p>Ориентир для учебного прогресса</p></article>
            <article className="summary-card"><h2>Посещаемость</h2><strong>{student.attendance}%</strong><p>По текущей дисциплине</p></article>
            <article className="summary-card"><h2>Следующая проверка</h2><strong>{followUp ? new Date(followUp.scheduledFor).toLocaleDateString('ru-RU') : 'Не назначена'}</strong><p>{followUp ? `Через ${followUp.days} ${followUp.days === 1 ? 'день' : followUp.days < 5 ? 'дня' : 'дней'} от назначения` : 'Рекомендуется проверить прогресс через 3 дня'}</p></article>
          </div>
          <section id="student-progress" className="card portal-section"><h2>Моя динамика</h2><p className="analysis-caption">{courseName(student.course)}</p><GradeTrajectory student={student} />
            <p className="supportive-note">{student.trajectory.direction === 'DECLINING' ? 'Последние результаты снизились. Academic Rescue подготовил рекомендации, которые помогут улучшить ситуацию.' : 'Продолжайте учиться в своём темпе и следите за прогрессом.'}</p>
          </section>
          <section id="student-plan" className="card portal-section"><h2>Мой план на неделю</h2><p className="analysis-caption">{approvedPlan?.length ? 'План подтверждён преподавателем.' : 'Предварительные рекомендации по учебным данным. План преподавателя ещё не подтверждён.'}</p>
            <ol className="student-task-list">{tasks.map((task, index) => <li key={`${index}-${task}`}><span>{task}</span><select aria-label={`Статус задачи: ${task}`} value={taskState[task] ?? taskStatuses[0]} onChange={(event) => setTaskState((previous) => ({ ...previous, [task]: event.target.value }))}>{taskStatuses.map((status) => <option key={status}>{status}</option>)}</select></li>)}</ol>
            <p className="analysis-caption">Отметки задач сохраняются только на этой странице и не изменяют оценки. Сообщить преподавателю о выполнении можно кнопкой ниже.</p>
          </section>
          <section id="student-materials" className="card portal-section"><h2>Рекомендуемые материалы</h2>
            <div className="student-materials">{student.materials.map((item) => <article key={item.topic}><small>{item.topic}</small><h3>{item.title}</h3><button className="secondary-action" type="button" aria-expanded={openTopic === item.topic} aria-controls="student-material-content" onClick={() => setOpenTopic(openTopic === item.topic ? null : item.topic)}>Открыть материал</button></article>)}</div>
            {student.materials.length === 0 && <p>Материалы пока не подобраны.</p>}
            {material && <div id="student-material-content" className="material-content" role="region" aria-label={material.title}><h3>{material.title}</h3><p>{material.content}</p><button type="button" className="secondary-action" onClick={() => setOpenTopic(null)}>Закрыть материал</button></div>}
          </section>
          <section id="student-messages" className="card portal-section"><h2>Последнее сообщение</h2>
            {lastMessage ? <><p className="analysis-caption">Сохранено преподавателем: {new Date(lastMessage.sentAt).toLocaleString('ru-RU')}</p><p className="student-message">{lastMessage.message}</p></> : <p>Новых сообщений пока нет.</p>}
            <div className="student-replies"><h3>Обратная связь</h3><div className="action-buttons">
              <button className="primary-action" disabled={Boolean(sending)} onClick={() => respond('PLAN_UNDERSTOOD')}>План понятен</button>
              <button className="secondary-action" disabled={Boolean(sending)} onClick={() => respond('NEED_TEACHER_HELP')}>Нужна помощь преподавателя</button>
              <button className="secondary-action" disabled={Boolean(sending)} onClick={() => respond('TASK_COMPLETED')}>Я выполнил задание</button>
            </div><p role="status">{sending ? 'Сохранение ответа...' : confirmation}</p>{responseError && <p role="alert">{responseError}</p>}
            {responses.length > 0 && <><h3>Мои ответы</h3><ul className="student-response-list">{responses.map((response) => <li key={response.id}>{responseLabels[response.type]}<small>{new Date(response.createdAt).toLocaleString('ru-RU')}</small></li>)}</ul></>}
            </div>
          </section>
        </>}
        <footer className="page-footer">Деморежим · Кабинет Тимура · Ответы хранятся на сервере до его перезапуска</footer>
      </main>
    </div>
  </div>;
}
