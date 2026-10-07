import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  BuildMenu,
  buildTable,
} from "../../../../src/client/hud/layers/BuildMenu";
import type { GameView } from "../../../../src/client/view";
import { EventBus } from "../../../../src/core/EventBus";
import { UnitType } from "../../../../src/core/game/Game";
import { BuildUnitIntentEvent } from "../../../../src/client/Transport";

const ACTIVE_KEY = "openfront.tutorial.active";
const STEP_KEY = "openfront.tutorial.step";

describe("BuildMenu tutorial choices", () => {
  beforeEach(() => {
    localStorage.setItem(ACTIVE_KEY, "true");
    localStorage.setItem(STEP_KEY, "4");
  });

  afterEach(() => {
    document.querySelectorAll("build-menu").forEach((menu) => menu.remove());
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(STEP_KEY);
  });

  test("shows the full menu while keeping only City enabled during its lesson", async () => {
    const menu = new BuildMenu();
    const player = { totalUnitLevels: () => 0 };
    menu.game = { myPlayer: () => player } as unknown as GameView;
    menu.playerBuildables = buildTable.flat().map((item) => ({
      type: item.unitType,
      canBuild: 10,
      canUpgrade: false,
      cost: 10n,
    })) as never;
    Reflect.set(menu, "_hidden", false);
    document.body.append(menu);
    await menu.updateComplete;

    const buttons = Array.from(
      menu.shadowRoot?.querySelectorAll<HTMLButtonElement>(".build-button") ??
        [],
    );
    const city = buttons.find(
      (button) => button.dataset.tutorialUnit === String(UnitType.City),
    );

    expect(buttons).toHaveLength(buildTable.flat().length);
    expect(city?.disabled).toBe(false);
    expect(city?.classList.contains("tutorial-dimmed")).toBe(false);
    expect(
      buttons
        .filter((button) => button !== city)
        .every(
          (button) =>
            button.disabled && button.classList.contains("tutorial-dimmed"),
        ),
    ).toBe(true);
  });
});


describe("BuildMenu tutorial silo choice", () => {
  beforeEach(() => {
    localStorage.setItem(ACTIVE_KEY, "true");
    localStorage.setItem(STEP_KEY, "10");
  });

  afterEach(() => {
    document.querySelectorAll("build-menu").forEach((menu) => menu.remove());
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(STEP_KEY);
  });

  test("keeps Missile Silo selectable and emits its build intent in the silo lesson", async () => {
    const menu = new BuildMenu();
    const eventBus = new EventBus();
    const intents: BuildUnitIntentEvent[] = [];
    eventBus.on(BuildUnitIntentEvent, (event) => intents.push(event));
    menu.eventBus = eventBus;
    menu.game = {
      myPlayer: () => ({ totalUnitLevels: () => 0 }),
    } as unknown as GameView;
    menu.uiState = {} as never;
    menu.playerBuildables = buildTable.flat().map((item) => ({
      type: item.unitType,
      canBuild: item.unitType === UnitType.MissileSilo ? false : 10,
      canUpgrade: false,
      cost: 10n,
    })) as never;
    Reflect.set(menu, "clickedTile", 42);
    Reflect.set(menu, "_hidden", false);
    document.body.append(menu);
    await menu.updateComplete;

    const silo = menu.shadowRoot?.querySelector<HTMLButtonElement>(
      `[data-tutorial-unit="${UnitType.MissileSilo}"]`,
    );
    expect(silo?.disabled).toBe(false);
    silo?.click();
    expect(intents).toHaveLength(1);
    expect(intents[0].unit).toBe(UnitType.MissileSilo);
    expect(intents[0].tile).toBe(42);
  });
});
