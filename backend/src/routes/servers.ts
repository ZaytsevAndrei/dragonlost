import { Router } from 'express';
import { rustServersApi } from '../services/rustServersApi';

const router = Router();

// Get server data from rust-servers.net API
router.get('/', async (req, res) => {
  try {
    const serverData = await rustServersApi.getServerDetails();

    if (!serverData) {
      // Fallback to basic data if API fails
      return res.json({
        servers: [
          {
            id: 1,
            name: 'DragonLost | Main Server',
            ip: '185.189.255.19',
            port: 35500,
            players: 0,
            maxPlayers: 100,
            map: 'Unknown',
            status: 'offline',
            lastWipe: null,
          },
        ],
      });
    }

    // Transform API response to our format
    const servers = [
      {
        id: parseInt(serverData.id, 10),
        name: serverData.hostname || serverData.name || 'Unknown',
        ip: serverData.address,
        port: parseInt(serverData.port, 10),
        players: parseInt(serverData.players, 10) || 0,
        maxPlayers: parseInt(serverData.maxplayers, 10) || 100,
        map: serverData.map || 'Unknown',
        status: serverData.is_online === '1' ? 'online' : 'offline',
        lastWipe: serverData.last_check || null,
        country: serverData.location,
        rank: parseInt(serverData.rank, 10) || undefined,
        uptime: parseFloat(serverData.uptime) || undefined,
      },
    ];

    res.json({ servers });
  } catch (error) {
    console.error('Error fetching servers:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

export default router;
