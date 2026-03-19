import { useCallback, useEffect, useMemo, useState } from 'react';
import StatePanel from '../components/StatePanel';
import { CATEGORY_NAMES, CATEGORY_ORDER } from '../constants/shopCategories';
import { api, getBackendOrigin, getImageUrl } from '../services/api';
import type { ShopItem } from '../types';
import './Items.css';

const IGNORED_META_KEYS = new Set([
  'id',
  'name',
  'title',
  'description',
  'category',
  'image',
  'image_url',
  'price',
  'sort_order',
  'is_active',
]);

function toDisplayText(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return String(value);
}

function getItemTitle(item: ShopItem): string {
  if (item.name) return String(item.name);
  if (item.title) return String(item.title);
  if (item.id !== undefined) return `Предмет #${String(item.id)}`;
  return 'Без названия';
}

function getCategoryLabel(category: unknown): string {
  const key = String(category ?? '').trim();
  if (!key) return 'Без категории';
  return CATEGORY_NAMES[key] || key;
}

function getCategoryKey(category: unknown): string {
  const raw = String(category ?? '').trim();
  if (!raw) return '__uncategorized';

  const lowerRaw = raw.toLowerCase();
  const categoryEntries = Object.entries(CATEGORY_NAMES);

  // 1) Нормализуем ключи вида weapon/armor (с учетом регистра)
  const byKey = categoryEntries.find(([key]) => key.toLowerCase() === lowerRaw);
  if (byKey) return byKey[0];

  // 2) Нормализуем значения вида "🔫 Оружие"
  const byLabel = categoryEntries.find(([, label]) => label.toLowerCase() === lowerRaw);
  if (byLabel) return byLabel[0];

  // 3) Для неизвестных категорий используем текст как есть
  return raw;
}

function getCategoryOrderIndex(categoryKey: string): number {
  const index = CATEGORY_ORDER.indexOf(categoryKey);
  if (index !== -1) return index;
  if (categoryKey === '__uncategorized') return CATEGORY_ORDER.length + 1;
  return CATEGORY_ORDER.length;
}

function normalizeImagePath(rawPath: string): string {
  const value = rawPath.trim();
  if (value.startsWith('/uploads/')) return value;
  if (value.startsWith('uploads/')) return `/${value}`;
  if (value.startsWith('/')) return value;
  return `/uploads/${value}`;
}

function buildImageCandidates(rawPath: string | null | undefined): string[] {
  if (!rawPath) return [];
  const value = rawPath.trim();
  if (!value) return [];

  if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return [value];
  }

  const normalized = normalizeImagePath(value);
  const backendOrigin = getBackendOrigin();
  const candidates = [
    getImageUrl(value),
    normalized,
    `${backendOrigin}${normalized}`,
    `${backendOrigin}/api${normalized}`,
  ];

  return Array.from(new Set(candidates.filter(Boolean)));
}

interface ItemImageProps {
  imagePath: string;
  alt: string;
}

function ItemImage({ imagePath, alt }: ItemImageProps) {
  const candidates = useMemo(() => buildImageCandidates(imagePath), [imagePath]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setCandidateIndex(0);
    setHidden(false);
  }, [imagePath]);

  if (hidden || candidates.length === 0) return null;

  const currentSrc = candidates[candidateIndex];

  return (
    <div className="item-card-image-wrap">
      <img
        src={currentSrc}
        alt={alt}
        className="item-card-image"
        loading="lazy"
        onError={() => {
          const nextIndex = candidateIndex + 1;
          if (nextIndex < candidates.length) {
            setCandidateIndex(nextIndex);
            return;
          }
          setHidden(true);
        }}
      />
    </div>
  );
}

function Items() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get<{ items: ShopItem[] }>('/shop/items');
      setItems(response.data.items || []);
      setError(null);
    } catch {
      setError('Не удалось загрузить список предметов');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; items: ShopItem[] }>();
    for (const item of items) {
      const categoryKey = getCategoryKey(item.category);
      const categoryLabel = getCategoryLabel(item.category);
      const currentGroup = groups.get(categoryKey) ?? { key: categoryKey, label: categoryLabel, items: [] };
      currentGroup.items.push(item);
      groups.set(categoryKey, currentGroup);
    }

    return Array.from(groups.values()).sort((a, b) => {
      const orderDiff = getCategoryOrderIndex(a.key) - getCategoryOrderIndex(b.key);
      if (orderDiff !== 0) return orderDiff;
      return a.label.localeCompare(b.label, 'ru');
    });
  }, [items]);

  const filters = useMemo(() => {
    return [
      { key: 'all', label: 'Все', count: items.length },
      ...groupedItems.map((group) => ({
        key: group.key,
        label: group.label,
        count: group.items.length,
      })),
    ];
  }, [groupedItems, items.length]);

  const visibleGroups = useMemo(() => {
    if (selectedCategory === 'all') return groupedItems;
    return groupedItems.filter((group) => group.key === selectedCategory);
  }, [groupedItems, selectedCategory]);

  if (loading) {
    return (
      <div className="items">
        <h1>Предметы</h1>
        <StatePanel type="loading" title="Загрузка предметов" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="items">
        <h1>Предметы</h1>
        <StatePanel
          type="error"
          title="Не удалось загрузить предметы"
          message={error}
          actionLabel="Попробовать снова"
          onAction={fetchItems}
        />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="items">
        <h1>Предметы</h1>
        <StatePanel type="empty" title="Список предметов пуст" message="В таблице shop_items пока нет записей." />
      </div>
    );
  }

  return (
    <div className="items">
      <div className="items-header">
        <h1>Предметы</h1>
        <p>Список предметов из таблицы shop_items.</p>
      </div>

      <div className="items-filters">
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={`item-filter-btn ${selectedCategory === filter.key ? 'active' : ''}`}
            onClick={() => setSelectedCategory(filter.key)}
          >
            {filter.label} ({filter.count})
          </button>
        ))}
      </div>

      {visibleGroups.map((group) => (
        <section key={group.key} className="items-category">
          {selectedCategory === 'all' ? <h2>{group.label}</h2> : null}
          <div className="items-grid">
            {group.items.map((item, index) => {
              const imagePath = item.image_url ?? item.image;
              const extraFields = Object.entries(item).filter(([key, value]) => {
                if (IGNORED_META_KEYS.has(key)) return false;
                return value !== null && value !== undefined && value !== '';
              });

              return (
                <article key={String(item.id ?? `${getItemTitle(item)}-${index}`)} className="item-card">
                  {typeof imagePath === 'string' ? <ItemImage imagePath={imagePath} alt={getItemTitle(item)} /> : null}
                  <div className="item-card-body">
                    <h3>{getItemTitle(item)}</h3>
                    <p className="item-card-description">{toDisplayText(item.description)}</p>
                    <div className="item-card-meta">
                      <span className="item-price">Цена: {toDisplayText(item.price)}</span>
                      {item.is_active !== undefined ? (
                        <span className={`item-status ${Number(item.is_active) ? 'active' : 'inactive'}`}>
                          {Number(item.is_active) ? 'Активен' : 'Неактивен'}
                        </span>
                      ) : null}
                    </div>
                    {extraFields.length > 0 ? (
                      <dl className="item-extra-fields">
                        {extraFields.map(([key, value]) => (
                          <div key={`${String(item.id)}-${key}`} className="item-extra-row">
                            <dt>{key}</dt>
                            <dd>{toDisplayText(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default Items;
