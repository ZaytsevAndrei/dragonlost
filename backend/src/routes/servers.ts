import { Router } from 'express';

const router = Router();

// Mock server data - replace with real server query logic
router.get('/', async (req, res) => {
  try {
    // TODO: Implement actual server query logic
    // This could use Rust server query protocols or APIs
    const servers = [
      {
        id: 1,
        name: 'DragonLost | Main Server',
        ip: '0.0.0.0',
        port: 28015,
        players: 0,
        maxPlayers: 100,
        map: 'Procedural Map',
        mapSize: 3500,
        status: 'online',
        lastWipe: new Date().toISOString(),
      },
    ];

    res.json({ servers });
  } catch (error) {
    console.error('Error fetching servers:', error);
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

export default router;
