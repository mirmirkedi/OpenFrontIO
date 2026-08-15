import {
  GameConfig,
  GameID,
  GameStartInfo,
  GameStartInfoSchema,
  PartialGameRecord,
  Turn,
  TurnSchema,
} from "../core/Schemas";
import { replacer } from "../core/Util";
import { z } from "zod";

export interface LocalStatsData {
  [key: GameID]: {
    lobby: Partial<GameConfig>;
    // Only once the game is over
    gameRecord?: PartialGameRecord;
  };
}

let _startTime: number;

const ACTIVE_GAME_STORAGE_KEY = "opentroop-active-game-v1";

export interface ActiveLocalGame {
  gameStartInfo: GameStartInfo;
  turns: Turn[];
}

const ActiveLocalGameSchema = z.object({
  gameStartInfo: GameStartInfoSchema,
  turns: TurnSchema.array(),
});

function getStats(): LocalStatsData {
  const statsStr = localStorage.getItem("game-records");
  return statsStr ? JSON.parse(statsStr) : {};
}

function save(stats: LocalStatsData) {
  // To execute asynchronously
  setTimeout(
    () => localStorage.setItem("game-records", JSON.stringify(stats, replacer)),
    0,
  );
}

// The user can quit the game anytime so better save the lobby as soon as the
// game starts.
export function startGame(id: GameID, lobby: Partial<GameConfig>) {
  if (localStorage === undefined) {
    return;
  }

  _startTime = Date.now();
  const stats = getStats();
  stats[id] = { lobby };
  save(stats);
}

export function loadActiveLocalGame(): ActiveLocalGame | null {
  try {
    const saved = localStorage.getItem(ACTIVE_GAME_STORAGE_KEY);
    if (!saved) return null;
    const parsed: unknown = JSON.parse(saved);
    const result = ActiveLocalGameSchema.safeParse(parsed);
    if (result.success) return result.data;
    clearActiveLocalGame();
  } catch (error) {
    console.warn("Unable to restore saved OpenTroop game", error);
    clearActiveLocalGame();
  }
  return null;
}

export function saveActiveLocalGame(
  gameStartInfo: GameStartInfo,
  turns: Turn[],
) {
  try {
    localStorage.setItem(
      ACTIVE_GAME_STORAGE_KEY,
      JSON.stringify({ gameStartInfo, turns }, replacer),
    );
  } catch (error) {
    // A full storage quota must never interrupt the running match.
    console.warn("Unable to save OpenTroop game progress", error);
  }
}

export function clearActiveLocalGame() {
  try {
    localStorage.removeItem(ACTIVE_GAME_STORAGE_KEY);
  } catch (error) {
    console.warn("Unable to clear saved OpenTroop game", error);
  }
}

export function startTime() {
  return _startTime;
}

export function endGame(gameRecord: PartialGameRecord) {
  if (localStorage === undefined) {
    return;
  }

  const stats = getStats();
  const gameStat = stats[gameRecord.info.gameID];

  if (!gameStat) {
    console.log("LocalPersistantStats: game not found");
    return;
  }

  gameStat.gameRecord = gameRecord;
  save(stats);
  clearActiveLocalGame();
}
