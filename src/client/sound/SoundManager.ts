import { Howl } from "howler";
import { assetUrl } from "../../core/AssetUrls";
import { EventBus } from "../../core/EventBus";
import { UserSettings } from "../../core/game/UserSettings";
import {
  PlaySoundEffectEvent,
  SetBackgroundMusicVolumeEvent,
  SetSoundEffectsVolumeEvent,
  SoundEffect,
  soundEffectUrls,
} from "./Sounds";

export const MAX_CONCURRENT_SOUNDS = 8;
const PIRATE_MUSIC_GAIN = 0.65;
const NON_PIRATE_MUSIC_GAIN = 0.4;

export class SoundManager {
  private backgroundMusic: Howl[] = [];
  private backgroundMusicIsPirate: boolean[] = [];
  private currentTrack: number = 0;
  private soundEffects: Map<SoundEffect, Howl> = new Map();
  private soundEffectsVolume: number = 1;
  private backgroundMusicVolume: number = 0;
  private activeSounds: { howl: Howl; id: number }[] = [];
  private eventBus: EventBus;
  private onPlaySoundEffect: (e: PlaySoundEffectEvent) => void;
  private onSetBackgroundMusicVolume: (
    e: SetBackgroundMusicVolumeEvent,
  ) => void;
  private onSetSoundEffectsVolume: (e: SetSoundEffectsVolumeEvent) => void;

  constructor(eventBus: EventBus, userSettings: UserSettings) {
    this.eventBus = eventBus;
    this.safely("initialize background music", () => {
      this.backgroundMusic = [
        new Howl({
          src: [assetUrl("sounds/music/miguel-johnson-good-day-to-die.mp3")],
          loop: false,
          onend: this.playNext.bind(this),
          volume: 0,
        }),
        new Howl({
          src: [assetUrl("sounds/music/scott-buckley-legionnaire.mp3")],
          loop: false,
          onend: this.playNext.bind(this),
          volume: 0,
        }),
        new Howl({
          src: [
            assetUrl(
              "sounds/music/alexander-nakarada-pirates-of-the-quarantine.mp3",
            ),
          ],
          loop: false,
          onend: this.playNext.bind(this),
          volume: 0,
        }),
      ];
      this.backgroundMusicIsPirate = [false, false, true];
      this.shuffleBackgroundMusic();
    });
    this.setBackgroundMusicVolume(userSettings.backgroundMusicVolume());
    this.setSoundEffectsVolume(userSettings.soundEffectsVolume());
    this.onPlaySoundEffect = (e) => this.playSoundEffect(e.effect);
    this.onSetBackgroundMusicVolume = (e) =>
      this.setBackgroundMusicVolume(e.volume);
    this.onSetSoundEffectsVolume = (e) => this.setSoundEffectsVolume(e.volume);
    eventBus.on(PlaySoundEffectEvent, this.onPlaySoundEffect);
    eventBus.on(SetBackgroundMusicVolumeEvent, this.onSetBackgroundMusicVolume);
    eventBus.on(SetSoundEffectsVolumeEvent, this.onSetSoundEffectsVolume);
  }

  public dispose(): void {
    this.eventBus.off(PlaySoundEffectEvent, this.onPlaySoundEffect);
    this.eventBus.off(
      SetBackgroundMusicVolumeEvent,
      this.onSetBackgroundMusicVolume,
    );
    this.eventBus.off(SetSoundEffectsVolumeEvent, this.onSetSoundEffectsVolume);
    this.backgroundMusic.forEach((track) => {
      this.safely("stop background track", () => track.stop());
      this.safely("unload background track", () => track.unload());
    });
    this.soundEffects.forEach((sound) => {
      this.safely("stop sound effect", () => sound.stop());
      this.safely("unload sound effect", () => sound.unload());
    });
    this.soundEffects.clear();
    this.activeSounds = [];
  }

