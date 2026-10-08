import Countries from "resources/countries.json" with { type: "json" };
import { UserSettings } from "../core/game/UserSettings";

const COUNTRY_LOOKUP_TIMEOUT_MS = 1500;
const countries = Countries as { code: string; restricted?: boolean }[];

/** Set the local IP's country flag on first game launch, unless chosen. */
export async function initializeDefaultCountryFlag(
  settings: UserSettings,
): Promise<void> {
  if (settings.isCountryFlagInitializationComplete()) return;
  if (settings.getFlag()) {
    settings.markCountryFlagInitializationComplete();
    return;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    COUNTRY_LOOKUP_TIMEOUT_MS,
  );
  try {
    const response = await fetch("https://ipapi.co/country/", {
      signal: controller.signal,
    });
    if (!response.ok) return;
    const code = (await response.text()).trim().toLowerCase();
    const country = countries.find(
      (entry) =>
        entry.code.toLowerCase() === code &&
        entry.code.length === 2 &&
        entry.code !== "xx" &&
        entry.restricted !== true,
    );
    if (
      !country ||
      settings.isCountryFlagInitializationComplete() ||
      settings.getFlag()
    ) {
      return;
    }

    settings.setFlag(`country:${country.code}`);
  } catch {
    // A failed lookup must not block the game.
  } finally {
    settings.markCountryFlagInitializationComplete();
    window.clearTimeout(timeout);
  }
}
