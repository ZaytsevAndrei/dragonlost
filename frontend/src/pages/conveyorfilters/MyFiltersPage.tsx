import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import type { ConveyorFilter } from '../../utils/conveyorExport';
import type { RustCategoryId } from '../../data/rustCategories';
import ConveyorCategoryBar from './ConveyorCategoryBar';
import ConveyorFiltersPageHeader from './ConveyorFiltersPageHeader';
import FilterCard from './FilterCard';

type Tab = 'yours' | 'saved' | 'shared';

const TABS: { id: Tab; label: string }[] = [
  { id: 'yours', label: 'Мои фильтры' },
  { id: 'saved', label: 'Избранное' },
  { id: 'shared', label: 'Доступные мне' },
];

function MyFiltersPage() {
  const { user, loading: authLoading } = useAuthStore();
  const [tab, setTab] = useState<Tab>('yours');
  const [filters, setFilters] = useState<ConveyorFilter[]>([]);
  const [category, setCategory] = useState<RustCategoryId | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (active: Tab) => {
    const path =
      active === 'yours'
        ? '/conveyor-filters/mine'
        : active === 'saved'
          ? '/conveyor-filters/saved'
          : '/conveyor-filters/shared';
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<{ filters: ConveyorFilter[] }>(path);
      setFilters(res.data.filters || []);
    } catch {
      setError('Не удалось загрузить фильтры');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    void load(tab);
  }, [authLoading, user, tab, load]);

  const visibleFilters = useMemo(
    () => (category ? filters.filter((f) => f.category === category) : filters),
    [filters, category]
  );

  if (authLoading) {
    return <p className="cf-muted">Загрузка…</p>;
  }

  if (!user) {
    return (
      <section className="cf-section">
        <ConveyorFiltersPageHeader
          title="Приватные фильтры"
          lead="Ваши пресеты, избранное и доступы — войдите через Steam, чтобы управлять фильтрами."
          centered
        />
      </section>
    );
  }

  return (
    <section className="cf-section">
      <ConveyorFiltersPageHeader
        title="Приватные фильтры"
        lead="Ваши личные пресеты, избранное из общего каталога и фильтры, которыми с вами поделились."
        centered
        actions={
          <Link to="/conveyorfilters/new" className="cf-btn cf-btn-primary">
            Создать фильтр
          </Link>
        }
      />

      <div className="cf-pill-tabs" role="tablist" aria-label="Разделы приватных фильтров">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`cf-pill${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ConveyorCategoryBar value={category} onChange={setCategory} />

      {loading && <p className="cf-muted">Загрузка…</p>}
      {error && <p className="cf-error">{error}</p>}

      {!loading && !error && filters.length === 0 && (
        <div className="cf-empty">
          {tab === 'yours' && (
            <>
              <p>У вас пока нет фильтров.</p>
              <Link to="/conveyorfilters/new" className="cf-btn cf-btn-primary">
                Создать
              </Link>
            </>
          )}
          {tab === 'saved' && (
            <p>Сохранённых фильтров нет. Откройте «Общие фильтры» и нажмите «Сохранить».</p>
          )}
          {tab === 'shared' && <p>Вам пока никто не выдал доступ к фильтрам.</p>}
        </div>
      )}

      {!loading && !error && filters.length > 0 && visibleFilters.length === 0 && (
        <p className="cf-muted">В этой категории фильтров нет.</p>
      )}

      {!loading && visibleFilters.length > 0 && (
        <div className="cf-grid">
          {visibleFilters.map((filter) => (
            <FilterCard key={filter.id} filter={filter} onChanged={() => void load(tab)} showOwner={tab !== 'yours'} />
          ))}
        </div>
      )}
    </section>
  );
}

export default MyFiltersPage;
