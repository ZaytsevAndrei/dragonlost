import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ServerStatus from '../components/ServerStatus';
import { useAuthStore } from '../store/authStore';
import Items from './Items';
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

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.replace('#', '');
    const el = document.getElementById(id);
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [location.hash]);

  return (
    <div className="home">
      <AnimatedSection className="home-section--features" id="features">
        <header className="home-section-header">
          <h2 className="home-section-title">Играй с пользой</h2>
          <p className="home-section-subtitle">Следи за рейтингом и забирай ежедневную награду</p>
        </header>

        <div className="features features--duo">
          <Link to="/stats" className="feature-card feature-card-link">
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
            </div>
            <h3>Статистика</h3>
            <p>Подробная статистика игроков: убийства, смерти, K/D и многое другое</p>
            <span className="feature-card-inline-link">Открыть рейтинг →</span>
          </Link>

          <Link to="/rewards" className="feature-card feature-card-link feature-card-reward">
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="3" /></svg>
            </div>
            <h3>Ежедневная награда</h3>
            <p>
              {user
                ? 'Крутите колесо на 25 секторов — как в казино Rust. Награда до 200 монет в день.'
                : 'Авторизуйтесь и крутите колесо раз в день — награда на баланс сайта.'}
            </p>
            <span className="feature-card-inline-link">Перейти к колесу →</span>
          </Link>
        </div>
      </AnimatedSection>

      <AnimatedSection className="home-section--shop">
        <Items embedded />
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
