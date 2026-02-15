// User types
export interface User {
  id: number;
  steamid: string;
  username: string;
  avatar: string;
}

// Player statistics types
export interface PlayerStats {
  id: number;
  steamid?: string;
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

// Server types
export interface Server {
  id: number;
  name: string;
  ip: string;
  port: number;
  players: number;
  maxPlayers: number;
  map: string;
  mapSize?: number;
  status: 'online' | 'offline';
  lastWipe: string | null;
  country?: string;
  rank?: number;
  uptime?: number;
}

// API Response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PlayersResponse {
  players: PlayerStats[];
}

export interface PlayerResponse {
  player: PlayerStats;
}

export interface ServersResponse {
  servers: Server[];
}

export interface AuthResponse {
  user: User | null;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}
