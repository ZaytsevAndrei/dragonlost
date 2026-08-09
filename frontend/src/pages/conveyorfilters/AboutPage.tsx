function AboutPage() {
  return (
    <section className="cf-section cf-about">
      <h1>About</h1>
      <p className="cf-lead">
        Раздел <strong>Conveyor Filters</strong> помогает автоматизировать настройку индустриальных
        конвейеров в Rust: собирайте пресеты предметов, храните их между вайпами, делитесь с тиммейтами
        и вставляйте JSON прямо в игру.
      </p>

      <div className="cf-about-grid">
        <article>
          <h2>Как экспортировать</h2>
          <ol>
            <li>Откройте фильтр и нажмите «Экспорт JSON».</li>
            <li>Скопированный JSON вставьте в настройки Industrial Conveyor в Rust.</li>
            <li>Либо скачайте файл и храните пресеты локально.</li>
          </ol>
        </article>
        <article>
          <h2>Формат</h2>
          <p>
            Каждый элемент — объект с полями <code>TargetItemName</code>, <code>MaxAmountInOutput</code>,{' '}
            <code>BufferAmount</code>, <code>MinAmountInInput</code>, <code>IsBlueprint</code>,{' '}
            <code>TargetCategory</code> — как в официальном экспорте игры.
          </p>
        </article>
        <article>
          <h2>Доступ</h2>
          <p>
            Фильтр можно сделать публичным в каталоге Filters или выдать доступ конкретному игроку
            (SteamID / ник с сайта) — с правом только смотреть или редактировать.
          </p>
        </article>
      </div>

      <p className="cf-muted">
        Неофициальный инструмент сообщества DragonLost. Не связан с Facepunch Studios. Идея раздела
        вдохновлена{' '}
        <a href="https://rustconveyorfilters.com/" target="_blank" rel="noopener noreferrer">
          rustconveyorfilters.com
        </a>
        .
      </p>
    </section>
  );
}

export default AboutPage;
