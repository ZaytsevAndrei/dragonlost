import ConveyorFiltersPageHeader from './ConveyorFiltersPageHeader';

function AboutPage() {
  return (
    <section className="cf-section cf-about">
      <ConveyorFiltersPageHeader
        title="Как это работает"
        lead="Создайте пресет конвейера, сохраните его между вайпами и скопируйте JSON в игру одной кнопкой."
      />

      <div className="cf-about-grid">
        <article>
          <h2>Как экспортировать</h2>
          <ol>
            <li>Нажмите «Экспорт» на карточке фильтра или «Экспорт JSON» в редакторе.</li>
            <li>JSON сразу копируется в буфер обмена.</li>
            <li>Вставьте его в настройки Industrial Conveyor в Rust.</li>
          </ol>
        </article>
        <article>
          <h2>Общие и приватные</h2>
          <p>
            В «Общих фильтрах» — публичный каталог пресетов сообщества. В «Приватных фильтрах» — ваши схемы,
            избранное и доступы от других игроков. Новый фильтр по умолчанию можно оставить приватным или
            опубликовать в каталоге.
          </p>
        </article>
        <article>
          <h2>Формат и доступ</h2>
          <p>
            Каждый элемент — объект с полями <code>TargetItemName</code>, <code>MaxAmountInOutput</code>,{' '}
            <code>BufferAmount</code>, <code>MinAmountInInput</code>, <code>IsBlueprint</code>,{' '}
            <code>TargetCategory</code>. Доступ можно выдать конкретному игроку (SteamID / ник с сайта) —
            только смотреть или редактировать.
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
