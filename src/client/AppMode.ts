/**
 * The OpenTroop Android build is intentionally bot-only for its first release.
 * Keeping this as a server-provided bootstrap flag lets the normal web build
 * remain unchanged while the packaged client can disable online-only surfaces.
 */
export function isOpenTroopApp(): boolean {
  return window.BOOTSTRAP_CONFIG?.openTroopApp === true;
}

export function openTroopMapIds(): string[] {
  // An empty array means there is no map allow-list.
  return window.BOOTSTRAP_CONFIG?.openTroopMapIds ?? [];
}
