import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import type { DemoRole } from './components/Header';
import StudentDashboard from './components/StudentDashboard';
import SummaryCard from './components/SummaryCard';
import StudentTable from './components/StudentTable';
import StudentDetails from './components/StudentDetails';
import { getStudents, getStudentById, getScreeningSummary, type StudentSummary, type StudentDetails as StudentData, type ScreeningSummary } from './api/academicApi';

export default function App() {
  const [role, setRole] = useState<DemoRole>('teacher');
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [summary, setSummary] = useState<ScreeningSummary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getStudents(controller.signal), getScreeningSummary(controller.signal)])
      .then(([list, totals]) => {
        const priority = { INTERVENTION_REQUIRED: 0, WATCHLIST: 1, NORMAL: 2 };
        setStudents(list.sort((a, b) => priority[a.status] - priority[b.status] || b.riskScore - a.riskScore));
        setSummary(totals);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setDetailsLoading(true);
    setDetailsError(false);
    setSelectedStudent(null);
    getStudentById(selectedId, controller.signal)
      .then((student) => { if (!controller.signal.aborted) setSelectedStudent(student); })
      .catch(() => { if (!controller.signal.aborted) setDetailsError(true); })
      .finally(() => { if (!controller.signal.aborted) setDetailsLoading(false); });
    return () => controller.abort();
  }, [selectedId]);

  function closeDetails() {
    const id = selectedId;
    setSelectedId(null);
    setSelectedStudent(null);
    document.querySelector<HTMLButtonElement>(`button[data-student-id="${id}"]`)?.focus();
  }

  if (role === 'student') return <StudentDashboard onRoleChange={setRole} />;

  return (
    <div className="app-layout">
      <a href="#dashboard" className="skip-link">Перейти к панели</a>
      <Sidebar />
      <div className="main-layout">
        <Header role={role} onRoleChange={setRole} />
        <main id="dashboard">
          <div className="page-heading"><div><div className="eyebrow">ОБЗОР / ГЛАВНАЯ</div><h1>Панель преподавателя</h1><p>Учебная динамика студентов и своевременная академическая поддержка.</p></div><div className="semester-chip"><span aria-hidden="true">▦</span> Обзор семестра <strong>Неделя 5</strong></div></div>
          {loading && <p role="status">Загрузка данных...</p>}
          {error && <p role="alert">Не удалось загрузить данные Academic Rescue.</p>}
          {summary && !loading && !error && <>
          <div className="summary-grid">
            <SummaryCard title="Студентов под наблюдением" value={students.length} description="В текущей учебной группе" tone="blue" />
            <SummaryCard title="В норме" value={summary.normal} description="Дополнительная помощь не нужна" tone="blue" />
            <SummaryCard title="Наблюдение" value={summary.watchlist} description="Мягкая профилактическая поддержка" tone="blue" />
            <SummaryCard title="Требуют вмешательства" value={summary.interventionRequired} description="Нужна персональная поддержка" tone="blue" />
          </div>
          <StudentTable students={students} selectedId={selectedId ?? undefined} onSelect={(student) => setSelectedId(student.id)} />
          {selectedId && detailsLoading && <p role="status">Загрузка данных...</p>}
          {selectedId && detailsError && <p role="alert">Не удалось загрузить данные Academic Rescue. <button onClick={closeDetails}>Закрыть</button></p>}
          {selectedStudent && selectedStudent.id === selectedId && !detailsLoading && <StudentDetails student={selectedStudent} onClose={closeDetails} />}
          <section className="card monitoring-section" aria-labelledby="monitoring-heading">
            <div className="monitoring-intro"><span className="monitoring-icon" aria-hidden="true">✧</span><div><h2 id="monitoring-heading">AI-мониторинг</h2><p>Academic Rescue постоянно отслеживает учебную динамику и использует глубокий AI-анализ только тогда, когда студенту действительно может потребоваться помощь.</p></div><span className="demo-badge">Деморежим</span></div>
            <dl className="monitoring-metrics"><div><dt>Проверено студентов</dt><dd>{summary.studentsScanned}</dd></div><div><dt>Глубокий анализ</dt><dd>{summary.deepAnalyses}</dd></div><div><dt>Краткий анализ</dt><dd>{summary.briefReviews}</dd></div><div><dt>Требуют полного вмешательства</dt><dd>{summary.interventionRequired}</dd></div></dl>
            <div className="monitoring-footer"><span className="small-dot" />Сначала проверка по правилам. Углублённый анализ — при необходимости.</div>
          </section>
          </>}
          <footer className="page-footer"><span>Academic Rescue · Поддержка учебных достижений</span><span>Данные локального сервера · AI не подключён</span></footer>
        </main>
      </div>
    </div>
  );
}
