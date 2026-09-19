import { Cell } from "src/core/game/Game";
import { EventBus } from "../../core/EventBus";
import { UnitType } from "../../core/game/Game";
import { Controller } from "../Controller";
import {
  CloseViewEvent,
  ContextMenuEvent,
  MouseUpEvent,
  SelectAllWarshipsEvent,
  TouchEvent,
  UnitSelectionEvent,
  WarshipSelectionBoxCancelEvent,
  WarshipSelectionBoxCompleteEvent,
  WarshipSelectionBoxUpdateEvent,
} from "../InputHandler";
import { MapRenderer } from "../render/gl";
import { TransformHandler } from "../TransformHandler";
import { UIState } from "../UIState";
import { GameView, UnitView } from "../view";

/**
 * Controller for warship selection state + click handling.
 *
 * Drawing for selection boxes (single + multi) lives in the WebGL
 * SelectionBoxPass (forwarded via UnitSelectionEvent from ClientGameRunner).
 * The drag-rectangle preview is a screen-space DOM overlay (dragRectEl) we
 * own here.
 *
 * This class does not render anything to canvas2D — it's purely a state +
 * click controller. The "Controller" pattern: main-thread analog of the
 * worker's Execution (init + tick + event subscriptions).
 */
export class WarshipSelectionController implements Controller {
  // Currently selected single warship (game-logic readers use this; the
  // visual is drawn by WebGL SelectionBoxPass).
  private selectedUnit: UnitView | null = null;
  // Currently multi-selected warships (shift+drag box select).
  private multiSelectedWarships: UnitView[] = [];

  // Drag rectangle (shift+drag warship selection box) — a screen-space DOM
  // overlay positioned via inline style.
  private dragRectEl: HTMLDivElement | null = null;

  constructor(
    private game: GameView,
    private eventBus: EventBus,
    private transformHandler: TransformHandler,
    private view: MapRenderer,
    private uiState?: UIState,
  ) {}

  tick() {
    // Prune any destroyed warships from the multi-selection. The WebGL
    // SelectionBoxPass also drops them automatically.
    this.multiSelectedWarships = this.multiSelectedWarships.filter((u) =>
      u.isActive(),
    );
  }

  init() {
    this.eventBus.on(UnitSelectionEvent, (e) => this.onUnitSelection(e));

    this.ensureDragRectEl();
    this.eventBus.on(WarshipSelectionBoxUpdateEvent, (e) => {
      this.updateDragRect(e.startX, e.startY, e.endX, e.endY);
    });
    const clearBox = () => this.hideDragRect();
    this.eventBus.on(WarshipSelectionBoxCompleteEvent, clearBox);
    this.eventBus.on(WarshipSelectionBoxCancelEvent, clearBox);
    this.eventBus.on(CloseViewEvent, clearBox);

    // Normal map clicks are routed through the radial menu by
    // ClientGameRunner. This controller only owns explicit warship selection.
    this.eventBus.on(TouchEvent, (e) => this.onTouch(e));
    this.eventBus.on(WarshipSelectionBoxCompleteEvent, (e) =>
      this.onSelectionBoxComplete(e),
    );
    this.eventBus.on(SelectAllWarshipsEvent, () => this.onSelectAllWarships());
  }

  /**
   * Lazily create the shift+drag rectangle overlay. Screen-space DOM element,
   * pointer-events: none so it doesn't intercept the drag itself. z-index
   * sits above the WebGL/canvas2D map canvases but below HUD modals.
   */
  private ensureDragRectEl(): void {
    if (this.dragRectEl !== null) return;
    const el = document.createElement("div");
    el.id = "warship-drag-rect";
    el.style.position = "fixed";
    el.style.pointerEvents = "none";
    el.style.display = "none";
    el.style.zIndex = "30";
    el.style.borderStyle = "dashed";
    el.style.borderWidth = "1px";
    el.style.boxSizing = "border-box";
    document.body.appendChild(el);
    this.dragRectEl = el;
  }

  private updateDragRect(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): void {
    const el = this.dragRectEl;
    if (el === null) return;
    const x1 = Math.min(startX, endX);
    const y1 = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);

