import { useEffect, useState } from 'react';
import { api } from '../services/api';
import './Statistics.css';

interface PlayerStats {
  id: number;
  steamid: string;
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

type SortCategory = 'all' | 'kills' | 'kd' | 'wood' | 'stones' | 'metal' | 'sulfur';

function Statistics() {
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortCategory, setSortCategory] = useState<SortCategory>('all');
  const playersPerPage = 10;

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await api.get('/stats');
      setPlayers(response.data.players);
      setError(null);
    } catch (err) {
      setError('Не удалось загрузить статистику');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Фильтрация и сортировка
  let filteredPlayers = players.filter((player) =>
    player.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Сортировка по выбранной категории
  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
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
        return 0; // Исходный порядок
    }
  });

  // Пагинация
  const totalPages = Math.ceil(sortedPlayers.length / playersPerPage);
  const indexOfLastPlayer = currentPage * playersPerPage;
  const indexOfFirstPlayer = indexOfLastPlayer - playersPerPage;
  const currentPlayers = sortedPlayers.slice(indexOfFirstPlayer, indexOfLastPlayer);

  // Сброс на первую страницу при изменении поиска
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const paginate = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCategoryChange = (category: SortCategory) => {
    setSortCategory(category);
    setCurrentPage(1);
  };

  const formatTimePlayed = (seconds: string) => {
    const totalSeconds = parseFloat(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}ч ${minutes}м`;
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString('ru-RU');
  };

  if (loading) {
    return (
      <div className="statistics">
        <h1>Статистика игроков</h1>
        <div className="loading">Загрузка...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="statistics">
        <h1>Статистика игроков</h1>
        <div className="error">{error}</div>
        <button onClick={fetchStats} className="btn-retry">
          Попробовать снова
        </button>
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
            Показано {indexOfFirstPlayer + 1}-{Math.min(indexOfLastPlayer, sortedPlayers.length)} из {sortedPlayers.length}
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
            {currentPlayers.map((player) => (
              <tr key={player.steamid}>
                <td className="player-name">{player.name}</td>
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

      {sortedPlayers.length === 0 && (
        <div className="no-results">Игроки не найдены</div>
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
