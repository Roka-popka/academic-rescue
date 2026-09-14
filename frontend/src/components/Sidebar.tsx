const navigation = [
  { label: 'Главная', path: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z' },
  { label: 'Студенты', path: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.9' },
  { label: 'Наблюдение', path: 'M12 8v5 M12 16v.1 M10 3 2 18q-1 3 2 3h16q3 0 2-3L14 3q-2-3-4 0' },
  { label: 'Вмешательства', path: 'M12 3 3 7v6q1 6 9 9 8-3 9-9V7z M8 12h8 M12 8v8' },
  { label: 'Отчёты', path: 'M5 3h10l4 4v14H5z M14 3v5h5 M8 16v2 M12 12v6 M16 10v8' },
  { label: 'Настройки', path: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6' },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <a className="brand" href="#dashboard" aria-label="Главная — Academic Rescue">
        <span className="brand-mark" aria-hidden="true">A<span>+</span></span>
        <span>Academic Rescue<small>АКАДЕМИЧЕСКАЯ ПОДДЕРЖКА</small></span>
      </a>
      <div className="workspace-label">КАБИНЕТ ПРЕПОДАВАТЕЛЯ</div>
      <nav aria-label="Основная навигация">
        {navigation.map(({ label, path }, index) => (
          <button key={label} type="button" className={`nav-item ${index === 0 ? 'active' : ''}`}
            aria-current={index === 0 ? 'page' : undefined} disabled={index !== 0}
            title={index === 0 ? 'Текущая страница' : `${label}: раздел скоро появится`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
            {label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer"><span className="workspace-icon" aria-hidden="true">AR</span><div>Учебное пространство<small>Доступ преподавателя</small></div></div>
    </aside>
  );
}
