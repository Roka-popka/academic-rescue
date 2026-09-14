import type { StudentDetails as Student } from '../api/academicApi';
import { getStudentActions, approvePlan, sendIntervention, sendWarning, scheduleFollowUp, type StudentActions, type ActionResult } from '../api/academicApi';
import { useEffect, useRef, useState } from 'react';
import { statusLabels, riskLabels, studentName, courseName } from '../data/studentLabels';
import GradeTrajectory from './GradeTrajectory';
import AgentTimeline from './AgentTimeline';
import StudentResponses from './StudentResponses';

export default function StudentDetails({ student, onClose }: { student: Student; onClose: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [actions, setActions] = useState<StudentActions | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const approved = Boolean(actions?.approvedPlans.length);
  const sent = Boolean(actions?.notifications.some((item) => item.kind === (student.status === 'WATCHLIST' ? 'WARNING' : 'INTERVENTION')));
  const followUp = actions?.followUps.find((item) => !item.completed);
  const recommendation = actions?.approvedPlans.at(-1)?.plan.steps ?? student.recommendation;
  const full = student.status === 'INTERVENTION_REQUIRED';
  const normal = student.status === 'NORMAL';

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: 'start' });
  }, [student.id]);

  useEffect(() => {
    const controller = new AbortController();
    setActions(null);
    setError('');
    setMessage('');
    getStudentActions(student.id, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setActions(result); })
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [student.id]);

  async function complete(action: () => Promise<ActionResult>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await action();
      setActions(result.actions);
      setMessage(result.message);
    } catch (error) { setError(error instanceof Error ? error.message : 'Не удалось выполнить действие.'); }
    finally { setBusy(false); }
  }

  return (
    <section className="card details-panel" id="student-details" aria-labelledby="details-heading">
      <div className="section-header student-detail-header">
        <div><div className="eyebrow">АНАЛИЗ АКАДЕМИЧЕСКИХ РИСКОВ</div><h2 id="details-heading" ref={headingRef} tabIndex={-1}>{studentName(student.name)}</h2><p>{courseName(student.course)}</p>
          <div className="detail-badges"><span className={`badge status-${student.status.toLowerCase()}`}>{statusLabels[student.status]}</span><span className={`badge risk-${student.riskLevel.toLowerCase()}`}>{riskLabels[student.riskLevel]} РИСК</span></div>
        </div>
        <button className="close-button" type="button" onClick={onClose} aria-label="Закрыть карточку студента">×</button>
      </div>
      <dl className="academic-metrics">
        <div><dt>Риск</dt><dd className={full ? 'metric-warning' : ''}>{student.riskScore} <small>/ 100</small></dd></div>
        <div><dt>Прогноз итоговой оценки</dt><dd>{student.projectedFinal?.toFixed(2) ?? 'Нет данных'}</dd></div>
        <div><dt>Посещаемость</dt><dd>{student.attendance}%</dd></div>
        <div><dt>Пропущено дедлайнов</dt><dd>{student.missedDeadlines}</dd></div>
      </dl>
      <div className="analysis-columns">
        <div><GradeTrajectory student={student} />
          <section className="analysis-section"><h3>Почему студент в зоне риска</h3>
            {normal ? <p className="positive-message">По результатам скрининга вмешательство не требуется.</p> : <><p className="analysis-caption">Факторы выявлены из учебных данных, а не предположений AI.</p><ul className="risk-factor-list">{student.riskFactors.map((factor) => <li key={factor}>{factor}</li>)}{student.weakTopics.length > 0 && <li>Слабые темы: {student.weakTopics.join(', ')}</li>}</ul></>}
          </section>
        </div>
        <AgentTimeline student={student} actions={actions} />
      </div>
      <section className="agent-recommendation"><h3>Рекомендация Academic Rescue</h3>
        {full ? <><p className="recommendation-source">Данные локального академического агента. AI не подключён.</p>{recommendation.length ? <ul>{recommendation.map((item) => <li key={item}>{item}</li>)}</ul> : <p>План помощи ещё не создан. Кнопка «Подтвердить план» создаст и подтвердит его на сервере.</p>}</> : <p>{student.recommendation[0]}</p>}
      </section>
      <StudentResponses studentId={student.id} />
      <div className="teacher-actions">
        {!normal && <div className="action-buttons">
          {full && <button className="primary-action" type="button" disabled={busy || !actions || approved} onClick={() => complete(() => approvePlan(student.id))}>{approved ? '✓ План подтверждён' : 'Подтвердить план'}</button>}
          <button className={full ? 'secondary-action' : 'primary-action'} type="button" disabled={busy || !actions || sent || (full && !approved)} onClick={() => complete(() => full ? sendIntervention(student.id) : sendWarning(student.id))}>{sent ? (full ? '✓ Сообщение сохранено в демо-режиме' : '✓ Мягкое предупреждение сохранено в демо-режиме') : full ? 'Отправить студенту' : 'Отправить мягкое предупреждение'}</button>
          <button className="secondary-action" type="button" disabled={busy || !actions || Boolean(followUp)} onClick={() => complete(() => scheduleFollowUp(student.id, full ? (student.riskLevel === 'CRITICAL' ? 1 : 3) : 7))}>{followUp ? '✓ Повторная проверка назначена' : 'Назначить повторную проверку'}</button>
        </div>}
        {error && <p role="alert">{error}</p>}
        <p role="status">{busy ? 'Выполняется действие...' : !actions && !error ? 'Загрузка действий...' : message}</p>
        <p>Действия сохраняются в памяти сервера. Внешние сообщения не отправляются.</p>
      </div>
    </section>
  );
}
