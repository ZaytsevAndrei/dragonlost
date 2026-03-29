import { Link } from 'react-router-dom';
import './AdminHome.css';

function AdminHome() {
  return (
    <div className="admin-home">
      <header className="admin-home-header">
        <h1>Админ-панель</h1>
        <p className="admin-home-lead">Выберите раздел управления сайтом.</p>
      </header>
      <div className="admin-home-grid">
        <Link to="/admin/map-vote" className="admin-home-card">
          <span className="admin-home-card-icon" aria-hidden>
            🗳️
          </span>
          <h2>Голосования за карту</h2>
          <p>Создание сессий, варианты карт, закрытие и итоги.</p>
        </Link>
        <Link to="/admin/vouchers" className="admin-home-card">
          <span className="admin-home-card-icon" aria-hidden>
            🎟️
          </span>
          <h2>Промокоды</h2>
          <p>Сроки действия, лимиты активаций, недельный сброс.</p>
        </Link>
      </div>
    </div>
  );
}

export default AdminHome;
