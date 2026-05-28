import { useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { api } from '../services/api';
import StatePanel from '../components/StatePanel';
import type { PlayerStats } from '../types';
import './Statistics.css';

/** Иконки ресурсов из локальной папки backend/uploads/stats */
const RUST_RESOURCE_ICON = {
  wood: '/uploads/stats/wood.png',
  stones: '/uploads/stats/stones.png',
  metalOre: '/uploads/stats/metal.ore.png',
  sulfurOre: '/uploads/stats/sulfur.ore.png',
} as const;

function RustResourceIcon({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      className="rust-resource-icon"
      width={20}
      height={20}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
    />
  );
}

function ResourceColumnTitle({ text, iconSrc }: { text: string; iconSrc: string }): ReactNode {
  return (
    <span className="stat-column-label-with-icon">
      <RustResourceIcon src={iconSrc} />
      {text}
    </span>
  );
}

function FilterBtnLabel({
  iconSrc,
  emoji,
  children,
}: {
  iconSrc?: string;
  emoji?: string;
  children: ReactNode;
}) {
  return (
    <span className="filter-btn-label-with-icon">
      {iconSrc ? <RustResourceIcon src={iconSrc} /> : emoji ? <span aria-hidden="true">{emoji}</span> : null}
      <span>{children}</span>
    </span>
  );
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type SortCategory = 'all' | 'kills' | 'kd' | 'wood' | 'stones' | 'metal' | 'sulfur';

const SORT_FILTERS: {
  category: SortCategory;
  label: string;
  emoji?: string;
  iconSrc?: string;
}[] = [
  { category: 'all', label: 'Все', emoji: '📊' },
  { category: 'kills', label: 'Убийства', emoji: '⚔️' },
  { category: 'kd', label: 'K/D', emoji: '🎯' },
  { category: 'wood', label: 'Дерево', iconSrc: RUST_RESOURCE_ICON.wood },
  { category: 'stones', label: 'Камень', iconSrc: RUST_RESOURCE_ICON.stones },
  { category: 'metal', label: 'Железная руда', iconSrc: RUST_RESOURCE_ICON.metalOre },
  { category: 'sulfur', label: 'Серная руда', iconSrc: RUST_RESOURCE_ICON.sulfurOre },
];

type ColumnKey =
  | 'kills'
  | 'deaths'
  | 'kd'
  | 'headshots'
  | 'shots'
  | 'barrelsBroken'
  | 'joins'
  | 'timePlayed'
  | 'lastSeen'
  | 'wood'
  | 'stones'
  | 'metalOre'
  | 'sulfurOre';

const PLAYERS_PER_PAGE = 20;

function Statistics() {
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [sortCategory, setSortCategory] = useState<SortCategory>('all');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchStats = useCallback(async (page: number, search: string) => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = {
        page,
        limit: PLAYERS_PER_PAGE,
      };
      if (search) params.search = search;

      const response = await api.get('/stats', { params });
      setPlayers(response.data.players);
      setPagination(response.data.pagination);
      setError(null);
    } catch {
      setError('Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(currentPage, searchTerm);
  }, [currentPage, fetchStats]);

  // Клиентская сортировка текущей страницы
  const sortedPlayers = [...players].sort((a, b) => {
    switch (sortCategory) {
      case 'kills':
        return b.stats.kills - a.stats.kills;
      case 'kd':
        return b.stats.kd - a.stats.kd;
      case 'wood':
        return b.resources.wood - a.resources.wood;
      case 'stones':
        return b.resources.stones - a.resources.stones;
      case 'metal':
        return b.resources.metalOre - a.resources.metalOre;
      case 'sulfur':
        return b.resources.sulfurOre - a.resources.sulfurOre;
      default:
        return 0;
    }
  });

  const totalPages = pagination?.totalPages || 1;

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setCurrentPage(1);
      fetchStats(1, value);
    }, 400);
  };

  const paginate = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCategoryChange = (category: SortCategory) => {
    setSortCategory(category);
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString('ru-RU');
  };

  type StatColumn = {
    key: ColumnKey;
    label: ReactNode;
    cellClassName?: string;
    render: (player: PlayerStats) => string | number;
  };

  const columns: StatColumn[] = useMemo(() => {
    const all: StatColumn[] = [
      { key: 'kills', label: 'Убийств', render: (player) => player.stats.kills },
      { key: 'deaths', label: 'Смертей', render: (player) => player.stats.deaths },
      { key: 'kd', label: 'K/D', cellClassName: 'kd-stat', render: (player) => player.stats.kd.toFixed(2) },
      { key: 'barrelsBroken', label: '🛢️ Бочек', render: (player) => formatNumber(player.stats.barrelsBroken) },
      { key: 'joins', label: 'Заходов', render: (player) => formatNumber(player.stats.joins) },
      {
        key: 'wood',
        label: <ResourceColumnTitle text="Дерево" iconSrc={RUST_RESOURCE_ICON.wood} />,
        cellClassName: 'resource-stat',
        render: (player) => formatNumber(player.resources.wood),
      },
      {
        key: 'stones',
        label: <ResourceColumnTitle text="Камень" iconSrc={RUST_RESOURCE_ICON.stones} />,
        cellClassName: 'resource-stat',
        render: (player) => formatNumber(player.resources.stones),
      },
      {
        key: 'metalOre',
        label: <ResourceColumnTitle text="Железная руда" iconSrc={RUST_RESOURCE_ICON.metalOre} />,
        cellClassName: 'resource-stat',
        render: (player) => formatNumber(player.resources.metalOre),
      },
      {
        key: 'sulfurOre',
        label: <ResourceColumnTitle text="Серная руда" iconSrc={RUST_RESOURCE_ICON.sulfurOre} />,
        cellClassName: 'resource-stat',
        render: (player) => formatNumber(player.resources.sulfurOre),
      },
    ];
    return all;
  }, []);
  const activeColumns = columns;

  if (loading) {
    return (
      <div className="statistics">
        <h1>Статистика игроков</h1>
        <StatePanel type="loading" title="Загрузка статистики" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="statistics">
        <h1>Статистика игроков</h1>
        <StatePanel
          type="error"
          title="Не удалось загрузить статистику"
          message={error}
          actionLabel="Попробовать снова"
          onAction={() => fetchStats(currentPage, searchTerm)}
        />
      </div>
    );
  }

  return (
    <div className="statistics">
      <div className="stats-header">
        <div className="stats-title-row">
          <h1>Статистика игроков</h1>
        </div>
        
        <div className="stats-filters">
          {SORT_FILTERS.map(({ category, label, emoji, iconSrc }) => (
            <button
              key={category}
              type="button"
              className={`filter-btn ${sortCategory === category ? 'active' : ''}`}
              onClick={() => handleCategoryChange(category)}
            >
              <FilterBtnLabel iconSrc={iconSrc} emoji={emoji}>
                {label}
              </FilterBtnLabel>
            </button>
          ))}
        </div>

        <div className="stats-controls">
          <input
            type="text"
            placeholder="Поиск игрока..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="search-input"
          />
          <div className="stats-info">
            {pagination && `Показано ${(pagination.page - 1) * pagination.limit + 1}-${Math.min(pagination.page * pagination.limit, pagination.total)} из ${pagination.total}`}
          </div>
        </div>

      </div>

      <div className="stats-table-container">
        <table className="stats-table">
          <thead>
            <tr>
              <th>Игрок</th>
              {activeColumns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((player) => (
              <tr key={player.id}>
                <td className="player-name">{player.name || 'Неизвестный игрок'}</td>
                {activeColumns.map((column) => (
                  <td key={`${player.id}-${column.key}`} className={column.cellClassName}>
                    {column.render(player)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && sortedPlayers.length === 0 && (
        <StatePanel
          type="empty"
          title="Игроки не найдены"
          message="Попробуйте изменить строку поиска или сбросить фильтры."
          actionLabel="Сбросить фильтры"
          onAction={() => {
            setSortCategory('all');
            handleSearch('');
          }}
        />
      )}

      {sortedPlayers.length > 0 && totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => paginate(1)}
            disabled={currentPage === 1}
            className="pagination-btn"
          >
            ««
          </button>
          <button
            onClick={() => paginate(currentPage - 1)}
            disabled={currentPage === 1}
            className="pagination-btn"
          >
            «
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
            // Показываем только ближайшие страницы
            if (
              page === 1 ||
              page === totalPages ||
              (page >= currentPage - 2 && page <= currentPage + 2)
            ) {
              return (
                <button
                  key={page}
                  onClick={() => paginate(page)}
                  className={`pagination-btn ${currentPage === page ? 'active' : ''}`}
                >
                  {page}
                </button>
              );
            } else if (page === currentPage - 3 || page === currentPage + 3) {
              return <span key={page} className="pagination-dots">...</span>;
            }
            return null;
          })}

          <button
            onClick={() => paginate(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="pagination-btn"
          >
            »
          </button>
          <button
            onClick={() => paginate(totalPages)}
            disabled={currentPage === totalPages}
            className="pagination-btn"
          >
            »»
          </button>
        </div>
      )}
    </div>
  );
}

export default Statistics;
