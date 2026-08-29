import { assetUrl } from "../core/AssetUrls";

const MUSIC_ENABLED_KEY = "worldfront.music.enabled";
const MENU_MUSIC_VOLUME = 0.3;

/** Add tracks here when they are ready, for example: ["music/worldfront-theme.mp3"]. */
const WORLD_FRONT_MUSIC_TRACKS: string[] = [
  "sounds/music/alexander-nakarada-pirates-of-the-quarantine.mp3",
];

class WorldFrontMusicController {
  private readonly tracks = WORLD_FRONT_MUSIC_TRACKS.map((track) =>
    assetUrl(track),
  );
  private audio: HTMLAudioElement | null = null;
  private trackIndex = 0;
  private enabled = this.readEnabledPreference();

  constructor() {
    this.shuffleTracks();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  hasTracks(): boolean {
    return this.tracks.length > 0;
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

  stop(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  private async play(): Promise<void> {
    if (!this.enabled || this.tracks.length === 0) return;
    if (!this.audio) {
      this.audio = new Audio(this.tracks[this.trackIndex]);
      this.audio.preload = "auto";
      this.audio.volume = MENU_MUSIC_VOLUME;
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
    if (this.trackIndex === this.tracks.length - 1) {
      this.shuffleTracks();
      this.trackIndex = 0;
    } else {
      this.trackIndex += 1;
    }
    this.audio.src = this.tracks[this.trackIndex];
    void this.play();
  };

  private shuffleTracks(): void {
    for (let index = this.tracks.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [this.tracks[index], this.tracks[randomIndex]] = [
        this.tracks[randomIndex],
        this.tracks[index],
      ];
    }
  }

  private readEnabledPreference(): boolean {
    try {
      return localStorage.getItem(MUSIC_ENABLED_KEY) !== "false";
    } catch {
      return true;
    }
  }
}

export const worldFrontMusic = new WorldFrontMusicController();
