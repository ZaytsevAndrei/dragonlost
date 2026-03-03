import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../services/api';
import StatePanel from '../components/StatePanel';
import './Statistics.css';

interface PlayerStats {
  id: number;
  name: string;
  stats: {
    kills: number;
    deaths: number;
    kd: number;
    suicides: number;
    headshots: number;
    shots: number;
    woundedTimes: number;
    joins: number;
  };
  resources: {
    wood: number;
    stones: number;
    metalOre: number;
    sulfurOre: number;
  };
  lastSeen: number;
  timePlayed: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type SortCategory = 'all' | 'kills' | 'kd' | 'wood' | 'stones' | 'metal' | 'sulfur';

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
        <h1>Статистика игроков</h1>
        
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
      </div>

      <div className="stats-table-container">
        <table className="stats-table">
          <thead>
            <tr>
              <th>Игрок</th>
              <th>Убийств</th>
              <th>Смертей</th>
              <th>K/D</th>
              <th>🪵 Дерево</th>
              <th>🪨 Камень</th>
              <th>⛏️ Металл</th>
              <th>💎 Сера</th>
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((player) => (
              <tr key={player.id}>
                <td className="player-name">{player.name || 'Неизвестный игрок'}</td>
                <td>{player.stats.kills}</td>
                <td>{player.stats.deaths}</td>
                <td className="kd-stat">{player.stats.kd.toFixed(2)}</td>
                <td className="resource-stat">{formatNumber(player.resources.wood)}</td>
                <td className="resource-stat">{formatNumber(player.resources.stones)}</td>
                <td className="resource-stat">{formatNumber(player.resources.metalOre)}</td>
                <td className="resource-stat">{formatNumber(player.resources.sulfurOre)}</td>
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
