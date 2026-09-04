/**
 * Android WebView audio can otherwise request exclusive media focus on some
 * devices. Ask the native shell for a mix-friendly game focus instead.
 */
export function requestMixFriendlyAudioFocus(): void {
  try {
    window.WorldFrontAudio?.requestMayDuck();
  } catch {
    // Browsers and older shells do not expose the native bridge.
  }
}

export function releaseMixFriendlyAudioFocus(): void {
  try {
    window.WorldFrontAudio?.abandon();
  } catch {
    // Browsers and older shells do not expose the native bridge.
  }
}

declare global {
  interface Window {
    WorldFrontAudio?: {
      requestMayDuck(): void;
      abandon(): void;
    };
  }
}
