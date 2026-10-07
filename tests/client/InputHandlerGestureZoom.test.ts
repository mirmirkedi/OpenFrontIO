import {
  DragEvent,
  InputHandler,
  MouseUpEvent,
  TouchEvent,
  ZOOM_DELTA_DIVISOR,
  ZoomEvent,
} from "../../src/client/InputHandler";
import type { UIState } from "../../src/client/UIState";
import type { GameView } from "../../src/client/view";
import { EventBus } from "../../src/core/EventBus";

/** jsdom has no GestureEvent, so fake one with a plain cancelable Event. */
function dispatchGesture(
  target: EventTarget,
  type: string,
  props: { scale?: number; clientX?: number; clientY?: number } = {},
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { scale: 1, clientX: 0, clientY: 0, ...props });
  target.dispatchEvent(event);
  return event;
}

/** Same, for pointers — jsdom's PointerEvent drops pointerId/pointerType. */
function dispatchPointerDown(
  target: EventTarget,
  pointerId: number,
  props: { clientX?: number; clientY?: number } = {},
): void {
  const event = new Event("pointerdown", { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId,
    pointerType: "touch",
    button: 0,
    clientX: 0,
    clientY: 0,
    ...props,
  });
  target.dispatchEvent(event);
}

function dispatchPointerUp(target: EventTarget, pointerId: number): void {
  const event = new Event("pointerup", { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId, pointerType: "touch", button: 0 });
  target.dispatchEvent(event);
}

function setup() {
  const canvas = document.createElement("div");
  document.body.appendChild(canvas);

  const eventBus = new EventBus();
  const zooms: ZoomEvent[] = [];
  eventBus.on(ZoomEvent, (e) => zooms.push(e));

  const gameView = { inSpawnPhase: () => false } as unknown as GameView;
  const handler = new InputHandler(gameView, {} as UIState, canvas, eventBus);
  handler.initialize();

  return { canvas, eventBus, handler, zooms };
}

describe("InputHandler tutorial keyboard movement", () => {
  it("does not pan with a held movement key until the tutorial ends", () => {
    const { canvas, eventBus, handler } = setup();
    const drags: DragEvent[] = [];
    eventBus.on(DragEvent, (event) => drags.push(event));
    Reflect.get(handler, "activeKeys").add("ArrowUp");
    const moveKeys = Reflect.get(handler, "moveKeys") as () => void;

    try {
      localStorage.setItem("openfront.tutorial.active", "true");
      moveKeys();
      expect(drags).toHaveLength(0);

      localStorage.removeItem("openfront.tutorial.active");
      moveKeys();
      expect(drags).toHaveLength(1);
    } finally {
      localStorage.removeItem("openfront.tutorial.active");
      handler.destroy();
      canvas.remove();
    }
  });
});

describe("InputHandler Safari trackpad pinch", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => {
    ctx.handler.destroy();
    ctx.canvas.remove();
  });

  it("emits a negative delta when pinching out (zoom in)", () => {
    dispatchGesture(ctx.canvas, "gesturestart", { scale: 1 });
    dispatchGesture(ctx.canvas, "gesturechange", { scale: 1.2 });

    expect(ctx.zooms).toHaveLength(1);
    expect(ctx.zooms[0].delta).toBeLessThan(0);
  });

  it("emits a positive delta when pinching in (zoom out)", () => {
    dispatchGesture(ctx.canvas, "gesturestart", { scale: 1 });
    dispatchGesture(ctx.canvas, "gesturechange", { scale: 0.8 });

    expect(ctx.zooms).toHaveLength(1);
    expect(ctx.zooms[0].delta).toBeGreaterThan(0);
  });

  it("converts the pinch ratio using the TransformHandler.onZoom convention", () => {
    dispatchGesture(ctx.canvas, "gesturestart", { scale: 1 });
    dispatchGesture(ctx.canvas, "gesturechange", { scale: 1.5 });

    // A 1.5x pinch must produce a zoomFactor of 1/1.5.
    const zoomFactor = 1 + ctx.zooms[0].delta / ZOOM_DELTA_DIVISOR;
    expect(zoomFactor).toBeCloseTo(1 / 1.5, 10);
  });

  it("treats scale as cumulative, not per-event", () => {
    dispatchGesture(ctx.canvas, "gesturestart", { scale: 1 });
    dispatchGesture(ctx.canvas, "gesturechange", { scale: 1.2 });
    dispatchGesture(ctx.canvas, "gesturechange", { scale: 1.44 });

    // Both steps are the same 1.2x ratio, so both deltas must match.
    expect(ctx.zooms).toHaveLength(2);
    expect(ctx.zooms[1].delta).toBeCloseTo(ctx.zooms[0].delta, 10);
  });

  it("uses the gesture position as the zoom focal point", () => {
    dispatchGesture(ctx.canvas, "gesturestart", { scale: 1 });
    dispatchGesture(ctx.canvas, "gesturechange", {
      scale: 1.2,
      clientX: 321,
      clientY: 123,
    });

    expect(ctx.zooms[0].x).toBe(321);
    expect(ctx.zooms[0].y).toBe(123);
  });

  it("ignores gesturechange with no gesture in progress", () => {
    dispatchGesture(ctx.canvas, "gesturechange", { scale: 1.2 });

    expect(ctx.zooms).toHaveLength(0);
  });

  it("does not carry scale across a completed gesture", () => {
    dispatchGesture(ctx.canvas, "gesturestart", { scale: 1 });
    dispatchGesture(ctx.canvas, "gesturechange", { scale: 4 });
    dispatchGesture(ctx.canvas, "gestureend", { scale: 4 });
    ctx.zooms.length = 0;

    // Without the reset this reads as a 1.2/4 ratio and zooms the wrong way.
    dispatchGesture(ctx.canvas, "gesturestart", { scale: 1 });
    dispatchGesture(ctx.canvas, "gesturechange", { scale: 1.2 });

    expect(ctx.zooms).toHaveLength(1);
    expect(ctx.zooms[0].delta).toBeLessThan(0);
  });

  it("defers to the pointer pinch path when two pointers are down", () => {
    dispatchPointerDown(ctx.canvas, 1, { clientX: 100, clientY: 100 });
    dispatchPointerDown(ctx.canvas, 2, { clientX: 200, clientY: 200 });

    dispatchGesture(ctx.canvas, "gesturestart", { scale: 1 });
    dispatchGesture(ctx.canvas, "gesturechange", { scale: 1.2 });

    expect(ctx.zooms).toHaveLength(0);
  });

  it("advances the scale during a pointer pinch so a lift does not re-zoom", () => {
    dispatchPointerDown(ctx.canvas, 1, { clientX: 100, clientY: 100 });
    dispatchPointerDown(ctx.canvas, 2, { clientX: 200, clientY: 200 });

    dispatchGesture(ctx.canvas, "gesturestart", { scale: 1 });
    // Deferred to the pointer path, but the scale must still advance to 2.
    dispatchGesture(ctx.canvas, "gesturechange", { scale: 2 });
    expect(ctx.zooms).toHaveLength(0);

    dispatchPointerUp(ctx.canvas, 1);
    dispatchGesture(ctx.canvas, "gesturechange", { scale: 2.2 });

    // Ratio must be 2.2/2, not 2.2/1 — the 1→2 zoom was already handled.
    expect(ctx.zooms).toHaveLength(1);
    const zoomFactor = 1 + ctx.zooms[0].delta / ZOOM_DELTA_DIVISOR;
    expect(zoomFactor).toBeCloseTo(1 / 1.1, 10);
  });

  it("still zooms for a trackpad pinch, which registers no pointers", () => {
    dispatchPointerDown(ctx.canvas, 1, { clientX: 100, clientY: 100 });

    dispatchGesture(ctx.canvas, "gesturestart", { scale: 1 });
    dispatchGesture(ctx.canvas, "gesturechange", { scale: 1.2 });

    expect(ctx.zooms).toHaveLength(1);
  });

  it("emits nothing when the pinch has not moved", () => {
    dispatchGesture(ctx.canvas, "gesturestart", { scale: 1 });
    dispatchGesture(ctx.canvas, "gesturechange", { scale: 1 });

    expect(ctx.zooms).toHaveLength(0);
  });

  it("calls preventDefault so the page does not zoom", () => {
    for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
      const event = dispatchGesture(ctx.canvas, type, { scale: 1.2 });
      expect(event.defaultPrevented).toBe(true);
    }
  });
});

