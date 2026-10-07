import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ShowReplayPanelEvent } from "../../../../src/client/hud/layers/ReplayPanel";
import { TutorialOverlay } from "../../../../src/client/hud/layers/TutorialOverlay";
import {
  ReplaySpeedChangeEvent,
  ZoomEvent,
} from "../../../../src/client/InputHandler";
import { GoToPositionEvent } from "../../../../src/client/TransformHandler";
import {
  BuildUnitIntentEvent,
  PauseGameIntentEvent,
  SendAllianceRequestIntentEvent,
  SendAttackIntentEvent,
  SendBoatAttackIntentEvent,
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

  test("zoom lesson has no tutorial auto-zoom action", async () => {
    const { overlay } = createOverlay(0);
    Reflect.set(overlay, "rect", new DOMRect(100, 100, 76, 76));
    document.body.append(overlay);
    await overlay.updateComplete;

    expect(overlay.shadowRoot?.querySelector(".zoom-assist")).toBeNull();
    expect(overlay.shadowRoot?.querySelectorAll("button")).toHaveLength(1);
    overlay.remove();
    overlay.stop();
  });

  test("spawn tap is passed through for normal game validation", () => {
    const { overlay } = createOverlay(1);
    const canvas = document.createElement("canvas");
    const event = { composedPath: () => [canvas] } as unknown as Event;
    const canInteractAt = Reflect.get(overlay, "canInteractAt").bind(
      overlay,
    ) as (x: number, y: number, event: Event) => boolean;

    expect(canInteractAt(100, 100, event)).toBe(true);
    overlay.stop();
  });

  test("spawn taps over the game canvas pass through even if the event path is retargeted", () => {
    const { overlay } = createOverlay(1);
    const canvas = document.createElement("canvas");
    Reflect.set(overlay, "findElement", () => canvas);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 500, 500),
    );
    const event = {
      composedPath: () => [document.createElement("div")],
    } as unknown as Event;
    const canInteractAt = Reflect.get(overlay, "canInteractAt").bind(
      overlay,
    ) as (x: number, y: number, event: Event) => boolean;

    expect(canInteractAt(250, 250, event)).toBe(true);
    expect(canInteractAt(550, 250, event)).toBe(false);
    overlay.stop();
  });

  test("mobile map taps inside an expand target pass through when retargeted", () => {
    const { overlay } = createOverlay(2);
    const canvas = document.createElement("canvas");
    Reflect.set(overlay, "rect", new DOMRect(100, 100, 76, 76));
    Reflect.set(overlay, "findElement", () => canvas);
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 500, 500),
    );
    const event = {
      pointerType: "touch",
      pointerId: 7,
      clientX: 120,
      clientY: 120,
      composedPath: () => [document.createElement("div")],
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as PointerEvent;

    Reflect.get(overlay, "guardPointerDown")(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(Reflect.get(overlay, "mapActionMenuAllowed")).toBe(true);
    overlay.stop();
  });

  test("expand target taps are accepted by the visible circle, but controls are not", () => {
    const { overlay } = createOverlay(2);
    Reflect.set(overlay, "rect", new DOMRect(100, 100, 76, 76));
    const canInteractAt = Reflect.get(overlay, "canInteractAt").bind(
      overlay,
    ) as (x: number, y: number, event: Event) => boolean;
    const mapEvent = {
      composedPath: () => [document.createElement("div")],
    } as unknown as Event;
    const button = document.createElement("button");
    const controlEvent = {
      composedPath: () => [button],
    } as unknown as Event;

    expect(canInteractAt(138, 138, mapEvent)).toBe(true);
    expect(canInteractAt(250, 250, mapEvent)).toBe(false);
    expect(canInteractAt(138, 138, controlEvent)).toBe(false);
    overlay.stop();
  });

  test("speed hint moves below replay controls instead of covering them", () => {
    const { overlay } = createOverlay(4);
    Reflect.set(overlay, "rect", new DOMRect(850, 80, 60, 50));
    const hintTop = Reflect.get(overlay, "hintTop").bind(
      overlay,
    ) as () => string;

    expect(hintTop()).toBe(`${window.innerHeight - 264}px`);
    overlay.stop();
  });

  test("Port lesson targets an owned ocean coast tile, not an inland lake shore", () => {
    const { overlay } = createOverlay(10);
    const centerX = window.innerWidth * 0.5;
    overlay.game = {
      myPlayer: () => ({ smallID: () => 1 }),
      hasOwner: () => true,
      ownerID: () => 1,
      isOceanShore: (tile: number) => tile === 2,
      isShore: () => true,
      isImpassable: () => false,
      x: (tile: number) => (tile === 2 ? centerX + 80 : centerX - 80),
      y: () => 300,
    } as unknown as GameView;
    overlay.transformHandler = {
      worldToScreenCoordinates: (cell: { x: number; y: number }) => cell,
    } as never;
    Reflect.set(overlay, "hasCoastalTerritory", () => true);
    Reflect.set(overlay, "enemyBorderTiles", new Set([1, 2]));

    const target = Reflect.get(overlay, "findMapTarget").call(overlay);

    expect(target).not.toBeNull();
    expect(target.left + target.width / 2).toBeGreaterThan(centerX);
    expect(Reflect.get(overlay, "portTargetTile")).toBe(2);
    overlay.stop();
  });

  test("Port lesson skips ocean coast tiles where a Port cannot be built", async () => {
    const { overlay } = createOverlay(10);
    const player = {
      smallID: () => 1,
      buildables: vi
        .fn()
        .mockResolvedValueOnce([{ type: UnitType.Port, canBuild: false }])
        .mockResolvedValueOnce([{ type: UnitType.Port, canBuild: 42 }]),
    };
    overlay.game = {
      myPlayer: () => player,
      hasOwner: () => true,
      ownerID: () => 1,
      isOceanShore: () => true,
      isImpassable: () => false,
      x: (tile: number) => tile * 100,
      y: () => 300,
    } as unknown as GameView;
    overlay.transformHandler = {
      worldToScreenCoordinates: () => ({ x: 300, y: 300 }),
    } as never;
    Reflect.set(overlay, "hasCoastalTerritory", () => true);
    Reflect.set(overlay, "enemyBorderTiles", new Set([1, 2]));
    Reflect.set(overlay, "refreshTarget", vi.fn());

    const refreshPortTarget = Reflect.get(overlay, "refreshPortTarget").bind(
      overlay,
    ) as (player: unknown) => void;
    refreshPortTarget(player);
    await Reflect.get(overlay, "portTargetRequest");

    expect(Reflect.get(overlay, "invalidPortTargets").has(1)).toBe(true);
    expect(Reflect.get(overlay, "portTargetTile")).toBeNull();

    refreshPortTarget(player);
    await Reflect.get(overlay, "portTargetRequest");

    expect(Reflect.get(overlay, "portTargetTile")).toBe(2);
    expect(player.buildables).toHaveBeenCalledTimes(2);
    expect(player.buildables).toHaveBeenNthCalledWith(1, 1, [UnitType.Port]);
    expect(player.buildables).toHaveBeenNthCalledWith(2, 2, [UnitType.Port]);
    overlay.stop();
  });

  test("attack lesson targets only a currently owned neighboring enemy tile", () => {
    const { overlay } = createOverlay(3);
    const player = { smallID: () => 1 };
    overlay.game = {
      myPlayer: () => player,
      isLand: () => true,
      isImpassable: () => false,
      hasOwner: () => true,
      ownerID: (tile: number) => (tile === 20 || tile === 30 ? 2 : 1),
      neighbors: (tile: number) => (tile === 20 ? [10] : []),
      x: () => 300,
      y: () => 400,
    } as unknown as GameView;
    overlay.transformHandler = {
      worldToScreenCoordinates: () => ({ x: 300, y: 400 }),
    } as never;
    Reflect.set(overlay, "adjacentEnemyTiles", new Set([10, 20, 30]));

    const target = Reflect.get(overlay, "findNeighborEnemyTarget").call(
      overlay,
      player,
    ) as DOMRect | null;

    expect(target).toEqual(new DOMRect(262, 362, 76, 76));
    overlay.stop();
  });

  test("attack lesson pans to a real off-screen neighbor instead of highlighting map center", () => {
    const { eventBus, overlay } = createOverlay(3);
    const player = { smallID: () => 1 };
    const emit = vi.spyOn(eventBus, "emit");
    overlay.game = {
      myPlayer: () => player,
      isLand: () => true,
      isImpassable: () => false,
      hasOwner: () => true,
      ownerID: (tile: number) => (tile === 20 ? 2 : 1),
      neighbors: (tile: number) => (tile === 20 ? [10] : []),
      x: (tile: number) => tile,
      y: (tile: number) => tile,
    } as unknown as GameView;
    overlay.transformHandler = {
      worldToScreenCoordinates: (cell: { x: number; y: number }) => cell,
    } as never;
    Reflect.set(overlay, "adjacentEnemyTiles", new Set([20]));

    const target = Reflect.get(overlay, "findTarget").call(overlay);

    expect(target).toBeNull();
    expect(emit).toHaveBeenCalledWith(new GoToPositionEvent(20.5, 20.5));
    overlay.stop();
  });

  test("attack lesson does not fall back to a spotlight over the player's own country", () => {
    const { overlay } = createOverlay(3);
    const player = { smallID: () => 1 };
    overlay.game = {
      myPlayer: () => player,
      isLand: () => true,
      isImpassable: () => false,
      hasOwner: () => true,
      ownerID: () => 1,
      neighbors: () => [],
    } as unknown as GameView;
    overlay.transformHandler = {
      worldToScreenCoordinates: () => ({ x: 300, y: 400 }),
    } as never;
    Reflect.set(overlay, "adjacentEnemyTiles", new Set([10]));

    expect(Reflect.get(overlay, "findTarget").call(overlay)).toBeNull();
    overlay.stop();
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

    const canInteractAt = Reflect.get(overlay, "canInteractAt").bind(
      overlay,
    ) as (x: number, y: number, event: Event) => boolean;
    const findMapTarget = Reflect.get(overlay, "findMapTarget").bind(
      overlay,
    ) as () => DOMRect | null;
    const canvas = document.createElement("canvas");
    const mapTap = { composedPath: () => [canvas] } as unknown as Event;
    expect(findMapTarget()).not.toBeNull();
    expect(canInteractAt(100, 100, mapTap)).toBe(true);
    // The spotlight is a suggestion. A valid empty tile elsewhere must also
    // work, so small screen/canvas coordinate differences cannot deadlock spawn.
    expect(canInteractAt(500, 500, mapTap)).toBe(true);

    isLand = false;
    expect(findMapTarget()).toBeNull();
    expect(canInteractAt(100, 100, mapTap)).toBe(true);
    isLand = true;
    hasOwner = true;
    expect(findMapTarget()).toBeNull();
    overlay.stop();
  });

  test("spawn step keeps its highlight but removes the auto-pick button", async () => {
    const { overlay } = createOverlay(1);
    Reflect.set(overlay, "rect", new DOMRect(100, 100, 76, 76));
    document.body.append(overlay);
    await overlay.updateComplete;

    expect(overlay.shadowRoot?.querySelector(".spotlight")).not.toBeNull();
    expect(overlay.shadowRoot?.querySelector(".zoom-assist")).toBeNull();
    overlay.remove();
    overlay.stop();
  });

  test("expand step has no assist button because the radial Attack action is required", async () => {
    const { overlay } = createOverlay(2);
    Reflect.set(overlay, "rect", new DOMRect(100, 100, 76, 76));
    document.body.append(overlay);
    await overlay.updateComplete;

    expect(overlay.shadowRoot?.querySelector(".zoom-assist")).toBeNull();
    overlay.remove();
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

    eventBus.emit(new SendAttackIntentEvent(null, 100));
    Reflect.set(overlay, "expandActionAt", 0);
    overlay.tick();
    expect(localStorage.getItem(STEP_KEY)).toBe("2");

    Reflect.set(overlay, "adjacentEnemyTiles", new Set([99]));
    Reflect.set(overlay, "nextNeighborScanAt", 0);
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
