import type { StudentDetails as Student } from '../api/academicApi';
import { trajectoryLabels } from '../data/studentLabels';

export default function GradeTrajectory({ student }: { student: Student }) {
  const grades = student.gradeHistory;
  const x = (index: number) => 45 + index * 500 / Math.max(grades.length - 1, 1);
  const y = (grade: number) => 185 - grade * 1.5;
  const points = grades.map((grade, index) => `${x(index)},${y(grade)}`).join(' ');
  return (
    <section className="analysis-section">
      <h3>Динамика успеваемости</h3>
      <p className="analysis-caption">Траектория: {trajectoryLabels[student.trajectory.direction]}</p>
      <svg className="grade-chart" viewBox="0 0 590 225" role="img" aria-label={`Оценки по неделям: ${grades.join(', ')}. Траектория: ${trajectoryLabels[student.trajectory.direction]}`}>
        {[0, 25, 50, 75, 100].map((grade) => <g key={grade}><line x1="45" x2="545" y1={y(grade)} y2={y(grade)} stroke="#e5ebf2" /><text x="32" y={y(grade) + 4} textAnchor="end">{grade}</text></g>)}
        <polyline points={points} fill="none" stroke="#326ca9" strokeWidth="3" strokeLinejoin="round" />
        {grades.map((grade, index) => <g key={index}>
          <circle cx={x(index)} cy={y(grade)} r="4" fill="#fff" stroke="#326ca9" strokeWidth="2"><title>Неделя {index + 1}: {grade} баллов</title></circle>
          <text x={x(index)} y={y(grade) - 12} textAnchor="middle" className="grade-label">{grade}</text>
          <text x={x(index)} y="211" textAnchor="middle">Неделя {index + 1}</text>
        </g>)}
      </svg>
    </section>
  );
}
