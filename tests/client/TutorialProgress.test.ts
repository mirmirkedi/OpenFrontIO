import { beforeEach, describe, expect, test } from "vitest";
import {
  activateTutorialForGame,
  prepareTutorialForGameStart,
  TUTORIAL_LAUNCH_PENDING_KEY,
} from "../../src/client/TutorialProgress";

const ACTIVE_KEY = "openfront.tutorial.active";
const COMPLETED_KEY = "openfront.tutorial.completed";
const SKIPPED_KEY = "openfront.tutorial.skipped";
const STEP_KEY = "openfront.tutorial.step";

describe("tutorial progress across game sessions", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  test("a new tutorial launch always starts from its first lesson", () => {
    localStorage.setItem(STEP_KEY, "3");
    prepareTutorialForGameStart(true);

    expect(localStorage.getItem(ACTIVE_KEY)).toBe("true");
    expect(localStorage.getItem(STEP_KEY)).toBeNull();
    expect(activateTutorialForGame(true)).toBe(true);
    expect(localStorage.getItem(STEP_KEY)).toBeNull();
    expect(sessionStorage.getItem(TUTORIAL_LAUNCH_PENDING_KEY)).toBeNull();
  });

  test("an unfinished tutorial restarts at step one after the app is reopened", () => {
    localStorage.setItem(ACTIVE_KEY, "true");
    localStorage.setItem(STEP_KEY, "3");

    expect(activateTutorialForGame(true)).toBe(true);
    expect(localStorage.getItem(STEP_KEY)).toBe("0");
  });

  test("an interrupted Help replay is discarded for a returning player", () => {
    localStorage.setItem(ACTIVE_KEY, "true");
    localStorage.setItem(COMPLETED_KEY, "true");
    localStorage.setItem(STEP_KEY, "3");

    expect(activateTutorialForGame(true)).toBe(false);
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
    expect(localStorage.getItem(STEP_KEY)).toBeNull();
  });

  test("a fresh Help replay can run once even after tutorial completion", () => {
    localStorage.setItem(COMPLETED_KEY, "true");
    prepareTutorialForGameStart(true);

    expect(activateTutorialForGame(true)).toBe(true);
  });

  test("starting an ordinary game clears stale tutorial restrictions", () => {
    localStorage.setItem(ACTIVE_KEY, "true");
    localStorage.setItem(STEP_KEY, "3");
    sessionStorage.setItem(TUTORIAL_LAUNCH_PENDING_KEY, "true");

    prepareTutorialForGameStart(false);

    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
    expect(localStorage.getItem(STEP_KEY)).toBeNull();
    expect(sessionStorage.getItem(TUTORIAL_LAUNCH_PENDING_KEY)).toBeNull();
    expect(activateTutorialForGame(true)).toBe(false);
  });

  test("an interrupted skipped tutorial stays disabled", () => {
    localStorage.setItem(ACTIVE_KEY, "true");
    localStorage.setItem(SKIPPED_KEY, "true");
    localStorage.setItem(STEP_KEY, "3");

    expect(activateTutorialForGame(true)).toBe(false);
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
    expect(localStorage.getItem(STEP_KEY)).toBeNull();
  });
});
