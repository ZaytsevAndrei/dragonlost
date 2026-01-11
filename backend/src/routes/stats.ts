import { Router } from 'express';
import { rustPool } from '../config/database';
import { RowDataPacket } from 'mysql2';

const router = Router();

// Генерация моковых данных для тестирования
const generateMockPlayers = (count: number) => {
  const names = [
    'Dragon', 'Shadow', 'Phoenix', 'Wolf', 'Tiger', 'Eagle', 'Hawk', 'Bear',
    'Lion', 'Panther', 'Viper', 'Cobra', 'Falcon', 'Raven', 'Storm', 'Thunder',
    'Blade', 'Ghost', 'Hunter', 'Warrior', 'Knight', 'Samurai', 'Ninja', 'Ronin',
    'Spartan', 'Viking', 'Titan', 'Zeus', 'Thor', 'Odin', 'Loki', 'Ares',
    'Hades', 'Poseidon', 'Atlas', 'Hercules', 'Achilles', 'Perseus', 'Jason', 'Odysseus',
    'Sniper', 'Reaper', 'Slayer', 'Destroyer', 'Terminator', 'Predator', 'Killer', 'Assassin',
    'Demon', 'Devil', 'Angel', 'Saint', 'Prophet', 'Wizard', 'Sorcerer', 'Mage',
    'Archer', 'Ranger', 'Scout', 'Soldier', 'Captain', 'Major', 'General', 'Commander',
    'Frost', 'Blaze', 'Nova', 'Eclipse', 'Vortex', 'Chaos', 'Fury', 'Rage',
    'Phantom', 'Specter', 'Wraith', 'Shade', 'Banshee', 'Valkyrie', 'Reaper', 'Grim',
    'Alpha', 'Beta', 'Gamma', 'Delta', 'Omega', 'Prime', 'Apex', 'Vertex',
    'Sigma', 'Kappa', 'Lambda', 'Epsilon', 'Zeta', 'Theta', 'Iota', 'Psi',
    'Cyber', 'Neo', 'Matrix', 'Vector', 'Quantum', 'Neutron', 'Proton', 'Photon',
  ];

  const mockPlayers = [];
  
  for (let i = 0; i < count; i++) {
    const name = names[i % names.length] + (i > names.length - 1 ? Math.floor(i / names.length) : '');
    const kills = Math.floor(Math.random() * 500);
    const deaths = Math.floor(Math.random() * 400);
    const kd = deaths > 0 ? parseFloat((kills / deaths).toFixed(2)) : kills;
    
    mockPlayers.push({
      id: 1000 + i,
      steamid: `7656119${String(Math.floor(Math.random() * 900000000) + 100000000)}`,
      name: name,
      stats: {
        kills,
        deaths,
        kd,
        suicides: Math.floor(Math.random() * 20),
        headshots: Math.floor(Math.random() * kills * 0.3),
        shots: Math.floor(Math.random() * kills * 50),
        experiments: Math.floor(Math.random() * 10),
        recoveries: Math.floor(Math.random() * 50),
        woundedTimes: Math.floor(Math.random() * 100),
        craftedItems: Math.floor(Math.random() * 500),
        repairedItems: Math.floor(Math.random() * 100),
        secondsPlayed: Math.floor(Math.random() * 360000),
        joins: Math.floor(Math.random() * 100) + 1,
      },
      resources: {
        wood: Math.floor(Math.random() * 50000),
        stones: Math.floor(Math.random() * 100000),
        metalOre: Math.floor(Math.random() * 20000),
        sulfurOre: Math.floor(Math.random() * 15000),
      },
      lastSeen: Date.now() / 1000 - Math.random() * 86400 * 30,
      timePlayed: String(Math.floor(Math.random() * 360000)),
      firstConnection: Date.now() / 1000 - Math.random() * 86400 * 90,
    });
  }
  
  return mockPlayers;
};

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
    experiments: number;
    recoveries: number;
    woundedTimes: number;
    craftedItems: number;
    repairedItems: number;
    secondsPlayed: number;
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
  firstConnection: number;
}

