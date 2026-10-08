import Countries from "resources/countries.json" with { type: "json" };
import { isOpenTroopApp } from "./AppMode";
import { UserSettings } from "../core/game/UserSettings";

const COUNTRY_LOOKUP_TIMEOUT_MS = 1500;
const countries = Countries as { code: string; restricted?: boolean }[];

function supportedCountry(code: string | undefined): string | undefined {
  const normalizedCode = code?.toLowerCase();
  if (!normalizedCode) return undefined;

  return countries.find(
    (entry) =>
      entry.code.toLowerCase() === normalizedCode &&
      entry.code.length === 2 &&
      entry.code !== "xx" &&
      entry.restricted !== true,
  )?.code;
}

function countryFromBrowserLocale(): string | undefined {
  if (typeof navigator === "undefined") return undefined;

  for (const locale of navigator.languages?.length
    ? navigator.languages
    : [navigator.language]) {
    try {
      const region = new Intl.Locale(locale).region;
      const country = supportedCountry(region);
      if (country) return country;
    } catch {
      // Ignore malformed or unsupported locale tags and try the next one.
    }
  }

  return undefined;
}

/** Set a default country flag on first game launch, unless chosen. */
export async function initializeDefaultCountryFlag(
  settings: UserSettings,
): Promise<void> {
  if (settings.isCountryFlagInitializationComplete()) return;
  if (settings.getFlag()) {
    settings.markCountryFlagInitializationComplete();
    return;
  }

  let country: string | undefined;
  // The packaged app has no network permission, so use the device locale there.
  if (!isOpenTroopApp()) {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      COUNTRY_LOOKUP_TIMEOUT_MS,
    );
    try {
      const response = await fetch("https://ipapi.co/country/", {
        signal: controller.signal,
      });
      if (response.ok) {
        country = supportedCountry((await response.text()).trim());
      }
    } catch {
      // The locale fallback keeps a failed lookup from blocking the game.
    } finally {
      window.clearTimeout(timeout);
    }
  }

  country ??= countryFromBrowserLocale();
  if (
    !country ||
    settings.isCountryFlagInitializationComplete() ||
    settings.getFlag()
  ) {
    return;
  }

  settings.setFlag(`country:${country}`);
}
