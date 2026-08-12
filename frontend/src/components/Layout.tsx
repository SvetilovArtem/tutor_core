import { NavLink, Outlet } from 'react-router-dom';
import Icon from './Icon';
import { useTheme } from '../hooks/useTheme';
import styles from './Layout.module.css';

const navItems = [
  { to: '/', label: 'Дашборд', icon: 'dashboard' },
  { to: '/schedule', label: 'Расписание', icon: 'calendar' },
  { to: '/students', label: 'Ученики', icon: 'users' },
  { to: '/lessons', label: 'Уроки', icon: 'book' },
  { to: '/packages', label: 'Пакеты', icon: 'ticket' },
];

export default function Layout() {
  const { theme, toggle } = useTheme();

  const logout = () => {
    localStorage.removeItem('access_token');
    window.location.href = '/login';
  };

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>🎓 Tutor Core</div>
        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
              }
            >
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <button className={styles.themeBtn} onClick={toggle} title="Переключить тему">
            <Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} />
            <span>{theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}</span>
          </button>
          <button className={styles.logoutBtn} onClick={logout}>
            <Icon name="logout" size={18} />
            <span>Выйти</span>
          </button>
        </div>
      </aside>

      <div className={styles.mainWrapper}>
        <main className={styles.main}>
          <Outlet />
        </main>
        <footer className={styles.footer}>
          <span>Tutor Core v0.1</span>
          <span>support@tutorcore.by</span>
        </footer>
      </div>
    </div>
  );
}