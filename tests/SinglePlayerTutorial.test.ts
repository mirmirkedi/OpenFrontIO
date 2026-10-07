import { describe, expect, it, vi } from "vitest";
import { SinglePlayerModal } from "../src/client/SinglePlayerModal";

describe("Help tutorial launch", () => {
  it("starts the tutorial with defaults without opening battle setup", async () => {
    const modal = new SinglePlayerModal();
    const loadNationCount = vi.fn().mockResolvedValue(undefined);
    const startGame = vi.fn().mockImplementation(async () => {
      expect(Reflect.get(modal, "tutorialRequested")).toBe(true);
    });
    Reflect.set(modal, "loadNationCount", loadNationCount);
    Reflect.set(modal, "startGame", startGame);

    await modal.startTutorialWithDefaults();

    expect(loadNationCount).toHaveBeenCalledOnce();
    expect(startGame).toHaveBeenCalledOnce();
    expect(modal.isOpen()).toBe(false);
    expect(Reflect.get(modal, "tutorialRequested")).toBe(false);
  });
});
