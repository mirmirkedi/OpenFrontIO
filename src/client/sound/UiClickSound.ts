import { Howl } from "howler";
import { assetUrl } from "../../core/AssetUrls";
import { EventBus } from "../../core/EventBus";
import { UserSettings } from "../../core/game/UserSettings";
import { SetSoundEffectsVolumeEvent } from "./Sounds";

// A lot of the mobile shell is intentionally rendered as cards instead of
// native buttons. Those cards use the shared cursor-pointer utility class.
// Keep an explicit escape hatch for controls that do not use that class.
const CLICKABLE_SELECTOR = "button,[role=button],[data-ui-sound],.cursor-pointer";
const IGNORED_SELECTOR =
  "input,textarea,select,canvas,radial-menu,[data-ui-sound-ignore]";

/** Adds a quiet click only to deliberate action buttons in the app shell. */
export function installUiClickSound(
  eventBus: EventBus,
  userSettings: UserSettings,
): void {
  let volume = userSettings.soundEffectsVolume();
  let lastClickAt = 0;
  const click = new Howl({
    src: [assetUrl("sounds/effects/click.mp3")],
    volume: volume * volume,
  });

  const onVolumeChange = (event: SetSoundEffectsVolumeEvent) => {
    volume = Math.max(0, Math.min(1, event.volume));
    click.volume(volume * volume);
  };
  const onClick = (event: MouseEvent) => {
    const path = event.composedPath();
    const target = path.find(
      (node): node is Element =>
        node instanceof Element && node.matches(CLICKABLE_SELECTOR),
    );
    if (
      !target ||
      target.matches(":disabled,[aria-disabled='true']") ||
      target.matches(IGNORED_SELECTOR) ||
      target.closest(IGNORED_SELECTOR)
    ) {
      return;
    }

    // A single tap can bubble through nested clickable elements. Avoid a
    // doubled sound without making normal fast taps feel unresponsive.
    const now = performance.now();
    if (now - lastClickAt < 55) {
      return;
    }
    lastClickAt = now;
    click.play();
  };

  eventBus.on(SetSoundEffectsVolumeEvent, onVolumeChange);
  document.addEventListener("click", onClick, true);
}
