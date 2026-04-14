import WebSocket from 'ws';

interface RconResponse {
  Identifier: number;
  Message: string;
  Type: string;
}

interface PendingRequest {
  resolve: (msg: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class RustRconService {
  private ws: WebSocket | null = null;
  private host: string;
  private port: number;
  private password: string;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private connected = false;
  private connecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** После `quit` не планировать переподключение (сервер перезапускается панелью). */
  private intentionalShutdown = false;

  private readonly COMMAND_TIMEOUT = 10_000;
  private readonly RECONNECT_DELAY = 5_000;

  constructor() {
    this.host = process.env.RCON_HOST || '127.0.0.1';
    this.port = parseInt(process.env.RCON_PORT || '28016', 10);
    this.password = process.env.RCON_PASSWORD || '';
  }

  isConfigured(): boolean {
    return this.password.length > 0;
  }

  /** Вызвать перед отправкой `quit`, иначе после остановки сервера начнётся цикл переподключений. */
  markIntentionalShutdown(): void {
    this.intentionalShutdown = true;
  }

  async connect(): Promise<void> {
    if (this.connected || this.connecting) return;
    if (!this.isConfigured()) {
      throw new Error('RCON не настроен: RCON_PASSWORD не задан');
    }

    this.connecting = true;

    return new Promise<void>((resolve, reject) => {
      const url = `ws://${this.host}:${this.port}/${this.password}`;
      this.ws = new WebSocket(url);

      const connectTimeout = setTimeout(() => {
        this.connecting = false;
        this.ws?.terminate();
        reject(new Error('RCON: таймаут подключения'));
      }, this.COMMAND_TIMEOUT);

      this.ws.on('open', () => {
        clearTimeout(connectTimeout);
        this.connected = true;
        this.connecting = false;
        console.log(`✅ RCON подключён к ${this.host}:${this.port}`);
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('close', () => {
        clearTimeout(connectTimeout);
        this.handleDisconnect();
      });

      this.ws.on('error', (err: Error) => {
        clearTimeout(connectTimeout);
        if (this.connecting) {
          this.connecting = false;
          reject(new Error(`RCON: ошибка подключения — ${err.message}`));
        }
        console.error('RCON WebSocket ошибка:', err.message);
      });
    });
  }

  async sendCommand(command: string): Promise<string> {
    if (!this.connected || !this.ws) {
      await this.connect();
    }

    return new Promise<string>((resolve, reject) => {
      const id = ++this.requestId;

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RCON: таймаут команды "${command}"`));
      }, this.COMMAND_TIMEOUT);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const payload = JSON.stringify({
        Identifier: id,
        Message: command,
        Name: 'DragonLostWeb',
      });

      this.ws!.send(payload, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          reject(new Error(`RCON: ошибка отправки — ${err.message}`));
        }
      });
    });
  }

  async isPlayerOnline(steamId: string): Promise<boolean> {
    const response = await this.sendCommand('playerlist');

    try {
      const players = JSON.parse(response) as Array<{ SteamID: string }>;
      return players.some((p) => p.SteamID === steamId);
    } catch {
      return response.includes(steamId);
    }
  }

  async giveItem(steamId: string, itemShortName: string, amount: number): Promise<string> {
    const useSilent = process.env.RCON_SILENT_GIVE !== 'false';
    const command = useSilent
      ? `silentgive ${steamId} ${itemShortName} ${amount}`
      : `inventory.giveto ${steamId} ${itemShortName} ${amount}`;

    console.log(`RCON → ${command}`);
    const response = await this.sendCommand(command);
    console.log(`RCON ← ${response}`);
    return response;
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    for (const [id, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('RCON: соединение закрыто'));
      this.pendingRequests.delete(id);
    }

    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }

    this.connected = false;
    this.connecting = false;
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const response = JSON.parse(data.toString()) as RconResponse;
      const pending = this.pendingRequests.get(response.Identifier);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(response.Identifier);
        pending.resolve(response.Message);
      }
    } catch {
      console.error('RCON: не удалось разобрать ответ');
    }
  }

  private handleDisconnect(): void {
    const wasConnected = this.connected;
    this.connected = false;
    this.connecting = false;
    this.ws = null;

    for (const [id, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error('RCON: соединение потеряно'));
      this.pendingRequests.delete(id);
    }

    if (wasConnected) {
      if (this.intentionalShutdown) {
        this.intentionalShutdown = false;
        console.log('RCON: отключение после остановки сервера (переподключение не планируется)');
      } else {
        console.warn('⚠️ RCON: соединение потеряно, переподключение через 5 с...');
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('RCON: не удалось переподключиться:', message);
        this.scheduleReconnect();
      }
    }, this.RECONNECT_DELAY);
  }
}

export const rconService = new RustRconService();
