export type ThermalLevel = "normal" | "warm" | "hot";

/** Only real Android thermal status changes quality; slow frames alone do not. */
export class PowerProfile {
  private level: ThermalLevel = "normal";
  private coolingSince: number | null = null;
  private lastActivityAt = 0;

  markActivity(now: number) {
    this.lastActivityAt = now;
  }

  updateThermal(status: number, now: number) {
    if (!Number.isInteger(status) || status < 0 || status > 6) return;
    // Android: NONE=0, LIGHT=1, MODERATE=2, SEVERE=3.
    const next = status >= 3 ? "hot" : status >= 2 ? "warm" : "normal";
    const rank = { normal: 0, warm: 1, hot: 2 };
    if (rank[next] >= rank[this.level]) {
      this.level = next;
      this.coolingSince = null;
    } else {
      this.coolingSince ??= now;
      if (now - this.coolingSince >= 30_000) {
        this.level = next;
        this.coolingSince = null;
      }
    }
  }

  get fpsLimit(): number {
    // Prefer even frame intervals on common 60/120 Hz screens; avoid a 45 FPS step.
    return this.level === "hot" ? 30 : 60;
  }

  fps(now: number): number {
    return now - this.lastActivityAt >= 10_000
      ? Math.min(30, this.fpsLimit)
      : this.fpsLimit;
  }

  get dprLimit(): number {
    return this.level === "normal" ? 1.25 : 1;
  }

  get reduceEffects(): boolean {
    return this.level === "hot";
  }
}
