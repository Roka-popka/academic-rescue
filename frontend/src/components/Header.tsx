export type DemoRole = 'teacher' | 'student';
export default function Header({ role, onRoleChange }: { role: DemoRole; onRoleChange: (role: DemoRole) => void }) {
  return (
    <header className="top-header">
      <div className="header-title">{role === 'teacher' ? 'Мониторинг академических рисков' : 'Моё учебное пространство'}</div>
      <div className="role-switch" role="group" aria-label="Роль в деморежиме">
        <button type="button" aria-pressed={role === 'teacher'} onClick={() => onRoleChange('teacher')}>Преподаватель</button>
        <button type="button" aria-pressed={role === 'student'} onClick={() => onRoleChange('student')}>Студент</button>
      </div>
      <div className="user-block"><span className="avatar" aria-hidden="true">{role === 'teacher' ? 'ПР' : 'ТИ'}</span><div><strong>{role === 'teacher' ? 'Преподаватель' : 'Тимур'}</strong><span>{role === 'teacher' ? 'Администратор факультета' : 'Студент · деморежим'}</span></div></div>
    </header>
  );
}
