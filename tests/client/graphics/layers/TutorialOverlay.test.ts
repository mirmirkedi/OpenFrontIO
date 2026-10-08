import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CloseLeaderboardEvent } from "../../../../src/client/hud/layers/GameLeftSidebar";
import { ShowReplayPanelEvent } from "../../../../src/client/hud/layers/ReplayPanel";
import { TutorialOverlay } from "../../../../src/client/hud/layers/TutorialOverlay";
import {
  ContextMenuEvent,
  MouseUpEvent,
  TouchEvent,
  ZoomEvent,
} from "../../../../src/client/InputHandler";
import {
  GoToPlayerEvent,
  GoToPositionEvent,
} from "../../../../src/client/TransformHandler";
import {
  BuildUnitIntentEvent,
  PauseGameIntentEvent,
  SendAllianceRequestIntentEvent,
  SendAttackIntentEvent,
  SendBoatAttackIntentEvent,
  SendWinnerEvent,
} from "../../../../src/client/Transport";
import { TUTORIAL_LAUNCH_PENDING_KEY } from "../../../../src/client/TutorialProgress";
import type { GameView } from "../../../../src/client/view";
import { EventBus } from "../../../../src/core/EventBus";
import { GameType, UnitType } from "../../../../src/core/game/Game";

const ACTIVE_KEY = "openfront.tutorial.active";
const COMPLETED_KEY = "openfront.tutorial.completed";
const STEP_KEY = "openfront.tutorial.step";
const SPEED_STEP_REMOVED_KEY = "openfront.tutorial.speed-step-removed";
const STEP_INDEX_VERSION_KEY = "openfront.tutorial.step-index-version";

