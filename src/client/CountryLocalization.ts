import { translateText } from "./Utils";

let displayNamesCache: {
  lang: string;
  instance: Intl.DisplayNames;
} | null = null;

/**
 * Custom localization overrides for historical, empire, and non-ISO flags in countries.json.
 */
const CUSTOM_COUNTRY_TRANSLATIONS: Record<string, Record<string, string>> = {
  tr: {
    // International / Unions
    eu: "Avrupa Birliği",
    "African union": "Afrika Birliği",
    pirate: "Korsan",
    Pirate: "Korsan",
    "Soviet Union": "Sovyetler Birliği",
    su: "Sovyetler Birliği",

    // Antiquity & Empires
    SPQR: "Roma İmparatorluğu",
    "West Roman Empire": "Batı Roma İmparatorluğu",
    "Byzantine Empire": "Bizans İmparatorluğu",
    "Holy Roman Empire": "Kutsal Roma Cermen İmparatorluğu",
    "Ottoman Empire": "Osmanlı İmparatorluğu",
    "Seljuk Empire": "Büyük Selçuklu İmparatorluğu",
    "Timurid Empire": "Timur İmparatorluğu",
    "Mongol Empire": "Moğol İmparatorluğu",
    "Russian Empire": "Rus İmparatorluğu",
    "German Empire": "Alman İmparatorluğu",
    "Austrian Empire": "Avusturya İmparatorluğu",
    "Habsburg Austria": "Habsburg Avusturyası",
    "Spanish Empire": "İspanyol İmparatorluğu",
    spanish_empire: "İspanyol İmparatorluğu",
    "Swedish Empire": "İsveç İmparatorluğu",
    "Empire of Japan": "Japon İmparatorluğu",
    Empire_of_Japan1: "Japon İmparatorluğu",
    "Ethiopian Empire": "Etiyopya İmparatorluğu",
    "Mali Empire": "Mali İmparatorluğu",
    "Median Empire": "Med İmparatorluğu",
    "Aztec Empire": "Aztek İmparatorluğu",
    "Macedonian Empire": "Makedonya İmparatorluğu",
    Macedonia: "Makedonya İmparatorluğu",
    "Sassanid Empire": "Sasani İmparatorluğu",
    "Achaemenid Empire": "Ahameniş İmparatorluğu",

    // Caliphates & Khanates
    "Abbasid Caliphate": "Abbasi Hilafeti",
    "Umayyad Caliphate": "Emevi Hilafeti",
    "Fatimid Caliphate": "Fatımi Hilafeti",
    "Crimean Khanate": "Kırım Hanlığı",
    "Golden Horde": "Altın Orda Devleti",
    "Kazakh Khanate": "Kazak Hanlığı",
    "Mughal Empire": "Babür İmparatorluğu",

    // Regions & Historical States
    Circassia: "Çerkesya (Adıge)",
    Adygea: "Çerkesya (Adıge)",
    Andalusia: "Endülüs",
    "es-an": "Endülüs",
    Aceh: "Açe Sultanlığı",
    "Almohad Dynasty": "Muvahhidler",
    "Almoravid Dynasty": "Murabıtlar",
    "Gokturk Khaganate": "Göktürk Kağanlığı",
    "Hunnic Empire": "Hun İmparatorluğu",
  },
  en: {
    eu: "European Union",
    "African union": "African Union",
    SPQR: "Roman Empire",
    "West Roman Empire": "Western Roman Empire",
    Circassia: "Circassia (Adygea)",
    "es-an": "Andalusia",
    pirate: "Pirate",
    Pirate: "Pirate",
    su: "Soviet Union",
  },
};

/**
 * Returns the active UI language code (e.g. "tr", "en", "de").
 */
export function getActiveLanguage(): string {
  if (typeof document !== "undefined") {
    const langSelector = document.querySelector("lang-selector") as {
      currentLang?: string;
    } | null;
    if (langSelector?.currentLang && langSelector.currentLang !== "debug") {
      return langSelector.currentLang;
    }
  }
  if (typeof localStorage !== "undefined") {
    const saved =
      localStorage.getItem("worldfront.language") ??
      localStorage.getItem("lang");
    if (saved) return saved;
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language.split("-")[0];
  }
  return "en";
}

/**
 * Returns the localized country name in the active (or requested) language.
 * Uses:
 * 1. Explicit translateText("country.<code>")
 * 2. Custom historical/empire overrides dictionary
 * 3. ECMAScript Intl.DisplayNames for standard ISO codes (2-3 letters)
 * 4. Fallback to defaultName
 */
export function getLocalizedCountryName(
  code: string,
  defaultName: string,
  lang?: string,
): string {
  const currentLang = lang ?? getActiveLanguage();

  // 1. Translation key if defined in language files
  const transKey = `country.${code}`;
  const customTrans = translateText(transKey);
  if (customTrans && customTrans !== transKey) {
    return customTrans;
  }

  // 2. Custom overrides (especially for historical / non-standard codes)
  const langOverrides = CUSTOM_COUNTRY_TRANSLATIONS[currentLang];
  if (langOverrides) {
    const override = langOverrides[code] ?? langOverrides[defaultName];
    if (override) return override;
  }

  // 3. Native Intl.DisplayNames for standard 2-3 letter ISO country codes
  if (
    typeof Intl !== "undefined" &&
    "DisplayNames" in Intl &&
    /^[a-zA-Z]{2,3}$/.test(code)
  ) {
    try {
      if (
        !displayNamesCache ||
        displayNamesCache.lang !== currentLang
      ) {
        displayNamesCache = {
          lang: currentLang,
          instance: new Intl.DisplayNames([currentLang], { type: "region" }),
        };
      }
      const localized = displayNamesCache.instance.of(code.toUpperCase());
      if (localized && localized.toLowerCase() !== code.toLowerCase()) {
        return localized;
      }
    } catch {
      // Ignore unsupported codes and fall back
    }
  }

  return defaultName;
}

/**
 * Checks whether a country matches a search query against its localized name,
 * original name, and code.
 */
export function matchesCountryQuery(
  country: { code: string; name: string },
  query: string,
  lang?: string,
): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  const localized = getLocalizedCountryName(country.code, country.name, lang).toLowerCase();
  const original = country.name.toLowerCase();
  const code = country.code.toLowerCase();

  return (
    localized.includes(q) ||
    original.includes(q) ||
    code.includes(q)
  );
}
