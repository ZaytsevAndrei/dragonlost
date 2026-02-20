// User types
export interface User {
  id: number;
  steamid: string;
  username: string;
  avatar: string;
  role: string;
  created_at: Date;
  last_login: Date;
}

// Player statistics types
export interface PlayerStatistics {
  LastUpdate: number;
  Joins: number;
  Leaves: number;
  Kills: number;
  Deaths: number;
  Suicides: number;
  Shots: number;
  Headshots: number;
  Experiments: number;
  Recoveries: number;
  VoiceBytes: number;
  WoundedTimes: number;
  CraftedItems: number;
  RepairedItems: number;
  LiftUsages: number;
  WheelSpins: number;
  HammerHits: number;
  ExplosivesThrown: number;
  WeaponReloads: number;
  RocketsLaunched: number;
  SecondsPlayed: number;
  Names: string[];
  IPs: string[];
  TimeStamps: number[];
  CollectiblePickups: Record<string, number>;
  PlantPickups: Record<string, number>;
  Gathered: Record<string, number>;
}

export interface PlayerDatabase {
  id: number;
  userid: string;
  StatisticsDB: string;
  'Last Seen': string;
  'Time Played': string;
  'Last Position': string;
  IPs: string;
  Names: string;
  'First Connection': string;
  name: string;
  ip: string;
  steamid: string;
}

export interface PlayerStats {
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

// Express session extension
declare module 'express-session' {
  interface SessionData {
    passport?: {
      user?: string;
    };
    csrfToken?: string;
  }
}

// Passport user extension
declare global {
  namespace Express {
    interface User extends Omit<import('./index').User, 'created_at' | 'last_login'> {}
  }
}
