import fetch from 'node-fetch';

interface RustServerDetailResponse {
  id: string;
  name: string;
  hostname: string;
  address: string;
  port: string;
  players: string;
  maxplayers: string;
  map: string;
  is_online: string;
  rank: string;
  location: string;
  uptime: string;
  last_check: string;
  last_online: string;
  [key: string]: any;
}

const RUST_SERVERS_API_BASE = 'https://rust-servers.net/api/';

export class RustServersApiService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Получить детальную информацию о сервере
   */
  async getServerDetails(): Promise<RustServerDetailResponse | null> {
    try {
      const url = `${RUST_SERVERS_API_BASE}?object=servers&element=detail&key=${this.apiKey}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`Rust-servers.net API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json() as RustServerDetailResponse;
      return data;
    } catch (error) {
      console.error('Error fetching server details from rust-servers.net:', error);
      return null;
    }
  }

  /**
   * Проверить, проголосовал ли игрок (по Steam ID)
   */
  async checkVote(steamId: string): Promise<number> {
    try {
      const url = `${RUST_SERVERS_API_BASE}?object=votes&element=claim&key=${this.apiKey}&steamid=${steamId}`;
      
      const response = await fetch(url, {
        method: 'GET',
      });

      if (!response.ok) {
        return 0;
      }

      const result = await response.text();
      return parseInt(result, 10) || 0;
    } catch (error) {
      console.error('Error checking vote:', error);
      return 0;
    }
  }

  /**
   * Отметить голос как полученный (claimed)
   */
  async claimVote(steamId: string): Promise<boolean> {
    try {
      const url = `${RUST_SERVERS_API_BASE}?action=post&object=votes&element=claim&key=${this.apiKey}&steamid=${steamId}`;
      
      const response = await fetch(url, {
        method: 'POST',
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.text();
      return result === '1';
    } catch (error) {
      console.error('Error claiming vote:', error);
      return false;
    }
  }
}

// Создаем singleton instance
const apiKey = process.env.RUST_SERVERS_API_KEY || '';
export const rustServersApi = new RustServersApiService(apiKey);
