import type { StudentSummary as Student } from '../api/academicApi';
import { statusLabels, riskLabels, trajectoryLabels, studentName, courseName } from '../data/studentLabels';

interface Props {
  students: Student[];
  selectedId?: string;
  onSelect: (student: Student) => void;
}

export default function StudentTable({ students, selectedId, onSelect }: Props) {
  return (
    <section className="card student-section" aria-labelledby="students-heading">
      <div className="section-header"><div><h2 id="students-heading">Студенты, требующие внимания</h2><p>Все студенты группы — в порядке приоритета поддержки.</p></div><span className="count-label">Студентов: {students.length}</span></div>
      <div className="table-scroll" role="region" aria-label="Таблица академических рисков студентов" tabIndex={0}>
        <table>
          <thead><tr>{['Студент', 'Дисциплина', 'Риск', 'Траектория', 'Прогноз итоговой оценки', 'Статус', 'Действие'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
          <tbody>{students.map((student) => (
            <tr key={student.id} className={student.id === selectedId ? 'selected-row' : ''}>
              <th scope="row"><span className="student-name"><span className="student-avatar" aria-hidden="true">{studentName(student.name).slice(0, 2).toUpperCase()}</span>{studentName(student.name)}</span></th>
              <td className="course-cell">{courseName(student.course)}</td>
              <td><div className="risk-cell"><strong>{student.riskScore}<small>/100</small></strong><span className={`badge risk-${student.riskLevel.toLowerCase()}`}>{riskLabels[student.riskLevel]}</span></div></td>
              <td><span className={`trajectory ${student.trajectory.direction.toLowerCase()}`}><span aria-hidden="true">{student.trajectory.direction === 'DECLINING' ? '↘' : student.trajectory.direction === 'IMPROVING' ? '↗' : '→'}</span>{trajectoryLabels[student.trajectory.direction]}</span></td>
              <td className="grade-cell">{student.projectedFinal?.toFixed(2) ?? 'Нет данных'}</td>
              <td><span className={`badge status-${student.status.toLowerCase()}`}>{statusLabels[student.status]}</span></td>
              <td><button type="button" className="view-button" data-student-id={student.id} aria-label={`Подробнее: ${studentName(student.name)}`} aria-controls="student-details" aria-expanded={student.id === selectedId} onClick={() => onSelect(student)}>Подробнее <span aria-hidden="true">↗</span></button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="table-footer"><span><span className="legend-dot" />Снижение оценок учитывается даже при низком текущем риске.</span><span>По приоритету поддержки</span></div>
    </section>
  );
}
