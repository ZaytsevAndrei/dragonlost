import { Link } from 'react-router-dom';
import './Home.css';

function Home() {
  return (
    <div className="home">
      <section className="features">
        <div className="feature-card">
          <div className="feature-icon">📊</div>
          <h3>Статистика</h3>
          <p>
            Подробная статистика игроков: убийства, смерти, K/D и многое другое
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🎮</div>
          <h3>Сервера</h3>
          <p>Информация о наших серверах, онлайн игроков и расписание вайпов</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🔒</div>
          <h3>Steam авторизация</h3>
          <p>Войдите через Steam для доступа к расширенным функциям</p>
        </div>
      </section>

      <section className="cta">
        <h2>Готовы начать играть?</h2>
        <p>Присоединяйтесь к нашему серверу прямо сейчас!</p>
        <Link to="/servers" className="btn-cta">Подключиться к серверу</Link>
      </section>
    </div>
  );
}

export default Home;
