import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ShowReplayPanelEvent } from "../../../../src/client/hud/layers/ReplayPanel";
import { TutorialOverlay } from "../../../../src/client/hud/layers/TutorialOverlay";
import {
  ReplaySpeedChangeEvent,
  ZoomEvent,
} from "../../../../src/client/InputHandler";
import {
  BuildUnitIntentEvent,
  PauseGameIntentEvent,
  SendAllianceRequestIntentEvent,
  SendAttackIntentEvent,
  SendBoatAttackIntentEvent,
  SendSpawnIntentEvent,
  SendWinnerEvent,
} from "../../../../src/client/Transport";
import { ReplaySpeedMultiplier } from "../../../../src/client/utilities/ReplaySpeedMultiplier";
import type { GameView } from "../../../../src/client/view";
import { EventBus } from "../../../../src/core/EventBus";
import { GameType, UnitType } from "../../../../src/core/game/Game";

const ACTIVE_KEY = "openfront.tutorial.active";
const COMPLETED_KEY = "openfront.tutorial.completed";
const STEP_KEY = "openfront.tutorial.step";

function createOverlay(step: number) {
  localStorage.setItem(ACTIVE_KEY, "true");
  localStorage.setItem(STEP_KEY, String(step));

  const eventBus = new EventBus();
  const overlay = new TutorialOverlay();
  overlay.game = {
    config: () => ({
      gameConfig: () => ({ gameType: GameType.Singleplayer }),
    }),
    myPlayer: () => null,
  } as unknown as GameView;
  overlay.eventBus = eventBus;
  overlay.uiState = { attackRatio: 0.15 } as never;
  overlay.transformHandler = {} as never;
  overlay.init();
  return { eventBus, overlay };
}

