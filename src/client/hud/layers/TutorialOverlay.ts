import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { Cell, GameType, UnitType } from "../../../core/game/Game";
import { assetUrl } from "../../../core/AssetUrls";
import type { Controller } from "../../Controller";
import {
  AttackRatioEvent,
  MouseUpEvent,
  ZOOM_DELTA_DIVISOR,
  ZoomEvent,
} from "../../InputHandler";
import type { TransformHandler } from "../../TransformHandler";
import { GoToPlayerEvent, GoToPositionEvent } from "../../TransformHandler";
import {
  BuildUnitIntentEvent,
  SendAllianceRequestIntentEvent,
  SendAttackIntentEvent,
} from "../../Transport";
import type { UIState } from "../../UIState";
import { translateText } from "../../Utils";
import type { GameView } from "../../view";
import { CloseLeaderboardEvent } from "./GameLeftSidebar";
import { ShowReplayPanelEvent } from "./ReplayPanel";

const ACTIVE_KEY = "openfront.tutorial.active";
const COMPLETED_KEY = "openfront.tutorial.completed";
const SKIPPED_KEY = "openfront.tutorial.skipped";
const STEP_KEY = "openfront.tutorial.step";
const SPEED_STEP_REMOVED_KEY = "openfront.tutorial.speed-step-removed";
const STEP_INDEX_VERSION_KEY = "openfront.tutorial.step-index-version";
const TUTORIAL_ZOOM_SCALE = 4.0;
const TUTORIAL_ATTACK_RATIO = 0.15;
const TARGET_REFRESH_INTERVAL_MS = 300;

