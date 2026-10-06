import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import HomeHero from '../components/HomeHero';
import ServerStatus from '../components/ServerStatus';
import WipeCountdown from '../components/WipeCountdown';
import { useAuthStore } from '../store/authStore';
import './Home.css';

function useAnimateOnScroll() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('animate-visible');
          observer.unobserve(el);
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}

function AnimatedSection({
  children,
  className = '',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useAnimateOnScroll();
  return (
    <section ref={ref} id={id} className={`home-section animate-section ${className}`.trim()}>
      {children}
    </section>
  );
}

function Home() {
  const { user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.replace('#', '');
    if (id === 'shop') {
      navigate('/shop', { replace: true });
      return;
    }
    const el = document.getElementById(id);
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [location.hash, navigate]);

  return (
    <div className="home">
      <HomeHero />

      <AnimatedSection className="home-section--wipe" id="wipe">
        <WipeCountdown variant="home" />
      </AnimatedSection>

      <AnimatedSection className="home-section--features" id="features">
        <header className="home-section-header">
          <h2 className="home-section-title">Играй с пользой</h2>
          <p className="home-section-subtitle">Следи за рейтингом и крути колесо удачи</p>
        </header>

        <div className="features features--duo">
          <Link to="/leaders" className="feature-card feature-card-link">
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
            </div>
            <h3>Топ игроков</h3>
            <p>Рейтинг игроков сервера: время в игре, убийства, K/D и добыча ресурсов</p>
            <span className="feature-card-inline-link">Смотреть рейтинг</span>
          </Link>

          <Link to="/wheel" className="feature-card feature-card-link feature-card-reward">
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="3" /></svg>
            </div>
            <h3>Колесо удачи</h3>
            <p>
              {user
                ? 'Крутите колесо раз в сутки — призы от обычных до легендарных.'
                : 'Авторизуйтесь, добавьте метку dragonlost.ru в ник Steam и крутите колесо.'}
            </p>
            <span className="feature-card-inline-link">Перейти к колесу</span>
          </Link>
        </div>
      </AnimatedSection>

      <AnimatedSection className="home-section--server" id="server">
        <header className="home-section-header">
          <h2 className="home-section-title">Сервер</h2>
          <p className="home-section-subtitle">Онлайн, карта и адрес для подключения</p>
        </header>
        <div className="home-server-wrap">
          <ServerStatus hideTitle />
        </div>
      </AnimatedSection>
    </div>
  );
}

export default Home;
