import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import StatePanel from '../components/StatePanel';
import ThemeSwitcher from '../components/ThemeSwitcher';
import './AdminLayout.css';

function AdminLayout() {
  const { user, loading } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  if (loading) {
    return (
      <div className="admin-root">
        <StatePanel type="loading" title="Загрузка" message="Проверка доступа…" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="admin-root">
        <StatePanel type="error" title="Доступ запрещён" message="Только для администраторов" />
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar" aria-label="Разделы админки">
        <div className="admin-sidebar-title">Админка</div>
        <nav className="admin-sidebar-nav">
          <NavLink to="/admin" end className={({ isActive }) => (isActive ? 'admin-nav-link admin-nav-link-active' : 'admin-nav-link')}>
            Обзор
          </NavLink>
          <NavLink
            to="/admin/map-vote"
            className={({ isActive }) => (isActive ? 'admin-nav-link admin-nav-link-active' : 'admin-nav-link')}
          >
            Голосования за карту
          </NavLink>
          <NavLink
            to="/admin/vouchers"
            className={({ isActive }) => (isActive ? 'admin-nav-link admin-nav-link-active' : 'admin-nav-link')}
          >
            Промокоды
          </NavLink>
        </nav>
        <div className="admin-sidebar-footer">
          <ThemeSwitcher compact />
        </div>
      </aside>
      <div className="admin-main">
        <Outlet />
      </div>
    </div>
  );
}

export default AdminLayout;