// Get all players statistics
router.get('/', async (req, res) => {
  try {
    const [rows] = await rustPool.query<RowDataPacket[]>(
      'SELECT * FROM PlayerDatabase ORDER BY `Last Seen` DESC LIMIT 100'
    );

    const realPlayers = rows.map((row) => {
      const statisticsDB = JSON.parse(row.StatisticsDB || '{}');
      const kills = statisticsDB.Kills || 0;
      const deaths = statisticsDB.Deaths || 0;
      const gathered = statisticsDB.Gathered || {};
      
      return {
        id: row.id,
        steamid: row.steamid,
        name: row.name,
        stats: {
          kills,
          deaths,
          kd: deaths > 0 ? parseFloat((kills / deaths).toFixed(2)) : kills,
          suicides: statisticsDB.Suicides || 0,
          headshots: statisticsDB.Headshots || 0,
          shots: statisticsDB.Shots || 0,
          experiments: statisticsDB.Experiments || 0,
          recoveries: statisticsDB.Recoveries || 0,
          woundedTimes: statisticsDB.WoundedTimes || 0,
          craftedItems: statisticsDB.CraftedItems || 0,
          repairedItems: statisticsDB.RepairedItems || 0,
          secondsPlayed: statisticsDB.SecondsPlayed || 0,
          joins: statisticsDB.Joins || 0,
        },
        resources: {
          wood: gathered.wood || 0,
          stones: gathered.stones || 0,
          metalOre: gathered['metal.ore'] || 0,
          sulfurOre: gathered['sulfur.ore'] || 0,
        },
        lastSeen: parseFloat(row['Last Seen'] || 0),
        timePlayed: row['Time Played'] || '0',
        firstConnection: parseFloat(row['First Connection'] || 0),
      };
    });

    // Добавляем моковые данные для тестирования
    const mockPlayers = generateMockPlayers(100);
    const allPlayers = [...realPlayers, ...mockPlayers];

    res.json({ players: allPlayers });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get player statistics by Steam ID
router.get('/:steamid', async (req, res) => {
  try {
    const { steamid } = req.params;

    const [rows] = await rustPool.query<RowDataPacket[]>(
      'SELECT * FROM PlayerDatabase WHERE steamid = ?',
      [steamid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const row = rows[0];
    const statisticsDB = JSON.parse(row.StatisticsDB || '{}');
    const kills = statisticsDB.Kills || 0;
    const deaths = statisticsDB.Deaths || 0;
    const gathered = statisticsDB.Gathered || {};

    const player: PlayerStats = {
      id: row.id,
      steamid: row.steamid,
      name: row.name,
      stats: {
        kills,
        deaths,
        kd: deaths > 0 ? parseFloat((kills / deaths).toFixed(2)) : kills,
        suicides: statisticsDB.Suicides || 0,
        headshots: statisticsDB.Headshots || 0,
        shots: statisticsDB.Shots || 0,
        experiments: statisticsDB.Experiments || 0,
        recoveries: statisticsDB.Recoveries || 0,
        woundedTimes: statisticsDB.WoundedTimes || 0,
        craftedItems: statisticsDB.CraftedItems || 0,
        repairedItems: statisticsDB.RepairedItems || 0,
        secondsPlayed: statisticsDB.SecondsPlayed || 0,
        joins: statisticsDB.Joins || 0,
      },
      resources: {
        wood: gathered.wood || 0,
        stones: gathered.stones || 0,
        metalOre: gathered['metal.ore'] || 0,
        sulfurOre: gathered['sulfur.ore'] || 0,
      },
      lastSeen: parseFloat(row['Last Seen'] || 0),
      timePlayed: row['Time Played'] || '0',
      firstConnection: parseFloat(row['First Connection'] || 0),
    };

    res.json({ player });
  } catch (error) {
    console.error('Error fetching player stats:', error);
    res.status(500).json({ error: 'Failed to fetch player statistics' });
  }
});

export default router;
