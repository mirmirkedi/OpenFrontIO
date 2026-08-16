import {
  GameInfo,
  PublicGameInfo,
  PublicGames,
} from "../../core/Schemas";
import { PublicLobbySocket } from "../LobbySocket";

export type ServerConnectionStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "reconnecting"
  | "error";

export interface MultiplayerServerListener {
  onLobbiesUpdate?: (lobbies: PublicGames) => void;
  onStatusChange?: (status: ServerConnectionStatus) => void;
}

export class MultiplayerServerAdapter {
  private static instance: MultiplayerServerAdapter | null = null;
  private lobbySocket: PublicLobbySocket | null = null;
  private listeners: Set<MultiplayerServerListener> = new Set();
  private lastLobbies: PublicGames | null = null;
  private status: ServerConnectionStatus = "disconnected";

  public static getInstance(): MultiplayerServerAdapter {
    MultiplayerServerAdapter.instance ??= new MultiplayerServerAdapter();
    return MultiplayerServerAdapter.instance;
  }

  private constructor() {
    this.lobbySocket = new PublicLobbySocket(
      (lobbies) => this.handleLobbiesUpdate(lobbies),
      {
        reconnectDelay: 2500,
        maxWsAttempts: 5,
      },
    );
  }

  public subscribe(listener: MultiplayerServerListener): () => void {
    this.listeners.add(listener);
    if (this.lastLobbies && listener.onLobbiesUpdate) {
      listener.onLobbiesUpdate(this.lastLobbies);
    }
    if (listener.onStatusChange) {
      listener.onStatusChange(this.status);
    }
    // Auto start socket if listeners exist
    if (this.listeners.size === 1) {
      this.connect();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.disconnect();
      }
    };
  }

  public connect(): void {
    if (this.status === "connected" || this.status === "connecting") return;
    this.setStatus("connecting");
    try {
      this.lobbySocket?.start();
      this.setStatus("connected");
    } catch (e) {
      console.error("MultiplayerServerAdapter connect error:", e);
      this.setStatus("error");
    }
  }

  public disconnect(): void {
    this.lobbySocket?.stop();
    this.setStatus("disconnected");
  }

  private setStatus(status: ServerConnectionStatus): void {
    this.status = status;
    for (const listener of this.listeners) {
      listener.onStatusChange?.(status);
    }
  }

  private handleLobbiesUpdate(lobbies: PublicGames): void {
    this.lastLobbies = lobbies;
    this.setStatus("connected");
    for (const listener of this.listeners) {
      listener.onLobbiesUpdate?.(lobbies);
    }
  }

  public getLastLobbies(): PublicGames | null {
    return this.lastLobbies;
  }

  public getStatus(): ServerConnectionStatus {
    return this.status;
  }

  /**
   * Helper to format game ID and dispatch join event to game engine
   */
  public joinGame(
    gameID: string,
    source: "public" | "private" | "matchmaking" = "public",
    lobbyInfo?: GameInfo | PublicGameInfo,
  ): void {
    const cleanId = gameID.trim().toUpperCase();
    document.dispatchEvent(
      new CustomEvent("join-lobby", {
        detail: {
          gameID: cleanId,
          source,
          publicLobbyInfo: lobbyInfo,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
