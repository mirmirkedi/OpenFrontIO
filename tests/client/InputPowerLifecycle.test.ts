import {
  ContextMenuEvent,
  DragEvent,
  InputHandler,
} from "../../src/client/InputHandler";
import type { GameView } from "../../src/client/view";
import { EventBus } from "../../src/core/EventBus";

describe("input power lifecycle", () => {
  let input: InputHandler;
  let bus: EventBus;
  let canvas: HTMLDivElement;
  beforeEach(() => {
    vi.useFakeTimers();
    canvas = document.createElement("div");
    document.body.append(canvas);
    bus = new EventBus();
    input = new InputHandler(
      {
        inSpawnPhase: () => false,
        myPlayer: () => null,
      } as unknown as GameView,
      {
        attackRatio: 0.2,
        ghostStructure: null,
        rocketDirectionUp: true,
        upgradeMultiplier: 1,
      },
      canvas,
      bus,
    );
    input.initialize();
  });
  afterEach(() => {
    input.destroy();
    canvas.remove();
    vi.useRealTimers();
  });

  it("has no keyboard timer while idle, repeats only while a movement key is held", () => {
    const drag = vi.fn();
    bus.on(DragEvent, drag);
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp" }));
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(20);
    expect(drag).toHaveBeenCalledTimes(5);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowUp" }));
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(drag).toHaveBeenCalledTimes(5);
  });

  it("releases keys when Android pauses and does not restart them on resume", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp" }));
    window.dispatchEvent(
      new CustomEvent("worldfront-app-state", { detail: { active: false } }),
    );
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(
      new CustomEvent("worldfront-app-state", { detail: { active: true } }),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes DOM listeners as well as timers when destroyed", () => {
    const menu = vi.fn();
    bus.on(ContextMenuEvent, menu);
    input.destroy();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp" }));
    canvas.dispatchEvent(new MouseEvent("contextmenu"));
    expect(vi.getTimerCount()).toBe(0);
    expect(menu).not.toHaveBeenCalled();
  });
});
