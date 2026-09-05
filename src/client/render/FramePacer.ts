/** Limit rendering without accumulating a backlog or changing simulation time. */
export class FramePacer {
  private nextFrame = 0;
  private fps = 0;

  reset() {
    this.nextFrame = 0;
    this.fps = 0;
  }

  shouldRender(now: number, fps: number): boolean {
    const interval = 1000 / fps;
    if (fps !== this.fps) {
      this.fps = fps;
      this.nextFrame = now;
    }
    // Small tolerance avoids dropping every other frame on 59.94 Hz screens.
    if (now + 0.5 < this.nextFrame) return false;
    this.nextFrame += interval;
    if (this.nextFrame < now) this.nextFrame = now + interval;
    return true;
  }
}
