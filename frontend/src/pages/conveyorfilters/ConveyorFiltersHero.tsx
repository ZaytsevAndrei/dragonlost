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
      <p className="cf-intro cf-intro-compact">
        Устали тратить часы на настройку фильтров конвейера каждый вайп? Наше приложение позволяет легко
        создавать, редактировать и делиться кастомными схемами конвейеров. Просматривайте общие фильтры,
        сохраняйте любимые пресеты и копируйте JSON в буфер обмена — затем вставьте его прямо в Rust.
        Измените свой геймплей навсегда и верните себе драгоценное время!
      </p>
    </div>
  );
}

export default ConveyorFiltersHero;
