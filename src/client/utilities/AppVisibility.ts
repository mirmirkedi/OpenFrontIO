/** Browser visibility plus the Android activity lifecycle (including split-screen). */
export function observeAppVisibility(
  onChange: (visible: boolean) => void,
): () => void {
  let nativeActive = true;
  try {
    nativeActive = window.WorldFrontPower?.isAppActive() ?? true;
  } catch {
    // Older Android shells and browsers have no power bridge.
  }
  const notify = () => onChange(!document.hidden && nativeActive);
  const onNativeState = (event: Event) => {
    const active: unknown = (event as CustomEvent).detail?.active;
    if (typeof active === "boolean") nativeActive = active;
    notify();
  };
  document.addEventListener("visibilitychange", notify);
  window.addEventListener("worldfront-app-state", onNativeState);
  notify();
  return () => {
    document.removeEventListener("visibilitychange", notify);
    window.removeEventListener("worldfront-app-state", onNativeState);
  };
}

declare global {
  interface Window {
    WorldFrontPower?: {
      isAppActive(): boolean;
      getThermalStatus(): number;
    };
  }
}
