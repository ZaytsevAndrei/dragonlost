function ConveyorFiltersHero() {
  return (
    <div className="cf-hero-compact">
      <figure className="cf-hero cf-hero-compact-visual">
        <img
          src="/images/rust-filters-hero.png?v=5"
          alt="Игрок в окружении мигающих конвейерных фильтров Rust"
          className="cf-hero-image cf-hero-image-compact"
          width={1920}
          height={1080}
          decoding="async"
        />
        <span className="cf-hero-blink" aria-hidden="true" />
      </figure>
      <div className="cf-hero-copy">
        <h1 className="cf-hero-title">Фильтры на вайп</h1>
        <p className="cf-intro cf-intro-compact">
          Настроил раз — не собирай фильтры каждый вайп
        </p>
      </div>
    </div>
  );
}

export default ConveyorFiltersHero;
