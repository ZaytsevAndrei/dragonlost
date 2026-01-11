import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import './Header.css';

function Header() {
  const { user, logout } = useAuthStore();
  const API_URL = import.meta.env.VITE_API_URL || '/api';

  const handleLogin = () => {
    window.location.href = `${API_URL}/auth/steam`;
  };

  return (
    <header className="header">
      <div className="container">
        <div className="header-content">
          <Link to="/" className="logo">
            <h1>DragonLost</h1>
          </Link>

          <nav className="nav">
            <Link to="/" className="nav-link">
              Главная
            </Link>
            <Link to="/stats" className="nav-link">
              Статистика
            </Link>
            <Link to="/servers" className="nav-link">
              Сервера
            </Link>
          </nav>

          <div className="auth-section">
            {user ? (
              <div className="user-info">
                <img src={user.avatar} alt={user.username} className="user-avatar" />
                <span className="user-name">{user.username}</span>
                <button onClick={logout} className="btn-logout">
                  Выход
                </button>
              </div>
            ) : (
              <button onClick={handleLogin} className="btn-login">
                <img
                  src="https://steamcommunity-a.akamaihd.net/public/images/signinthroughsteam/sits_01.png"
                  alt="Sign in through Steam"
                />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