type TutorialStep = {
  id: string;
  title: string;
  hint: string;
  target?: string;
  unit?: UnitType;
  icon?: string;
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
    icon: assetUrl("images/SwordIconWhite.svg"),
    mapTarget: true,
  },
  {
    id: "city",
    title: "tutorial.step.city.title",
    hint: "tutorial.step.city.hint",
    icon: assetUrl("images/CityIconWhite.svg"),
    unit: UnitType.City,
    mapTarget: true,
  },
  {
    id: "factory",
    title: "tutorial.step.factory.title",
    hint: "tutorial.step.factory.hint",
    icon: assetUrl("images/FactoryIconWhite.svg"),
    unit: UnitType.Factory,
    mapTarget: true,
  },
  {
    id: "defense",
    title: "tutorial.step.defense.title",
    hint: "tutorial.step.defense.hint",
    icon: assetUrl("images/ShieldIconWhite.svg"),
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
    icon: assetUrl("images/PortIcon.svg"),
    unit: UnitType.Port,
    mapTarget: true,
  },
  {
    id: "warship",
    title: "tutorial.step.warship.title",
    hint: "tutorial.step.warship.hint",
    icon: assetUrl("images/BattleshipIconWhite.svg"),
    unit: UnitType.Warship,
    mapTarget: true,
  },
  {
    id: "silo",
    title: "tutorial.step.silo.title",
    hint: "tutorial.step.silo.hint",
    icon: assetUrl("images/MissileSiloIconWhite.svg"),
    unit: UnitType.MissileSilo,
    mapTarget: true,
  },
  {
    id: "rocket",
    title: "tutorial.step.rocket.title",
    hint: "tutorial.step.rocket.hint",
    icon: assetUrl("images/NukeIconWhite.svg"),
    mapTarget: true,
  },
  {
    id: "sam",
    title: "tutorial.step.sam.title",
    hint: "tutorial.step.sam.hint",
    icon: assetUrl("images/SamLauncherIconWhite.svg"),
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
    .step-title-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      margin-bottom: 4px;
    }
    .step-icon {
      width: 21px;
      height: 21px;
      flex: 0 0 auto;
      object-fit: contain;
      filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.5));
    }
    .step-title {
      display: block;
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
    .skip:hover {
      color: white;
      border-color: rgba(128, 220, 255, 0.55);
    }
    .continue {
      pointer-events: auto;
      margin-top: 10px;
      padding: 8px 12px;
      border: 1px solid rgba(128, 220, 255, 0.55);
      border-radius: 8px;
      background: rgba(8, 48, 72, 0.96);
      color: #b9edff;
      font:
        700 11px/1 Inter,
        system-ui,
        sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .continue:hover {
      color: white;
      border-color: rgba(128, 220, 255, 0.85);
      background: rgba(11, 65, 95, 0.98);
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
  private lockedZoomScale: number | null = null;
  private zoomCenterWorld: { x: number; y: number } | null = null;
  private attackNeighborFocusRequested = false;
  private tutorialGestureScale: number | null = null;
  private tutorialAllowedPointers = new Set<number>();
  private spawnPointer: {
    id: number;
    x: number;
    y: number;
    targetX: number;
    targetY: number;
  } | null = null;
  private enemyBorderTiles: ReadonlySet<number> = new Set();
  private adjacentEnemyTiles: ReadonlySet<number> = new Set();
  private adjacentUnownedLandTiles: ReadonlySet<number> = new Set();
  private invalidPortTargets = new Set<number>();
  private spawnTargetTile: ReturnType<GameView["ref"]> | null = null;
  private portTargetTile: ReturnType<GameView["ref"]> | null = null;
  private portTargetRequest: Promise<void> | null = null;
  private portFocusRequested = false;
  private mapActionMenuAllowed = false;
  private borderTilesRequest: Promise<void> | null = null;
  private nextBorderTilesRefreshAt = Number.NEGATIVE_INFINITY;
  private expandActionAt = Number.POSITIVE_INFINITY;
  private nextNeighborScanAt = Number.NEGATIVE_INFINITY;

  private readonly guardPointerDown = (event: PointerEvent) => {
    if (this.active && this.current.id === "spawn") {
      if (
        event
          .composedPath()
          .some(
            (node) =>
              node instanceof Element && node.classList.contains("skip"),
          )
      ) {
        return;
      }
      if (
        event.button === 0 &&
        this.spawnPointer === null &&
        this.canInteractAt(event.clientX, event.clientY, event)
      ) {
        this.spawnPointer = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          targetX: this.rect!.left + this.rect!.width / 2,
          targetY: this.rect!.top + this.rect!.height / 2,
        };
      }
      // The highlighted circle covers many map tiles. Route a completed tap
      // through the game's spawn validation using the selected tile below.
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
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
    if (
      this.current.mapTarget &&
      this.current.id !== "spawn" &&
      this.pointInRect(event.clientX, event.clientY) &&
      !this.isControlEvent(event)
    ) {
      // The game validates the tile when it receives the tap. Here we only
      // ensure the tap is on the visible tutorial target; a duplicate
      // screen-to-world check can reject mobile coordinates after scaling.
      this.mapActionMenuAllowed = true;
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
    if (this.active && this.current.id === "spawn") {
      if (
        event
          .composedPath()
          .some(
            (node) =>
              node instanceof Element && node.classList.contains("skip"),
          )
      ) {
        return;
      }
      const start = this.spawnPointer;
      this.spawnPointer = null;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (
        event.type === "pointerup" &&
        start?.id === event.pointerId &&
        this.pointInSpotlight(event.clientX, event.clientY) &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) < 12 &&
        this.spawnTargetTile !== null
      ) {
        this.eventBus.emit(new MouseUpEvent(start.targetX, start.targetY));
      }
      return;
    }
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
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(event.code)
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
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
      this.tutorialAllowedPointers.has(event.pointerId)
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
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
    if (localStorage.getItem(STEP_INDEX_VERSION_KEY) !== "2") {
      const savedStep = Number(localStorage.getItem(STEP_KEY) ?? 0);
      const previousReleaseRemovedSpeed =
        localStorage.getItem(SPEED_STEP_REMOVED_KEY) === "true";
      if (previousReleaseRemovedSpeed) {
        // The previous 16-step flow still included Pause/Resume.
        if (savedStep >= 5) this.stepIndex = savedStep - 1;
      } else if (savedStep >= 4) {
        // Migrate directly from the original 17-step flow to this 15-step one.
        this.stepIndex = savedStep >= 6 ? savedStep - 2 : 4;
      }
      this.stepIndex = Math.max(0, Math.min(STEPS.length - 1, this.stepIndex));
      localStorage.setItem(STEP_KEY, String(this.stepIndex));
      localStorage.setItem(STEP_INDEX_VERSION_KEY, "2");
    }
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
    this.eventBus.emit(new ShowReplayPanelEvent(false, isSinglePlayer));

    this.eventBus.on(ZoomEvent, (event) => {
      if (!this.active) return;
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
        this.expandActionAt = Math.min(
          this.expandActionAt,
          performance.now() + 2500,
        );
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
      if (this.adjacentEnemyTiles.size > 0) this.complete("expand");
    }
  }

  stop() {
    this.active = false;
    this.spawnPointer = null;
    this.lockedZoomScale = null;
    this.zoomCenterWorld = null;
    this.tutorialGestureScale = null;
    this.tutorialAllowedPointers.clear();
    this.mapActionMenuAllowed = false;
    if (this.refreshTimer !== undefined)
      window.clearInterval(this.refreshTimer);
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
    this.attackNeighborFocusRequested = false;
    this.portFocusRequested = false;
    this.spawnTargetTile = null;
    this.spawnPointer = null;
    this.mapActionMenuAllowed = false;
    this.tutorialAllowedPointers.clear();
    localStorage.setItem(STEP_KEY, String(this.stepIndex));
    if (id === "leaderboard") {
      // The click opens the panel after this capture-phase handler advances the
      // tutorial, so close it once the click has finished bubbling.
      queueMicrotask(() => this.eventBus.emit(new CloseLeaderboardEvent()));
    }
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

  private pointInSpotlight(x: number, y: number) {
    if (!this.rect) return false;
    const radius = Math.min(this.rect.width, this.rect.height) / 2;
    return (
      Math.hypot(
        x - (this.rect.left + this.rect.width / 2),
        y - (this.rect.top + this.rect.height / 2),
      ) <= radius
    );
  }

  private currentTargetSelector() {
    if (
      this.current.unit === UnitType.Warship &&
      this.isVisibleElement('[data-id="attack_Warship"]')
    ) {
      return '[data-id="attack_Warship"]';
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
              node.classList.contains("continue") ||
              node.matches('player-panel button[aria-label="Close"]')),
        )
    ) {
      return true;
    }
    if (this.current.id === "zoom") return false;
    if (this.current.id === "spawn") {
      const eventIsMap =
        this.isCanvasEvent(event) || this.pointIsOnGameCanvas(x, y, event);
      return (
        eventIsMap &&
        !this.isControlEvent(event) &&
        this.pointInSpotlight(x, y) &&
        this.spawnTargetTile !== null
      );
    }
    if (this.current.mapTarget) {
      if (this.isActionMenuEvent(event)) return this.mapActionMenuAllowed;
      return this.pointInRect(x, y) && !this.isControlEvent(event);
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

  private findTarget(): DOMRect | null {
    const selector = this.currentTargetSelector();
    const element = selector ? this.findElement(selector) : null;
    if (element && this.isVisibleElement(selector!))
      return element.getBoundingClientRect();

    if (this.current.mapTarget) {
      const mapTarget = this.findMapTarget();
      if (mapTarget) return mapTarget;
      if (this.current.id === "spawn") return null;
    }

    // Enemy-target lessons must never silently point at the map center: at
    // some zoom levels that is the player's own country.
    if (["attack", "ally", "rocket", "win"].includes(this.current.id)) {
      return null;
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
    if (player && this.current.unit === UnitType.Port) {
      if (!this.hasCoastalTerritory(player)) {
        return this.findAdjacentOpenLandTarget(player, true);
      }
      return this.findOwnedOceanCoastTarget(player);
    }
    if (player && this.current.unit === UnitType.Warship) {
      const port = player.units(UnitType.Port)[0];
      if (!port) return null;
      const point = this.transformHandler.worldToScreenCoordinates(
        new Cell(
          this.game.x(port.tile()) + 0.5,
          this.game.y(port.tile()) + 0.5,
        ),
      );
      return new DOMRect(point.x - 38, point.y - 38, 76, 76);
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
    let best: { rect: DOMRect; score: number; tile: number } | null = null;

    const mapStep = 24;
    for (let y = top; y <= bottom; y += mapStep) {
      for (let x = left; x <= right; x += mapStep) {
        const cell = this.transformHandler.screenToWorldCoordinates(x, y);
        if (!this.game.isValidCoord(cell.x, cell.y)) continue;
        const tile = this.game.ref(cell.x, cell.y);
        if (
          this.current.unit === UnitType.Port &&
          this.invalidPortTargets.has(tile)
        ) {
          continue;
        }
        if (
          wantsOwnedLand &&
          (!player || this.game.ownerID(tile) !== player.smallID())
        )
          continue;
        if (
          this.current.unit === UnitType.Port &&
          !this.game.isOceanShore(tile)
        ) {
          continue;
        }
        if (wantsEmptyLand && !this.isOpenLand(cell.x, cell.y, tile)) continue;
        if (!wantsEmptyLand && !wantsEnemy && !this.game.isLand(tile)) continue;
        if (this.game.isImpassable(tile)) continue;
        const score = Math.hypot(x - targetX, y - targetY);
        if (!best || score < best.score) {
          best = {
            rect: new DOMRect(x - 38, y - 38, 76, 76),
            score,
            tile,
          };
        }
      }
    }
    if (this.current.id === "spawn") {
      this.spawnTargetTile = best?.tile ?? null;
    }
    return best?.rect ?? null;
  }

  private findOwnedOceanCoastTarget(player: TutorialPlayer): DOMRect | null {
    const inView = (point: { x: number; y: number }) =>
      point.x >= 80 &&
      point.x <= window.innerWidth - 80 &&
      point.y >= 100 &&
      point.y <= window.innerHeight - 140;

    if (
      this.portTargetTile !== null &&
      !this.invalidPortTargets.has(this.portTargetTile) &&
      this.game.hasOwner(this.portTargetTile) &&
      this.game.ownerID(this.portTargetTile) === player.smallID() &&
      this.game.isOceanShore(this.portTargetTile) &&
      !this.game.isImpassable(this.portTargetTile)
    ) {
      const point = this.transformHandler.worldToScreenCoordinates(
        new Cell(
          this.game.x(this.portTargetTile) + 0.5,
          this.game.y(this.portTargetTile) + 0.5,
        ),
      );
      if (inView(point)) return new DOMRect(point.x - 38, point.y - 38, 76, 76);
      if (!this.portFocusRequested) {
        this.portFocusRequested = true;
        this.eventBus.emit(
          new GoToPositionEvent(
            this.game.x(this.portTargetTile) + 0.5,
            this.game.y(this.portTargetTile) + 0.5,
          ),
        );
      }
      return null;
    }

    this.portTargetTile = null;
    this.portFocusRequested = false;
    const centerX = window.innerWidth * 0.5;
    const centerY = window.innerHeight * 0.46;
    let bestVisible: {
      tile: number;
      point: { x: number; y: number };
      score: number;
    } | null = null;
    let bestAny: {
      tile: number;
      point: { x: number; y: number };
      score: number;
    } | null = null;

    for (const tile of this.enemyBorderTiles) {
      if (
        this.invalidPortTargets.has(tile) ||
        !this.game.hasOwner(tile) ||
        this.game.ownerID(tile) !== player.smallID() ||
        !this.game.isOceanShore(tile) ||
        this.game.isImpassable(tile)
      ) {
        continue;
      }
      const point = this.transformHandler.worldToScreenCoordinates(
        new Cell(this.game.x(tile) + 0.5, this.game.y(tile) + 0.5),
      );
      const score = Math.hypot(point.x - centerX, point.y - centerY);
      const candidate = { tile, point, score };
      if (!bestAny || score < bestAny.score) bestAny = candidate;
      if (inView(point) && (!bestVisible || score < bestVisible.score)) {
        bestVisible = candidate;
      }
    }

    const target = bestVisible ?? bestAny;
    if (!target) return null;
    this.portTargetTile = target.tile;
    if (!inView(target.point)) {
      this.portFocusRequested = true;
      this.eventBus.emit(
        new GoToPositionEvent(
          this.game.x(target.tile) + 0.5,
          this.game.y(target.tile) + 0.5,
        ),
      );
      return null;
    }
    return new DOMRect(target.point.x - 38, target.point.y - 38, 76, 76);
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
    let best: { rect: DOMRect; score: number; tile: number } | null = null;

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
        preferCoast && !this.game.isOceanShore(tile) ? 10_000 : 0;
      const score =
        coastPriority + Math.hypot(point.x - centerX, point.y - centerY);
      if (!best || score < best.score) {
        best = {
          rect: new DOMRect(point.x - 38, point.y - 38, 76, 76),
          score,
          tile,
        };
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
    let best: { rect: DOMRect; score: number; tile: number } | null = null;

    let focusTile: number | null = null;
    for (const tile of this.adjacentEnemyTiles) {
      if (!this.isCurrentEnemyNeighbor(tile, player)) continue;
      focusTile ??= tile;
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
        best = {
          rect: new DOMRect(point.x - 38, point.y - 38, 76, 76),
          score,
          tile,
        };
      }
    }
    if (best) return best.rect;
    if (focusTile !== null && !this.attackNeighborFocusRequested) {
      this.attackNeighborFocusRequested = true;
      this.eventBus.emit(
        new GoToPositionEvent(
          this.game.x(focusTile) + 0.5,
          this.game.y(focusTile) + 0.5,
        ),
      );
    }
    return null;
  }

  private isCurrentEnemyNeighbor(tile: number, player: TutorialPlayer) {
    if (
      !this.game.isLand(tile) ||
      this.game.isImpassable(tile) ||
      !this.game.hasOwner(tile) ||
      this.game.ownerID(tile) === player.smallID()
    ) {
      return false;
    }
    return this.game
      .neighbors(tile)
      .some(
        (neighbor) =>
          this.game.hasOwner(neighbor) &&
          this.game.ownerID(neighbor) === player.smallID(),
      );
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

  private pointIsOnGameCanvas(x: number, y: number, event: Event) {
    const hitsControl = event
      .composedPath()
      .some(
        (node) =>
          node instanceof Element &&
          node.matches("button, input, select, textarea, [role='button']"),
      );
    if (hitsControl) return false;
    const canvas = this.findElement("canvas");
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    return (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
  }

  private isControlEvent(event: Event) {
    return event
      .composedPath()
      .some(
        (node) =>
          node instanceof Element &&
          node.matches("button, input, select, textarea, [role='button']"),
      );
  }

  private hasCoastalTerritory(player: TutorialPlayer) {
    for (const tile of this.enemyBorderTiles) {
      if (
        this.game.ownerID(tile) === player.smallID() &&
        this.game.isOceanShore(tile)
      ) {
        return true;
      }
    }
    return false;
  }

  private refreshTarget() {
    if (!this.active) return;
    const player = this.game.myPlayer();
    if (player) {
      this.refreshBorderTiles(player);
      this.refreshPortTarget(player);
    }
    const next = this.findTarget();
    if (!next) {
      if (this.rect) {
        this.rect = null;
        this.requestUpdate();
      }
      return;
    }
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

  private refreshPortTarget(player: TutorialPlayer) {
    if (
      this.current.unit !== UnitType.Port ||
      !this.hasCoastalTerritory(player) ||
      this.portTargetTile !== null ||
      this.portTargetRequest
    ) {
      return;
    }
    if (this.portTargetTile === null) this.findMapTarget();
    const tile = this.portTargetTile;
    if (
      tile === null ||
      this.invalidPortTargets.has(tile) ||
      !this.game.hasOwner(tile) ||
      this.game.ownerID(tile) !== player.smallID() ||
      !this.game.isOceanShore(tile)
    ) {
      return;
    }

    this.portTargetRequest = player
      .buildables(tile, [UnitType.Port])
      .then((buildables) => {
        if (!this.active || this.current.unit !== UnitType.Port) return;
        const port = buildables.find((unit) => unit.type === UnitType.Port);
        if (port && port.canBuild !== false) {
          this.portTargetTile = tile;
        } else {
          this.invalidPortTargets.add(tile);
          if (this.portTargetTile === tile) this.portTargetTile = null;
        }
      })
      .catch(() => {
        this.invalidPortTargets.add(tile);
        if (this.portTargetTile === tile) this.portTargetTile = null;
      })
      .finally(() => {
        this.portTargetRequest = null;
        if (this.active && this.current.unit === UnitType.Port) {
          this.refreshTarget();
        }
      });
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
    const safeTop = Math.max(56, (window.visualViewport?.offsetTop ?? 0) + 46);
    const hintHeight = 128;
    const bottomReserve = 136;
    if (!this.rect) {
      return "max(56px, calc(env(safe-area-inset-top) + 46px))";
    }
    const above = this.rect.top - hintHeight;
    if (above >= safeTop) return `${above}px`;

    const below = this.rect.bottom + 16;
    if (below + hintHeight <= window.innerHeight - bottomReserve) {
      return `${below}px`;
    }

    return `${Math.max(safeTop, window.innerHeight - bottomReserve - hintHeight)}px`;
  }

  private renderStepTitle() {
    return html`
      <span class="step-title-row">
        ${this.current.icon
          ? html`<img class="step-icon" src=${this.current.icon} alt="" aria-hidden="true" />`
          : null}
        <strong class="step-title">${translateText(this.current.title)}</strong>
      </span>
    `;
  }

  render() {
    if (!this.active) return html``;
    if (!this.rect) {
      return html`
        <div class="veil"></div>
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
          ${this.renderStepTitle()}
          <span class="step-copy">${translateText(this.currentHintKey())}</span>
          ${this.renderContinueButton()}
        </div>
        ${this.renderSkipButton()}
      `;
    }
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
        ${this.renderStepTitle()}
        <span class="step-copy">${translateText(this.currentHintKey())}</span>
        ${this.renderContinueButton()}
      </div>
      ${this.renderSkipButton()}
    `;
  }

  private renderContinueButton() {
    if (this.current.id !== "win") return html``;
    return html`<button class="continue" @click=${() => this.finish()}>
      ${translateText("tutorial.continue")}
    </button>`;
  }

  private renderSkipButton() {
    if (this.current.id === "win") return html``;
    return html`<button class="skip" @click=${this.skip}>
      ${translateText("tutorial.skip")}
    </button>`;
  }
}
