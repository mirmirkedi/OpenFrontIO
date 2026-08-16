import { html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { GameMapType, GameMode } from "../../core/game/Game";
import { PublicGameInfo, PublicGames } from "../../core/Schemas";
import { BaseModal } from "../components/BaseModal";
import { HostLobbyModal } from "../HostLobbyModal";
import { terrainMapFileLoader } from "../TerrainMapFileLoader";
import { UsernameInput } from "../UsernameInput";
import {
  calculateServerTimeOffset,
  getMapName,
  getModifierLabels,
  getSecondsUntilServerTimestamp,
  renderDuration,
} from "../Utils";
import { MultiplayerServerAdapter } from "./MultiplayerServerAdapter";

@customElement("multiplayer-home-modal")
export class MultiplayerHomeModal extends BaseModal {
  @state() private lobbies: PublicGames | null = null;
  @state() private joinCode: string = "";
  @state() private joinError: string = "";
  @state() private defaultLobbyTime: number = 60;
  private serverTimeOffset: number = 0;
  private unsubscribeAdapter: (() => void) | null = null;

  constructor() {
    super();
    this.id = "page-multiplayer";
  }

  private validateUsername(): boolean {
    const usernameInput = document.querySelector(
      "username-input",
    ) as UsernameInput | null;
    return usernameInput ? usernameInput.canPlay() : true;
  }

  protected onOpen(): void {
    const adapter = MultiplayerServerAdapter.getInstance();
    this.unsubscribeAdapter = adapter.subscribe({
      onLobbiesUpdate: (lobbies) => this.handleLobbiesUpdate(lobbies),
    });
    adapter.connect();
  }

  protected onClose(): void {
    if (this.unsubscribeAdapter) {
      this.unsubscribeAdapter();
      this.unsubscribeAdapter = null;
    }
    this.joinCode = "";
    this.joinError = "";
  }

  private handleLobbiesUpdate(lobbies: PublicGames) {
    this.lobbies = lobbies;
    this.serverTimeOffset = calculateServerTimeOffset(lobbies.serverTime);
    this.requestUpdate();
  }

  private openQuickMatch = () => {
    if (!this.validateUsername()) return;
    const allGames = [
      ...(this.lobbies?.games?.["ffa"] ?? []),
      ...(this.lobbies?.games?.["team"] ?? []),
      ...(this.lobbies?.games?.["special"] ?? []),
    ];
    if (allGames.length > 0) {
      this.joinPublicLobby(allGames[0]);
    } else {
      this.close();
      window.showPage?.("page-matchmaking");
    }
  };

  private openCreateLobby = () => {
    if (!this.validateUsername()) return;
    this.close();
    (document.querySelector("host-lobby-modal") as HostLobbyModal)?.open();
  };

  private handleJoinCodeInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    this.joinCode = input.value.trim().toUpperCase();
    this.joinError = "";
  };

  private handleJoinCodeSubmit = (e?: Event) => {
    e?.preventDefault();
    if (!this.validateUsername()) return;
    if (!this.joinCode) {
      this.joinError = "Please enter a game code";
      return;
    }
    const cleanCode = this.joinCode.trim().toUpperCase();
    this.close();
    MultiplayerServerAdapter.getInstance().joinGame(cleanCode, "private");
  };

  private joinPublicLobby(lobby: PublicGameInfo) {
    if (!this.validateUsername()) return;
    this.close();
    MultiplayerServerAdapter.getInstance().joinGame(
      lobby.gameID,
      "public",
      lobby,
    );
  }

  protected renderHeaderSlot() {
    return html`
      <div class="flex items-center justify-between w-full px-2 py-1">
        <div class="opentroop-setup-header__left flex items-center gap-3">
          <button
            class="opentroop-icon-button opentroop-setup-header__back"
            @click=${() => this.close()}
            aria-label="Back"
          >
            ←
          </button>
          <span class="opentroop-setup-header__title font-bold uppercase tracking-wider text-white">
            Multiplayer
          </span>
        </div>
      </div>
    `;
  }

  protected renderBody() {
    const ffaGames = this.lobbies?.games?.["ffa"] ?? [];
    const teamGames = this.lobbies?.games?.["team"] ?? [];
    const specialGames = this.lobbies?.games?.["special"] ?? [];
    const hostedGames = this.lobbies?.games?.["hosted"] ?? [];
    const allPublicGames = [...ffaGames, ...teamGames, ...specialGames, ...hostedGames];

    return html`
      <div class="opentroop-setup-shell flex flex-col h-full">
        <div class="opentroop-setup-scroll flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 sm:px-6 pt-3 pb-6 mx-auto w-full max-w-4xl space-y-6">
          
          <!-- Warfare Actions Section -->
          <div>
            <div class="flex items-center justify-between pb-2 border-b border-white/10 mb-3">
              <span class="text-xs font-bold uppercase tracking-widest text-white/50">
                Warfare Actions
              </span>
            </div>

            <!-- Action Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- Quick Match Button -->
              <button
                @click=${this.openQuickMatch}
                class="w-full flex items-center justify-between p-4 rounded-xl border bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 active:scale-[0.98] transition-all text-left"
              >
                <div>
                  <span class="block text-sm sm:text-base font-bold uppercase tracking-wider text-white">
                    Quick Match
                  </span>
                  <span class="block text-xs font-normal text-white/60 mt-0.5">
                    Jump into next available battle
                  </span>
                </div>
                <span class="text-lg text-white/40 font-bold">›</span>
              </button>

              <!-- Create Lobby Button -->
              <button
                @click=${this.openCreateLobby}
                class="w-full flex items-center justify-between p-4 rounded-xl border bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 active:scale-[0.98] transition-all text-left"
              >
                <div>
                  <span class="block text-sm sm:text-base font-bold uppercase tracking-wider text-white">
                    Create Lobby
                  </span>
                  <span class="block text-xs font-normal text-white/60 mt-0.5">
                    Custom rules, maps & friends
                  </span>
                </div>
                <span class="text-lg text-white/40 font-bold">›</span>
              </button>
            </div>

            <!-- Join with Code Bar -->
            <form
              @submit=${this.handleJoinCodeSubmit}
              class="mt-3 flex gap-2 items-center p-1.5 rounded-xl bg-white/5 border border-white/10"
            >
              <input
                type="text"
                .value=${this.joinCode}
                @input=${this.handleJoinCodeInput}
                placeholder="ENTER LOBBY CODE"
                maxlength="16"
                class="flex-1 bg-transparent px-3 py-2 text-xs sm:text-sm font-mono font-bold tracking-widest text-white uppercase focus:outline-none placeholder:text-white/30"
              />
              <button
                type="submit"
                class="px-5 py-2.5 rounded-lg bg-malibu-blue hover:bg-aquarius active:scale-95 text-white font-bold text-xs uppercase tracking-wider transition-all shrink-0"
              >
                Join
              </button>
            </form>
            ${this.joinError
              ? html`<p class="text-rose-400 text-xs font-bold mt-2 px-1">${this.joinError}</p>`
              : nothing}
          </div>

          <!-- Public Battles Section -->
          <div>
            <div class="flex items-center justify-between pb-2 border-b border-white/10 mb-3">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold uppercase tracking-widest text-white/50">
                  Public Battlefields
                </span>
                <span class="px-2 py-0.5 text-[10px] font-bold rounded-full bg-white/10 text-white/80 border border-white/10">
                  ${allPublicGames.length}
                </span>
              </div>
              <button
                @click=${() => MultiplayerServerAdapter.getInstance().connect()}
                class="text-[11px] font-bold uppercase tracking-wider text-white/60 hover:text-white"
              >
                ↻ Refresh
              </button>
            </div>

            <!-- Lobbies List -->
            ${this.lobbies === null
              ? html`
                  <div class="flex flex-col items-center justify-center p-8 text-center">
                    <span class="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-2"></span>
                    <p class="text-xs font-bold text-white/50 tracking-wider uppercase">Loading battles...</p>
                  </div>
                `
              : allPublicGames.length === 0
                ? html`
                    <div class="p-6 text-center text-white/60 rounded-xl bg-white/5 border border-white/10">
                      <p class="text-xs font-bold uppercase tracking-wider">No active public lobbies</p>
                      <button
                        @click=${this.openCreateLobby}
                        class="mt-3 px-4 py-2 rounded-lg bg-malibu-blue hover:bg-aquarius text-white font-bold text-xs uppercase tracking-wider"
                      >
                        Create First Lobby
                      </button>
                    </div>
                  `
                : html`
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      ${allPublicGames.map((lobby) => this.renderPublicLobbyCard(lobby))}
                    </div>
                  `}
          </div>

        </div>
      </div>
    `;
  }

  private renderPublicLobbyCard(lobby: PublicGameInfo) {
    const mapType = lobby.gameConfig?.gameMap as GameMapType;
    const mapImageSrc = mapType ? terrainMapFileLoader.getMapData(mapType).webpPath : undefined;
    const mapName = getMapName(lobby.gameConfig?.gameMap) ?? "World";
    const modeName = this.getLobbyModeName(lobby);

    const timeRemaining = lobby.startsAt
      ? getSecondsUntilServerTimestamp(lobby.startsAt, this.serverTimeOffset)
      : undefined;

    const timeDisplay =
      timeRemaining === undefined
        ? renderDuration(this.defaultLobbyTime)
        : timeRemaining > 0
          ? renderDuration(timeRemaining)
          : "STARTING";

    const modifierLabels = getModifierLabels(
      lobby.gameConfig?.publicGameModifiers,
      lobby.gameConfig?.doomsdayClock?.speed,
    );

    return html`
      <div
        @click=${() => this.joinPublicLobby(lobby)}
        class="group relative overflow-hidden rounded-xl border bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer flex flex-col justify-between min-h-[140px]"
      >
        <!-- Map Background Thumbnail -->
        <div class="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-30 group-hover:opacity-45 transition-opacity">
          ${mapImageSrc
            ? html`
                <img
                  src="${mapImageSrc}"
                  alt="${mapName}"
                  class="w-full h-full object-cover"
                />
              `
            : nothing}
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
        </div>

        <!-- Top Badges -->
        <div class="relative z-10 flex items-start justify-between p-3 gap-2">
          <div class="flex flex-wrap gap-1">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-malibu-blue text-white">
              ${modeName}
            </span>
            ${modifierLabels.map(
              (mod) => html`
                <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-black/40 text-white/80 border border-white/10">
                  ${mod}
                </span>
              `,
            )}
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider bg-black/50 text-white border border-white/10">
            ${timeDisplay}
          </span>
        </div>

        <!-- Bottom Row -->
        <div class="relative z-10 flex items-end justify-between p-3">
          <div>
            <h4 class="text-white font-bold text-sm uppercase tracking-wider leading-tight">
              ${mapName}
            </h4>
            <div class="text-white/60 text-xs font-normal mt-0.5">
              ${lobby.numClients ?? 0}/${lobby.gameConfig?.maxPlayers ?? 50} Players
            </div>
          </div>
          <button
            class="px-4 py-1.5 rounded-lg bg-malibu-blue hover:bg-aquarius active:scale-95 text-white font-bold text-xs uppercase tracking-wider"
          >
            Join
          </button>
        </div>
      </div>
    `;
  }

  private getLobbyModeName(lobby: PublicGameInfo): string {
    const config = lobby.gameConfig;
    if (!config) return "FFA";
    if (config.gameMode === GameMode.FFA) return "FFA";
    if (config.gameMode === GameMode.Team) {
      if (config.playerTeams === 2) return "2 Teams";
      if (config.playerTeams === 3) return "3 Teams";
      if (config.playerTeams === 4) return "4 Teams";
      return "Teams";
    }
    return "Battle";
  }
}
