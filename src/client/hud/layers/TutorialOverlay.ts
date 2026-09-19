import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { GameType, UnitType } from "../../../core/game/Game";
import type { Controller } from "../../Controller";
import {
  AttackRatioEvent,
  ContextMenuEvent,
  ReplaySpeedChangeEvent,
  TouchEvent,
  ZOOM_DELTA_DIVISOR,
  ZoomEvent,
} from "../../InputHandler";
import type { TransformHandler } from "../../TransformHandler";
import {
  BuildUnitIntentEvent,
  MoveWarshipIntentEvent,
  PauseGameIntentEvent,
  SendAllianceRequestIntentEvent,
  SendAttackIntentEvent,
  SendBoatAttackIntentEvent,
  SendWinnerEvent,
} from "../../Transport";
import type { UIState } from "../../UIState";
import type { GameView } from "../../view";

const ACTIVE_KEY = "openfront.tutorial.active";
const COMPLETED_KEY = "openfront.tutorial.completed";
const SKIPPED_KEY = "openfront.tutorial.skipped";
const STEP_KEY = "openfront.tutorial.step";
const TUTORIAL_ZOOM_SCALE = 2.8;
const TUTORIAL_ATTACK_RATIO = 0.15;

type TutorialStep = {
  id: string;
  copy: string;
  target?: string;
  unit?: UnitType;
  mapTarget?: boolean;
};

const STEPS: TutorialStep[] = [
  { id: "zoom", copy: "Zoom in to see the map", mapTarget: true },
  { id: "spawn", copy: "Tap an empty area to start", mapTarget: true },
  {
    id: "expand",
    copy: "Tap an empty area, then choose Attack",
    mapTarget: true,
  },
  { id: "attack", copy: "Attack a neighboring country", mapTarget: true },
  { id: "speed", copy: "Use the speed controls", target: "replay" },
  {
    id: "pause",
    copy: "Pause the game when you need a moment",
    target: "pause",
  },
  { id: "city", copy: "Build a City", unit: UnitType.City },
  { id: "factory", copy: "Build a Factory", unit: UnitType.Factory },
  {
    id: "defense",
    copy: "Protect your border with a Defense Post",
    unit: UnitType.DefensePost,
  },
  {
    id: "ally",
    copy: "Ask a nearby country to become your ally",
    mapTarget: true,
  },
  { id: "port", copy: "Build a Port near the coast", unit: UnitType.Port },
  { id: "warship", copy: "Send a Warship out to sea", mapTarget: true },
  { id: "silo", copy: "Build a Missile Silo", unit: UnitType.MissileSilo },
  { id: "rocket", copy: "Launch a rocket at an enemy", mapTarget: true },
  { id: "sam", copy: "Build a SAM Launcher", unit: UnitType.SAMLauncher },
  { id: "leaderboard", copy: "Open the leaderboard", target: "leaderboard" },
  { id: "win", copy: "Conquer the map to win", mapTarget: true },
];

