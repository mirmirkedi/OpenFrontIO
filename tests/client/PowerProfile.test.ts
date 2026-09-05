import { FramePacer } from "../../src/client/render/FramePacer";
import {
  renderDpr,
  setAppDprLimit,
} from "../../src/client/render/gl/utils/Dpr";
import { PowerProfile } from "../../src/client/render/PowerProfile";
import { observeAppVisibility } from "../../src/client/utilities/AppVisibility";

describe("frame pacing", () => {
  it.each([60, 90, 120, 144])(
    "caps a %s Hz display at 60 FPS without a half-rate bug",
    (hz) => {
      const pacer = new FramePacer();
      let rendered = 0;
      for (let i = 0; i < hz * 10; i++)
        if (pacer.shouldRender((i * 1000) / hz, 60)) rendered++;
      expect(rendered).toBeGreaterThanOrEqual(599);
      expect(rendered).toBeLessThanOrEqual(601);
    },
  );

  it.each([30, 45])(
    "paces %s FPS and doesn't burst after a long suspension",
    (fps) => {
      const pacer = new FramePacer();
      let rendered = 0;
      for (let i = 0; i < 1200; i++)
        if (pacer.shouldRender((i * 1000) / 120, fps)) rendered++;
      expect(rendered).toBeGreaterThanOrEqual(fps * 10 - 1);
      expect(rendered).toBeLessThanOrEqual(fps * 10 + 1);
      expect(pacer.shouldRender(100_000, fps)).toBe(true);
      expect(pacer.shouldRender(100_001, fps)).toBe(false);
      pacer.reset();
      expect(pacer.shouldRender(100_002, 60)).toBe(true);
    },
  );

  it("does not halve 59.94 Hz screens", () => {
    const pacer = new FramePacer();
    for (let i = 0; i < 600; i++)
      expect(pacer.shouldRender((i * 1000) / 59.94, 60)).toBe(true);
  });
});

describe("mobile power profile", () => {
  it("uses 60 FPS for activity, 30 after ten quiet seconds, and wakes immediately", () => {
    const profile = new PowerProfile();
    profile.markActivity(100);
    expect(profile.fps(10_099)).toBe(60);
    expect(profile.fps(10_100)).toBe(30);
    profile.markActivity(10_101);
    expect(profile.fps(10_101)).toBe(60);
  });

  it("reduces quality only on real thermal pressure and waits 30 seconds before recovery", () => {
    const profile = new PowerProfile();
    profile.updateThermal(1, 0);
    expect(profile.fpsLimit).toBe(60);
    profile.updateThermal(2, 1);
    expect(profile.fpsLimit).toBe(60);
    expect(profile.dprLimit).toBe(1);
    profile.updateThermal(3, 2);
    expect(profile.fpsLimit).toBe(30);
    expect(profile.dprLimit).toBe(1);
    expect(profile.reduceEffects).toBe(true);
    profile.updateThermal(0, 10);
    profile.updateThermal(0, 30_009);
    expect(profile.fpsLimit).toBe(30);
    profile.updateThermal(0, 30_010);
    expect(profile.fpsLimit).toBe(60);
    expect(profile.reduceEffects).toBe(false);
  });

  it("resets cooling hysteresis on renewed heat and ignores malformed bridge data", () => {
    const profile = new PowerProfile();
    profile.updateThermal(3, 0);
    profile.updateThermal(0, 1000);
    profile.updateThermal(3, 29_000);
    profile.updateThermal(0, 30_000);
    profile.updateThermal(NaN, 40_000);
    profile.updateThermal(-1, 41_000);
    profile.updateThermal(0, 59_999);
    expect(profile.fpsLimit).toBe(30);
  });
});

describe("native lifecycle and DPR", () => {
  afterEach(() => {
    delete window.WorldFrontPower;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setAppDprLimit(1.25);
  });

  it("requires both browser and native activity to be visible and removes listeners", () => {
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    window.WorldFrontPower = {
      isAppActive: () => true,
      getThermalStatus: () => 0,
    };
    const changed = vi.fn();
    const stop = observeAppVisibility(changed);
    const state = (active: boolean) =>
      window.dispatchEvent(
        new CustomEvent("worldfront-app-state", { detail: { active } }),
      );
    expect(changed).toHaveBeenLastCalledWith(true);
    state(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(changed).toHaveBeenLastCalledWith(false);
    hidden = true;
    state(true);
    expect(changed).toHaveBeenLastCalledWith(false);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(changed).toHaveBeenLastCalledWith(true);
    const count = changed.mock.calls.length;
    stop();
    state(false);
    expect(changed).toHaveBeenCalledTimes(count);
  });

  it("shares the app resolution limit while preserving web DPR", () => {
    vi.stubGlobal("BOOTSTRAP_CONFIG", { openTroopApp: true });
    vi.stubGlobal("devicePixelRatio", 3);
    expect(renderDpr()).toBe(1.25);
    setAppDprLimit(1);
    expect(renderDpr()).toBe(1);
    vi.stubGlobal("BOOTSTRAP_CONFIG", { openTroopApp: false });
    expect(renderDpr()).toBe(2);
  });
});
