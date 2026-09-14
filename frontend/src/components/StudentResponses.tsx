import { useEffect, useState } from 'react';
import { getStudentResponses, type StudentResponse } from '../api/academicApi';
import { responseLabels } from '../data/studentLabels';

export default function StudentResponses({ studentId }: { studentId: string }) {
  const [responses, setResponses] = useState<StudentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getStudentResponses(studentId, controller.signal)
      .then((items) => { if (!controller.signal.aborted) setResponses(items); })
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [studentId]);
  return <section className="agent-recommendation"><h3>Ответы студента</h3>
    {loading ? <p role="status">Загрузка ответов...</p> : error ? <p role="alert">{error}</p> : responses.length === 0 ? <p>Ответов пока нет.</p>
      : <ul className="student-response-list">{responses.map((response) => <li key={response.id}>
        <strong>{response.type === 'NEED_TEACHER_HELP' ? '⚠' : '✓'} {responseLabels[response.type]}</strong>
        <small>{new Date(response.createdAt).toLocaleString('ru-RU')}</small>
        {response.message && <p>{response.message}</p>}
      </li>)}</ul>}
  </section>;
}