describe("TutorialOverlay deterministic progression", () => {
  beforeEach(() => {
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(STEP_KEY);
  });

  afterEach(() => {
    document
      .querySelectorAll("tutorial-overlay")
      .forEach((element) => element.remove());
  });

  test("pause lesson advances only after the player resumes", () => {
    const { eventBus, overlay } = createOverlay(5);

    eventBus.emit(new PauseGameIntentEvent(true));
    expect(localStorage.getItem(STEP_KEY)).toBe("5");

    eventBus.emit(new PauseGameIntentEvent(false));
    expect(localStorage.getItem(STEP_KEY)).toBe("6");
    overlay.stop();
  });

  test("tutorial blocks clicks and keyboard activation on unrelated controls", () => {
    const { overlay } = createOverlay(0);
    const button = document.createElement("button");
    let activated = false;
    button.addEventListener("click", () => (activated = true));
    button.addEventListener("keydown", () => (activated = true));
    document.body.append(button);

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    button.dispatchEvent(click);
    const keydown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Enter",
    });
    button.dispatchEvent(keydown);
    const touchDown = new Event("pointerdown", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperties(touchDown, {
      pointerType: { value: "touch" },
      pointerId: { value: 7 },
      clientX: { value: 5 },
      clientY: { value: 5 },
    });
    button.dispatchEvent(touchDown);

    expect(click.defaultPrevented).toBe(true);
    expect(keydown.defaultPrevented).toBe(true);
    expect(touchDown.defaultPrevented).toBe(true);
    expect(activated).toBe(false);
    button.remove();
    overlay.stop();
  });

  test("zoom lesson keeps its accessible zoom action interactive", () => {
    const { overlay } = createOverlay(0);
    const assist = document.createElement("button");
    assist.classList.add("zoom-assist");
    const event = { composedPath: () => [assist] } as unknown as Event;
    const canInteractAt = Reflect.get(overlay, "canInteractAt").bind(
      overlay,
    ) as (x: number, y: number, event: Event) => boolean;

    expect(canInteractAt(0, 0, event)).toBe(true);
    overlay.stop();
  });

  test("spawn assist sends the highlighted valid tile", () => {
    const { eventBus, overlay } = createOverlay(1);
    const expectedTile = 42;
    const received: SendSpawnIntentEvent[] = [];
    eventBus.on(SendSpawnIntentEvent, (event) => received.push(event));
    overlay.game = {
      myPlayer: () => null,
      isValidCoord: () => true,
      ref: () => expectedTile,
      isLand: () => true,
      hasOwner: () => false,
      isImpassable: () => false,
    } as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: () => ({ x: 4, y: 9 }),
    } as never;
    Reflect.set(overlay, "rect", new DOMRect(100, 100, 76, 76));
    Reflect.set(overlay, "findMapTarget", () => new DOMRect(100, 100, 76, 76));
    const chooseStartingPoint = Reflect.get(overlay, "chooseStartingPoint") as
      | (() => void)
      | undefined;

    expect(chooseStartingPoint).toBeTypeOf("function");
    chooseStartingPoint?.call(overlay);
    expect(received).toHaveLength(1);
    expect(received[0].tile).toBe(expectedTile);
    overlay.stop();
  });

  test("expand assist requests the tutorial's controlled expansion", () => {
    const { eventBus, overlay } = createOverlay(2);
    const sent: SendAttackIntentEvent[] = [];
    eventBus.on(SendAttackIntentEvent, (event) => sent.push(event));
    overlay.game = {
      myPlayer: () => ({ troops: () => 100 }) as never,
    } as unknown as GameView;
    const expandForMe = Reflect.get(overlay, "expandForMe") as
      | (() => void)
      | undefined;

    expect(expandForMe).toBeTypeOf("function");
    expandForMe?.call(overlay);
    expect(sent).toHaveLength(1);
    expect(sent[0].targetID).toBeNull();
    expect(sent[0].troops).toBe(15);
    overlay.stop();
  });

  test("expand assist retries at a bounded rate and stops after its limit", () => {
    vi.useFakeTimers();
    try {
      const { eventBus, overlay } = createOverlay(2);
      const sent: SendAttackIntentEvent[] = [];
      eventBus.on(SendAttackIntentEvent, (event) => sent.push(event));
      const player = {
        troops: () => 100,
        id: () => 1,
        borderTiles: async () => ({ borderTiles: [] }),
      };
      overlay.game = {
        myPlayer: () => player as never,
      } as unknown as GameView;
      const expandForMe = Reflect.get(overlay, "expandForMe") as
        | (() => void)
        | undefined;

      expandForMe?.();
      vi.advanceTimersByTime(20_000);
      expect(sent).toHaveLength(8);
      overlay.stop();
      vi.advanceTimersByTime(5_000);
      expect(sent).toHaveLength(8);
    } finally {
      vi.useRealTimers();
    }
  });

  test("attack assist targets the highlighted enemy", () => {
    const { eventBus, overlay } = createOverlay(3);
    const sent: SendAttackIntentEvent[] = [];
    eventBus.on(SendAttackIntentEvent, (event) => sent.push(event));
    const player = { smallID: () => 1, troops: () => 100 };
    const enemy = { smallID: () => 2, id: () => "enemy" };
    overlay.game = {
      myPlayer: () => player,
      isValidCoord: () => true,
      ref: () => 42,
      hasOwner: () => true,
      owner: () => enemy,
    } as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: () => ({ x: 4, y: 9 }),
    } as never;
    Reflect.set(overlay, "findMapTarget", () => new DOMRect(100, 100, 76, 76));
    const attackForMe = Reflect.get(overlay, "attackForMe") as
      | (() => void)
      | undefined;

    expect(attackForMe).toBeTypeOf("function");
    attackForMe?.call(overlay);
    expect(sent).toHaveLength(1);
    expect(sent[0].targetID).toBe("enemy");
    expect(sent[0].troops).toBe(15);
    overlay.stop();
  });

  test("unit assist builds the current lesson unit on highlighted owned land", () => {
    const { eventBus, overlay } = createOverlay(6);
    const player = { smallID: () => 1 };
    const received: BuildUnitIntentEvent[] = [];
    eventBus.on(BuildUnitIntentEvent, (event) => received.push(event));
    overlay.game = {
      myPlayer: () => player,
      isValidCoord: () => true,
      ref: () => 42,
      ownerID: () => 1,
      isImpassable: () => false,
    } as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: () => ({ x: 4, y: 9 }),
    } as never;
    Reflect.set(overlay, "findMapTarget", () => new DOMRect(100, 100, 76, 76));
    const buildUnitForMe = Reflect.get(overlay, "buildUnitForMe") as
      | (() => void)
      | undefined;

    expect(buildUnitForMe).toBeTypeOf("function");
    buildUnitForMe?.call(overlay);
    expect(received).toHaveLength(1);
    expect(received[0].unit).toBe(UnitType.City);
    expect(received[0].tile).toBe(42);
    overlay.stop();
  });

  test("alliance assist requests an alliance with the highlighted neighbor", () => {
    const { eventBus, overlay } = createOverlay(9);
    const player = { smallID: () => 1 };
    const neighbor = { smallID: () => 2, isPlayer: () => true };
    const received: SendAllianceRequestIntentEvent[] = [];
    eventBus.on(SendAllianceRequestIntentEvent, (event) =>
      received.push(event),
    );
    overlay.game = {
      myPlayer: () => player,
      isValidCoord: () => true,
      ref: () => 42,
      hasOwner: () => true,
      owner: () => neighbor,
    } as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: () => ({ x: 4, y: 9 }),
    } as never;
    Reflect.set(overlay, "findMapTarget", () => new DOMRect(100, 100, 76, 76));
    const requestAllianceForMe = Reflect.get(
      overlay,
      "requestAllianceForMe",
    ) as (() => void) | undefined;

    expect(requestAllianceForMe).toBeTypeOf("function");
    requestAllianceForMe?.call(overlay);
    expect(received).toHaveLength(1);
    expect(received[0].requestor).toBe(player);
    expect(received[0].recipient).toBe(neighbor);
    overlay.stop();
  });

  test("port assist places a Port once a coast is available", () => {
    const { eventBus, overlay } = createOverlay(10);
    const player = { smallID: () => 1 };
    const received: BuildUnitIntentEvent[] = [];
    eventBus.on(BuildUnitIntentEvent, (event) => received.push(event));
    overlay.game = {
      myPlayer: () => player,
      isValidCoord: () => true,
      ref: () => 42,
      ownerID: () => 1,
      isImpassable: () => false,
    } as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: () => ({ x: 4, y: 9 }),
    } as never;
    Reflect.set(overlay, "hasCoastalTerritory", () => true);
    Reflect.set(overlay, "findMapTarget", () => new DOMRect(100, 100, 76, 76));
    const portForMe = Reflect.get(overlay, "portForMe") as
      | (() => void)
      | undefined;

    expect(portForMe).toBeTypeOf("function");
    portForMe?.call(overlay);
    expect(received).toHaveLength(1);
    expect(received[0].unit).toBe(UnitType.Port);
    expect(received[0].tile).toBe(42);
    overlay.stop();
  });

  test("rocket assist launches from the player's Missile Silo", () => {
    const { eventBus, overlay } = createOverlay(13);
    const silo = { tile: () => 88 };
    const player = { units: () => [silo] };
    const received: BuildUnitIntentEvent[] = [];
    eventBus.on(BuildUnitIntentEvent, (event) => received.push(event));
    overlay.game = {
      myPlayer: () => player,
    } as unknown as GameView;
    const launchAtomBombForMe = Reflect.get(overlay, "launchAtomBombForMe") as
      | (() => void)
      | undefined;

    expect(launchAtomBombForMe).toBeTypeOf("function");
    launchAtomBombForMe?.call(overlay);
    expect(received).toHaveLength(1);
    expect(received[0].unit).toBe(UnitType.AtomBomb);
    expect(received[0].tile).toBe(88);
    overlay.stop();
  });

  test("rocket assist builds a missing silo and launches when it is ready", () => {
    vi.useFakeTimers();
    try {
      const { eventBus, overlay } = createOverlay(13);
      const silo = { tile: () => 88 };
      let silos: typeof silo[] = [];
      const player = {
        id: () => "player",
        smallID: () => 1,
        tiles: () => [42],
        borderTiles: async () => ({ borderTiles: new Set<number>() }),
        units: () => silos,
      };
      const received: BuildUnitIntentEvent[] = [];
      eventBus.on(BuildUnitIntentEvent, (event) => received.push(event));
      overlay.game = {
        myPlayer: () => player,
      } as unknown as GameView;
      Reflect.set(overlay, "findOwnedLandTile", () => 42);
      const launchAtomBombForMe = Reflect.get(overlay, "launchAtomBombForMe") as
        | (() => void)
        | undefined;

      launchAtomBombForMe?.();
      expect(received).toHaveLength(1);
      expect(received[0].unit).toBe(UnitType.MissileSilo);
      expect(received[0].tile).toBe(42);

      silos = [silo];
      vi.advanceTimersByTime(500);
      expect(received).toHaveLength(2);
      expect(received[1].unit).toBe(UnitType.AtomBomb);
      expect(received[1].tile).toBe(88);
      expect(localStorage.getItem(STEP_KEY)).toBe("14");
      overlay.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  test("win lesson finishes only when the local player wins", () => {
    const { eventBus, overlay } = createOverlay(16);
    overlay.game = {
      myPlayer: () => ({ clientID: () => "me", team: () => null }) as never,
    } as unknown as GameView;

    eventBus.emit(new SendWinnerEvent(["player", "other"], {} as never));
    expect(localStorage.getItem(ACTIVE_KEY)).toBe("true");

    eventBus.emit(new SendWinnerEvent(["player", "me"], {} as never));
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
    expect(localStorage.getItem(COMPLETED_KEY)).toBe("true");
    expect(localStorage.getItem(STEP_KEY)).toBeNull();
    overlay.stop();
  });

  test("spawn lesson blocks unrelated HUD controls", () => {
    const { overlay } = createOverlay(1);
    const button = document.createElement("button");
    let activated = false;
    button.addEventListener("click", () => (activated = true));
    button.addEventListener("keydown", () => (activated = true));
    document.body.append(button);

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    button.dispatchEvent(click);
    const keydown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Space",
    });
    button.dispatchEvent(keydown);

    expect(click.defaultPrevented).toBe(true);
    expect(keydown.defaultPrevented).toBe(true);
    expect(activated).toBe(false);
    button.remove();
    overlay.stop();
  });

  test("spawn lesson can target and accept land before myPlayer exists", () => {
    const { overlay } = createOverlay(1);
    let isLand = true;
    let hasOwner = false;
    const game = {
      myPlayer: () => null,
      isValidCoord: () => true,
      ref: () => 42,
      isLand: () => isLand,
      hasOwner: () => hasOwner,
      isImpassable: () => false,
    };
    overlay.game = game as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: () => ({ x: 0, y: 0 }),
    } as never;
    Reflect.set(overlay, "rect", new DOMRect(50, 50, 100, 100));

    const isValidMapActionAt = Reflect.get(overlay, "isValidMapActionAt").bind(
      overlay,
    ) as (x: number, y: number) => boolean;
    const canInteractAt = Reflect.get(overlay, "canInteractAt").bind(
      overlay,
    ) as (x: number, y: number, event: Event) => boolean;
    const findMapTarget = Reflect.get(overlay, "findMapTarget").bind(
      overlay,
    ) as () => DOMRect | null;
    const canvas = document.createElement("canvas");
    const mapTap = { composedPath: () => [canvas] } as unknown as Event;
    expect(findMapTarget()).not.toBeNull();
    expect(isValidMapActionAt(100, 100)).toBe(true);
    expect(canInteractAt(100, 100, mapTap)).toBe(true);
    // The spotlight is a suggestion. A valid empty tile elsewhere must also
    // work, so small screen/canvas coordinate differences cannot deadlock spawn.
    expect(canInteractAt(500, 500, mapTap)).toBe(true);

    isLand = false;
    expect(isValidMapActionAt(100, 100)).toBe(false);
    expect(canInteractAt(100, 100, mapTap)).toBe(false);
    isLand = true;
    hasOwner = true;
    expect(isValidMapActionAt(100, 100)).toBe(false);
    overlay.stop();
  });

  test("map actions are limited to valid adjacent tutorial targets", () => {
    const { overlay } = createOverlay(2);
    const player = { smallID: () => 1 };
    const game = {
      myPlayer: () => player,
      isValidCoord: () => true,
      ref: () => 42,
      ownerID: () => 0,
      isShore: () => false,
    };
    overlay.game = game as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: () => ({ x: 0, y: 0 }),
    } as never;

    Reflect.set(overlay, "adjacentUnownedLandTiles", new Set([42]));
    const isValidMapActionAt = Reflect.get(overlay, "isValidMapActionAt").bind(
      overlay,
    ) as (x: number, y: number) => boolean;
    expect(isValidMapActionAt(100, 100)).toBe(true);

    Reflect.set(overlay, "adjacentUnownedLandTiles", new Set());
    expect(isValidMapActionAt(100, 100)).toBe(false);

    Reflect.set(overlay, "stepIndex", 3);
    Reflect.set(overlay, "adjacentEnemyTiles", new Set([42]));
    expect(isValidMapActionAt(100, 100)).toBe(true);
    Reflect.set(overlay, "adjacentEnemyTiles", new Set());
    expect(isValidMapActionAt(100, 100)).toBe(false);
    overlay.stop();
  });

  test("all 17 lessons advance from their intended successful action", () => {
    const { eventBus, overlay } = createOverlay(0);
    const player = {
      hasSpawned: () => true,
      clientID: () => 1,
      team: () => 1,
      id: () => 1,
      borderTiles: async () => ({ borderTiles: [] }),
    };
    overlay.game = {
      config: () => ({
        gameConfig: () => ({ gameType: GameType.Singleplayer }),
      }),
      myPlayer: () => player,
    } as unknown as GameView;
    const transformHandler = {
      scale: 4,
      screenToCanvasCoordinates: () => ({ x: 0, y: 0 }),
      screenToWorldCoordinatesFloat: () => ({ x: 0, y: 0 }),
      worldToScreenCoordinates: () => ({ x: 200, y: 200 }),
    };
    overlay.transformHandler = transformHandler as never;

    eventBus.emit(new ZoomEvent(200, 200, 0));
    expect(localStorage.getItem(STEP_KEY)).toBe("1");

    overlay.tick();
    expect(localStorage.getItem(STEP_KEY)).toBe("2");

    eventBus.emit(new SendAttackIntentEvent(2 as never, 100));
    Reflect.set(overlay, "expandActionAt", 0);
    Reflect.set(overlay, "adjacentEnemyTiles", new Set([42]));
    overlay.tick();
    expect(localStorage.getItem(STEP_KEY)).toBe("3");

    eventBus.emit(new SendAttackIntentEvent(2 as never, 100));
    expect(localStorage.getItem(STEP_KEY)).toBe("4");

    let replayPanelVisible = true;
    eventBus.on(ShowReplayPanelEvent, (event) => {
      replayPanelVisible = event.visible;
    });
    eventBus.emit(new ReplaySpeedChangeEvent(ReplaySpeedMultiplier.fast));
    expect(localStorage.getItem(STEP_KEY)).toBe("5");
    expect(replayPanelVisible).toBe(false);

    eventBus.emit(new PauseGameIntentEvent(true));
    expect(localStorage.getItem(STEP_KEY)).toBe("5");
    eventBus.emit(new PauseGameIntentEvent(false));
    expect(localStorage.getItem(STEP_KEY)).toBe("6");

    for (const [step, unit] of [
      [6, UnitType.City],
      [7, UnitType.Factory],
      [8, UnitType.DefensePost],
    ] as const) {
      eventBus.emit(new BuildUnitIntentEvent(unit, 42));
      expect(localStorage.getItem(STEP_KEY)).toBe(String(step + 1));
    }

    eventBus.emit(new SendAllianceRequestIntentEvent({} as never, {} as never));
    expect(localStorage.getItem(STEP_KEY)).toBe("10");

    for (const [step, unit] of [
      [10, UnitType.Port],
      [11, UnitType.Warship],
      [12, UnitType.MissileSilo],
    ] as const) {
      eventBus.emit(new BuildUnitIntentEvent(unit, 42));
      expect(localStorage.getItem(STEP_KEY)).toBe(String(step + 1));
    }

    eventBus.emit(new BuildUnitIntentEvent(UnitType.AtomBomb, 42));
    expect(localStorage.getItem(STEP_KEY)).toBe("14");
    eventBus.emit(new BuildUnitIntentEvent(UnitType.SAMLauncher, 42));
    expect(localStorage.getItem(STEP_KEY)).toBe("15");

    const leaderboard = document.createElement("button");
    leaderboard.dataset.tutorialTarget = "leaderboard";
    document.body.append(leaderboard);
    const leaderboardClick = {
      composedPath: () => [leaderboard],
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as MouseEvent;
    (Reflect.get(overlay, "guardClick") as (event: MouseEvent) => void)(
      leaderboardClick,
    );
    expect(localStorage.getItem(STEP_KEY)).toBe("16");
    leaderboard.remove();

    eventBus.emit(new SendWinnerEvent(["player", 1] as never, [] as never));
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
    expect(localStorage.getItem("openfront.tutorial.completed")).toBe("true");
    overlay.stop();
  });

  test("warship lesson requires building a Warship, not sending a transport boat", () => {
    const { eventBus, overlay } = createOverlay(11);

    eventBus.emit(new SendBoatAttackIntentEvent(1, 100));
    expect(localStorage.getItem(STEP_KEY)).toBe("11");

    eventBus.emit(new BuildUnitIntentEvent(UnitType.Warship, 1));
    expect(localStorage.getItem(STEP_KEY)).toBe("12");
    overlay.stop();
  });
});
