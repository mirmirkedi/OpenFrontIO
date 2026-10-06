import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { Cell, GameType, UnitType } from "../../../core/game/Game";
import type { Controller } from "../../Controller";
import {
  AttackRatioEvent,
  ReplaySpeedChangeEvent,
  ZOOM_DELTA_DIVISOR,
  ZoomEvent,
} from "../../InputHandler";
import type { TransformHandler } from "../../TransformHandler";
import { GoToPlayerEvent } from "../../TransformHandler";
import {
  BuildUnitIntentEvent,
  PauseGameIntentEvent,
  SendAllianceRequestIntentEvent,
  SendAttackIntentEvent,
  SendSpawnIntentEvent,
  SendWinnerEvent,
} from "../../Transport";
import type { UIState } from "../../UIState";
import { translateText } from "../../Utils";
import type { GameView } from "../../view";

const ACTIVE_KEY = "openfront.tutorial.active";
const COMPLETED_KEY = "openfront.tutorial.completed";
const SKIPPED_KEY = "openfront.tutorial.skipped";
const STEP_KEY = "openfront.tutorial.step";
const TUTORIAL_ZOOM_SCALE = 4.0;
const TUTORIAL_ATTACK_RATIO = 0.15;
const TARGET_REFRESH_INTERVAL_MS = 300;

type TutorialStep = {
  id: string;
  title: string;
  hint: string;
  target?: string;
  unit?: UnitType;
  mapTarget?: boolean;
};

type TutorialPlayer = NonNullable<ReturnType<GameView["myPlayer"]>>;
const BORDER_REFRESH_INTERVAL_MS = 500;

