import Countries from "resources/countries.json" with { type: "json" };
import LanguageMetadata from "resources/lang/metadata.json" with { type: "json" };
import { isOpenTroopApp } from "./AppMode";
import { getActiveLanguage } from "./CountryLocalization";
import { UserSettings } from "../core/game/UserSettings";

const COUNTRY_LOOKUP_TIMEOUT_MS = 1500;
const countries = Countries as { code: string; restricted?: boolean }[];
const languageMetadata = LanguageMetadata as { code: string; svg: string }[];

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

  const selectedLanguage = getActiveLanguage();
  try {
    const region = new Intl.Locale(selectedLanguage).region;
    const country = supportedCountry(region);
    if (country) return country;
  } catch {
    // Ignore malformed or unsupported locale tags and try the language flag.
  }

  // The selected UI language can provide a default when its code has no
  // region (for example, "tr" -> the Turkish flag).
  const languageFlag = languageMetadata.find(
    (entry) => entry.code.toLowerCase() === selectedLanguage.toLowerCase(),
  );
  const languageCountry = supportedCountry(languageFlag?.svg);
  if (languageCountry) return languageCountry;

  const browserLocales = [
    ...(navigator.languages?.length ? navigator.languages : []),
    navigator.language,
  ];
  for (const locale of browserLocales) {
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

  // Prefer the selected game language or device locale. IP-based location is
  // only a final web fallback because it can be inaccurate (for example, VPNs).
  let country = countryFromBrowserLocale();
  if (!country && !isOpenTroopApp()) {
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

  if (
    !country ||
    settings.isCountryFlagInitializationComplete() ||
    settings.getFlag()
  ) {
    return;
  }

  settings.setFlag(`country:${country}`);
}
