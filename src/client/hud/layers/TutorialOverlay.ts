import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import Countries from "resources/countries.json" with { type: "json" };
import { assetUrl } from "../../../core/AssetUrls";
import { EventBus } from "../../../core/EventBus";
import {
  Cell,
  GameType,
  Structures,
  TUTORIAL_NUKE_TARGET_NAME,
  UnitType,
} from "../../../core/game/Game";
import { UserSettings } from "../../../core/game/UserSettings";
import { validateUsername } from "../../../core/validations/username";
import type { Controller } from "../../Controller";
import { getLocalizedCountryName } from "../../CountryLocalization";
import {
  CloseViewEvent,
  ContextMenuEvent,
  MouseUpEvent,
  TouchEvent,
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
import {
  activateTutorialForGame,
  persistTutorialIdentityName,
  shouldPersistTutorialIdentity,
  TUTORIAL_ATTACK_RATIO,
} from "../../TutorialProgress";
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
const TARGET_REFRESH_INTERVAL_MS = 300;
const MAP_SPOTLIGHT_SIZE = 48;
const MAP_SPOTLIGHT_RADIUS = MAP_SPOTLIGHT_SIZE / 2;
const TUTORIAL_STEP_ADVANCE_DELAY_MS = 2000;
const BUILD_TARGET_MAX_INTERIOR_RADIUS = 96;
const BUILD_TARGET_INTERIOR_RADIUS_STEP = 8;

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
    icon: assetUrl("images/SwordIconWhite.svg"),
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
    icon: assetUrl("images/AllianceRequestWhiteIcon.svg"),
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
    id: "win",
    title: "tutorial.step.win.title",
    hint: "tutorial.step.win.hint",
    icon: assetUrl("images/CrownIcon.svg"),
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
      gap: 9px;
      margin-bottom: 4px;
    }
    .step-icon {
      display: block;
      width: 32px;
      height: 32px;
      flex: 0 0 auto;
      object-fit: contain;
      padding: 4px;
      border-radius: 8px;
      background: rgba(131, 223, 255, 0.14);
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
  @state() private active = false;
  private refreshTimer: number | undefined;
  private lockedZoomScale: number | null = null;
  private zoomCenterWorld: { x: number; y: number } | null = null;
  private warshipCameraRestorePosition: {
    x: number;
    y: number;
    zoom: number;
  } | null = null;
  private rocketCameraRestorePosition: {
    x: number;
    y: number;
    zoom: number;
  } | null = null;
  private rocketFocusRequested = false;
  private rocketLaunched = false;
  private rocketTargetSmallID: number | null = null;
  private rocketAdvanceAt = 0;
  private attackAdvanceAt = 0;
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
  private mapTargetTile: ReturnType<GameView["ref"]> | null = null;
  private mapFocusTile: ReturnType<GameView["ref"]> | null = null;
  private mapTargetStepIndex = -1;
  private mapTargetOwnerID: number | null = null;
  private tutorialCountryIdentityApplied = false;
  private mapActionPointer: {
    id: number;
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    pointerType: PointerEvent["pointerType"];
  } | null = null;
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
      event.button === 0 &&
      this.mapTargetTile !== null &&
      this.pointInSpotlight(event.clientX, event.clientY) &&
      !this.isControlEvent(event) &&
      (this.isCanvasEvent(event) ||
        this.pointIsOnGameCanvas(event.clientX, event.clientY, event))
    ) {
      const target = this.mapTargetTile;
      const point = this.transformHandler.worldToScreenCoordinates(
        new Cell(this.game.x(target) + 0.5, this.game.y(target) + 0.5),
      );
      this.mapActionPointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        targetX: point.x,
        targetY: point.y,
        pointerType: event.pointerType,
      };
      this.mapActionMenuAllowed = true;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (
      this.current.mapTarget &&
      this.current.id !== "spawn" &&
      this.pointInRect(event.clientX, event.clientY) &&
      !this.isControlEvent(event)
    ) {
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
    const mapStart = this.mapActionPointer;
    if (
      this.active &&
      this.current.mapTarget &&
      event.pointerId === mapStart?.id
    ) {
      this.mapActionPointer = null;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (
        event.type === "pointerup" &&
        this.pointInSpotlight(event.clientX, event.clientY) &&
        Math.hypot(event.clientX - mapStart.x, event.clientY - mapStart.y) < 12
      ) {
        if (mapStart.pointerType === "mouse") {
          this.eventBus.emit(
            new ContextMenuEvent(mapStart.targetX, mapStart.targetY),
          );
        } else {
          this.eventBus.emit(
            new TouchEvent(mapStart.targetX, mapStart.targetY),
          );
        }
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
    this.active = activateTutorialForGame(isSinglePlayer);
    if (!this.active) return;

    this.stepIndex = Math.max(
      0,
      Math.min(STEPS.length - 1, Number(localStorage.getItem(STEP_KEY) ?? 0)),
    );
    const stepIndexVersion = localStorage.getItem(STEP_INDEX_VERSION_KEY);
    if (stepIndexVersion !== "3") {
      const savedStep = Number(localStorage.getItem(STEP_KEY) ?? 0);
      if (stepIndexVersion !== "2") {
        const previousReleaseRemovedSpeed =
          localStorage.getItem(SPEED_STEP_REMOVED_KEY) === "true";
        if (previousReleaseRemovedSpeed) {
          // The previous 16-step flow still included Pause/Resume.
          if (savedStep >= 5) this.stepIndex = savedStep - 1;
        } else if (savedStep >= 4) {
          // Migrate directly from the original 17-step flow.
          this.stepIndex = savedStep >= 6 ? savedStep - 2 : 4;
        }
      }
      this.stepIndex = Math.max(0, Math.min(STEPS.length - 1, this.stepIndex));
      localStorage.setItem(STEP_KEY, String(this.stepIndex));
      localStorage.setItem(STEP_INDEX_VERSION_KEY, "3");
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
    this.eventBus.emit(new CloseViewEvent());

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
        // Hold this camera for two seconds so the player can see the attack.
        if (this.attackAdvanceAt === 0) {
          this.attackAdvanceAt =
            performance.now() + TUTORIAL_STEP_ADVANCE_DELAY_MS;
        }
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
      ) {
        if (this.current.id === "rocket") {
          this.rocketLaunched = true;
          this.rocketTargetSmallID = this.mapTargetOwnerID;
        }
      }
    });

    // `active` is deliberately not a Lit state field. The game renderer can
    // initialize this layer after its first render, so explicitly render the
    // first tutorial card even while the map target is still being resolved.
    this.requestUpdate();
  }

  getTickIntervalMs() {
    return 100;
  }

  tick() {
    if (!this.active || !this.game.myPlayer()) return;
    const player = this.game.myPlayer()!;
    if (
      this.current.id === "rocket" &&
      this.rocketLaunched &&
      this.rocketTargetSmallID !== null
    ) {
      const target = this.game
        .players()
        .find((candidate) => candidate.smallID() === this.rocketTargetSmallID);
      if (!target || !target.isAlive()) {
        if (this.rocketAdvanceAt === 0) {
          this.rocketAdvanceAt =
            performance.now() + TUTORIAL_STEP_ADVANCE_DELAY_MS;
        }
      }
      if (this.rocketAdvanceAt > 0 && performance.now() >= this.rocketAdvanceAt) {
        this.complete("rocket");
      }
    }
    if (
      this.current.id === "attack" &&
      this.attackAdvanceAt > 0 &&
      performance.now() >= this.attackAdvanceAt
    ) {
      this.complete("attack");
    }
    if (
      shouldPersistTutorialIdentity() &&
      !this.tutorialCountryIdentityApplied &&
      player.state?.spawnTile !== undefined
    ) {
      const country = this.tutorialCountryForPlayer(
        player,
        player.state!.spawnTile!,
      );
      if (country) {
        const identityName = validateUsername(country.name).isValid
          ? country.name
          : (country.code?.toUpperCase() ?? country.name);
        player.setTutorialCountryIdentity(identityName, country.flag);
        if (country.code) {
          new UserSettings().setFlag(`country:${country.code}`);
        }
        const usernameInput = document.querySelector("username-input") as {
          setTutorialUsername?: (name: string) => boolean;
        } | null;
        usernameInput?.setTutorialUsername?.(identityName);
        persistTutorialIdentityName(identityName);
        this.tutorialCountryIdentityApplied = true;
      }
    }
    if (
      this.current.id === "win" &&
      player.isAlive() &&
      this.game.players().filter((candidate) => candidate.isAlive()).length ===
        1
    ) {
      this.finish();
    } else if (this.current.id === "spawn" && player.hasSpawned()) {
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
    this.restoreRocketCamera();
    this.restoreWarshipCamera();
    this.active = false;
    this.attackAdvanceAt = 0;
    this.rocketAdvanceAt = 0;
    this.spawnPointer = null;
    this.mapActionPointer = null;
    this.clearMapTarget();
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

  private tutorialCountryForPlayer(
    player: TutorialPlayer,
    spawnTile: NonNullable<NonNullable<TutorialPlayer["state"]>["spawnTile"]>,
  ) {
    const selectedFlag = player.cosmetics.flag;
    const flagCode = selectedFlag?.match(/^\/flags\/([^/]+)\.svg$/i)?.[1];
    const selectedCountry = flagCode
      ? (Countries as { code: string; name: string }[]).find(
          (country) =>
            encodeURIComponent(country.code).toLowerCase() ===
            flagCode.toLowerCase(),
        )
      : undefined;
    if (selectedCountry) {
      return {
        code: selectedCountry.code,
        name: getLocalizedCountryName(
          selectedCountry.code,
          selectedCountry.name,
        ),
        flag: selectedFlag,
      };
    }
    return this.game.countryForTile(spawnTile);
  }

  private complete(id: string) {
    if (!this.active || this.current.id !== id) return;
    if (id === "expand") this.zoomOutForAttackStep();
    if (id === "port") this.shiftCameraForWarshipStep();
    if (id === "warship") this.restoreWarshipCamera();
    if (id === "rocket") {
      this.restoreRocketCamera();
      this.rocketAdvanceAt = 0;
    }
    if (id === "attack") this.attackAdvanceAt = 0;
    if (id === "silo") {
      this.rocketFocusRequested = false;
      this.rocketLaunched = false;
      this.rocketTargetSmallID = null;
    }
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
    this.mapActionPointer = null;
    this.clearMapTarget();
    this.tutorialAllowedPointers.clear();
    localStorage.setItem(STEP_KEY, String(this.stepIndex));
    this.rect = null;
    this.requestUpdate();
  }

  private zoomOutForAttackStep() {
    const player = this.game.myPlayer();
    if (!player) return;
    const viewportWidth = this.transformHandler.width?.() ?? window.innerWidth;
    const mapWidth = this.game.width?.() ?? Number.POSITIVE_INFINITY;
    const minimumScale = Math.max(0.2, viewportWidth / mapWidth);
    // Reduce the current zoom by 30%. Setting the absolute scale to 0.2
    // makes the whole world fit on screen on phones, far beyond the intended
    // small step back needed to reveal a neighboring country.
    this.lockedZoomScale = Math.max(
      minimumScale,
      this.transformHandler.scale * 0.7,
    );
    this.eventBus.emit(new GoToPlayerEvent(player, this.lockedZoomScale));
  }

  private finish() {
    this.restoreWarshipCamera();
    this.eventBus.emit(new CloseLeaderboardEvent());
    this.stop();
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.setItem(COMPLETED_KEY, "true");
    localStorage.removeItem(STEP_KEY);
    this.requestUpdate();
  }

  private skip() {
    if (!window.confirm(translateText("tutorial.skip.confirm"))) return;
    this.restoreWarshipCamera();
    this.stop();
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.setItem(SKIPPED_KEY, "true");
    localStorage.removeItem(STEP_KEY);
    this.requestUpdate();
  }

  private shiftCameraForWarshipStep() {
    if (this.warshipCameraRestorePosition) return;
    const viewportWidth = this.transformHandler.width?.() ?? window.innerWidth;
    const scale = this.transformHandler.scale;
    if (!Number.isFinite(scale) || scale <= 0) return;
    const mapWidth = this.game.width?.() ?? Number.POSITIVE_INFINITY;
    const minimumScale = Math.max(0.2, viewportWidth / mapWidth);
    const warshipStepScale = Math.max(minimumScale, scale * 0.7);
    const center = this.transformHandler.screenToWorldCoordinatesFloat(
      window.innerWidth / 2,
      window.innerHeight / 2,
    );
    this.warshipCameraRestorePosition = { ...center, zoom: scale };
    // Shifting the camera center left moves the unchanged water target right
    // on screen, away from the hard-to-tap edge.
    this.eventBus.emit(
      new GoToPositionEvent(
        center.x - (viewportWidth * 0.06) / warshipStepScale,
        center.y,
        warshipStepScale,
      ),
    );
  }

  private restoreWarshipCamera() {
    const position = this.warshipCameraRestorePosition;
    if (!position) return;
    this.warshipCameraRestorePosition = null;
    this.eventBus.emit(
      new GoToPositionEvent(position.x, position.y, position.zoom),
    );
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
      // Never display a generic center marker when this step has no valid map
      // tile yet; it can silently land on the player's country.
      return this.findMapTarget();
    }

    // Enemy-target lessons must never silently point at the map center: at
    // some zoom levels that is the player's own country.
    if (["attack", "ally", "rocket", "win"].includes(this.current.id)) {
      return null;
    }

    const width = 116;
    const height = 116;
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
      this.current.id !== "spawn" &&
      this.mapTargetStepIndex === this.stepIndex
    ) {
      const frozen = this.frozenMapTargetRect(player);
      if (frozen) return frozen;
      this.clearMapTarget();
    }
    if (player && this.current.unit === UnitType.Port) {
      if (!this.hasCoastalTerritory(player)) {
        return this.findAdjacentOpenLandTarget(player, true);
      }
      return this.findOwnedOceanCoastTarget(player);
    }
    if (player && this.current.unit === UnitType.Warship) {
      return this.findPortAdjacentSeaTarget(player);
    }
    if (this.current.id === "rocket") {
      return this.findTutorialNukeTarget();
    }
    const wantsEmptyLand = ["expand", "spawn"].includes(this.current.id);
    const wantsEnemy = ["attack", "ally", "rocket", "win"].includes(
      this.current.id,
    );
    const wantsOwnedLand = this.current.unit !== undefined;
    const isSiloStep = this.current.unit === UnitType.MissileSilo;
    if (wantsEnemy) {
      return player ? this.findNeighborEnemyTarget(player) : null;
    }

    const sideMargin = Math.max(
      MAP_SPOTLIGHT_RADIUS + 24,
      Math.min(430, window.innerWidth * 0.12),
    );
    const left = sideMargin;
    const right = Math.max(left, window.innerWidth - sideMargin);
    const top = Math.max(140, window.innerHeight * 0.2);
    const bottom = Math.max(top, window.innerHeight - 180);
    const targetX = window.innerWidth * 0.5;
    const targetY = window.innerHeight * 0.46;
    let best: {
      rect: DOMRect;
      score: number;
      tile: number;
      clearance: number;
    } | null = null;
    const ownedUnits =
      player && (wantsOwnedLand || this.current.id === "expand")
        ? this.unitsOwnedBy(player)
        : [];
    const buildStructures =
      player && wantsOwnedLand
        ? (this.game.units?.(...Structures.types) ?? []).filter((unit) =>
            unit.isActive(),
          )
        : [];
    const structureMinDistance =
      this.game.config?.().structureMinDist?.() ?? 15;

    for (let y = top; y <= bottom; y += isSiloStep ? 8 : 16) {
      for (let x = left; x <= right; x += isSiloStep ? 8 : 16) {
        const cell = this.transformHandler.screenToWorldCoordinates(x, y);
        if (!this.game.isValidCoord(cell.x, cell.y)) continue;
        const tile = this.game.ref(cell.x, cell.y);
        if (
          wantsOwnedLand &&
          (!player || this.game.ownerID(tile) !== player.smallID())
        ) {
          continue;
        }
        if (wantsEmptyLand && !this.isOpenLand(cell.x, cell.y, tile)) continue;
        if (!wantsEmptyLand && !wantsOwnedLand && !this.game.isLand(tile)) {
          continue;
        }
        if (this.game.isImpassable(tile)) continue;
        const point =
          this.current.id === "spawn"
            ? { x, y }
            : this.transformHandler.worldToScreenCoordinates(
                new Cell(cell.x + 0.5, cell.y + 0.5),
              );
        const ownerID = wantsOwnedLand ? player!.smallID() : null;
        if (
          this.current.id !== "spawn" &&
          !this.spotlightMatchesRegion(point.x, point.y, (sample) =>
            this.isLandOwnedBy(sample, ownerID),
          ) &&
          !isSiloStep
        ) {
          continue;
        }
        if (
          player &&
          wantsOwnedLand &&
          !this.isValidStructureBuildTile(
            tile,
            buildStructures,
            structureMinDistance,
          )
        ) {
          continue;
        }
        if (
          player &&
          this.current.id === "expand" &&
          this.hasUnitNearPoint(
            ownedUnits,
            point.x,
            point.y,
            MAP_SPOTLIGHT_RADIUS + 24,
          )
        ) {
          continue;
        }
        let clearance = 0;
        if (player && wantsOwnedLand) {
          const unitClearance = this.nearestUnitDistance(
            ownedUnits,
            point.x,
            point.y,
          );
          if (unitClearance <= (isSiloStep ? 6 : MAP_SPOTLIGHT_RADIUS + 6)) {
            continue;
          }
          const borderClearance = this.ownedLandClearance(
            point.x,
            point.y,
            player.smallID(),
          );
          clearance = Math.min(borderClearance, unitClearance);
        }
        const score = Math.hypot(point.x - targetX, point.y - targetY);
        if (
          !best ||
          (wantsOwnedLand && clearance > best.clearance) ||
          ((!wantsOwnedLand || clearance === best.clearance) &&
            score < best.score)
        ) {
          best = {
            rect: this.rectAtPoint(point.x, point.y),
            score,
            tile,
            clearance,
          };
        }
      }
    }
    if (best) this.rememberMapTarget(best.tile);
    else this.clearMapTarget();
    if (this.current.id === "spawn") {
      this.spawnTargetTile = best?.tile ?? null;
    }
    return best?.rect ?? null;
  }

  private rememberMapTarget(
    targetTile: number,
    focusTile = targetTile,
    ownerID?: number,
  ) {
    this.mapTargetTile = targetTile;
    this.mapFocusTile = focusTile;
    this.mapTargetStepIndex = this.stepIndex;
    this.mapTargetOwnerID =
      ownerID ??
      (this.game.hasOwner(targetTile) ? this.game.ownerID(targetTile) : null);
  }

  private clearMapTarget() {
    this.mapTargetTile = null;
    this.mapFocusTile = null;
    this.mapTargetStepIndex = -1;
    this.mapTargetOwnerID = null;
  }

  private frozenMapTargetRect(player: TutorialPlayer | null) {
    const targetTile = this.mapTargetTile;
    const focusTile = this.mapFocusTile;
    if (targetTile === null || focusTile === null) return null;
    const point = this.transformHandler.worldToScreenCoordinates(
      new Cell(this.game.x(focusTile) + 0.5, this.game.y(focusTile) + 0.5),
    );
    const inView =
      point.x >= MAP_SPOTLIGHT_RADIUS &&
      point.x <= window.innerWidth - MAP_SPOTLIGHT_RADIUS &&
      point.y >= MAP_SPOTLIGHT_RADIUS &&
      point.y <= window.innerHeight - MAP_SPOTLIGHT_RADIUS;
    if (!inView) return null;

    if (this.current.unit === UnitType.Warship) {
      const portExists = player
        ?.units(UnitType.Port)
        .some((port) => port.isActive());
      if (
        !portExists ||
        !this.game.isOcean(targetTile) ||
        !this.game.isOcean(focusTile)
      ) {
        return null;
      }
      return this.rectAtPoint(point.x, point.y);
    }

    if (this.current.id === "rocket") {
      const target = this.game
        .players()
        .find((candidate) => candidate.smallID() === this.mapTargetOwnerID);
      if (
        !target?.isAlive() ||
        !this.game.hasOwner(targetTile) ||
        this.game.ownerID(targetTile) !== this.mapTargetOwnerID
      ) {
        return null;
      }
      return this.rectAtPoint(point.x, point.y);
    }

    if (player && this.current.unit === UnitType.Port) {
      const validPortTile =
        !this.invalidPortTargets.has(targetTile) &&
        this.game.hasOwner(targetTile) &&
        this.game.ownerID(targetTile) === player.smallID() &&
        this.game.isOceanShore(targetTile) &&
        !this.game.isImpassable(targetTile);
      if (
        !validPortTile ||
        !this.spotlightMatchesRegion(point.x, point.y, (tile) =>
          this.isLandOwnedBy(tile, player.smallID()),
        ) ||
        this.hasUnitNearPoint(this.unitsOwnedBy(player), point.x, point.y)
      ) {
        return null;
      }
      return this.rectAtPoint(point.x, point.y);
    }

    const isEnemyStep = ["attack", "ally", "rocket", "win"].includes(
      this.current.id,
    );
    if (isEnemyStep) {
      const ownerStillNeighbors = Array.from(this.adjacentEnemyTiles).some(
        (tile) =>
          this.isCurrentEnemyNeighbor(tile, player!) &&
          this.game.ownerID(tile) === this.mapTargetOwnerID,
      );
      if (
        !player ||
        !ownerStillNeighbors ||
        !this.spotlightMatchesRegion(point.x, point.y, (tile) =>
          this.isLandOwnedBy(tile, this.mapTargetOwnerID),
        )
      ) {
        return null;
      }
      return this.rectAtPoint(point.x, point.y);
    }

    if (this.current.id === "expand") {
      if (
        !this.isOpenLand(
          this.game.x(targetTile),
          this.game.y(targetTile),
          targetTile,
        ) ||
        !this.spotlightMatchesRegion(point.x, point.y, (tile) =>
          this.isLandOwnedBy(tile, null),
        ) ||
        (player !== null &&
          this.hasUnitNearPoint(
            this.unitsOwnedBy(player),
            point.x,
            point.y,
            MAP_SPOTLIGHT_RADIUS + 24,
          ))
      ) {
        return null;
      }
      return this.rectAtPoint(point.x, point.y);
    }

    if (this.current.unit && player) {
      const isSiloStep = this.current.unit === UnitType.MissileSilo;
      if (!this.isLandOwnedBy(targetTile, player.smallID())) return null;
      if (
        !isSiloStep &&
        !this.spotlightMatchesRegion(point.x, point.y, (tile) =>
          this.isLandOwnedBy(tile, player.smallID()),
        )
      ) {
        return null;
      }
      if (
        this.hasUnitNearPoint(
          this.unitsOwnedBy(player),
          point.x,
          point.y,
          isSiloStep ? 6 : MAP_SPOTLIGHT_RADIUS + 6,
        )
      ) {
        return null;
      }
      return this.rectAtPoint(point.x, point.y);
    }

    if (this.current.id === "spawn") return this.rectAtPoint(point.x, point.y);
    return null;
  }

  private isLandOwnedBy(tile: number, ownerID: number | null) {
    return (
      this.game.isLand(tile) &&
      !this.game.isImpassable(tile) &&
      (ownerID === null
        ? !this.game.hasOwner(tile) && !this.game.hasFallout(tile)
        : this.game.hasOwner(tile) && this.game.ownerID(tile) === ownerID)
    );
  }

  private spotlightMatchesRegion(
    centerX: number,
    centerY: number,
    acceptsTile: (tile: number) => boolean,
    radius = MAP_SPOTLIGHT_RADIUS - 2,
  ) {
    for (let y = -radius; y <= radius; y += 6) {
      for (let x = -radius; x <= radius; x += 6) {
        if (x * x + y * y > radius * radius) continue;
        const cell = this.transformHandler.screenToWorldCoordinates(
          centerX + x,
          centerY + y,
        );
        if (
          !this.game.isValidCoord(cell.x, cell.y) ||
          !acceptsTile(this.game.ref(cell.x, cell.y))
        ) {
          return false;
        }
      }
    }
    return true;
  }

  private unitsOwnedBy(player: TutorialPlayer) {
    return this.game.unitsOwnedBy?.(player.smallID()) ?? player.units?.() ?? [];
  }

  private isValidStructureBuildTile(
    tile: number,
    structures: readonly { tile: () => number }[],
    minimumDistance: number,
  ) {
    const x = this.game.x(tile);
    const y = this.game.y(tile);
    return structures.every((structure) => {
      const structureTile = structure.tile();
      return (
        Math.hypot(
          x - this.game.x(structureTile),
          y - this.game.y(structureTile),
        ) >= minimumDistance
      );
    });
  }

  private hasUnitNearPoint(
    units: readonly { tile: () => number; isActive: () => boolean }[],
    x: number,
    y: number,
    clearance = MAP_SPOTLIGHT_RADIUS + 6,
  ) {
    return this.nearestUnitDistance(units, x, y) <= clearance;
  }

  private nearestUnitDistance(
    units: readonly { tile: () => number; isActive: () => boolean }[],
    x: number,
    y: number,
  ) {
    let nearest = Number.POSITIVE_INFINITY;
    for (const unit of units) {
      if (!unit.isActive()) continue;
      const point = this.transformHandler.worldToScreenCoordinates(
        new Cell(
          this.game.x(unit.tile()) + 0.5,
          this.game.y(unit.tile()) + 0.5,
        ),
      );
      nearest = Math.min(nearest, Math.hypot(point.x - x, point.y - y));
    }
    return nearest;
  }

  private ownedLandClearance(x: number, y: number, ownerID: number) {
    let clearance = MAP_SPOTLIGHT_RADIUS - 2;
    for (
      let radius = 32;
      radius <= BUILD_TARGET_MAX_INTERIOR_RADIUS;
      radius += BUILD_TARGET_INTERIOR_RADIUS_STEP
    ) {
      if (
        !this.spotlightMatchesRegion(
          x,
          y,
          (tile) => this.isLandOwnedBy(tile, ownerID),
          radius,
        )
      ) {
        break;
      }
      clearance = radius;
    }
    return clearance;
  }

  private rectAtPoint(x: number, y: number) {
    return new DOMRect(
      x - MAP_SPOTLIGHT_RADIUS,
      y - MAP_SPOTLIGHT_RADIUS,
      MAP_SPOTLIGHT_SIZE,
      MAP_SPOTLIGHT_SIZE,
    );
  }

  private findOwnedOceanCoastTarget(player: TutorialPlayer): DOMRect | null {
    const sideMargin = Math.max(
      MAP_SPOTLIGHT_RADIUS + 24,
      Math.min(430, window.innerWidth * 0.12),
    );
    const inView = (point: { x: number; y: number }) =>
      point.x >= sideMargin &&
      point.x <= window.innerWidth - sideMargin &&
      point.y >= 100 &&
      point.y <= window.innerHeight - 140;
    const ownedUnits = this.unitsOwnedBy(player);
    const coastalTiles = [
      ...(this.portTargetTile === null ? [] : [this.portTargetTile]),
      ...this.enemyBorderTiles,
    ];
    const seen = new Set<number>();
    let best:
      | {
          coastTile: number;
          focusTile: number;
          point: { x: number; y: number };
          score: number;
        }
      | undefined;
    let bestAvailable:
      | {
          coastTile: number;
          focusTile: number;
          point: { x: number; y: number };
          score: number;
        }
      | undefined;
    const centerX = window.innerWidth * 0.5;
    const centerY = window.innerHeight * 0.46;

    for (const coastTile of coastalTiles) {
      if (seen.has(coastTile)) continue;
      seen.add(coastTile);
      if (
        this.invalidPortTargets.has(coastTile) ||
        !this.game.hasOwner(coastTile) ||
        this.game.ownerID(coastTile) !== player.smallID() ||
        !this.game.isOceanShore(coastTile) ||
        this.game.isImpassable(coastTile)
      ) {
        continue;
      }
      const focusCandidates: number[] = [];
      const visitedLand = new Set<number>([coastTile]);
      let frontier = [coastTile];
      for (let depth = 1; depth <= 8; depth++) {
        const next: number[] = [];
        for (const tile of frontier) {
          for (const neighbor of this.game.neighbors(tile)) {
            if (visitedLand.has(neighbor)) continue;
            visitedLand.add(neighbor);
            if (!this.isLandOwnedBy(neighbor, player.smallID())) continue;
            focusCandidates.push(neighbor);
            next.push(neighbor);
          }
        }
        if (next.length === 0) break;
        frontier = next;
      }
      if (focusCandidates.length === 0) focusCandidates.push(coastTile);
      for (const focusTile of focusCandidates) {
        const point = this.transformHandler.worldToScreenCoordinates(
          new Cell(this.game.x(focusTile) + 0.5, this.game.y(focusTile) + 0.5),
        );
        if (
          !this.spotlightMatchesRegion(point.x, point.y, (tile) =>
            this.isLandOwnedBy(tile, player.smallID()),
          ) ||
          this.hasUnitNearPoint(ownedUnits, point.x, point.y)
        ) {
          continue;
        }
        const score = Math.hypot(point.x - centerX, point.y - centerY);
        if (!bestAvailable || score < bestAvailable.score) {
          bestAvailable = { coastTile, focusTile, point, score };
        }
        if (!inView(point)) continue;
        if (!best || score < best.score) {
          best = { coastTile, focusTile, point, score };
        }
      }
    }

    const target = best ?? bestAvailable;
    if (target) {
      this.portTargetTile = target.coastTile;
      this.rememberMapTarget(
        target.coastTile,
        target.focusTile,
        player.smallID(),
      );
      if (best) {
        this.portFocusRequested = false;
        return this.rectAtPoint(target.point.x, target.point.y);
      }
      if (!this.portFocusRequested) {
        this.portFocusRequested = true;
        this.eventBus.emit(
          new GoToPositionEvent(
            this.game.x(target.focusTile) + 0.5,
            this.game.y(target.focusTile) + 0.5,
          ),
        );
      }
      return null;
    }

    this.clearMapTarget();
    if (this.portTargetTile !== null && !this.portFocusRequested) {
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

  private findPortAdjacentSeaTarget(player: TutorialPlayer): DOMRect | null {
    const ports = player.units(UnitType.Port);
    const port = ports.find((unit) => unit.isActive());
    if (!port) {
      this.clearMapTarget();
      return null;
    }

    const portTile = port.tile();
    const visited = new Set<number>([portTile]);
    let frontier = [portTile];
    // The Port is often near the left coast. Bias the launch target slightly
    // right so its spotlight stays comfortably tappable on narrow screens.
    const centerX = window.innerWidth * 0.56;
    const centerY = window.innerHeight * 0.46;
    for (let depth = 1; depth <= 5; depth++) {
      const next: number[] = [];
      const candidates: {
        tile: number;
        point: { x: number; y: number };
        score: number;
      }[] = [];
      for (const tile of frontier) {
        for (const neighbor of this.game.neighbors(tile)) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          if (!this.game.isOcean(neighbor)) continue;
          next.push(neighbor);
          const point = this.transformHandler.worldToScreenCoordinates(
            new Cell(this.game.x(neighbor) + 0.5, this.game.y(neighbor) + 0.5),
          );
          if (
            point.x < MAP_SPOTLIGHT_RADIUS ||
            point.x > window.innerWidth - MAP_SPOTLIGHT_RADIUS ||
            point.y < MAP_SPOTLIGHT_RADIUS ||
            point.y > window.innerHeight - MAP_SPOTLIGHT_RADIUS
          ) {
            continue;
          }
          candidates.push({
            tile: neighbor,
            point,
            score: Math.hypot(point.x - centerX, point.y - centerY),
          });
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.score - b.score);
        const target = candidates[0];
        // Buildables are queried against the clicked tile. Use connected
        // ocean so Warship is buildable; the Port is only the launch anchor.
        this.rememberMapTarget(target.tile);
        return this.rectAtPoint(target.point.x, target.point.y);
      }
      frontier = next;
    }

    // The clicked tile is connected ocean by the Port. The spotlight may
    // overlap the shoreline; requiring its entire ring to be ocean can hide
    // the Warship target even when a valid launch tile is visible.
    this.clearMapTarget();
    return null;
  }

  private findTutorialNukeTarget(): DOMRect | null {
    const target = this.game
      .players()
      .find((candidate) => candidate.static.name === TUTORIAL_NUKE_TARGET_NAME);
    const targetTile = target?.state.spawnTile;
    if (!target || !target.isAlive() || targetTile === undefined) {
      this.clearMapTarget();
      return null;
    }

    const point = this.transformHandler.worldToScreenCoordinates(
      new Cell(this.game.x(targetTile) + 0.5, this.game.y(targetTile) + 0.5),
    );
    const inView =
      point.x >= MAP_SPOTLIGHT_RADIUS &&
      point.x <= window.innerWidth - MAP_SPOTLIGHT_RADIUS &&
      point.y >= MAP_SPOTLIGHT_RADIUS &&
      point.y <= window.innerHeight - MAP_SPOTLIGHT_RADIUS;
    if (!inView) {
      if (!this.rocketFocusRequested) {
        this.rocketFocusRequested = true;
        const center = this.transformHandler.screenToWorldCoordinatesFloat(
          window.innerWidth / 2,
          window.innerHeight / 2,
        );
        this.rocketCameraRestorePosition = {
          ...center,
          zoom: this.transformHandler.scale,
        };
        this.eventBus.emit(
          new GoToPositionEvent(
            this.game.x(targetTile) + 0.5,
            this.game.y(targetTile) + 0.5,
            this.transformHandler.scale,
          ),
        );
      }
      return null;
    }

    this.rememberMapTarget(targetTile, targetTile, target.smallID());
    return this.rectAtPoint(point.x, point.y);
  }

  private restoreRocketCamera() {
    const position = this.rocketCameraRestorePosition;
    if (!position) return;
    this.rocketCameraRestorePosition = null;
    this.rocketFocusRequested = false;
    this.eventBus.emit(
      new GoToPositionEvent(position.x, position.y, position.zoom),
    );
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
    let bestCoast: {
      point: { x: number; y: number };
      score: number;
      tile: number;
    } | null = null;

    for (const tile of this.adjacentUnownedLandTiles) {
      const isOceanCoast = this.game.isOceanShore(tile);
      if (
        (preferCoast && !isOceanCoast) ||
        !this.isOpenLand(this.game.x(tile), this.game.y(tile), tile)
      ) {
        continue;
      }
      const x = this.game.x(tile);
      const y = this.game.y(tile);
      const point = this.transformHandler.worldToScreenCoordinates(
        new Cell(x + 0.5, y + 0.5),
      );
      const score = Math.hypot(point.x - centerX, point.y - centerY);
      if (preferCoast && (!bestCoast || score < bestCoast.score)) {
        bestCoast = { tile, point, score };
      }
      if (
        point.x < left ||
        point.x > right ||
        point.y < top ||
        point.y > bottom
      ) {
        continue;
      }
      if (!best || score < best.score) {
        best = {
          rect: this.rectAtPoint(point.x, point.y),
          score,
          tile,
        };
      }
    }
    const targetTile = best?.tile ?? bestCoast?.tile ?? null;
    if (targetTile !== null) this.rememberMapTarget(targetTile);
    else this.clearMapTarget();
    if (!best && preferCoast && bestCoast && !this.portFocusRequested) {
      this.portFocusRequested = true;
      this.eventBus.emit(
        new GoToPositionEvent(
          this.game.x(bestCoast.tile) + 0.5,
          this.game.y(bestCoast.tile) + 0.5,
        ),
      );
    } else if (best && preferCoast) {
      this.portFocusRequested = false;
    }
    return best?.rect ?? null;
  }

  private findNeighborEnemyTarget(player: TutorialPlayer) {
    const enemyOwners = new Set<number>();
    let focusTile: number | null = null;
    for (const tile of this.adjacentEnemyTiles) {
      if (!this.isCurrentEnemyNeighbor(tile, player)) continue;
      enemyOwners.add(this.game.ownerID(tile));
      focusTile ??= tile;
    }
    if (enemyOwners.size === 0) {
      this.clearMapTarget();
      return null;
    }

    const centerX = window.innerWidth * 0.5;
    const centerY = window.innerHeight * 0.46;
    let best: { rect: DOMRect; score: number; tile: number } | null = null;
    for (let y = 100; y <= window.innerHeight - 140; y += 16) {
      for (let x = 80; x <= window.innerWidth - 80; x += 16) {
        const cell = this.transformHandler.screenToWorldCoordinates(x, y);
        if (!this.game.isValidCoord(cell.x, cell.y)) continue;
        const tile = this.game.ref(cell.x, cell.y);
        if (
          !this.game.hasOwner(tile) ||
          !enemyOwners.has(this.game.ownerID(tile)) ||
          !this.game.isLand(tile) ||
          this.game.isImpassable(tile)
        ) {
          continue;
        }
        const point = this.transformHandler.worldToScreenCoordinates(
          new Cell(cell.x + 0.5, cell.y + 0.5),
        );
        const ownerID = this.game.ownerID(tile);
        if (
          !this.spotlightMatchesRegion(point.x, point.y, (sample) =>
            this.isLandOwnedBy(sample, ownerID),
          )
        ) {
          continue;
        }
        const score = Math.hypot(point.x - centerX, point.y - centerY);
        if (!best || score < best.score) {
          best = { rect: this.rectAtPoint(point.x, point.y), score, tile };
        }
      }
    }
    if (best) {
      this.rememberMapTarget(
        best.tile,
        best.tile,
        this.game.ownerID(best.tile),
      );
      this.attackNeighborFocusRequested = false;
      return best.rect;
    }
    this.clearMapTarget();
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
    if (
      !this.active ||
      (this.current.id === "attack" && this.attackAdvanceAt > 0)
    ) {
      return;
    }
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
        if (this.current.id === "attack" && this.attackAdvanceAt > 0) return;
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
    const above = this.rect.top - hintHeight - 18;
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
          ? html`<img
              class="step-icon"
              src=${this.current.icon}
              width="32"
              height="32"
              alt=""
              aria-hidden="true"
            />`
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
    const spotlightWidth = isMapStep ? this.rect.width : this.rect.width + 24;
    const spotlightHeight = isMapStep
      ? this.rect.height
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