    // Color from the local player's territory tint (matches the canvas2D look).
    const myPlayer = this.game.myPlayer();
    const base = myPlayer ? myPlayer.territoryColor().lighten(0.2) : null;
    const border = base
      ? base.alpha(0.85).toRgbString()
      : "rgba(100, 200, 255, 0.85)";
    const fill = base
      ? base.alpha(0.06).toRgbString()
      : "rgba(100, 200, 255, 0.06)";

    el.style.left = `${x1}px`;
    el.style.top = `${y1}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.borderColor = border;
    el.style.backgroundColor = fill;
    el.style.display = "block";
  }

  private hideDragRect(): void {
    if (this.dragRectEl !== null) this.dragRectEl.style.display = "none";
  }

  /** Route every normal touch to the radial menu, including water tiles. */
  private onTouch(event: TouchEvent) {
    const cell = this.transformHandler.screenToWorldCoordinates(
      event.x,
      event.y,
    );
    if (!this.game.isValidCoord(cell.x, cell.y)) return;

    const clickRef = this.game.ref(cell.x, cell.y);
    if (this.game.inSpawnPhase()) {
      if (!this.game.isWater(clickRef)) {
        this.eventBus.emit(new MouseUpEvent(event.x, event.y));
      }
      return;
    }
    if (this.uiState && this.uiState.ghostStructure !== null) {
      return;
    }
    this.eventBus.emit(new ContextMenuEvent(event.x, event.y));
  }

  /**
   * Resolve a shift+drag selection box: gather all player-owned warships
   * whose screen position falls inside the rectangle.
   */
  private onSelectionBoxComplete(event: WarshipSelectionBoxCompleteEvent) {
    const x1 = Math.min(event.startX, event.endX);
    const y1 = Math.min(event.startY, event.endY);
    const x2 = Math.max(event.startX, event.endX);
    const y2 = Math.max(event.startY, event.endY);

    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return;

    const selected = this.game.units(UnitType.Warship).filter((unit) => {
      if (!unit.isActive() || unit.owner() !== myPlayer) return false;
      const screen = this.transformHandler.worldToScreenCoordinates(
        new Cell(this.game.x(unit.tile()), this.game.y(unit.tile())),
      );
      return (
        screen.x >= x1 && screen.x <= x2 && screen.y >= y1 && screen.y <= y2
      );
    });

    // Clear single selection if we got a box selection
    if (selected.length > 0 && this.selectedUnit) {
      this.eventBus.emit(new UnitSelectionEvent(this.selectedUnit, false));
    }
    this.eventBus.emit(new UnitSelectionEvent(null, true, selected));
  }

  private getAllWarships(): UnitView[] {
    const myPlayer = this.game.myPlayer();
    if (!myPlayer) return [];
    return this.game
      .units(UnitType.Warship)
      .filter((u) => u.isActive() && u.owner() === myPlayer);
  }

  public selectedAllWarships(): boolean {
    const allWarships = this.getAllWarships();
    return (
      allWarships.length > 0 &&
      this.multiSelectedWarships.length === allWarships.length
    );
  }

  private onSelectAllWarships() {
    const allWarships = this.getAllWarships();
    if (allWarships.length === 0) return;

    if (this.selectedUnit) {
      this.eventBus.emit(new UnitSelectionEvent(this.selectedUnit, false));
    }
    this.eventBus.emit(
      new UnitSelectionEvent(null, !this.selectedAllWarships(), allWarships),
    );
  }

  /**
   * Handle the unit selection event (single or multi).
   * When event.units.length > 0 it's a multi-selection from box/select-all.
   * When event.unit is set it's a single warship selection.
   * When event.isSelected is false it clears all selection state.
   */
  private onUnitSelection(event: UnitSelectionEvent) {
    this.multiSelectedWarships = [];
    this.selectedUnit = null;

    if (!event.isSelected) {
      this.view.setSelectedUnits([]);
      return;
    }

    if ((event.units ?? []).length > 0) {
      this.multiSelectedWarships = event.units;
      this.view.setSelectedUnits(event.units.map((u) => u.id()));
    } else {
      this.selectedUnit = event.unit;
      this.view.setSelectedUnits(event.unit ? [event.unit.id()] : []);
    }
  }
}
