import { isOpenTroopApp } from "../../../AppMode";

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

/**
 * Device-pixel-ratio used by the WebGL renderer for its backing store and all
 * screen↔world math.
 *
 * The Android WebView is fill-rate bound on many phones. Rendering a 3x
 * device-pixel canvas costs roughly 9x the fragment work of 1x, while the
 * extra sharpness is hard to notice during map panning. The web client keeps
 * the existing 2x cap; the packaged game uses a conservative cap based on
 * the device's reported CPU/RAM class. This keeps every map, unit, and shader
 * feature intact — only the backing-buffer resolution changes.
 */
export function renderDpr(): number {
  const nativeDpr = Math.min(window.devicePixelRatio || 2, 2);
  if (!isOpenTroopApp()) return nativeDpr;

  const nav = navigator as NavigatorWithMemory;
  const lowMemory = nav.deviceMemory !== undefined && nav.deviceMemory <= 4;
  const lowCpu =
    nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 4;

  // Lower-end Android devices get the largest reduction; stronger devices
  // still avoid the expensive 2x/3x backing store used by high-DPI phones.
  return Math.min(nativeDpr, lowMemory || lowCpu ? 1.25 : 1.5);
}
