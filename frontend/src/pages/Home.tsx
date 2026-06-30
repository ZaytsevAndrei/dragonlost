import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
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

function AnimatedSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useAnimateOnScroll();
  return (
    <div ref={ref} className={`animate-section ${className}`}>
      {children}
    </div>
  );
}

function Home() {
  const { user } = useAuthStore();
  const telegramBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'DragonLostBot';
  const telegramBotUrl = `https://t.me/${telegramBotUsername}`;

  return (
    <div className="home">
      {/* ===== FEATURE CARDS ===== */}
      <AnimatedSection>
        <div className="features">
          <Link to="/stats" className="feature-card feature-card-link">
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></svg>
            </div>
            <h3>Статистика</h3>
            <p>Подробная статистика игроков: убийства, смерти, K/D и многое другое</p>
          </Link>

          <Link to="/rewards" className="feature-card feature-card-link feature-card-reward">
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="3" /></svg>
            </div>
            <h3>Ежедневная награда</h3>
            <p>
              {user
                ? 'Крутите колесо на 25 секторов — как в казино Rust. Награда до 200 рублей в день.'
                : 'Авторизуйтесь и крутите колесо раз в день — награда на баланс сайта.'}
            </p>
            <span className="feature-card-inline-link">Перейти к колесу →</span>
          </Link>

          <a
            href="https://discord.gg/NSPuBH4mZJ"
            target="_blank"
            rel="noopener noreferrer"
            className="feature-card feature-card-link feature-card-discord"
          >
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24" fill="currentColor" width="30" height="30">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </div>
            <h3>Присоединяйся к Discord</h3>
            <p>Общайся с игроками, следи за новостями и будь в курсе событий</p>
          </a>

          <a
            href={telegramBotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="feature-card feature-card-link feature-card-telegram"
          >
            <div className="feature-icon-wrap">
              <svg viewBox="0 0 24 24" fill="currentColor" width="30" height="30">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
            </div>
            <h3>Telegram-бот</h3>
            <p>
              {user
                ? 'Бонус раз в 12 часов — предметы в инвентарь на сайте. Сначала привяжите аккаунт.'
                : 'Бонус раз в 12 часов — предметы в инвентарь. Авторизуйтесь и привяжите Telegram.'}
            </p>
            <span className="feature-card-inline-link">Открыть бота →</span>
          </a>
        </div>
      </AnimatedSection>

    </div>
  );
}

export default Home;
