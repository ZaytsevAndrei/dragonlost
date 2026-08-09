import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import type { ConveyorFilter } from '../../utils/conveyorExport';
import FilterCard from './FilterCard';

type Tab = 'yours' | 'saved' | 'shared';

const TABS: { id: Tab; label: string }[] = [
  { id: 'yours', label: 'Your Filters' },
  { id: 'saved', label: 'Saved Filters' },
  { id: 'shared', label: 'Shared With You' },
];

function MyFiltersPage() {
  const { user, loading: authLoading } = useAuthStore();
  const [tab, setTab] = useState<Tab>('yours');
  const [filters, setFilters] = useState<ConveyorFilter[]>([]);
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

  if (authLoading) {
    return <p className="cf-muted">Загрузка…</p>;
  }

  if (!user) {
    return (
      <section className="cf-section cf-center">
        <h1>My Filters</h1>
        <p className="cf-lead">Войдите через Steam, чтобы видеть свои фильтры, избранное и доступ от друзей.</p>
      </section>
    );
  }

  return (
    <section className="cf-section">
      <header className="cf-header cf-header-center">
        <h1>My Filters</h1>
        <Link to="/conveyorfilters/new" className="cf-btn cf-btn-primary">
          Создать фильтр
        </Link>
      </header>

      <div className="cf-pill-tabs" role="tablist" aria-label="Разделы My Filters">
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
          {tab === 'saved' && <p>Сохранённых фильтров нет. Откройте публичный каталог и нажмите «Сохранить».</p>}
          {tab === 'shared' && <p>Вам пока никто не выдал доступ к фильтрам.</p>}
        </div>
      )}

      {!loading && filters.length > 0 && (
        <div className="cf-grid">
          {filters.map((filter) => (
            <FilterCard key={filter.id} filter={filter} onChanged={() => void load(tab)} showOwner={tab !== 'yours'} />
          ))}
        </div>
      )}
    </section>
  );
}

export default MyFiltersPage;
