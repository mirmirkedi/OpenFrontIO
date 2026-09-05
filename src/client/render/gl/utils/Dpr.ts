import { isOpenTroopApp } from "../../../AppMode";

let appDprLimit = 1.25;

/** Shared by canvas size and all screen/world conversions. */
export function setAppDprLimit(limit: number): void {
  appDprLimit = Math.min(1.25, Math.max(1, limit));
}

/**
 * Device-pixel-ratio used by the WebGL renderer for its backing store and all
 * screen↔world math.
 *
 * The Android WebView is fill-rate bound on many phones. Rendering a 3x
 * device-pixel canvas costs roughly 9x the fragment work of 1x, while the
 * extra sharpness is hard to notice during map panning. The web client keeps
 * the existing 2x cap; the packaged game uses 1.25x, falling to 1x under
 * moderate or severe thermal pressure. This keeps every map, unit, and shader
 * feature intact — only the backing-buffer resolution changes.
 */
export function renderDpr(): number {
  const nativeDpr = Math.min(window.devicePixelRatio || 2, 2);
  if (!isOpenTroopApp()) return nativeDpr;

  return Math.min(nativeDpr, appDprLimit);
}
