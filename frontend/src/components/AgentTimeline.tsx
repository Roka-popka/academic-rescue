import type { StudentDetails as Student } from '../api/academicApi';
import type { StudentActions } from '../api/academicApi';


export default function AgentTimeline({ student, actions }: { student: Student; actions: StudentActions | null }) {
  const full = student.status === 'INTERVENTION_REQUIRED';
  const approved = Boolean(actions?.approvedPlans.length);
  const sent = Boolean(actions?.notifications.some((item) => item.kind === (full ? 'INTERVENTION' : 'WARNING')));
  const followUp = actions?.followUps.find((item) => !item.completed);
  const steps = [{ label: 'Академические данные проверены', done: true }];
  if (student.status === 'NORMAL') {
    steps.push({ label: 'Успеваемость стабильна. Вмешательство не требуется', done: true });
  } else {
    steps.push(
      { label: student.trajectory.direction === 'DECLINING' ? 'Обнаружена негативная динамика' : 'Учебная динамика проверена', done: true },
      { label: 'Определены основные факторы риска', done: true },
      { label: full ? (approved || student.recommendation.length ? 'План помощи доступен' : 'План помощи ещё не создан') : 'Доступна профилактическая рекомендация', done: approved || student.recommendation.length > 0 },
    );
    if (full) steps.push({ label: approved ? 'План помощи подтверждён' : 'Ожидает подтверждения преподавателя', done: approved });
    steps.push({ label: sent ? 'Сообщение подготовлено и сохранено локально' : 'Сообщение ожидает решения преподавателя', done: sent });
    steps.push({ label: followUp ? `Повторная проверка назначена: ${new Date(followUp.scheduledFor).toLocaleDateString('ru-RU')}` : 'Повторная проверка ещё не назначена', done: Boolean(followUp) });
  }
  return <section className="analysis-section"><h3>Действия агента</h3><p className="analysis-caption">Состояние локального сервера</p>{!actions ? <p>Состояние действий ещё не загружено.</p> : <ol className="agent-timeline">{steps.map((step) => <li key={step.label} className={step.done ? 'done' : 'pending'}><span aria-hidden="true">{step.done ? '✓' : '○'}</span><div>{step.label}<small>{step.done ? 'Выполнено' : 'Ожидается'}</small></div></li>)}</ol>}</section>;
}
