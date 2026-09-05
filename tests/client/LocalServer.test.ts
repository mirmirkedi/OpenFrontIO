import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/core/EventBus";
import type { ClientMessage, GameStartInfo } from "../../src/core/Schemas";

vi.mock("../../src/client/Auth", () => ({
  getAuthHeader: vi.fn(async () => "Bearer test-jwt"),
  getPersistentID: vi.fn(() => "123e4567-e89b-12d3-a456-426614174000"),
}));

vi.mock("../../src/client/Api", () => ({
  getApiBase: vi.fn(() => "https://api.test"),
}));

vi.mock("src/client/ClientEnv", () => ({
  ClientEnv: {
    turnIntervalMs: vi.fn(() => 100),
    gitCommit: vi.fn(() => "DEV"),
  },
}));

import { ReplaySpeedChangeEvent } from "../../src/client/InputHandler";
import {
  clearActiveLocalGame,
  loadActiveLocalGame,
} from "../../src/client/LocalPersistantStats";
import { LocalServer } from "../../src/client/LocalServer";
import { ReplaySpeedMultiplier } from "../../src/client/utilities/ReplaySpeedMultiplier";

// jsdom doesn't provide CompressionStream; use Node's implementation.
if (typeof globalThis.CompressionStream === "undefined") {
  const streamWeb = await import("node:stream/web");
  (globalThis as any).CompressionStream = streamWeb.CompressionStream;
}

const CLIENT_ID = "abCD1234";

function makeGameStartInfo(): GameStartInfo {
  return {
    gameID: "gameID12",
    lobbyCreatedAt: 1000,
    config: {
      gameMap: "Africa",
      difficulty: "Medium",
      donateGold: false,
      donateTroops: false,
      gameType: "Singleplayer",
      gameMode: "Free For All",
      gameMapSize: "Normal",
      nations: "default",
      bots: 400,
      infiniteGold: false,
      infiniteTroops: false,
      instantBuild: false,
      randomSpawn: false,
    },
    players: [
      {
        clientID: CLIENT_ID,
        username: "TestUser",
        clanTag: null,
      },
    ],
  } as GameStartInfo;
}

function makeServer(isReplay: boolean): LocalServer {
  const server = new LocalServer(
    {
      gameStartInfo: makeGameStartInfo(),
      playerName: "TestUser",
      playerClanTag: null,
    } as any,
    isReplay,
    new EventBus(),
  );
  server.updateCallback(
    () => {},
    () => {},
  );
  return server;
}

const winnerMsg: ClientMessage = {
  type: "winner",
  winner: ["player", CLIENT_ID],
  allPlayersStats: { [CLIENT_ID]: { attacks: [100n] } },
};

function archivedRecord(call: any) {
  const body = call[1].body as ArrayBuffer;
  return JSON.parse(gunzipSync(Buffer.from(body)).toString());
}

