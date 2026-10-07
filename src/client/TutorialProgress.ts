const ACTIVE_KEY = "openfront.tutorial.active";
const COMPLETED_KEY = "openfront.tutorial.completed";
const SKIPPED_KEY = "openfront.tutorial.skipped";
const STEP_KEY = "openfront.tutorial.step";

export const TUTORIAL_LAUNCH_PENDING_KEY = "openfront.tutorial.launch-pending";

/** Prepare tutorial state for a newly launched single-player match. */
export function prepareTutorialForGameStart(tutorialMode: boolean) {
  sessionStorage.removeItem(TUTORIAL_LAUNCH_PENDING_KEY);
  localStorage.removeItem(STEP_KEY);

  if (tutorialMode) {
    localStorage.setItem(ACTIVE_KEY, "true");
    localStorage.removeItem(SKIPPED_KEY);
    sessionStorage.setItem(TUTORIAL_LAUNCH_PENDING_KEY, "true");
  } else {
    // A Help-page replay is only active for its current match. Do not let its
    // tutorial restrictions leak into the player's next ordinary game.
    localStorage.removeItem(ACTIVE_KEY);
  }
}

/** Resolve persisted tutorial flags when a game renderer is initialized. */
export function activateTutorialForGame(isSinglePlayer: boolean): boolean {
  const launchPending =
    sessionStorage.getItem(TUTORIAL_LAUNCH_PENDING_KEY) === "true";
  sessionStorage.removeItem(TUTORIAL_LAUNCH_PENDING_KEY);

  if (!isSinglePlayer) {
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(STEP_KEY);
    return false;
  }

  if (localStorage.getItem(ACTIVE_KEY) !== "true") return false;

  // A freshly requested tutorial (including a Help replay) is allowed to run
  // once even if this player completed it before.
  if (launchPending) return true;

  // Without a fresh launch marker, this is a leftover tutorial from a prior
  // page/game session. Restart it for new players; discard Help replays for
  // players who already completed or skipped the tutorial.
  if (
    localStorage.getItem(COMPLETED_KEY) === "true" ||
    localStorage.getItem(SKIPPED_KEY) === "true"
  ) {
    localStorage.removeItem(ACTIVE_KEY);
    localStorage.removeItem(STEP_KEY);
    return false;
  }

  localStorage.setItem(STEP_KEY, "0");
  return true;
}
