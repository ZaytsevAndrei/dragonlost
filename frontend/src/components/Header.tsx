import { Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import './Header.css';

function Header() {
  const { user, logout } = useAuthStore();
  const API_URL = import.meta.env.VITE_API_URL || '/api';
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleLogin = () => {
    window.location.href = `${API_URL}/auth/steam`;
  };

  const handleLogout = async () => {
    setDropdownOpen(false);
    await logout();
  };

  // Закрытие dropdown при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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
            <Link to="/shop" className="nav-link">
              Магазин
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
              <div className="user-dropdown" ref={dropdownRef}>
                <div 
                  className="user-info" 
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                >
                  <img src={user.avatar} alt={user.username} className="user-avatar" />
                  <span className="user-name">{user.username}</span>
                  <span className={`dropdown-arrow ${dropdownOpen ? 'open' : ''}`}>▼</span>
                </div>
                
                {dropdownOpen && (
                  <div className="dropdown-menu">
                    <Link 
                      to="/inventory" 
                      className="dropdown-item"
                      onClick={() => setDropdownOpen(false)}
                    >
                      <span className="dropdown-icon">🎒</span>
                      Мой инвентарь
                    </Link>
                    <Link 
                      to="/rewards" 
                      className="dropdown-item"
                      onClick={() => setDropdownOpen(false)}
                    >
                      <span className="dropdown-icon">🎁</span>
                      Ежедневная награда
                    </Link>
                    <div className="dropdown-divider"></div>
                    <button 
                      onClick={handleLogout} 
                      className="dropdown-item logout"
                    >
                      <span className="dropdown-icon">🚪</span>
                      Выход
                    </button>
                  </div>
                )}
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
