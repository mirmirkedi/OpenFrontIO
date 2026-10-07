import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  BuildMenu,
  buildTable,
} from "../../../../src/client/hud/layers/BuildMenu";
import type { GameView } from "../../../../src/client/view";
import { UnitType } from "../../../../src/core/game/Game";

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