@customElement("tutorial-overlay")
export class TutorialOverlay extends LitElement implements Controller {
  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 2000;
      pointer-events: none;
      display: block;
    }
    .veil {
      position: absolute;
      inset: 0;
      background: rgba(2, 9, 16, 0.36);
    }
    .spotlight {
      position: fixed;
      border-radius: 50%;
      pointer-events: none;
      box-shadow:
        0 0 0 9999px rgba(2, 9, 16, 0.48),
        0 0 26px rgba(45, 190, 255, 0.28),
        inset 0 0 22px rgba(45, 190, 255, 0.12);
      background: rgba(150, 225, 255, 0.035);
      transition: all 0.26s ease-out;
    }
    .hint {
      position: fixed;
      top: clamp(110px, 14vh, 180px);
      left: 50%;
      max-width: min(360px, calc(100vw - 32px));
      padding: 9px 12px;
      border: 1px solid rgba(128, 220, 255, 0.28);
      border-radius: 10px;
      background: rgba(5, 25, 41, 0.94);
      color: #eaf8ff;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
      font:
        600 13px/1.25 Inter,
        system-ui,
        sans-serif;
      text-align: center;
      transform: translateX(-50%);
      white-space: normal;
    }
    .progress {
      position: fixed;
      top: max(12px, env(safe-area-inset-top));
      left: 50%;
      transform: translateX(-50%);
      color: rgba(232, 248, 255, 0.72);
      font:
        700 10px/1 Inter,
        system-ui,
        sans-serif;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .hand {
      display: none;
    }
    .skip {
      position: fixed;
      left: max(12px, env(safe-area-inset-left));
      right: auto;
      bottom: max(68px, calc(env(safe-area-inset-bottom) + 68px));
      pointer-events: auto;
      padding: 7px 10px;
      border: 1px solid rgba(206, 232, 244, 0.25);
      border-radius: 8px;
      background: rgba(5, 25, 41, 0.82);
      color: rgba(235, 247, 252, 0.78);
      font:
        700 10px/1 Inter,
        system-ui,
        sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .skip:hover {
      color: white;
      border-color: rgba(128, 220, 255, 0.55);
    }
    @keyframes tutorial-hand {
      0%,
      100% {
        margin-top: 0;
      }
      50% {
        margin-top: 7px;
      }
    }
  `;

  @property({ attribute: false }) public game!: GameView;
  @property({ attribute: false }) public eventBus!: EventBus;
  @property({ attribute: false }) public uiState!: UIState;
  @property({ attribute: false }) public transformHandler!: TransformHandler;
  @state() private stepIndex = 0;
  @state() private rect: DOMRect | null = null;
  private active = false;
  private baselineTiles = 0;
  private refreshTimer: number | undefined;
  private lockedZoomScale: number | null = null;
  private lockedZoomOffsetX: number | null = null;
  private lockedZoomOffsetY: number | null = null;
  private zoomCenterWorld: { x: number; y: number } | null = null;
  private tutorialGestureScale: number | null = null;
  private expandActionAt = Number.POSITIVE_INFINITY;
  private emptyClickCount = 0;
  private attackTargetID: string | null = null;

  private readonly guardPointerDown = (event: PointerEvent) => {
    if (
      this.active &&
      this.current.id === "expand" &&
      event.button === 0 &&
      this.pointInRect(event.clientX, event.clientY) &&
      event.composedPath().some((node) => node instanceof HTMLCanvasElement)
    ) {
      // The actual click is counted from ContextMenuEvent/TouchEvent below;
      // pointerdown only controls the tutorial input gate.
    }
    if (!this.active || this.canInteractAt(event.clientX, event.clientY, event))
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly guardWheel = (event: WheelEvent) => {
    if (!this.active) return;
    const inside = this.rect && this.pointInRect(event.clientX, event.clientY);
    if (this.current.id !== "zoom" || !inside || event.deltaY >= 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    // Do not let InputHandler use the user's pointer position as the zoom
    // anchor. The tutorial always zooms toward one fixed screen-center point.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!this.zoomCenterWorld) this.captureZoomCenter();
    this.eventBus.emit(
      new ZoomEvent(
        window.innerWidth / 2,
        window.innerHeight / 2,
        event.deltaY,
      ),
    );
  };

  private readonly guardKeyDown = (event: KeyboardEvent) => {
    if (!this.active) return;
    const zoomInKeys = new Set(["Equal", "NumpadAdd"]);
    const zoomOutKeys = new Set(["Minus", "NumpadSubtract"]);
    if (
      zoomOutKeys.has(event.code) ||
      (zoomInKeys.has(event.code) && this.current.id !== "zoom")
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
    } else if (zoomInKeys.has(event.code)) {
      if (!this.zoomCenterWorld) this.captureZoomCenter();
    }
  };

  private readonly guardPointerMove = (event: PointerEvent) => {
    if (!this.active || this.canInteractAt(event.clientX, event.clientY, event))
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly guardGesture = (event: Event) => {
    if (!this.active) return;
    if (this.current.id === "zoom") {
      const gesture = event as Event & { scale: number };
      if (event.type === "gesturestart") {
        this.tutorialGestureScale = gesture.scale;
        if (!this.zoomCenterWorld) this.captureZoomCenter();
      } else if (event.type === "gesturechange") {
        const previous = this.tutorialGestureScale;
        const scale = gesture.scale;
        this.tutorialGestureScale = scale;
        if (previous && Number.isFinite(scale) && scale > 0) {
          const ratio = scale / previous;
          if (Number.isFinite(ratio) && ratio > 0) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.eventBus.emit(
              new ZoomEvent(
                window.innerWidth / 2,
                window.innerHeight / 2,
                ZOOM_DELTA_DIVISOR * (1 / ratio - 1),
              ),
            );
            return;
          }
        }
      } else if (event.type === "gestureend") {
        this.tutorialGestureScale = null;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private captureZoomCenter() {
    this.zoomCenterWorld = this.transformHandler.screenToWorldCoordinatesFloat(
      window.innerWidth / 2,
      window.innerHeight / 2,
    );
  }

  init() {
    const isSinglePlayer =
      this.game.config().gameConfig().gameType === GameType.Singleplayer;
    this.active = isSinglePlayer && localStorage.getItem(ACTIVE_KEY) === "true";
    if (!this.active) return;

    this.stepIndex = Math.max(
      0,
      Math.min(STEPS.length - 1, Number(localStorage.getItem(STEP_KEY) ?? 0)),
    );
    this.refreshTimer = window.setInterval(() => this.refreshTarget(), 100);
    window.addEventListener("pointerdown", this.guardPointerDown, true);
    window.addEventListener("pointermove", this.guardPointerMove, true);
    window.addEventListener("wheel", this.guardWheel, {
      capture: true,
      passive: false,
    });
    window.addEventListener("keydown", this.guardKeyDown, true);
    window.addEventListener("gesturechange", this.guardGesture, true);
    window.addEventListener("gesturestart", this.guardGesture, true);
    window.addEventListener("gestureend", this.guardGesture, true);

    this.eventBus.on(ZoomEvent, () => {
      if (this.current.id === "zoom" && this.zoomCenterWorld) {
        const canvasCenter = this.transformHandler.screenToCanvasCoordinates(
          window.innerWidth / 2,
          window.innerHeight / 2,
        );
        this.transformHandler.offsetX =
          this.zoomCenterWorld.x -
          this.game.width() / 2 -
          (canvasCenter.x - this.game.width() / 2) /
            this.transformHandler.scale;
        this.transformHandler.offsetY =
          this.zoomCenterWorld.y -
          this.game.height() / 2 -
          (canvasCenter.y - this.game.height() / 2) /
            this.transformHandler.scale;
      }
      if (
        this.current.id === "zoom" &&
        this.transformHandler.scale >= TUTORIAL_ZOOM_SCALE
      ) {
        this.lockedZoomScale = this.transformHandler.scale;
        this.lockedZoomOffsetX = this.transformHandler.offsetX;
        this.lockedZoomOffsetY = this.transformHandler.offsetY;
        this.complete("zoom");
      } else if (this.lockedZoomScale !== null) {
        this.transformHandler.scale = this.lockedZoomScale;
        this.transformHandler.offsetX = this.lockedZoomOffsetX ?? 0;
        this.transformHandler.offsetY = this.lockedZoomOffsetY ?? 0;
      }
    });
    const countEmptyClick = (x: number, y: number) => {
      if (this.current.id !== "expand" || !this.pointInRect(x, y)) return;
      const cell = this.transformHandler.screenToWorldCoordinates(x, y);
      if (!this.game.isValidCoord(cell.x, cell.y)) return;
      const tile = this.game.ref(cell.x, cell.y);
      if (!this.isOpenLand(cell.x, cell.y, tile)) return;
      this.emptyClickCount += 1;
      if (this.emptyClickCount >= 3) {
        this.expandActionAt = performance.now() + 2500;
      }
      this.requestUpdate();
    };
    this.eventBus.on(ContextMenuEvent, (event) =>
      countEmptyClick(event.x, event.y),
    );
    this.eventBus.on(TouchEvent, (event) => countEmptyClick(event.x, event.y));
    this.eventBus.on(SendAttackIntentEvent, (event) => {
      if (this.current.id === "expand") {
        if (this.emptyClickCount >= 3) {
          this.expandActionAt = performance.now() + 2500;
        }
      } else if (this.current.id === "attack" && event.targetID !== null) {
        // The spotlight is refreshed while the map grows, so the rendered
        // country can move by a few tiles between the hint and the tap. Any
        // real ground attack here is therefore the intentional tutorial step.
        this.complete("attack");
      }
    });
    this.eventBus.on(SendBoatAttackIntentEvent, () => this.complete("warship"));
    this.eventBus.on(MoveWarshipIntentEvent, () => this.complete("warship"));
    this.eventBus.on(SendAllianceRequestIntentEvent, () =>
      this.complete("ally"),
    );
    this.eventBus.on(PauseGameIntentEvent, () => this.complete("pause"));
    this.eventBus.on(ReplaySpeedChangeEvent, () => this.complete("speed"));
    this.eventBus.on(SendWinnerEvent, (event) => {
      const player = this.game.myPlayer();
      const winner = event.winner;
      if (
        player &&
        ((winner?.[0] === "player" && winner[1] === player.clientID()) ||
          (winner?.[0] === "team" && winner[1] === player.team()))
      ) {
        this.finish();
      }
    });
    this.eventBus.on(BuildUnitIntentEvent, (event) => {
      if (this.current.unit === event.unit) this.complete(this.current.id);
      if (
        event.unit === UnitType.AtomBomb ||
        event.unit === UnitType.HydrogenBomb
      )
        this.complete("rocket");
    });

    // Keep the first expansion readable with a small default attack ratio.
    if (this.uiState.attackRatio !== TUTORIAL_ATTACK_RATIO) {
      this.eventBus.emit(
        new AttackRatioEvent(
          (TUTORIAL_ATTACK_RATIO - this.uiState.attackRatio) * 100,
        ),
      );
    }
  }

  getTickIntervalMs() {
    return 100;
  }

  tick() {
    if (!this.active || !this.game.myPlayer()) return;
    const player = this.game.myPlayer()!;
    if (this.current.id === "spawn" && player.hasSpawned()) {
      this.baselineTiles = player.numTilesOwned();
      this.complete("spawn");
    } else if (
      this.current.id === "expand" &&
      performance.now() >= this.expandActionAt &&
      this.hasNeighboringEnemy()
    ) {
      this.complete("expand");
    }
  }

  stop() {
    this.active = false;
    if (this.refreshTimer !== undefined)
      window.clearInterval(this.refreshTimer);
    window.removeEventListener("pointerdown", this.guardPointerDown, true);
    window.removeEventListener("pointermove", this.guardPointerMove, true);
    window.removeEventListener("wheel", this.guardWheel, true);
    window.removeEventListener("keydown", this.guardKeyDown, true);
    window.removeEventListener("gesturechange", this.guardGesture, true);
    window.removeEventListener("gesturestart", this.guardGesture, true);
    window.removeEventListener("gestureend", this.guardGesture, true);
  }

  private get current() {
    return STEPS[this.stepIndex];
  }

  private complete(id: string) {
    if (!this.active || this.current.id !== id) return;
    if (id === "spawn")
      this.baselineTiles = this.game.myPlayer()?.numTilesOwned() ?? 0;
    if (this.stepIndex >= STEPS.length - 1) {
      this.finish();
      return;
    }
    this.stepIndex += 1;
    localStorage.setItem(STEP_KEY, String(this.stepIndex));
    this.rect = null;
    this.requestUpdate();
  }

  private finish() {
    this.stop();
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.setItem(COMPLETED_KEY, "true");
    localStorage.removeItem(STEP_KEY);
    this.requestUpdate();
  }

  private skip() {
    if (!window.confirm("Skip the tutorial? You can replay it from Help."))
      return;
    this.stop();
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.setItem(SKIPPED_KEY, "true");
    localStorage.removeItem(STEP_KEY);
    this.requestUpdate();
  }

  private pointInRect(x: number, y: number) {
    return Boolean(
      this.rect &&
      x >= this.rect.left &&
      x <= this.rect.right &&
      y >= this.rect.top &&
      y <= this.rect.bottom,
    );
  }

  private canInteractAt(x: number, y: number, event: Event) {
    if (
      event
        .composedPath()
        .some(
          (node) => node instanceof Element && node.classList.contains("skip"),
        )
    ) {
      return true;
    }
    if (this.current.id === "zoom") return false;
    if (this.current.mapTarget) return this.pointInRect(x, y);
    const selector = this.current.target
      ? `[data-tutorial-target="${this.current.target}"]`
      : this.current.unit
        ? `[data-tutorial-unit="${this.current.unit}"]`
        : null;
    if (!selector) return false;
    return event
      .composedPath()
      .some((node) => node instanceof Element && node.matches(selector));
  }

  private findTarget(): DOMRect {
    const selector = this.current.target
      ? `[data-tutorial-target="${this.current.target}"]`
      : this.current.unit
        ? `[data-tutorial-unit="${this.current.unit}"]`
        : "";
    const element = selector ? this.findElement(selector) : null;
    if (element) return element.getBoundingClientRect();

    if (this.current.mapTarget) {
      const mapTarget = this.findMapTarget();
      if (mapTarget) return mapTarget;
    }

    const width = this.current.id === "leaderboard" ? 58 : 116;
    const height = this.current.id === "leaderboard" ? 58 : 116;
    return new DOMRect(
      window.innerWidth * 0.5 - width / 2,
      window.innerHeight * 0.44 - height / 2,
      width,
      height,
    );
  }

  private findMapTarget(): DOMRect | null {
    if (!this.transformHandler || !this.game.myPlayer()) return null;
    const player = this.game.myPlayer()!;
    const wantsEmptyLand = ["expand", "spawn"].includes(this.current.id);
    const wantsWater = this.current.id === "warship";
    const wantsEnemy = ["attack", "ally", "rocket"].includes(this.current.id);
    if (!wantsEnemy) this.attackTargetID = null;
    // Keep map pointers out of the persistent HUD: the leaderboard occupies
    // the upper-left, the control panel the bottom edge, and the match
    // controls the upper-right.
    const left = wantsEnemy
      ? 80
      : Math.max(150, Math.min(430, window.innerWidth * 0.34));
    const right = wantsEnemy
      ? window.innerWidth - 80
      : Math.max(left, window.innerWidth - 150);
    const top = wantsEnemy ? 100 : Math.max(140, window.innerHeight * 0.2);
    const bottom = wantsEnemy
      ? window.innerHeight - 140
      : Math.max(top, window.innerHeight - 180);
    const targetX = window.innerWidth * 0.5;
    const targetY = window.innerHeight * 0.46;
    let best: { rect: DOMRect; score: number; targetID: string | null } | null =
      null;

    for (let y = top; y <= bottom; y += 24) {
      for (let x = left; x <= right; x += 24) {
        const cell = this.transformHandler.screenToWorldCoordinates(x, y);
        if (!this.game.isValidCoord(cell.x, cell.y)) continue;
        const tile = this.game.ref(cell.x, cell.y);
        if (wantsWater && !this.game.isWater(tile)) continue;
        if (wantsEmptyLand && !this.isOpenLand(cell.x, cell.y, tile)) continue;
        if (
          wantsEnemy &&
          (!this.game.hasOwner(tile) ||
            this.game.ownerID(tile) === player.smallID() ||
            !this.isNearPlayer(cell.x, cell.y))
        )
          continue;
        if (
          !wantsWater &&
          !wantsEmptyLand &&
          !wantsEnemy &&
          !this.game.isLand(tile)
        )
          continue;
        if (this.game.isImpassable(tile)) continue;
        const score = Math.hypot(x - targetX, y - targetY);
        if (!best || score < best.score) {
          const owner = this.game.playerBySmallID(this.game.ownerID(tile));
          best = {
            rect: new DOMRect(x - 38, y - 38, 76, 76),
            score,
            targetID: owner.isPlayer() ? owner.id() : null,
          };
        }
      }
    }
    if (wantsEnemy) this.attackTargetID = best?.targetID ?? null;
    return best?.rect ?? null;
  }

  private hasNeighboringEnemy() {
    if (!this.transformHandler || !this.game.myPlayer()) return false;
    const playerID = this.game.myPlayer()!.smallID();
    for (let y = 100; y <= window.innerHeight - 140; y += 18) {
      for (let x = 80; x <= window.innerWidth - 80; x += 18) {
        const cell = this.transformHandler.screenToWorldCoordinates(x, y);
        if (!this.game.isValidCoord(cell.x, cell.y)) continue;
        const tile = this.game.ref(cell.x, cell.y);
        if (
          this.game.hasOwner(tile) &&
          this.game.ownerID(tile) !== playerID &&
          this.isNearPlayer(cell.x, cell.y)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private isNearPlayer(x: number, y: number) {
    const playerID = this.game.myPlayer()?.smallID();
    if (playerID === undefined) return false;
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.game.isValidCoord(nx, ny)) continue;
        if (this.game.ownerID(this.game.ref(nx, ny)) === playerID) return true;
      }
    }
    return false;
  }

  private refreshTarget() {
    if (!this.active) return;
    const next = this.findTarget();
    if (
      !this.rect ||
      Math.abs(this.rect.x - next.x) > 1 ||
      Math.abs(this.rect.y - next.y) > 1 ||
      Math.abs(this.rect.width - next.width) > 1
    ) {
      this.rect = next;
      this.requestUpdate();
    }
  }

  private findElement(selector: string): Element | null {
    const direct = document.querySelector(selector);
    if (direct) return direct;

    const roots: (Document | ShadowRoot)[] = [document];
    while (roots.length > 0) {
      const root = roots.shift()!;
      for (const element of Array.from(root.querySelectorAll("*"))) {
        if (!element.shadowRoot) continue;
        const match = element.shadowRoot.querySelector(selector);
        if (match) return match;
        roots.push(element.shadowRoot);
      }
    }
    return null;
  }

  private isOpenLand(x: number, y: number, tile: ReturnType<GameView["ref"]>) {
    if (!this.game.isLand(tile) || this.game.hasOwner(tile)) return false;
    // Do not point at a shoreline, border, label, or a one-tile pocket. The
    // player gets a genuinely readable empty patch to tap.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!this.game.isValidCoord(nx, ny)) return false;
        const neighbor = this.game.ref(nx, ny);
        if (!this.game.isLand(neighbor) || this.game.hasOwner(neighbor)) {
          return false;
        }
      }
    }
    return !this.game.isImpassable(tile);
  }

  private isMapStep() {
    return Boolean(this.current.mapTarget);
  }

  render() {
    if (!this.active || !this.rect) return html``;
    const isMapStep = this.isMapStep();
    const spotlightWidth = isMapStep ? 76 : this.rect.width + 24;
    const spotlightHeight = isMapStep
      ? 76
      : Math.max(48, this.rect.height + 32);
    const spotlightLeft = isMapStep ? this.rect.left : this.rect.left - 12;
    const spotlightTop = isMapStep
      ? this.rect.top
      : this.rect.top - (spotlightHeight - this.rect.height) / 2;
    return html`
      <div class="veil"></div>
      <div class="progress">${this.stepIndex + 1} / ${STEPS.length}</div>
      <div
        class="spotlight"
        style="left:${spotlightLeft}px;top:${spotlightTop}px;width:${spotlightWidth}px;height:${spotlightHeight}px;border-radius:${isMapStep
          ? "50%"
          : "18px"}"
      ></div>
      <div class="hint">${this.current.copy}</div>
      <button class="skip" @click=${this.skip}>Skip tutorial</button>
    `;
  }
}