  private safely(action: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.error(`SoundManager: failed to ${action}`, err);
    }
  }

  public playBackgroundMusic(): void {
    this.safely("play background music", () => {
      if (
        this.backgroundMusic.length > 0 &&
        !this.backgroundMusic[this.currentTrack].playing()
      ) {
        this.backgroundMusic[this.currentTrack].play();
      }
    });
  }

  public stopBackgroundMusic(): void {
    this.safely("stop background music", () => {
      if (this.backgroundMusic.length > 0) {
        this.backgroundMusic[this.currentTrack].stop();
      }
    });
  }

  // Slider positions are linear (0–1) but perceived loudness is roughly
  // logarithmic, so feeding the position straight to Howler makes the top of
  // the range sound identical. Square the position for an audio-taper curve.
  private perceptualGain(position: number): number {
    const clamped = Math.max(0, Math.min(1, position));
    return clamped * clamped;
  }

  public setBackgroundMusicVolume(volume: number): void {
    this.backgroundMusicVolume = this.perceptualGain(volume);
    this.safely("set background music volume", () => {
      this.backgroundMusic.forEach((track, index) => {
        const gain = this.backgroundMusicIsPirate[index]
          ? PIRATE_MUSIC_GAIN
          : NON_PIRATE_MUSIC_GAIN;
        track.volume(this.backgroundMusicVolume * gain);
      });
    });
  }

  private playNext(): void {
    if (this.backgroundMusic.length === 0) return;
    if (this.currentTrack === this.backgroundMusic.length - 1) {
      this.shuffleBackgroundMusic();
      this.currentTrack = 0;
    } else {
      this.currentTrack += 1;
    }
    this.playBackgroundMusic();
  }

  private shuffleBackgroundMusic(): void {
    for (let index = this.backgroundMusic.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [this.backgroundMusic[index], this.backgroundMusic[randomIndex]] = [
        this.backgroundMusic[randomIndex],
        this.backgroundMusic[index],
      ];
      [
        this.backgroundMusicIsPirate[index],
        this.backgroundMusicIsPirate[randomIndex],
      ] = [
        this.backgroundMusicIsPirate[randomIndex],
        this.backgroundMusicIsPirate[index],
      ];
    }
  }

  private getOrLoadSoundEffect(name: SoundEffect): Howl | null {
    let sound = this.soundEffects.get(name);
    if (sound) return sound;
    const src = soundEffectUrls.get(name);
    if (!src) return null;
    try {
      sound = new Howl({ src: [src], volume: this.soundEffectsVolume });
      this.soundEffects.set(name, sound);
      return sound;
    } catch (err) {
      console.error(`SoundManager: failed to load sound ${name}`, err);
      return null;
    }
  }

  private removeActiveSoundById(id: number): void {
    this.activeSounds = this.activeSounds.filter((s) => s.id !== id);
  }

  public playSoundEffect(name: SoundEffect): void {
    this.safely(`play sound ${name}`, () => {
      const howl = this.getOrLoadSoundEffect(name);
      if (!howl) return;

      if (this.activeSounds.length >= MAX_CONCURRENT_SOUNDS) {
        const oldest = this.activeSounds[0];
        oldest.howl.stop(oldest.id);
        this.removeActiveSoundById(oldest.id);
      }

      const id = howl.play();
      this.activeSounds.push({ howl, id });
      howl.once("end", () => this.removeActiveSoundById(id), id);
      howl.once("stop", () => this.removeActiveSoundById(id), id);
    });
  }

  public setSoundEffectsVolume(volume: number): void {
    this.soundEffectsVolume = this.perceptualGain(volume);
    this.safely("set sound effects volume", () => {
      this.soundEffects.forEach((sound) => {
        sound.volume(this.soundEffectsVolume);
      });
    });
  }

  public stopSoundEffect(name: SoundEffect): void {
    this.safely(`stop sound ${name}`, () => {
      const howl = this.soundEffects.get(name);
      if (howl) {
        howl.stop();
        this.activeSounds = this.activeSounds.filter((s) => s.howl !== howl);
      }
    });
  }
}