describe("LocalServer archiving", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("archives at win time, without keepalive, and not again at endGame", async () => {
    const server = makeServer(false);
    server.start();

    server.onMessage(winnerMsg);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test/archive_singleplayer_game");
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBe(false);
    expect(init.headers.Authorization).toBe("Bearer test-jwt");

    const record = archivedRecord(fetchMock.mock.calls[0]);
    expect(record.gitCommit).toBe("DEV");
    expect(record.info.winner).toEqual(["player", CLIENT_ID]);
    expect(record.info.players[0].clientID).toBe(CLIENT_ID);

    // Exiting afterwards must not archive the same game twice.
    server.endGame();
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries at endGame with keepalive when the win-time upload failed", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const server = makeServer(false);
    server.start();

    server.onMessage(winnerMsg);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Let the failed attempt settle so it is no longer in flight.
    await new Promise((r) => setTimeout(r, 0));

    server.endGame();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [, init] = fetchMock.mock.calls[1];
    expect(init.keepalive).toBe(true);
    expect(archivedRecord(fetchMock.mock.calls[1]).info.winner).toEqual([
      "player",
      CLIENT_ID,
    ]);
  });

  it("does not start a second upload while one is in flight", async () => {
    let resolveFetch!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((r) => (resolveFetch = r)),
    );
    const server = makeServer(false);
    server.start();

    server.onMessage(winnerMsg);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Exit while the win-time upload is still pending.
    server.endGame();
    resolveFetch(new Response(null, { status: 200 }));
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still archives at endGame when the game had no winner", async () => {
    const server = makeServer(false);
    server.start();

    server.endGame();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, init] = fetchMock.mock.calls[0];
    expect(init.keepalive).toBe(true);
    expect(archivedRecord(fetchMock.mock.calls[0]).info.winner).toBeUndefined();
  });

  it("never archives replays", async () => {
    const server = makeServer(true);
    server.start();

    server.onMessage(winnerMsg);
    server.endGame();
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("LocalServer scheduling and mobile persistence", () => {
  let server: LocalServer;
  let bus: EventBus;
  let received: number;
  let acknowledge: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    vi.stubGlobal("BOOTSTRAP_CONFIG", { openTroopApp: true });
    localStorage.clear();
    bus = new EventBus();
    received = 0;
    acknowledge = true;
    server = new LocalServer(
      {
        gameStartInfo: makeGameStartInfo(),
        playerName: "TestUser",
        playerClanTag: null,
      } as any,
      false,
      bus,
    );
    server.updateCallback(
      () => {},
      (message) => {
        if (message.type === "turn") {
          received++;
          if (acknowledge) server.turnComplete();
        }
      },
    );
  });

  afterEach(() => {
    server.endGame();
    clearActiveLocalGame();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps 10 turns per second with one scheduled wakeup and saves every five seconds", () => {
    server.start();
    const writes = vi.spyOn(Storage.prototype, "setItem");
    vi.advanceTimersByTime(5000);
    expect(received).toBe(50);
    expect(writes).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(writes).toHaveBeenCalledTimes(1);
    expect(loadActiveLocalGame()?.turns.length).toBe(50);
  });

  it("waits for worker acknowledgement instead of polling or queueing extra turns", () => {
    acknowledge = false;
    server.start();
    vi.advanceTimersByTime(1000);
    expect(received).toBe(1);
    expect(vi.getTimerCount()).toBe(1); // only the pending save
    server.turnComplete();
    vi.advanceTimersByTime(1);
    expect(received).toBe(2);
  });

  it("does not advance a resumed game until all restored turns are acknowledged", () => {
    server["lobbyConfig"].resumeTurns = [
      { turnNumber: 0, intents: [] },
      { turnNumber: 1, intents: [] },
    ];
    server.start();
    vi.advanceTimersByTime(1000);
    expect(received).toBe(0);
    server.turnComplete();
    vi.advanceTimersByTime(100);
    expect(received).toBe(0);
    server.turnComplete();
    vi.advanceTimersByTime(1);
    expect(received).toBe(1);
  });

  it("suspends in the background, flushes progress, and resumes without a catch-up burst", () => {
    server.start();
    vi.advanceTimersByTime(350);
    expect(received).toBe(3);
    window.dispatchEvent(
      new CustomEvent("worldfront-app-state", { detail: { active: false } }),
    );
    expect(loadActiveLocalGame()?.turns.length).toBe(3);
    // jsdom dispatches the synchronous storage write's storage event on a 0ms timer.
    vi.advanceTimersByTime(0);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(received).toBe(3);
    window.dispatchEvent(
      new CustomEvent("worldfront-app-state", { detail: { active: true } }),
    );
    vi.advanceTimersByTime(99);
    expect(received).toBe(3);
    vi.advanceTimersByTime(1);
    expect(received).toBe(4);
  });

  it("preserves manual pause through a background/foreground round trip", () => {
    server.start();
    server.onMessage({
      type: "intent",
      intent: { type: "toggle_pause", paused: true },
    });
    const count = received;
    window.dispatchEvent(
      new CustomEvent("worldfront-app-state", { detail: { active: false } }),
    );
    window.dispatchEvent(
      new CustomEvent("worldfront-app-state", { detail: { active: true } }),
    );
    vi.advanceTimersByTime(1000);
    expect(received).toBe(count);
    server.onMessage({
      type: "intent",
      intent: { type: "toggle_pause", paused: false },
    });
    vi.advanceTimersByTime(100);
    expect(received).toBeGreaterThan(count);
  });

  it("reschedules speed changes without leaving a stale timer", () => {
    server.start();
    bus.emit(new ReplaySpeedChangeEvent(ReplaySpeedMultiplier.fast));
    vi.advanceTimersByTime(1000);
    expect(received).toBe(20);
  });

  it("saves player commands immediately and flushes passive turns on pagehide", () => {
    server.start();
    server.onMessage({ type: "intent", intent: { type: "spawn", tile: 42 } });
    vi.advanceTimersByTime(100);
    expect(loadActiveLocalGame()?.turns[0].intents[0].type).toBe("spawn");
    vi.advanceTimersByTime(300);
    expect(loadActiveLocalGame()?.turns.length).toBe(1);
    window.dispatchEvent(new Event("pagehide"));
    expect(loadActiveLocalGame()?.turns.length).toBe(4);
  });

  it("does not recreate a completed game on subsequent passive ticks", () => {
    server.start();
    vi.advanceTimersByTime(100);
    server.onMessage(winnerMsg);
    expect(loadActiveLocalGame()).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(loadActiveLocalGame()).toBeNull();
  });

  it("removes pending timers and visibility handlers on stop", () => {
    server.start();
    vi.advanceTimersByTime(200);
    server.endGame();
    const count = received;
    vi.advanceTimersByTime(0);
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(
      new CustomEvent("worldfront-app-state", { detail: { active: true } }),
    );
    vi.advanceTimersByTime(10_000);
    expect(received).toBe(count);
    expect(loadActiveLocalGame()?.turns.length).toBe(count);
  });
});
