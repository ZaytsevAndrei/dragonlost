import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './HomeHero.css';

const PROMO_CODE = import.meta.env.VITE_HERO_PROMO_CODE || 'WIPE';

function HomeHero() {
  const [copied, setCopied] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 40);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyPromo = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(PROMO_CODE);
      setCopied(true);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = PROMO_CODE;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
    }
  }, []);

  const scrollToServer = useCallback(() => {
    document.getElementById('server')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <section className={`home-hero ${ready ? 'home-hero--ready' : ''}`.trim()} aria-label="Волга | ВАЙП 10 дней">
      <div className="home-hero-stage">
        <div className="home-hero-visual" aria-hidden="true">
          <div className="home-hero-character-frame">
            <img
              src="/images/hero-vozduhan.png?v=1"
              alt=""
              className="home-hero-character"
              width={1920}
              height={1080}
              decoding="async"
              fetchPriority="high"
            />
            <span className="home-hero-glitch" />
          </div>
          <span className="home-hero-glow" />
        </div>

        <div className="home-hero-copy">
          <p className="home-hero-brand">Волга | ВАЙП 10 дней</p>
          <h1 className="home-hero-title">x1 — сервер, на котором хочется играть</h1>
          <p className="home-hero-text">Классический вайп, магазин предметов и награды — всё в одном месте.</p>

          <button
            type="button"
            className={`home-hero-promo ${copied ? 'home-hero-promo--copied' : ''}`.trim()}
            onClick={copyPromo}
            aria-label={`Скопировать промокод ${PROMO_CODE}`}
          >
            <span className="home-hero-promo-label">Промокод для тебя!</span>
            <span className="home-hero-promo-hint">
              {copied ? 'Скопировано в буфер' : 'Нажми на него, чтобы скопировать'}
            </span>
            <span className="home-hero-promo-code">{PROMO_CODE}</span>
          </button>

          <div className="home-hero-actions">
            <button type="button" className="home-hero-cta" onClick={scrollToServer}>
              Начать играть
            </button>
            <Link to="/shop" className="home-hero-cta home-hero-cta--ghost">
              Магазин
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HomeHero;
