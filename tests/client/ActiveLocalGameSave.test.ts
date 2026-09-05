import {
  clearActiveLocalGame,
  flushActiveLocalGameSave,
  queueActiveLocalGameSave,
  saveActiveLocalGame,
} from "../../src/client/LocalPersistantStats";
import type { GameStartInfo, Turn } from "../../src/core/Schemas";

const key = "opentroop-active-game-v1";
const info = { gameID: "testgame" } as GameStartInfo;

describe("active game checkpoints", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    clearActiveLocalGame();
  });
  afterEach(() => {
    clearActiveLocalGame();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("coalesces 50 passive turns and writes the latest complete history at five seconds", () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    const turns: Turn[] = [];
    for (let i = 0; i < 50; i++) {
      turns.push({ turnNumber: i, intents: [] });
      queueActiveLocalGameSave(info, turns);
      vi.advanceTimersByTime(99);
    }
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(key)!).turns).toEqual(turns);
  });

  it("flushes pending progress synchronously and cancels the delayed duplicate", () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    queueActiveLocalGameSave(info, [{ turnNumber: 0, intents: [] }]);
    flushActiveLocalGameSave();
    expect(write).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("never resurrects a cleared or completed game", () => {
    queueActiveLocalGameSave(info, [{ turnNumber: 0, intents: [] }]);
    clearActiveLocalGame();
    flushActiveLocalGameSave();
    vi.advanceTimersByTime(10_000);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("an immediate command checkpoint supersedes a queued snapshot", () => {
    queueActiveLocalGameSave(info, [{ turnNumber: 0, intents: [] }]);
    const latest = [
      { turnNumber: 0, intents: [] },
      { turnNumber: 1, intents: [] },
    ];
    saveActiveLocalGame(info, latest);
    vi.advanceTimersByTime(10_000);
    expect(JSON.parse(localStorage.getItem(key)!).turns).toEqual(latest);
  });

  it("storage failure does not stop gameplay or destroy the previous checkpoint", () => {
    saveActiveLocalGame(info, []);
    const old = localStorage.getItem(key);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    queueActiveLocalGameSave(info, [{ turnNumber: 0, intents: [] }]);
    expect(() => flushActiveLocalGameSave()).not.toThrow();
    expect(localStorage.getItem(key)).toBe(old);
  });
});