describe("InputHandler touch spawn selection", () => {
  afterEach(() => {
    localStorage.removeItem("openfront.tutorial.active");
    localStorage.removeItem("openfront.tutorial.step");
  });

  it("routes a mobile tap through the normal spawn selection event", () => {
    localStorage.setItem("openfront.tutorial.active", "true");
    localStorage.setItem("openfront.tutorial.step", "1");
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    const eventBus = new EventBus();
    const mouseUps: MouseUpEvent[] = [];
    const touches: TouchEvent[] = [];
    eventBus.on(MouseUpEvent, (event) => mouseUps.push(event));
    eventBus.on(TouchEvent, (event) => touches.push(event));
    const gameView = { inSpawnPhase: () => true } as unknown as GameView;
    const handler = new InputHandler(gameView, {} as UIState, canvas, eventBus);
    handler.initialize();

    const pointerDown = new Event("pointerdown", {
      bubbles: true,
      cancelable: true,
    });
    Object.assign(pointerDown, {
      pointerId: 7,
      pointerType: "touch",
      button: 0,
      clientX: 232,
      clientY: 387,
    });
    canvas.dispatchEvent(pointerDown);

    const pointerUp = new Event("pointerup", {
      bubbles: true,
      cancelable: true,
    });
    Object.assign(pointerUp, {
      pointerId: 7,
      pointerType: "touch",
      button: 0,
      clientX: 232,
      clientY: 387,
      x: 232,
      y: 387,
    });
    window.dispatchEvent(pointerUp);

    expect(mouseUps).toHaveLength(1);
    expect(mouseUps[0]).toMatchObject({ x: 232, y: 387 });
    expect(touches).toHaveLength(1);
    handler.destroy();
    canvas.remove();
  });

  it("does not turn normal gameplay touches into map clicks", () => {
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);
    const eventBus = new EventBus();
    const mouseUps: MouseUpEvent[] = [];
    eventBus.on(MouseUpEvent, (event) => mouseUps.push(event));
    const gameView = { inSpawnPhase: () => false } as unknown as GameView;
    const handler = new InputHandler(gameView, {} as UIState, canvas, eventBus);
    handler.initialize();

    const pointerDown = new Event("pointerdown", {
      bubbles: true,
      cancelable: true,
    });
    Object.assign(pointerDown, {
      pointerId: 8,
      pointerType: "touch",
      button: 0,
      clientX: 120,
      clientY: 120,
    });
    canvas.dispatchEvent(pointerDown);
    const pointerUp = new Event("pointerup", {
      bubbles: true,
      cancelable: true,
    });
    Object.assign(pointerUp, {
      pointerId: 8,
      pointerType: "touch",
      button: 0,
      clientX: 120,
      clientY: 120,
      x: 120,
      y: 120,
    });
    window.dispatchEvent(pointerUp);

    expect(mouseUps).toHaveLength(0);
    handler.destroy();
    canvas.remove();
  });
});