const STEPS: TutorialStep[] = [
  {
    id: "zoom",
    title: "tutorial.step.zoom.title",
    hint: "tutorial.step.zoom.hint",
    mapTarget: true,
  },
  {
    id: "spawn",
    title: "tutorial.step.spawn.title",
    hint: "tutorial.step.spawn.hint",
    mapTarget: true,
  },
  {
    id: "expand",
    title: "tutorial.step.expand.title",
    hint: "tutorial.step.expand.hint",
    mapTarget: true,
  },
  {
    id: "attack",
    title: "tutorial.step.attack.title",
    hint: "tutorial.step.attack.hint",
    mapTarget: true,
  },
  {
    id: "speed",
    title: "tutorial.step.speed.title",
    hint: "tutorial.step.speed.hint",
    target: "replay",
  },
  {
    id: "pause",
    title: "tutorial.step.pause.title",
    hint: "tutorial.step.pause.hint",
    target: "pause",
  },
  {
    id: "city",
    title: "tutorial.step.city.title",
    hint: "tutorial.step.city.hint",
    unit: UnitType.City,
    mapTarget: true,
  },
  {
    id: "factory",
    title: "tutorial.step.factory.title",
    hint: "tutorial.step.factory.hint",
    unit: UnitType.Factory,
    mapTarget: true,
  },
  {
    id: "defense",
    title: "tutorial.step.defense.title",
    hint: "tutorial.step.defense.hint",
    unit: UnitType.DefensePost,
    mapTarget: true,
  },
  {
    id: "ally",
    title: "tutorial.step.ally.title",
    hint: "tutorial.step.ally.hint",
    mapTarget: true,
  },
  {
    id: "port",
    title: "tutorial.step.port.title",
    hint: "tutorial.step.port.hint",
    unit: UnitType.Port,
    mapTarget: true,
  },
  {
    id: "warship",
    title: "tutorial.step.warship.title",
    hint: "tutorial.step.warship.hint",
    unit: UnitType.Warship,
    mapTarget: true,
  },
  {
    id: "silo",
    title: "tutorial.step.silo.title",
    hint: "tutorial.step.silo.hint",
    unit: UnitType.MissileSilo,
    mapTarget: true,
  },
  {
    id: "rocket",
    title: "tutorial.step.rocket.title",
    hint: "tutorial.step.rocket.hint",
    mapTarget: true,
  },
  {
    id: "sam",
    title: "tutorial.step.sam.title",
    hint: "tutorial.step.sam.hint",
    unit: UnitType.SAMLauncher,
    mapTarget: true,
  },
  {
    id: "leaderboard",
    title: "tutorial.step.leaderboard.title",
    hint: "tutorial.step.leaderboard.hint",
    target: "leaderboard",
  },
  {
    id: "win",
    title: "tutorial.step.win.title",
    hint: "tutorial.step.win.hint",
    mapTarget: true,
  },
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
    @media (prefers-reduced-motion: reduce) {
      .spotlight,
      .hint {
        transition: none;
      }
    }
    .hint {
      position: fixed;
      top: max(56px, calc(env(safe-area-inset-top) + 46px));
      left: 50%;
      width: min(380px, calc(100vw - 32px));
      box-sizing: border-box;
      padding: 10px 14px 12px;
      border: 1px solid rgba(128, 220, 255, 0.28);
      border-radius: 12px;
      background: rgba(5, 25, 41, 0.94);
      color: #eaf8ff;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
      text-align: center;
      transform: translateX(-50%);
      white-space: normal;
      transition: top 0.22s ease-out;
    }
    .progress {
      display: block;
      margin-bottom: 5px;
      color: #83dfff;
      font:
        700 10px/1.2 Inter,
        system-ui,
        sans-serif;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .step-title {
      display: block;
      margin-bottom: 4px;
      color: #fff;
      font:
        700 14px/1.25 Inter,
        system-ui,
        sans-serif;
    }
    .step-copy {
      display: block;
      color: rgba(234, 248, 255, 0.9);
      font:
        500 13px/1.35 Inter,
        system-ui,
        sans-serif;
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
    .skip:hover,
    .zoom-assist:hover {
      color: white;
      border-color: rgba(128, 220, 255, 0.55);
    }
    .zoom-assist {
      position: fixed;
      right: max(12px, env(safe-area-inset-right));
      bottom: max(68px, calc(env(safe-area-inset-bottom) + 68px));
      pointer-events: auto;
      padding: 7px 10px;
      border: 1px solid rgba(128, 220, 255, 0.42);
      border-radius: 8px;
      background: rgba(5, 25, 41, 0.92);
      color: #aeeaff;
      font:
        700 10px/1 Inter,
        system-ui,
        sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
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
  private refreshTimer: number | undefined;
  private zoomAnimationFrame: number | undefined;
  private lockedZoomScale: number | null = null;
  private zoomCenterWorld: { x: number; y: number } | null = null;
  private tutorialGestureScale: number | null = null;
  private pauseStepPaused = false;
  private tutorialAllowedPointers = new Set<number>();
  private enemyBorderTiles: ReadonlySet<number> = new Set();
  private adjacentEnemyTiles: ReadonlySet<number> = new Set();
  private adjacentUnownedLandTiles: ReadonlySet<number> = new Set();
  private mapActionMenuAllowed = false;
  private borderTilesRequest: Promise<void> | null = null;
  private nextBorderTilesRefreshAt = Number.NEGATIVE_INFINITY;
  private expandActionAt = Number.POSITIVE_INFINITY;
  private nextNeighborScanAt = Number.NEGATIVE_INFINITY;

  private readonly guardPointerDown = (event: PointerEvent) => {
    // Let map touches reach InputHandler so it can recognize pinch gestures.
    // A touch on a HUD control must not activate that control during the lesson.
    if (
      this.active &&
      this.current.id === "zoom" &&
      event.pointerType === "touch"
    ) {
      if (this.canInteractAt(event.clientX, event.clientY, event)) return;
      if (this.isCanvasEvent(event)) {
        this.tutorialAllowedPointers.add(event.pointerId);
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!this.active) return;
    if (this.current.mapTarget && this.isCanvasEvent(event)) {
      this.mapActionMenuAllowed = this.isValidMapActionAt(
        event.clientX,
        event.clientY,
      );
    }
    if (this.canInteractAt(event.clientX, event.clientY, event)) {
      // Once a gesture starts on an allowed target, let it finish outside the
      // spotlight. This keeps map panning smooth without enabling stray taps.
      this.tutorialAllowedPointers.add(event.pointerId);
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly guardPointerEnd = (event: PointerEvent) => {
    this.tutorialAllowedPointers.delete(event.pointerId);
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
    if (event.code === "Enter" || event.code === "Space") {
      if (
        this.current.id === "leaderboard" &&
        event
          .composedPath()
          .some(
            (node) =>
              node instanceof Element &&
              node.matches('[data-tutorial-target="leaderboard"]'),
          )
      ) {
        this.complete("leaderboard");
        return;
      }
      if (!this.canInteractAt(0, 0, event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }
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

  private readonly guardClick = (event: MouseEvent) => {
    if (!this.active) return;
    if (
      this.current.id === "leaderboard" &&
      event
        .composedPath()
        .some(
          (node) =>
            node instanceof Element &&
            node.matches('[data-tutorial-target="leaderboard"]'),
        )
    ) {
      this.complete("leaderboard");
      return;
    }
    if (!this.canInteractAt(event.clientX, event.clientY, event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  private readonly guardPointerMove = (event: PointerEvent) => {
    if (
      this.active &&
      this.current.id === "zoom" &&
      event.pointerType === "touch"
    ) {
      if (this.tutorialAllowedPointers.has(event.pointerId)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (
      this.active &&
      this.current.id !== "zoom" &&
      event.pointerType === "touch" &&
      this.tutorialAllowedPointers.size > 1
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (
      !this.active ||
      this.tutorialAllowedPointers.has(event.pointerId) ||
      this.canInteractAt(event.clientX, event.clientY, event)
    )
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

  private zoomForMe = () => {
    if (!this.active || this.current.id !== "zoom") return;
    if (this.zoomAnimationFrame !== undefined) {
      cancelAnimationFrame(this.zoomAnimationFrame);
    }
    const startScale = this.transformHandler.scale;
    if (startScale >= TUTORIAL_ZOOM_SCALE) {
      this.eventBus.emit(
        new ZoomEvent(window.innerWidth / 2, window.innerHeight / 2, 0),
      );
      return;
    }
    this.captureZoomCenter();
    const startedAt = performance.now();
    const duration = 260;
    const animate = () => {
      if (!this.active || this.current.id !== "zoom") {
        this.zoomAnimationFrame = undefined;
        return;
      }
      const progress = Math.min(1, (performance.now() - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const desiredScale =
        startScale + (TUTORIAL_ZOOM_SCALE - startScale) * eased;
      const scale = this.transformHandler.scale;
      const delta = ZOOM_DELTA_DIVISOR * (scale / desiredScale - 1);
      this.eventBus.emit(
        new ZoomEvent(window.innerWidth / 2, window.innerHeight / 2, delta),
      );
      if (progress < 1 && this.current.id === "zoom") {
        this.zoomAnimationFrame = requestAnimationFrame(animate);
      } else {
        this.zoomAnimationFrame = undefined;
      }
    };
    this.zoomAnimationFrame = requestAnimationFrame(animate);
  };

  private chooseStartingPoint = () => {
    if (!this.active || this.current.id !== "spawn") return;
    const target = this.findMapTarget();
    if (!target) return;
    const cell = this.transformHandler.screenToWorldCoordinates(
      target.left + target.width / 2,
      target.top + target.height / 2,
    );
    if (!this.game.isValidCoord(cell.x, cell.y)) return;
    const tile = this.game.ref(cell.x, cell.y);
    if (!this.isOpenLand(cell.x, cell.y, tile)) return;
    this.eventBus.emit(new SendSpawnIntentEvent(tile));
  };

  private expandForMe = () => {
    if (!this.active || this.current.id !== "expand") return;
    const player = this.game.myPlayer();
    if (!player) return;
    this.eventBus.emit(
      new SendAttackIntentEvent(
        null,
        player.troops() * this.uiState.attackRatio,
      ),
    );
  };

  private attackForMe = () => {
    if (!this.active || this.current.id !== "attack") return;
    const player = this.game.myPlayer();
    const target = this.findMapTarget();
    if (!player || !target) return;
    const cell = this.transformHandler.screenToWorldCoordinates(
      target.left + target.width / 2,
      target.top + target.height / 2,
    );
    if (!this.game.isValidCoord(cell.x, cell.y)) return;
    const tile = this.game.ref(cell.x, cell.y);
    if (!this.game.hasOwner(tile)) return;
    const owner = this.game.owner(tile);
    if (owner.smallID() === player.smallID()) return;
    this.eventBus.emit(
      new SendAttackIntentEvent(
        owner.id(),
        player.troops() * this.uiState.attackRatio,
      ),
    );
  };

  init() {
    const isSinglePlayer =
      this.game.config().gameConfig().gameType === GameType.Singleplayer;
    this.active = isSinglePlayer && localStorage.getItem(ACTIVE_KEY) === "true";
    if (!this.active) return;

    this.stepIndex = Math.max(
      0,
      Math.min(STEPS.length - 1, Number(localStorage.getItem(STEP_KEY) ?? 0)),
    );
    this.refreshTimer = window.setInterval(
      () => this.refreshTarget(),
      TARGET_REFRESH_INTERVAL_MS,
    );
    window.addEventListener("pointerdown", this.guardPointerDown, true);
    window.addEventListener("pointermove", this.guardPointerMove, true);
    window.addEventListener("pointerup", this.guardPointerEnd, true);
    window.addEventListener("pointercancel", this.guardPointerEnd, true);
    window.addEventListener("click", this.guardClick, true);
    window.addEventListener("wheel", this.guardWheel, {
      capture: true,
      passive: false,
    });
    window.addEventListener("keydown", this.guardKeyDown, true);
    window.addEventListener("gesturechange", this.guardGesture, true);
    window.addEventListener("gesturestart", this.guardGesture, true);
    window.addEventListener("gestureend", this.guardGesture, true);

    this.eventBus.on(ZoomEvent, (event) => {
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
        this.complete("zoom");
      } else if (this.lockedZoomScale !== null) {
        const worldAnchor = this.transformHandler.screenToWorldCoordinatesFloat(
          event.x,
          event.y,
        );
        const canvasAnchor = this.transformHandler.screenToCanvasCoordinates(
          event.x,
          event.y,
        );
        this.transformHandler.scale = this.lockedZoomScale;
        this.transformHandler.offsetX =
          worldAnchor.x -
          this.game.width() / 2 -
          (canvasAnchor.x - this.game.width() / 2) / this.lockedZoomScale;
        this.transformHandler.offsetY =
          worldAnchor.y -
          this.game.height() / 2 -
          (canvasAnchor.y - this.game.height() / 2) / this.lockedZoomScale;
      }
    });
    this.eventBus.on(SendAttackIntentEvent, (event) => {
      if (this.current.id === "expand") {
        this.expandActionAt = performance.now() + 2500;
      } else if (this.current.id === "attack" && event.targetID !== null) {
        // The spotlight is refreshed while the map grows, so the rendered
        // country can move by a few tiles between the hint and the tap. Any
        // real ground attack here is therefore the intentional tutorial step.
        this.complete("attack");
      }
    });
    this.eventBus.on(SendAllianceRequestIntentEvent, () =>
      this.complete("ally"),
    );
    this.eventBus.on(PauseGameIntentEvent, (event) => {
      if (this.current.id !== "pause") return;
      if (event.paused) {
        this.pauseStepPaused = true;
        this.requestUpdate();
      } else if (this.pauseStepPaused) {
        this.complete("pause");
      }
    });
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
      this.complete("spawn");
    } else if (
      this.current.id === "expand" &&
      performance.now() >= this.expandActionAt &&
      performance.now() >= this.nextNeighborScanAt
    ) {
      this.nextNeighborScanAt = performance.now() + 400;
      if (this.hasNeighboringEnemy()) this.complete("expand");
    }
  }

  stop() {
    this.active = false;
    if (this.refreshTimer !== undefined)
      window.clearInterval(this.refreshTimer);
    if (this.zoomAnimationFrame !== undefined)
      cancelAnimationFrame(this.zoomAnimationFrame);
    window.removeEventListener("pointerdown", this.guardPointerDown, true);
    window.removeEventListener("pointermove", this.guardPointerMove, true);
    window.removeEventListener("pointerup", this.guardPointerEnd, true);
    window.removeEventListener("pointercancel", this.guardPointerEnd, true);
    window.removeEventListener("click", this.guardClick, true);
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
    if (id === "expand") this.zoomOutForAttackStep();
    if (this.stepIndex >= STEPS.length - 1) {
      this.finish();
      return;
    }
    this.stepIndex += 1;
    this.mapActionMenuAllowed = false;
    this.pauseStepPaused = false;
    this.tutorialAllowedPointers.clear();
    localStorage.setItem(STEP_KEY, String(this.stepIndex));
    this.rect = null;
    this.requestUpdate();
  }

  private zoomOutForAttackStep() {
    const player = this.game.myPlayer();
    if (!player) return;
    this.lockedZoomScale = Math.max(0.2, this.transformHandler.scale * 0.75);
    this.eventBus.emit(new GoToPlayerEvent(player, this.lockedZoomScale));
  }

  private finish() {
    this.stop();
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.setItem(COMPLETED_KEY, "true");
    localStorage.removeItem(STEP_KEY);
    this.requestUpdate();
  }

  private skip() {
    if (!window.confirm(translateText("tutorial.skip.confirm"))) return;
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

  private currentTargetSelector() {
    if (this.current.id === "speed") {
      const speedSelector = '[data-tutorial-target="replay-speed"]';
      if (this.isVisibleElement(speedSelector)) return speedSelector;
      return '[data-tutorial-target="replay"]';
    }
    if (this.current.target)
      return `[data-tutorial-target="${this.current.target}"]`;
    if (this.current.unit) return `[data-tutorial-unit="${this.current.unit}"]`;
    return null;
  }

  private isVisibleElement(selector: string) {
    const element = this.findElement(selector);
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      getComputedStyle(element).visibility !== "hidden" &&
      getComputedStyle(element).display !== "none" &&
      getComputedStyle(element).opacity !== "0"
    );
  }

  private isActionMenuEvent(event: Event) {
    return event
      .composedPath()
      .some(
        (node) =>
          node instanceof Element &&
          node.closest(".radial-menu-container, .build-menu") !== null,
      );
  }

  private canInteractAt(x: number, y: number, event: Event) {
    if (
      event
        .composedPath()
        .some(
          (node) =>
            node instanceof Element &&
            (node.classList.contains("skip") ||
              node.classList.contains("zoom-assist")),
        )
    ) {
      return true;
    }
    if (this.current.id === "zoom") return false;
    if (this.current.id === "spawn") {
      return this.isCanvasEvent(event) && this.isValidMapActionAt(x, y);
    }
    if (this.current.mapTarget) {
      if (this.isActionMenuEvent(event)) return this.mapActionMenuAllowed;
      return (
        this.pointInRect(x, y) &&
        this.isCanvasEvent(event) &&
        this.isValidMapActionAt(x, y)
      );
    }
    if (this.current.unit) {
      const selector = `[data-tutorial-unit="${this.current.unit}"]`;
      if (this.isVisibleElement(selector)) {
        return (
          this.isActionMenuEvent(event) ||
          event
            .composedPath()
            .some((node) => node instanceof Element && node.matches(selector))
        );
      }
      return event
        .composedPath()
        .some(
          (node) =>
            node instanceof HTMLCanvasElement ||
            (node instanceof Element &&
              node.closest(".radial-menu-container, .build-menu") !== null),
        );
    }
    const selector = this.currentTargetSelector();
    if (!selector) return false;
    return event
      .composedPath()
      .some((node) => node instanceof Element && node.matches(selector));
  }

  private findTarget(): DOMRect {
    const selector = this.currentTargetSelector();
    const element = selector ? this.findElement(selector) : null;
    if (element && this.isVisibleElement(selector!))
      return element.getBoundingClientRect();

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
    if (!this.transformHandler) return null;
    const player = this.game.myPlayer();
    if (!player && this.current.id !== "spawn") return null;
    if (
      player &&
      this.current.unit === UnitType.Port &&
      !this.hasCoastalTerritory(player)
    ) {
      return this.findAdjacentOpenLandTarget(player, true);
    }
    if (this.current.id === "expand" && player) {
      return this.findAdjacentOpenLandTarget(player);
    }
    const wantsEmptyLand = ["expand", "spawn"].includes(this.current.id);
    const wantsEnemy = ["attack", "ally", "rocket", "win"].includes(
      this.current.id,
    );
    const wantsOwnedLand = this.current.unit !== undefined;
    if (wantsEnemy) {
      return player ? this.findNeighborEnemyTarget(player) : null;
    }
    // Keep map pointers out of the persistent HUD: the leaderboard occupies
    // the upper-left, the control panel the bottom edge, and the match
    // controls the upper-right.
    const left = Math.max(150, Math.min(430, window.innerWidth * 0.34));
    const right = Math.max(left, window.innerWidth - 150);
    const top = Math.max(140, window.innerHeight * 0.2);
    const bottom = Math.max(top, window.innerHeight - 180);
    const targetX = window.innerWidth * 0.5;
    const targetY = window.innerHeight * 0.46;
    let best: { rect: DOMRect; score: number } | null = null;

    const mapStep = 24;
    for (let y = top; y <= bottom; y += mapStep) {
      for (let x = left; x <= right; x += mapStep) {
        const cell = this.transformHandler.screenToWorldCoordinates(x, y);
        if (!this.game.isValidCoord(cell.x, cell.y)) continue;
        const tile = this.game.ref(cell.x, cell.y);
        if (
          wantsOwnedLand &&
          (!player || this.game.ownerID(tile) !== player.smallID())
        )
          continue;
        if (this.current.unit === UnitType.Port && !this.game.isShore(tile))
          continue;
        if (wantsEmptyLand && !this.isOpenLand(cell.x, cell.y, tile)) continue;
        if (!wantsEmptyLand && !wantsEnemy && !this.game.isLand(tile)) continue;
        if (this.game.isImpassable(tile)) continue;
        const score = Math.hypot(x - targetX, y - targetY);
        if (!best || score < best.score) {
          best = {
            rect: new DOMRect(x - 38, y - 38, 76, 76),
            score,
          };
        }
      }
    }
    return best?.rect ?? null;
  }

  private findAdjacentOpenLandTarget(
    player: TutorialPlayer,
    preferCoast = false,
  ): DOMRect | null {
    const left = Math.max(150, Math.min(430, window.innerWidth * 0.34));
    const right = Math.max(left, window.innerWidth - 150);
    const top = Math.max(140, window.innerHeight * 0.2);
    const bottom = Math.max(top, window.innerHeight - 180);
    const centerX = window.innerWidth * 0.5;
    const centerY = window.innerHeight * 0.46;
    let best: { rect: DOMRect; score: number } | null = null;

    for (const tile of this.adjacentUnownedLandTiles) {
      const x = this.game.x(tile);
      const y = this.game.y(tile);
      const point = this.transformHandler.worldToScreenCoordinates(
        new Cell(x + 0.5, y + 0.5),
      );
      if (
        point.x < left ||
        point.x > right ||
        point.y < top ||
        point.y > bottom
      ) {
        continue;
      }
      const coastPriority =
        preferCoast && !this.game.isShore(tile) ? 10_000 : 0;
      const score =
        coastPriority + Math.hypot(point.x - centerX, point.y - centerY);
      if (!best || score < best.score) {
        best = { rect: new DOMRect(point.x - 38, point.y - 38, 76, 76), score };
      }
    }
    return best?.rect ?? null;
  }

  private findNeighborEnemyTarget(player: TutorialPlayer) {
    const left = 80;
    const right = Math.max(left, window.innerWidth - 80);
    const top = 100;
    const bottom = Math.max(top, window.innerHeight - 140);
    const centerX = window.innerWidth * 0.5;
    const centerY = window.innerHeight * 0.46;
    let best: { rect: DOMRect; score: number } | null = null;

    for (const tile of this.adjacentEnemyTiles) {
      const point = this.transformHandler.worldToScreenCoordinates(
        new Cell(this.game.x(tile) + 0.5, this.game.y(tile) + 0.5),
      );
      if (
        point.x < left ||
        point.x > right ||
        point.y < top ||
        point.y > bottom
      ) {
        continue;
      }
      const score = Math.hypot(point.x - centerX, point.y - centerY);
      if (!best || score < best.score) {
        best = { rect: new DOMRect(point.x - 38, point.y - 38, 76, 76), score };
      }
    }
    return best?.rect ?? null;
  }

  private hasNeighboringEnemy() {
    const player = this.game.myPlayer();
    return Boolean(player && this.hasNeighboringEnemyTile(player));
  }

  private hasNeighboringEnemyTile(_player: TutorialPlayer) {
    return this.adjacentEnemyTiles.size > 0;
  }

  private cacheAdjacentTargets(
    player: TutorialPlayer,
    borderTiles: ReadonlySet<number>,
  ) {
    const enemies = new Set<number>();
    const unownedLand = new Set<number>();
    for (const borderTile of borderTiles) {
      for (const tile of this.game.neighbors(borderTile)) {
        if (!this.game.isLand(tile) || this.game.isImpassable(tile)) continue;
        if (this.game.hasOwner(tile)) {
          if (this.game.ownerID(tile) !== player.smallID()) enemies.add(tile);
        } else if (!this.game.hasFallout(tile)) {
          unownedLand.add(tile);
        }
      }
    }
    this.enemyBorderTiles = borderTiles;
    this.adjacentEnemyTiles = enemies;
    this.adjacentUnownedLandTiles = unownedLand;
  }

  private isCanvasEvent(event: Event) {
    return event
      .composedPath()
      .some((node) => node instanceof HTMLCanvasElement);
  }

  private isValidMapActionAt(x: number, y: number) {
    if (!this.transformHandler) return false;
    const cell = this.transformHandler.screenToWorldCoordinates(x, y);
    if (!this.game.isValidCoord(cell.x, cell.y)) return false;
    const tile = this.game.ref(cell.x, cell.y);

    // Before the first spawn the human player does not exist in GameView yet.
    // Validate the spawn tile directly, matching ClientGameRunner's spawn
    // acceptance rules instead of requiring myPlayer() to be available.
    if (this.current.id === "spawn") {
      return this.isOpenLand(cell.x, cell.y, tile);
    }

    const player = this.game.myPlayer();
    if (!player) return false;
    switch (this.current.id) {
      case "expand":
        return this.adjacentUnownedLandTiles.has(tile);
      case "attack":
      case "ally":
      case "rocket":
      case "win":
        return this.adjacentEnemyTiles.has(tile);
      case "port":
        return this.hasCoastalTerritory(player)
          ? this.game.ownerID(tile) === player.smallID() &&
              this.game.isShore(tile)
          : this.adjacentUnownedLandTiles.has(tile);
      default:
        return this.current.unit === undefined
          ? true
          : this.game.ownerID(tile) === player.smallID();
    }
  }

  private hasCoastalTerritory(player: TutorialPlayer) {
    for (const tile of this.enemyBorderTiles) {
      if (
        this.game.ownerID(tile) === player.smallID() &&
        this.game.isShore(tile)
      ) {
        return true;
      }
    }
    return false;
  }

  private refreshTarget() {
    if (!this.active) return;
    const player = this.game.myPlayer();
    if (player) this.refreshBorderTiles(player);
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

  private refreshBorderTiles(player: TutorialPlayer) {
    const needsBorders = [
      "expand",
      "attack",
      "ally",
      "port",
      "rocket",
      "win",
    ].includes(this.current.id);
    if (!needsBorders || this.borderTilesRequest) return;
    const now = performance.now();
    if (now < this.nextBorderTilesRefreshAt) return;
    this.nextBorderTilesRefreshAt = now + BORDER_REFRESH_INTERVAL_MS;
    this.borderTilesRequest = player
      .borderTiles()
      .then((result) => {
        if (!this.active || this.game.myPlayer()?.id() !== player.id()) return;
        this.cacheAdjacentTargets(player, result.borderTiles);
        this.refreshTarget();
      })
      .catch(() => undefined)
      .finally(() => {
        this.borderTilesRequest = null;
      });
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

  private currentHintKey() {
    if (this.current.id === "pause" && this.pauseStepPaused) {
      return "tutorial.step.pause.resume";
    }
    if (
      this.current.id === "port" &&
      this.game.myPlayer() &&
      !this.hasCoastalTerritory(this.game.myPlayer()!)
    ) {
      return "tutorial.step.port.expand";
    }
    return this.current.hint;
  }

  private hintTop() {
    if (!this.rect || !this.isMapStep()) {
      return "max(56px, calc(env(safe-area-inset-top) + 46px))";
    }

    const safeTop = Math.max(56, (window.visualViewport?.offsetTop ?? 0) + 46);
    const hintHeight = 128;
    const bottomReserve = 136;
    const above = this.rect.top - hintHeight;
    if (above >= safeTop) return `${above}px`;

    const below = this.rect.top + 88;
    if (below + hintHeight <= window.innerHeight - bottomReserve) {
      return `${below}px`;
    }

    return `${Math.max(safeTop, window.innerHeight - bottomReserve - hintHeight)}px`;
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
      <div
        class="spotlight"
        style="left:${spotlightLeft}px;top:${spotlightTop}px;width:${spotlightWidth}px;height:${spotlightHeight}px;border-radius:${isMapStep
          ? "50%"
          : "18px"}"
      ></div>
      <div
        class="hint"
        style="top:${this.hintTop()}"
        role="status"
        aria-live="polite"
      >
        <span class="progress"
          >${translateText("tutorial.progress", {
            current: this.stepIndex + 1,
            total: STEPS.length,
          })}</span
        >
        <strong class="step-title">${translateText(this.current.title)}</strong>
        <span class="step-copy">${translateText(this.currentHintKey())}</span>
      </div>
      <button class="skip" @click=${this.skip}>
        ${translateText("tutorial.skip")}
      </button>
      ${this.current.id === "zoom"
        ? html`<button class="zoom-assist" @click=${this.zoomForMe}>
            ${translateText("tutorial.zoom.assist")}
          </button>`
        : null}
      ${this.current.id === "spawn"
        ? html`<button class="zoom-assist" @click=${this.chooseStartingPoint}>
            ${translateText("tutorial.spawn.assist")}
          </button>`
        : null}
      ${this.current.id === "expand"
        ? html`<button class="zoom-assist" @click=${this.expandForMe}>
            ${translateText("tutorial.expand.assist")}
          </button>`
        : null}
      ${this.current.id === "attack"
        ? html`<button class="zoom-assist" @click=${this.attackForMe}>
            ${translateText("tutorial.attack.assist")}
          </button>`
        : null}
    `;
  }
}
