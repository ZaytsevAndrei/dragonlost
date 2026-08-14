import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import type { ConveyorFilter } from '../../utils/conveyorExport';
import FilterCard from './FilterCard';

function FiltersPage() {
  const { user } = useAuthStore();
  const [filters, setFilters] = useState<ConveyorFilter[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<{ filters: ConveyorFilter[]; total: number }>('/conveyor-filters', {
        params: { q: query || undefined, limit: 48 },
      });
      setFilters(res.data.filters || []);
      setTotal(res.data.total || 0);
    } catch {
      setError('Не удалось загрузить публичные фильтры');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(search);
  }, [load, search]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSearch(q.trim());
  };

  return (
    <section className="cf-section">
      <p className="cf-intro">
        Устали тратить часы на настройку фильтров конвейера каждый вайп? Наше приложение позволяет легко
        создавать, редактировать и делиться кастомными схемами конвейеров. Просматривайте публичный каталог,
        сохраняйте любимые фильтры и экспортируйте конфигурации прямо в Rust для плавной и эффективной
        сортировки лута. Измените свой геймплей навсегда и верните себе драгоценное время!
      </p>
      <header className="cf-header">
        <div>
          <h1>Filters</h1>
          <p className="cf-lead">
            Публичный каталог фильтров конвейеров для Rust. Создавайте пресеты, делитесь доступом и
            экспортируйте JSON прямо в игру.
          </p>
        </div>
        {user ? (
          <Link to="/conveyorfilters/new" className="cf-btn cf-btn-primary">
            Создать фильтр
          </Link>
        ) : (
          <p className="cf-hint">Войдите через Steam, чтобы создавать и шарить фильтры</p>
        )}
      </header>

      <form className="cf-search" onSubmit={onSubmit}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по названию, описанию или автору…"
          aria-label="Поиск фильтров"
        />
        <button type="submit" className="cf-btn">
          Найти
        </button>
      </form>

      {loading && <p className="cf-muted">Загрузка…</p>}
      {error && <p className="cf-error">{error}</p>}
      {!loading && !error && filters.length === 0 && (
        <div className="cf-empty">
          <p>Публичных фильтров пока нет.</p>
          {user && (
            <Link to="/conveyorfilters/new" className="cf-btn cf-btn-primary">
              Создать первый
            </Link>
          )}
        </div>
      )}

      {!loading && filters.length > 0 && (
        <>
          <p className="cf-muted">Найдено: {total}</p>
          <div className="cf-grid">
            {filters.map((filter) => (
              <FilterCard key={filter.id} filter={filter} onChanged={() => void load(search)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export default FiltersPage;
