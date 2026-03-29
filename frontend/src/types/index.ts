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
    headshots: number;
    shots: number;
    experiments: number;
    recoveries: number;
    woundedTimes: number;
    craftedItems: number;
    repairedItems: number;
    barrelsBroken: number;
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

export interface AuthResponse {
  user: User | null;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export interface ShopItem {
  id?: number;
  name?: string;
  title?: string;
  description?: string;
  category?: string;
  image?: string;
  image_url?: string;
  price?: number | string;
  sort_order?: number;
  is_active?: number | boolean;
  /** Служебные поля API — не показываются в карточке магазина */
  rust_item_code?: string;
  quantity?: number;
  is_available?: number | boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}
