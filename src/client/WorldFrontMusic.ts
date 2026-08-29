import { assetUrl } from "../core/AssetUrls";

const MUSIC_ENABLED_KEY = "worldfront.music.enabled";

/** Add tracks here when they are ready, for example: ["music/worldfront-theme.mp3"]. */
const WORLD_FRONT_MUSIC_TRACKS: string[] = [];

class WorldFrontMusicController {
  private readonly tracks = WORLD_FRONT_MUSIC_TRACKS.map((track) =>
    assetUrl(track),
  );
  private audio: HTMLAudioElement | null = null;
  private trackIndex = 0;
  private enabled = this.readEnabledPreference();

  isEnabled(): boolean {
    return this.enabled;
  }
  toggle(): void {
    this.setEnabled(!this.enabled);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    try {
      localStorage.setItem(MUSIC_ENABLED_KEY, String(enabled));
    } catch {
      /* Restricted WebView/private mode. */
    }
    if (enabled) void this.play();
    else this.audio?.pause();
    window.dispatchEvent(
      new CustomEvent("worldfront-music-changed", { detail: { enabled } }),
    );
  }

  /** Call from a user gesture to satisfy browser autoplay policies. */
  unlock(): void {
    if (this.enabled) void this.play();
  }

  private async play(): Promise<void> {
    if (!this.enabled || this.tracks.length === 0) return;
    if (!this.audio) {
      this.audio = new Audio(this.tracks[this.trackIndex]);
      this.audio.preload = "auto";
      this.audio.addEventListener("ended", this.playNext);
    }
    try {
      await this.audio.play();
    } catch {
      /* Autoplay waits for a user gesture. */
    }
  }

  private playNext = (): void => {
    if (!this.audio || !this.enabled || this.tracks.length === 0) return;
    this.trackIndex = (this.trackIndex + 1) % this.tracks.length;
    this.audio.src = this.tracks[this.trackIndex];
    void this.play();
  };

  private readEnabledPreference(): boolean {
    try {
      return localStorage.getItem(MUSIC_ENABLED_KEY) !== "false";
    } catch {
      return true;
    }
  }
}

export const worldFrontMusic = new WorldFrontMusicController();