function createOverlay(step: number) {
  localStorage.setItem(ACTIVE_KEY, "true");
  localStorage.setItem(STEP_KEY, String(step));
  localStorage.setItem(SPEED_STEP_REMOVED_KEY, "true");
  localStorage.setItem(STEP_INDEX_VERSION_KEY, "3");
  sessionStorage.setItem(TUTORIAL_LAUNCH_PENDING_KEY, "true");

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
    localStorage.removeItem(SPEED_STEP_REMOVED_KEY);
    localStorage.removeItem(STEP_INDEX_VERSION_KEY);
    localStorage.removeItem(COMPLETED_KEY);
    localStorage.removeItem("openfront.tutorial.skipped");
    sessionStorage.removeItem(TUTORIAL_LAUNCH_PENDING_KEY);
  });

  afterEach(() => {
    document
      .querySelectorAll("tutorial-overlay")
      .forEach((element) => element.remove());
  });

  test("pause and resume actions do not advance tutorial lessons", () => {
    const { eventBus, overlay } = createOverlay(4);

    eventBus.emit(new PauseGameIntentEvent(true));
    eventBus.emit(new PauseGameIntentEvent(false));
    expect(localStorage.getItem(STEP_KEY)).toBe("4");
    overlay.stop();
  });

  test("finishes the final tutorial step when only the player remains alive", () => {
    const { eventBus, overlay } = createOverlay(13);
    const player = { id: () => "player", isAlive: () => true };
    let rivalAlive = true;
    const rival = { id: () => "rival", isAlive: () => rivalAlive };
    const closeLeaderboard = vi.fn();
    eventBus.on(CloseLeaderboardEvent, closeLeaderboard);
    overlay.game = {
      myPlayer: () => player,
      players: () => [player, rival],
    } as unknown as GameView;

    overlay.tick();
    expect(localStorage.getItem(ACTIVE_KEY)).toBe("true");

    rivalAlive = false;
    overlay.tick();

    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
    expect(localStorage.getItem(COMPLETED_KEY)).toBe("true");
    expect(closeLeaderboard).toHaveBeenCalledTimes(1);
    overlay.stop();
  });

  test("shifts the camera for Warship and restores it on the next step", () => {
    const { eventBus, overlay } = createOverlay(8);
    const goToPosition = vi.fn();
    eventBus.on(GoToPositionEvent, goToPosition);
    overlay.transformHandler = {
      width: () => 1000,
      scale: 2,
      screenToWorldCoordinatesFloat: () => ({ x: 500, y: 300 }),
    } as never;
    overlay.game = { myPlayer: () => ({}) } as unknown as GameView;

    eventBus.emit(new BuildUnitIntentEvent(UnitType.Port, 42));
    expect(goToPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 470, y: 300 }),
    );

    eventBus.emit(new BuildUnitIntentEvent(UnitType.Warship, 42));
    expect(goToPosition).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 500, y: 300 }),
    );
    overlay.stop();
  });

  test("closes any replay-speed panel when a tutorial starts", () => {
    localStorage.setItem(ACTIVE_KEY, "true");
    localStorage.setItem(STEP_KEY, "0");
    localStorage.setItem(STEP_INDEX_VERSION_KEY, "3");
    const eventBus = new EventBus();
    const visibleStates: boolean[] = [];
    eventBus.on(ShowReplayPanelEvent, (event) => {
      visibleStates.push(event.visible);
    });
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

    expect(visibleStates).toEqual([false]);
    overlay.stop();
  });

  test("renders step one immediately when tutorial starts after first render", async () => {
    localStorage.setItem(ACTIVE_KEY, "true");
    localStorage.setItem(STEP_KEY, "0");
    localStorage.setItem(STEP_INDEX_VERSION_KEY, "3");
    const overlay = new TutorialOverlay();
    overlay.game = {
      config: () => ({
        gameConfig: () => ({ gameType: GameType.Singleplayer }),
      }),
      myPlayer: () => null,
    } as unknown as GameView;
    overlay.eventBus = new EventBus();
    overlay.uiState = { attackRatio: 0.15 } as never;
    overlay.transformHandler = {} as never;
    document.body.append(overlay);
    await overlay.updateComplete;

    expect(overlay.shadowRoot?.querySelector(".hint")).toBeNull();
    overlay.init();
    await overlay.updateComplete;
    const hint = overlay.shadowRoot?.querySelector(".hint");
    overlay.remove();
    overlay.stop();
    expect(hint).not.toBeNull();
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

  test("tutorial allows the Player Panel close button through its input guard", () => {
    const { overlay } = createOverlay(10);
    const panel = document.createElement("player-panel");
    const close = document.createElement("button");
    close.setAttribute("aria-label", "Close");
    panel.append(close);
    document.body.append(panel);
    const click = {
      composedPath: () => [close, panel],
    } as unknown as MouseEvent;

    expect(
      Reflect.get(overlay, "canInteractAt").call(overlay, 0, 0, click),
    ).toBe(true);

    panel.remove();
    overlay.stop();
  });

  test("shows the Missile Silo icon in its tutorial hint", async () => {
    const { overlay } = createOverlay(10);
    document.body.append(overlay);
    await overlay.updateComplete;

    const icon = overlay.shadowRoot?.querySelector<HTMLImageElement>(
      ".step-title-row .step-icon",
    );
    expect(icon?.getAttribute("src")).toContain("MissileSiloIconWhite.svg");
    expect(icon?.getAttribute("width")).toBe("32");
    expect(icon?.getAttribute("height")).toBe("32");
    expect(icon?.getAttribute("alt")).toBe("");
    overlay.remove();
    overlay.stop();
  });

  test("renders icons on every tutorial action card with a matching asset", async () => {
    for (const step of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      const { overlay } = createOverlay(step);
      document.body.append(overlay);
      await overlay.updateComplete;

      const icon = overlay.shadowRoot?.querySelector<HTMLImageElement>(
        ".step-title-row .step-icon",
      );
      expect(
        icon,
        `step ${step + 1} should render its action icon`,
      ).not.toBeNull();
      expect(icon?.getAttribute("src")).toContain("/images/");
      expect(icon?.getAttribute("width")).toBe("32");
      overlay.remove();
      overlay.stop();
    }
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
    Reflect.set(overlay, "rect", new DOMRect(100, 100, 76, 76));
    const event = { composedPath: () => [canvas] } as unknown as Event;
    overlay.game = {
      isValidCoord: () => true,
      ref: () => 42,
    } as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: () => ({ x: 0, y: 0 }),
    } as never;
    Reflect.set(overlay, "spawnTargetTile", 42);
    const canInteractAt = Reflect.get(overlay, "canInteractAt").bind(
      overlay,
    ) as (x: number, y: number, event: Event) => boolean;

    expect(canInteractAt(138, 138, event)).toBe(true);
    expect(canInteractAt(275, 275, event)).toBe(false);
    overlay.stop();
  });

  test("spawn tap anywhere in the highlight is routed to its selected tile", () => {
    const { overlay } = createOverlay(1);
    const canvas = document.createElement("canvas");
    overlay.game = {
      isValidCoord: () => true,
      ref: () => 43,
    } as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: () => ({ x: 0, y: 0 }),
    } as never;
    Reflect.set(overlay, "spawnTargetTile", 42);
    Reflect.set(overlay, "rect", new DOMRect(100, 100, 76, 76));
    const event = { composedPath: () => [canvas] } as unknown as Event;
    const canInteractAt = Reflect.get(overlay, "canInteractAt").bind(
      overlay,
    ) as (x: number, y: number, event: Event) => boolean;

    expect(canInteractAt(138, 138, event)).toBe(true);
    overlay.stop();
  });

  test.each(["mouse", "touch"])(
    "step 2 routes a %s tap to the highlighted spawn tile through MouseUpEvent",
    (pointerType) => {
      const { overlay, eventBus } = createOverlay(1);
      const canvas = document.createElement("canvas");
      const selections: MouseUpEvent[] = [];
      eventBus.on(MouseUpEvent, (event) => selections.push(event));
      overlay.game = {
        isValidCoord: () => true,
        ref: (x: number) => (x < 10 ? 42 : 43),
      } as unknown as GameView;
      overlay.transformHandler = {
        screenToWorldCoordinates: (x: number) => ({
          x: x < 138 ? 0 : 10,
          y: 0,
        }),
      } as never;
      Reflect.set(overlay, "spawnTargetTile", 42);
      Reflect.set(overlay, "rect", new DOMRect(100, 100, 76, 76));

      const down = {
        pointerType,
        pointerId: 7,
        button: 0,
        clientX: 158,
        clientY: 138,
        composedPath: () => [canvas],
        preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      } as unknown as PointerEvent;
      Reflect.get(overlay, "guardPointerDown")(down);
      const up = { ...down, type: "pointerup" } as PointerEvent;
      Reflect.get(overlay, "guardPointerEnd")(up);

      expect(down.stopImmediatePropagation).toHaveBeenCalled();
      expect(selections).toHaveLength(1);
      expect(selections[0]).toMatchObject({ x: 138, y: 138 });
      overlay.stop();
    },
  );

  test("spawn pointer guard leaves Skip Tutorial clickable", () => {
    const { overlay } = createOverlay(1);
    const skip = document.createElement("button");
    skip.className = "skip";
    const event = {
      pointerId: 8,
      clientX: 10,
      clientY: 10,
      composedPath: () => [skip],
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as PointerEvent;

    Reflect.get(overlay, "guardPointerDown")(event);
    Reflect.get(overlay, "guardPointerEnd")(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
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
    overlay.game = {
      isValidCoord: () => true,
      ref: () => 42,
    } as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: () => ({ x: 0, y: 0 }),
    } as never;
    Reflect.set(overlay, "spawnTargetTile", 42);
    const canInteractAt = Reflect.get(overlay, "canInteractAt").bind(
      overlay,
    ) as (x: number, y: number, event: Event) => boolean;

    Reflect.set(overlay, "rect", new DOMRect(200, 200, 76, 76));
    expect(canInteractAt(238, 238, event)).toBe(true);
    expect(canInteractAt(275, 275, event)).toBe(false);
    expect(canInteractAt(550, 250, event)).toBe(false);
    overlay.stop();
  });

  test("dragging from a highlighted target cannot pan the map", () => {
    const { overlay } = createOverlay(2);
    Reflect.set(overlay, "rect", new DOMRect(100, 100, 76, 76));
    const canvas = document.createElement("canvas");
    const down = {
      pointerType: "touch",
      pointerId: 19,
      clientX: 138,
      clientY: 138,
      composedPath: () => [canvas],
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as PointerEvent;
    Reflect.get(overlay, "guardPointerDown")(down);

    const move = {
      pointerType: "touch",
      pointerId: 19,
      clientX: 180,
      clientY: 180,
      composedPath: () => [canvas],
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as PointerEvent;
    Reflect.get(overlay, "guardPointerMove")(move);

    expect(move.preventDefault).toHaveBeenCalled();
    expect(move.stopImmediatePropagation).toHaveBeenCalled();
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

  test("map-target taps use the game's menu event at the exact selected tile", () => {
    const { overlay, eventBus } = createOverlay(2);
    const selections: ContextMenuEvent[] = [];
    eventBus.on(ContextMenuEvent, (event) => selections.push(event));
    overlay.game = {
      x: () => 55,
      y: () => 66,
    } as unknown as GameView;
    overlay.transformHandler = {
      worldToScreenCoordinates: () => ({ x: 455, y: 566 }),
    } as never;
    Reflect.set(overlay, "mapTargetTile", 42);
    Reflect.set(overlay, "rect", new DOMRect(100, 100, 48, 48));
    const canvas = document.createElement("canvas");
    const down = {
      pointerType: "mouse",
      pointerId: 23,
      button: 0,
      clientX: 124,
      clientY: 124,
      composedPath: () => [canvas],
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as PointerEvent;
    Reflect.get(overlay, "guardPointerDown")(down);
    const up = {
      ...down,
      type: "pointerup",
      clientX: 125,
      clientY: 125,
    } as PointerEvent;
    Reflect.get(overlay, "guardPointerEnd")(up);

    expect(down.preventDefault).toHaveBeenCalled();
    expect(down.stopImmediatePropagation).toHaveBeenCalled();
    expect(selections).toHaveLength(1);
    expect(selections[0]).toMatchObject({ x: 455, y: 566 });
    overlay.stop();
  });

  test("touching a map target uses the game's touch path at its selected tile", () => {
    const { overlay, eventBus } = createOverlay(2);
    const selections: TouchEvent[] = [];
    eventBus.on(TouchEvent, (event) => selections.push(event));
    overlay.game = { x: () => 55, y: () => 66 } as unknown as GameView;
    overlay.transformHandler = {
      worldToScreenCoordinates: () => ({ x: 455, y: 566 }),
    } as never;
    Reflect.set(overlay, "mapTargetTile", 42);
    Reflect.set(overlay, "rect", new DOMRect(100, 100, 48, 48));
    const canvas = document.createElement("canvas");
    const down = {
      pointerType: "touch",
      pointerId: 24,
      button: 0,
      clientX: 124,
      clientY: 124,
      composedPath: () => [canvas],
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as PointerEvent;
    Reflect.get(overlay, "guardPointerDown")(down);
    Reflect.get(
      overlay,
      "guardPointerEnd",
    )({
      ...down,
      type: "pointerup",
      clientX: 125,
      clientY: 125,
    } as PointerEvent);

    expect(selections).toHaveLength(1);
    expect(selections[0]).toMatchObject({ x: 455, y: 566 });
    overlay.stop();
  });

  test("expand target is entirely neutral land and clears the player's unit", () => {
    const { overlay } = createOverlay(2);
    const player = { smallID: () => 1, units: () => [] };
    const width = 1000;
    const ref = (x: number, y: number) => Math.floor(y) * width + Math.floor(x);
    const xOf = (tile: number) => tile % width;
    const yOf = (tile: number) => Math.floor(tile / width);
    const occupied = ref(235, 394);
    overlay.game = {
      myPlayer: () => player,
      isValidCoord: () => true,
      ref,
      x: xOf,
      y: yOf,
      isLand: () => true,
      isImpassable: () => false,
      hasFallout: () => false,
      hasOwner: (tile: number) => tile === occupied,
      ownerID: () => 1,
      unitsOwnedBy: () => [{ tile: () => occupied, isActive: () => true }],
    } as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: (x: number, y: number) => ({ x, y }),
      worldToScreenCoordinates: (cell: { x: number; y: number }) => cell,
    } as never;

    const target = Reflect.get(overlay, "findMapTarget").call(
      overlay,
    ) as DOMRect;
    const centerX = target.left + target.width / 2;
    const centerY = target.top + target.height / 2;
    const occupiedPoint = { x: xOf(occupied) + 0.5, y: yOf(occupied) + 0.5 };

    expect(target).not.toBeNull();
    expect(
      Reflect.get(overlay, "spotlightMatchesRegion").call(
        overlay,
        centerX,
        centerY,
        (tile: number) => !overlay.game.hasOwner(tile),
      ),
    ).toBe(true);
    expect(
      Math.hypot(centerX - occupiedPoint.x, centerY - occupiedPoint.y),
    ).toBeGreaterThan(48);
    overlay.stop();
  });

  test.each([
    [5, UnitType.Factory],
    [6, UnitType.DefensePost],
    [10, UnitType.MissileSilo],
    [12, UnitType.SAMLauncher],
  ] as const)("build step %i targets empty owned land", (step, unitType) => {
    const { overlay } = createOverlay(step);
    const player = { smallID: () => 1, units: () => [] };
    const width = 1000;
    const ref = (x: number, y: number) => Math.floor(y) * width + Math.floor(x);
    const xOf = (tile: number) => tile % width;
    const yOf = (tile: number) => Math.floor(tile / width);
    const structure = ref(235, 394);
    overlay.game = {
      myPlayer: () => player,
      isValidCoord: () => true,
      ref,
      x: xOf,
      y: yOf,
      isLand: () => true,
      isImpassable: () => false,
      hasOwner: () => true,
      ownerID: () => 1,
      unitsOwnedBy: () => [{ tile: () => structure, isActive: () => true }],
      units: () => [{ tile: () => structure, isActive: () => true }],
      config: () => ({ structureMinDist: () => 15 }),
    } as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: (x: number, y: number) => ({ x, y }),
      worldToScreenCoordinates: (cell: { x: number; y: number }) => cell,
    } as never;

    const target = Reflect.get(overlay, "findMapTarget").call(
      overlay,
    ) as DOMRect;
    const centerX = target.left + target.width / 2;
    const centerY = target.top + target.height / 2;
    const structurePoint = { x: xOf(structure) + 0.5, y: yOf(structure) + 0.5 };

    expect(target).not.toBeNull();
    expect(Reflect.get(overlay, "current").unit).toBe(unitType);
    expect(
      Reflect.get(overlay, "spotlightMatchesRegion").call(
        overlay,
        centerX,
        centerY,
        (tile: number) => overlay.game.ownerID(tile) === player.smallID(),
      ),
    ).toBe(true);
    expect(
      Math.hypot(centerX - structurePoint.x, centerY - structurePoint.y),
    ).toBeGreaterThan(30);
    overlay.stop();
  });

  test("build target favors the country's open interior over a nearby city and border", () => {
    const { overlay } = createOverlay(5);
    const player = { smallID: () => 1, units: () => [] };
    const width = 1000;
    const borderX = 560;
    const centerY = Math.round(window.innerHeight * 0.46);
    const ref = (x: number, y: number) => Math.floor(y) * width + Math.floor(x);
    const xOf = (tile: number) => tile % width;
    const yOf = (tile: number) => Math.floor(tile / width);
    const city = ref(350, centerY);
    overlay.game = {
      myPlayer: () => player,
      isValidCoord: () => true,
      ref,
      x: xOf,
      y: yOf,
      isLand: () => true,
      isImpassable: () => false,
      hasOwner: (tile: number) => xOf(tile) < borderX,
      ownerID: () => 1,
      unitsOwnedBy: () => [{ tile: () => city, isActive: () => true }],
      units: () => [{ tile: () => city, isActive: () => true }],
      config: () => ({ structureMinDist: () => 15 }),
    } as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: (x: number, y: number) => ({ x, y }),
      worldToScreenCoordinates: (cell: { x: number; y: number }) => cell,
    } as never;

    const target = Reflect.get(overlay, "findMapTarget").call(
      overlay,
    ) as DOMRect;
    const centerX = target.left + target.width / 2;
    const targetY = target.top + target.height / 2;

    expect(centerX).toBeLessThan(borderX - 70);
    expect(
      Math.hypot(centerX - (xOf(city) + 0.5), targetY - (yOf(city) + 0.5)),
    ).toBeGreaterThan(80);
    expect(
      Reflect.get(overlay, "spotlightMatchesRegion").call(
        overlay,
        centerX,
        targetY,
        (tile: number) =>
          overlay.game.hasOwner(tile) && overlay.game.ownerID(tile) === 1,
        80,
      ),
    ).toBe(true);
    overlay.stop();
  });

  test("factory target remains findable in a narrow mobile viewport", () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const { overlay } = createOverlay(5);
    const player = { smallID: () => 1, units: () => [] };
    const width = 1000;
    const borderX = 145;
    const centerY = Math.round(window.innerHeight * 0.46);
    const ref = (x: number, y: number) => Math.floor(y) * width + Math.floor(x);
    const xOf = (tile: number) => tile % width;
    const yOf = (tile: number) => Math.floor(tile / width);
    const city = ref(100, centerY);
    overlay.game = {
      myPlayer: () => player,
      isValidCoord: () => true,
      ref,
      x: xOf,
      y: yOf,
      isLand: () => true,
      isImpassable: () => false,
      hasOwner: (tile: number) => xOf(tile) < borderX,
      ownerID: () => 1,
      unitsOwnedBy: () => [{ tile: () => city, isActive: () => true }],
      units: () => [{ tile: () => city, isActive: () => true }],
      config: () => ({ structureMinDist: () => 15 }),
    } as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: (x: number, y: number) => ({ x, y }),
      worldToScreenCoordinates: (cell: { x: number; y: number }) => cell,
    } as never;

    try {
      const target = Reflect.get(overlay, "findMapTarget").call(
        overlay,
      ) as DOMRect;
      const centerX = target.left + target.width / 2;
      const targetY = target.top + target.height / 2;

      expect(target).not.toBeNull();
      expect(centerX).toBeLessThan(borderX);
      expect(
        Math.hypot(centerX - (xOf(city) + 0.5), targetY - (yOf(city) + 0.5)),
      ).toBeGreaterThan(15);
    } finally {
      overlay.stop();
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalWidth,
      });
    }
  });

  test("attack step smoothly zooms out by 30 percent instead of fitting the whole map", () => {
    const { overlay, eventBus } = createOverlay(2);
    const player = { smallID: () => 1 };
    const emit = vi.spyOn(eventBus, "emit");
    overlay.game = {
      myPlayer: () => player,
      width: () => 2000,
    } as unknown as GameView;
    overlay.transformHandler = { width: () => 400, scale: 4 } as never;

    Reflect.get(overlay, "zoomOutForAttackStep").call(overlay);

    expect(Reflect.get(overlay, "lockedZoomScale")).toBeCloseTo(2.8);
    expect(emit).toHaveBeenCalledWith(
      new GoToPlayerEvent(player as never, 2.8),
    );
    overlay.stop();
  });

  test("attack step does not zoom below the actual map-fit minimum", () => {
    const { overlay, eventBus } = createOverlay(2);
    const player = { smallID: () => 1 };
    const emit = vi.spyOn(eventBus, "emit");
    overlay.game = {
      myPlayer: () => player,
      width: () => 2000,
    } as unknown as GameView;
    overlay.transformHandler = { width: () => 400, scale: 0.25 } as never;

    Reflect.get(overlay, "zoomOutForAttackStep").call(overlay);

    expect(Reflect.get(overlay, "lockedZoomScale")).toBe(0.2);
    expect(emit).toHaveBeenCalledWith(
      new GoToPlayerEvent(player as never, 0.2),
    );
    overlay.stop();
  });

  test("Warship spotlight and clicked tile use connected ocean by the Port", () => {
    const { overlay } = createOverlay(9);
    const width = 1000;
    const ref = (x: number, y: number) => Math.floor(y) * width + Math.floor(x);
    const xOf = (tile: number) => tile % width;
    const yOf = (tile: number) => Math.floor(tile / width);
    const portTile = ref(200, 450);
    const narrowSea = ref(225, 450);
    const openSea = ref(300, 450);
    const port = { tile: () => portTile, isActive: () => true };
    const player = {
      smallID: () => 1,
      units: (type: UnitType) => (type === UnitType.Port ? [port] : []),
    };
    overlay.game = {
      myPlayer: () => player,
      isValidCoord: () => true,
      ref,
      x: xOf,
      y: yOf,
      isOcean: (tile: number) => xOf(tile) >= 276,
      hasOwner: () => false,
      ownerID: () => 0,
      neighbors: (tile: number) =>
        tile === portTile ? [narrowSea, openSea] : [],
    } as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: (x: number, y: number) => ({ x, y }),
      worldToScreenCoordinates: (cell: { x: number; y: number }) => cell,
    } as never;

    const target = Reflect.get(overlay, "findMapTarget").call(
      overlay,
    ) as DOMRect;
    const centerX = target.left + target.width / 2;
    const centerY = target.top + target.height / 2;

    expect(target).not.toBeNull();
    expect(Reflect.get(overlay, "mapTargetTile")).toBe(openSea);
    expect(Reflect.get(overlay, "mapFocusTile")).toBe(openSea);
    expect(
      Reflect.get(overlay, "spotlightMatchesRegion").call(
        overlay,
        centerX,
        centerY,
        (tile: number) => overlay.game.isOcean(tile),
      ),
    ).toBe(true);
    expect(Reflect.get(overlay, "findMapTarget").call(overlay)).not.toBeNull();
    overlay.stop();
  });

  test("Warship lesson keeps a visible spotlight on a narrow sea edge", () => {
    const { overlay } = createOverlay(9);
    const portTile = 200;
    const narrowSea = 225;
    const port = { tile: () => portTile, isActive: () => true };
    const player = {
      smallID: () => 1,
      units: (type: UnitType) => (type === UnitType.Port ? [port] : []),
    };
    overlay.game = {
      myPlayer: () => player,
      isValidCoord: () => true,
      ref: (x: number) => Math.floor(x),
      x: (tile: number) => tile,
      y: () => 450,
      isOcean: (tile: number) => tile >= 220,
      neighbors: (tile: number) => (tile === portTile ? [narrowSea] : []),
    } as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: (x: number, y: number) => ({ x, y }),
      worldToScreenCoordinates: (cell: { x: number; y: number }) => cell,
    } as never;

    const target = Reflect.get(overlay, "findMapTarget").call(
      overlay,
    ) as DOMRect;
    expect(target).not.toBeNull();
    expect(Reflect.get(overlay, "mapTargetTile")).toBe(narrowSea);
    overlay.stop();
  });

  test("Port lesson targets an owned ocean coast tile, not an inland lake shore", () => {
    const { overlay } = createOverlay(8);
    const centerX = window.innerWidth * 0.5;
    overlay.game = {
      myPlayer: () => ({ smallID: () => 1 }),
      hasOwner: () => true,
      ownerID: () => 1,
      isOceanShore: (tile: number) => tile === 2,
      isShore: () => true,
      isLand: () => true,
      isFallout: () => false,
      isImpassable: () => false,
      unitsOwnedBy: () => [],
      neighbors: () => [],
      isValidCoord: () => true,
      ref: () => 1,
      x: (tile: number) => (tile === 2 ? centerX + 80 : centerX - 80),
      y: () => 300,
    } as unknown as GameView;
    overlay.transformHandler = {
      worldToScreenCoordinates: (cell: { x: number; y: number }) => cell,
      screenToWorldCoordinates: () => ({ x: 1, y: 1 }),
    } as never;
    Reflect.set(overlay, "hasCoastalTerritory", () => true);
    Reflect.set(overlay, "enemyBorderTiles", new Set([1, 2]));

    const target = Reflect.get(overlay, "findMapTarget").call(overlay);

    expect(target).not.toBeNull();
    expect(target.left + target.width / 2).toBeGreaterThan(centerX);
    expect(Reflect.get(overlay, "portTargetTile")).toBe(2);
    overlay.stop();
  });

  test("Port spotlight moves inland until the whole ring fits on owned land", () => {
    const { overlay } = createOverlay(8);
    const centerY = window.innerHeight * 0.46;
    overlay.game = {
      myPlayer: () => ({ smallID: () => 1, units: () => [] }),
      hasOwner: () => true,
      ownerID: () => 1,
      isOceanShore: (tile: number) => tile === 2,
      isLand: () => true,
      hasFallout: () => false,
      isImpassable: () => false,
      unitsOwnedBy: () => [],
      neighbors: (tile: number) =>
        tile === 2 ? [3] : tile === 3 ? [2, 4] : tile === 4 ? [3] : [],
      isValidCoord: () => true,
      ref: () => 1,
      x: (tile: number) => tile * 100,
      y: () => centerY,
    } as unknown as GameView;
    overlay.transformHandler = {
      worldToScreenCoordinates: (cell: { x: number }) => ({
        x: cell.x - 0.5,
        y: centerY,
      }),
      screenToWorldCoordinates: () => ({ x: 1, y: 1 }),
    } as never;
    Reflect.set(overlay, "hasCoastalTerritory", () => true);
    Reflect.set(overlay, "enemyBorderTiles", new Set([2]));
    Reflect.set(overlay, "spotlightMatchesRegion", (x: number) => x >= 350);

    const target = Reflect.get(overlay, "findMapTarget").call(overlay);

    expect(target).not.toBeNull();
    expect(Reflect.get(overlay, "mapTargetTile")).toBe(2);
    expect(Reflect.get(overlay, "mapFocusTile")).toBe(4);
    overlay.stop();
  });

  test("Port expansion highlight never falls back to inland land", () => {
    const { overlay } = createOverlay(8);
    const player = { smallID: () => 1 };
    const centerX = window.innerWidth * 0.5;
    const centerY = window.innerHeight * 0.46;
    overlay.game = {
      myPlayer: () => player,
      x: (tile: number) => tile,
      y: () => 0,
      isOceanShore: (tile: number) => tile === 2,
      isLand: () => true,
      hasOwner: () => false,
      isImpassable: () => false,
      isValidCoord: () => true,
      ref: () => 1,
    } as unknown as GameView;
    overlay.transformHandler = {
      worldToScreenCoordinates: (cell: { x: number }) => ({
        x: cell.x === 1.5 ? centerX : centerX + 80,
        y: centerY,
      }),
    } as never;
    Reflect.set(overlay, "adjacentUnownedLandTiles", new Set([1, 2]));

    const target = Reflect.get(overlay, "findAdjacentOpenLandTarget").call(
      overlay,
      player,
      true,
    ) as DOMRect;

    expect(target.left + target.width / 2).toBe(centerX + 80);
    overlay.stop();
  });

  test("Port lesson skips ocean coast tiles where a Port cannot be built", async () => {
    const { overlay } = createOverlay(8);
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
      isLand: () => true,
      hasFallout: () => false,
      isImpassable: () => false,
      unitsOwnedBy: () => [],
      neighbors: () => [],
      isValidCoord: () => true,
      ref: () => 1,
      x: (tile: number) => tile * 100,
      y: () => 300,
    } as unknown as GameView;
    overlay.transformHandler = {
      worldToScreenCoordinates: () => ({ x: 300, y: 300 }),
      screenToWorldCoordinates: () => ({ x: 1, y: 1 }),
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

  test("attack lesson puts the whole highlight inside a neighboring enemy country", () => {
    const { overlay } = createOverlay(3);
    const player = { smallID: () => 1 };
    const width = 10_000;
    const ref = (x: number, y: number) => Math.floor(y) * width + Math.floor(x);
    const xOf = (tile: number) => tile % width;
    const yOf = (tile: number) => Math.floor(tile / width);
    const seed = ref(300, 300);
    overlay.game = {
      myPlayer: () => player,
      isValidCoord: () => true,
      ref,
      x: xOf,
      y: yOf,
      isLand: () => true,
      isImpassable: () => false,
      hasOwner: () => true,
      ownerID: (tile: number) => (xOf(tile) >= 300 ? 2 : 1),
      neighbors: (tile: number) => [tile - 1],
    } as unknown as GameView;
    overlay.transformHandler = {
      screenToWorldCoordinates: (x: number, y: number) => ({ x, y }),
      worldToScreenCoordinates: (cell: { x: number; y: number }) => cell,
    } as never;
    Reflect.set(overlay, "adjacentEnemyTiles", new Set([seed]));

    const target = Reflect.get(overlay, "findNeighborEnemyTarget").call(
      overlay,
      player,
    ) as DOMRect | null;

    expect(target).not.toBeNull();
    expect(target?.width).toBe(48);
    expect(target!.left + target!.width / 2).toBeGreaterThan(300);
    expect(Reflect.get(overlay, "mapTargetTile")).toBeGreaterThan(seed);
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
      isValidCoord: () => false,
    } as unknown as GameView;
    overlay.transformHandler = {
      worldToScreenCoordinates: (cell: { x: number; y: number }) => cell,
      screenToWorldCoordinates: () => ({ x: 0, y: 0 }),
    } as never;
    Reflect.set(overlay, "adjacentEnemyTiles", new Set([20]));

    const target = Reflect.get(overlay, "findTarget").call(overlay);

    expect(target).toBeNull();
    expect(emit).toHaveBeenCalledWith(new GoToPositionEvent(20.5, 20.5));
    overlay.stop();
  });

  test("map lessons do not show a fake center target before the player exists", () => {
    const { overlay } = createOverlay(2);
    overlay.game = { myPlayer: () => null } as unknown as GameView;
    overlay.transformHandler = {} as never;

    expect(Reflect.get(overlay, "findTarget").call(overlay)).toBeNull();
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
      isValidCoord: () => false,
    } as unknown as GameView;
    overlay.transformHandler = {
      worldToScreenCoordinates: () => ({ x: 300, y: 400 }),
    } as never;
    Reflect.set(overlay, "adjacentEnemyTiles", new Set([10]));

    expect(Reflect.get(overlay, "findTarget").call(overlay)).toBeNull();
    overlay.stop();
  });

  test("final step hides Skip and restores controls only after confirmation", async () => {
    const { overlay } = createOverlay(13);
    document.body.append(overlay);
    await overlay.updateComplete;

    expect(overlay.shadowRoot?.querySelector(".skip")).toBeNull();
    const continueButton =
      overlay.shadowRoot?.querySelector<HTMLButtonElement>(".continue");
    expect(continueButton).not.toBeNull();
    expect(localStorage.getItem(ACTIVE_KEY)).toBe("true");
    // The test i18n stub returns the untranslated key, so verify the persisted
    // zero-based index instead of expecting translated interpolation text.
    expect(localStorage.getItem(STEP_KEY)).toBe("13");

    const blocked = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "ArrowUp",
    });
    window.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);

    Reflect.set(overlay, "lockedZoomScale", 2);
    Reflect.set(overlay, "zoomCenterWorld", { x: 10, y: 20 });
    continueButton?.click();
    expect(Reflect.get(overlay, "lockedZoomScale")).toBeNull();
    expect(Reflect.get(overlay, "zoomCenterWorld")).toBeNull();
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
    expect(localStorage.getItem(COMPLETED_KEY)).toBe("true");
    expect(localStorage.getItem(STEP_KEY)).toBeNull();
    const allowed = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "ArrowUp",
    });
    window.dispatchEvent(allowed);
    expect(allowed.defaultPrevented).toBe(false);
    overlay.stop();
  });

  test("skip clears tutorial restrictions and its temporary zoom lock", () => {
    const { overlay } = createOverlay(3);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    Reflect.set(overlay, "lockedZoomScale", 1.5);
    Reflect.set(overlay, "zoomCenterWorld", { x: 5, y: 6 });

    Reflect.get(overlay, "skip").call(overlay);

    expect(Reflect.get(overlay, "lockedZoomScale")).toBeNull();
    expect(Reflect.get(overlay, "zoomCenterWorld")).toBeNull();
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
    expect(localStorage.getItem(STEP_KEY)).toBeNull();
    expect(localStorage.getItem("openfront.tutorial.skipped")).toBe("true");
    vi.restoreAllMocks();
  });

  test("migrates old 17-step and intermediate 16-step saves", () => {
    const makeOverlay = () => {
      const overlay = new TutorialOverlay();
      overlay.game = {
        config: () => ({
          gameConfig: () => ({ gameType: GameType.Singleplayer }),
        }),
        myPlayer: () => null,
      } as unknown as GameView;
      overlay.eventBus = new EventBus();
      overlay.uiState = { attackRatio: 0.15 } as never;
      overlay.transformHandler = {} as never;
      return overlay;
    };

    localStorage.setItem(ACTIVE_KEY, "true");
    localStorage.setItem(STEP_KEY, "6");
    sessionStorage.setItem(TUTORIAL_LAUNCH_PENDING_KEY, "true");
    const originalOverlay = makeOverlay();
    originalOverlay.init();
    expect(localStorage.getItem(STEP_KEY)).toBe("4");
    originalOverlay.stop();

    localStorage.removeItem(STEP_INDEX_VERSION_KEY);
    localStorage.setItem(SPEED_STEP_REMOVED_KEY, "true");
    localStorage.setItem(STEP_KEY, "5");
    sessionStorage.setItem(TUTORIAL_LAUNCH_PENDING_KEY, "true");
    const intermediateOverlay = makeOverlay();
    intermediateOverlay.init();
    expect(localStorage.getItem(STEP_KEY)).toBe("4");
    intermediateOverlay.stop();
  });

  test("moves v2 leaderboard and win saves to the new final step", () => {
    localStorage.setItem(ACTIVE_KEY, "true");
    localStorage.setItem(STEP_KEY, "14");
    localStorage.setItem(STEP_INDEX_VERSION_KEY, "2");
    sessionStorage.setItem(TUTORIAL_LAUNCH_PENDING_KEY, "true");
    const overlay = new TutorialOverlay();
    overlay.game = {
      config: () => ({
        gameConfig: () => ({ gameType: GameType.Singleplayer }),
      }),
      myPlayer: () => null,
    } as unknown as GameView;
    overlay.eventBus = new EventBus();
    overlay.uiState = { attackRatio: 0.15 } as never;
    overlay.transformHandler = {} as never;
    overlay.init();

    expect(localStorage.getItem(STEP_KEY)).toBe("13");
    expect(localStorage.getItem(STEP_INDEX_VERSION_KEY)).toBe("3");
    expect(Reflect.get(overlay, "current").id).toBe("win");
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
    // A different clear tile must be rejected; the highlighted spawn tile is
    // the fixed tutorial origin used by the later construction steps.
    expect(canInteractAt(500, 500, mapTap)).toBe(false);

    isLand = false;
    expect(findMapTarget()).toBeNull();
    expect(canInteractAt(100, 100, mapTap)).toBe(false);
    isLand = true;
    hasOwner = true;
    expect(findMapTarget()).toBeNull();
    expect(canInteractAt(100, 100, mapTap)).toBe(false);
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

  test("all 14 lessons advance from their intended successful action", async () => {
    const { eventBus, overlay } = createOverlay(0);
    let nukeTargetAlive = true;
    const nukeTarget = {
      smallID: () => 7,
      isAlive: () => nukeTargetAlive,
    };
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
      players: () => [nukeTarget],
      width: () => 1000,
    } as unknown as GameView;
    const transformHandler = {
      scale: 4,
      width: () => window.innerWidth,
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

    for (const [step, unit] of [
      [4, UnitType.City],
      [5, UnitType.Factory],
      [6, UnitType.DefensePost],
    ] as const) {
      eventBus.emit(new BuildUnitIntentEvent(unit, 42));
      expect(localStorage.getItem(STEP_KEY)).toBe(String(step + 1));
    }

    eventBus.emit(new SendAllianceRequestIntentEvent({} as never, {} as never));
    expect(localStorage.getItem(STEP_KEY)).toBe("8");

    for (const [step, unit] of [
      [8, UnitType.Port],
      [9, UnitType.Warship],
      [10, UnitType.MissileSilo],
    ] as const) {
      eventBus.emit(new BuildUnitIntentEvent(unit, 42));
      expect(localStorage.getItem(STEP_KEY)).toBe(String(step + 1));
    }

    Reflect.set(overlay, "mapTargetOwnerID", 7);
    eventBus.emit(new BuildUnitIntentEvent(UnitType.AtomBomb, 42));
    expect(localStorage.getItem(STEP_KEY)).toBe("11");
    nukeTargetAlive = false;
    overlay.tick();
    expect(localStorage.getItem(STEP_KEY)).toBe("12");
    eventBus.emit(new BuildUnitIntentEvent(UnitType.SAMLauncher, 42));
    expect(localStorage.getItem(STEP_KEY)).toBe("13");

    let leaderboardCloseCount = 0;
    eventBus.on(CloseLeaderboardEvent, () => {
      leaderboardCloseCount += 1;
    });
    expect(localStorage.getItem(STEP_KEY)).toBe("13");
    expect(Reflect.get(overlay, "current").id).toBe("win");
    document.body.append(overlay);
    await overlay.updateComplete;
    expect(overlay.shadowRoot?.querySelector(".continue")).not.toBeNull();
    expect(localStorage.getItem(ACTIVE_KEY)).toBe("true");
    eventBus.emit(new SendWinnerEvent(["player", 1] as never, [] as never));
    expect(localStorage.getItem(ACTIVE_KEY)).toBe("true");
    overlay.shadowRoot?.querySelector<HTMLButtonElement>(".continue")?.click();
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
    expect(leaderboardCloseCount).toBe(1);
    overlay.remove();
    overlay.stop();
  });

  test("Warship lesson points to its Attack submenu option when it is open", () => {
    const { overlay } = createOverlay(9);
    const option = document.createElement("div");
    option.dataset.id = "attack_Warship";
    vi.spyOn(option, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 50, 50),
    );
    Reflect.set(overlay, "findElement", (selector: string) =>
      selector === '[data-id="attack_Warship"]' ? option : null,
    );

    const selector = Reflect.get(overlay, "currentTargetSelector").call(
      overlay,
    );

    expect(selector).toBe('[data-id="attack_Warship"]');
    overlay.stop();
  });

  test("warship lesson requires building a Warship, not sending a transport boat", () => {
    const { eventBus, overlay } = createOverlay(9);

    eventBus.emit(new SendBoatAttackIntentEvent(1, 100));
    expect(localStorage.getItem(STEP_KEY)).toBe("9");

    eventBus.emit(new BuildUnitIntentEvent(UnitType.Warship, 1));
    expect(localStorage.getItem(STEP_KEY)).toBe("10");
    overlay.stop();
  });
});
