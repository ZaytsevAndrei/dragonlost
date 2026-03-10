import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../services/api';
import StatePanel from '../components/StatePanel';
import type { PlayerStats } from '../types';
import './Statistics.css';

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type SortCategory = 'all' | 'kills' | 'kd' | 'wood' | 'stones' | 'metal' | 'sulfur';
type ColumnKey =
  | 'kills'
  | 'deaths'
  | 'kd'
  | 'headshots'
  | 'suicides'
  | 'shots'
  | 'joins'
  | 'timePlayed'
  | 'lastSeen'
  | 'wood'
  | 'stones'
  | 'metalOre'
  | 'sulfurOre';

const PLAYERS_PER_PAGE = 20;
const COLUMN_VISIBILITY_STORAGE_KEY = 'statistics-columns-visibility';
const DEFAULT_VISIBLE_COLUMNS: Record<ColumnKey, boolean> = {
  kills: true,
  deaths: true,
  kd: true,
  headshots: true,
  suicides: false,
  shots: false,
  joins: true,
  timePlayed: true,
  lastSeen: true,
  wood: true,
  stones: true,
  metalOre: true,
  sulfurOre: true,
};

function Statistics() {
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [sortCategory, setSortCategory] = useState<SortCategory>('all');
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
    if (typeof window === 'undefined') return DEFAULT_VISIBLE_COLUMNS;
    try {
      const raw = window.localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
      if (!raw) return DEFAULT_VISIBLE_COLUMNS;
      const parsed = JSON.parse(raw) as Partial<Record<ColumnKey, boolean>>;
      return { ...DEFAULT_VISIBLE_COLUMNS, ...parsed };
    } catch {
      return DEFAULT_VISIBLE_COLUMNS;
    }
  });
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

  useEffect(() => {
    window.localStorage.setItem(COLUMN_VISIBILITY_STORAGE_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

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

  const formatLastSeen = (timestamp: number) => {
    if (!timestamp) return '-';
    return new Date(timestamp * 1000).toLocaleString('ru-RU');
  };

  const columns: Array<{
    key: ColumnKey;
    label: string;
    cellClassName?: string;
    render: (player: PlayerStats) => string | number;
  }> = [
    { key: 'kills', label: 'Убийств', render: (player) => player.stats.kills },
    { key: 'deaths', label: 'Смертей', render: (player) => player.stats.deaths },
    { key: 'kd', label: 'K/D', cellClassName: 'kd-stat', render: (player) => player.stats.kd.toFixed(2) },
    { key: 'headshots', label: 'Хедшотов', render: (player) => formatNumber(player.stats.headshots) },
    { key: 'suicides', label: 'Суицидов', render: (player) => formatNumber(player.stats.suicides) },
    { key: 'shots', label: 'Выстрелов', render: (player) => formatNumber(player.stats.shots) },
    { key: 'joins', label: 'Заходов', render: (player) => formatNumber(player.stats.joins) },
    { key: 'timePlayed', label: 'Время', render: (player) => player.timePlayed || '-' },
    { key: 'lastSeen', label: 'Был в сети', render: (player) => formatLastSeen(player.lastSeen) },
    { key: 'wood', label: '🪵 Дерево', cellClassName: 'resource-stat', render: (player) => formatNumber(player.resources.wood) },
    { key: 'stones', label: '🪨 Камень', cellClassName: 'resource-stat', render: (player) => formatNumber(player.resources.stones) },
    { key: 'metalOre', label: '⛏️ Металл', cellClassName: 'resource-stat', render: (player) => formatNumber(player.resources.metalOre) },
    { key: 'sulfurOre', label: '💎 Сера', cellClassName: 'resource-stat', render: (player) => formatNumber(player.resources.sulfurOre) },
  ];
  const activeColumns = columns.filter((column) => visibleColumns[column.key]);
  const visibleColumnsCount = activeColumns.length;
  const totalColumnsCount = columns.length;

  const toggleColumnVisibility = (columnKey: ColumnKey) => {
    setVisibleColumns((prev) => {
      const next = { ...prev, [columnKey]: !prev[columnKey] };
      const visibleCount = Object.values(next).filter(Boolean).length;
      if (visibleCount === 0) return prev;
      return next;
    });
  };

  const selectAllColumns = () => {
    setVisibleColumns({
      kills: true,
      deaths: true,
      kd: true,
      headshots: true,
      suicides: true,
      shots: true,
      joins: true,
      timePlayed: true,
      lastSeen: true,
      wood: true,
      stones: true,
      metalOre: true,
      sulfurOre: true,
    });
  };

  const resetColumnsToDefault = () => {
    setVisibleColumns({ ...DEFAULT_VISIBLE_COLUMNS });
  };

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
          <span className="columns-badge">
            Показано колонок: {visibleColumnsCount}/{totalColumnsCount}
          </span>
        </div>
        
        <div className="stats-filters">
          <button
            className={`filter-btn ${sortCategory === 'all' ? 'active' : ''}`}
            onClick={() => handleCategoryChange('all')}
          >
            📊 Все
          </button>
          <button
            className={`filter-btn ${sortCategory === 'kills' ? 'active' : ''}`}
            onClick={() => handleCategoryChange('kills')}
          >
            ⚔️ Убийства
          </button>
          <button
            className={`filter-btn ${sortCategory === 'kd' ? 'active' : ''}`}
            onClick={() => handleCategoryChange('kd')}
          >
            🎯 K/D
          </button>
          <button
            className={`filter-btn ${sortCategory === 'wood' ? 'active' : ''}`}
            onClick={() => handleCategoryChange('wood')}
          >
            🪵 Дерево
          </button>
          <button
            className={`filter-btn ${sortCategory === 'stones' ? 'active' : ''}`}
            onClick={() => handleCategoryChange('stones')}
          >
            🪨 Камень
          </button>
          <button
            className={`filter-btn ${sortCategory === 'metal' ? 'active' : ''}`}
            onClick={() => handleCategoryChange('metal')}
          >
            ⛏️ Металл
          </button>
          <button
            className={`filter-btn ${sortCategory === 'sulfur' ? 'active' : ''}`}
            onClick={() => handleCategoryChange('sulfur')}
          >
            💎 Сера
          </button>
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

        <div className="columns-settings">
          <span className="columns-settings-title">Колонки:</span>
          <button
            type="button"
            className="columns-action-btn"
            onClick={selectAllColumns}
          >
            Выбрать все
          </button>
          <button
            type="button"
            className="columns-action-btn"
            onClick={resetColumnsToDefault}
          >
            Сбросить к умолчанию
          </button>
          {columns.map((column) => (
            <label key={column.key} className="column-toggle">
              <input
                type="checkbox"
                checked={visibleColumns[column.key]}
                onChange={() => toggleColumnVisibility(column.key)}
              />
              <span>{column.label}</span>
            </label>
          ))}
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
