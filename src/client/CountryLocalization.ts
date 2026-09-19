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
    "Byzantine Empire": "Byzantine Empire",
    "Ottoman Empire": "Ottoman Empire",
    "Mongol Empire": "Mongol Empire",
    "Holy Roman Empire": "Holy Roman Empire",
    Circassia: "Circassia (Adygea)",
    "es-an": "Andalusia",
    pirate: "Pirate",
    Pirate: "Pirate",
    "Soviet Union": "Soviet Union",
    su: "Soviet Union",
  },
  de: {
    eu: "Europäische Union",
    "African union": "Afrikanische Union",
    SPQR: "Römisches Reich",
    "West Roman Empire": "Weströmisches Reich",
    "Byzantine Empire": "Byzantinisches Reich",
    "Holy Roman Empire": "Heiliges Römisches Reich",
    "Ottoman Empire": "Osmanisches Reich",
    "Seljuk Empire": "Seldschukenreich",
    "Mongol Empire": "Mongolisches Reich",
    "Russian Empire": "Russisches Kaiserreich",
    Circassia: "Tscherkessien (Adygea)",
    "es-an": "Andalusien",
    pirate: "Piraten",
    Pirate: "Piraten",
    "Soviet Union": "Sowjetunion",
    su: "Sowjetunion",
  },
  fr: {
    eu: "Union Européenne",
    "African union": "Union Africaine",
    SPQR: "Empire Romain",
    "West Roman Empire": "Empire Romain d'Occident",
    "Byzantine Empire": "Empire Byzantin",
    "Holy Roman Empire": "Saint-Empire Romain",
    "Ottoman Empire": "Empire Ottoman",
    "Seljuk Empire": "Empire Seldjoukide",
    "Mongol Empire": "Empire Mongol",
    "Russian Empire": "Empire Russe",
    Circassia: "Circassie (Adyguée)",
    "es-an": "Andalousie",
    pirate: "Pirate",
    Pirate: "Pirate",
    "Soviet Union": "Union Soviétique",
    su: "Union Soviétique",
  },
  es: {
    eu: "Unión Europea",
    "African union": "Unión Africana",
    SPQR: "Imperio Romano",
    "West Roman Empire": "Imperio Romano de Occidente",
    "Byzantine Empire": "Imperio Bizantino",
    "Holy Roman Empire": "Sacro Imperio Romano Germánico",
    "Ottoman Empire": "Imperio Otomano",
    "Seljuk Empire": "Imperio Selyúcida",
    "Mongol Empire": "Imperio Mongol",
    "Russian Empire": "Imperio Ruso",
    Circassia: "Circasia (Adigueya)",
    "es-an": "Andalucía",
    pirate: "Pirata",
    Pirate: "Pirata",
    "Soviet Union": "Unión Soviética",
    su: "Unión Soviética",
  },
  ru: {
    eu: "Европейский союз",
    "African union": "Африканский союз",
    SPQR: "Римская империя",
    "West Roman Empire": "Западная Римская империя",
    "Byzantine Empire": "Византийская империя",
    "Holy Roman Empire": "Священная Римская империя",
    "Ottoman Empire": "Османская империя",
    "Seljuk Empire": "Сельджукская империя",
    "Mongol Empire": "Монгольская империя",
    "Russian Empire": "Российская империя",
    Circassia: "Черкесия (Адыгея)",
    "es-an": "Андалусия",
    pirate: "Пираты",
    Pirate: "Пираты",
    "Soviet Union": "Советский Союз",
    su: "Советский Союз",
  },
  "pt-BR": {
    eu: "União Europeia",
    "African union": "União Africana",
    SPQR: "Império Romano",
    "West Roman Empire": "Império Romano do Ocidente",
    "Byzantine Empire": "Império Bizantino",
    "Holy Roman Empire": "Sacro Império Romano-Germânico",
    "Ottoman Empire": "Império Otomano",
    "Seljuk Empire": "Império Seljúcida",
    "Mongol Empire": "Império Mongol",
    "Russian Empire": "Império Russo",
    Circassia: "Circássia (Adiguésia)",
    "es-an": "Andaluzia",
    pirate: "Pirata",
    Pirate: "Pirata",
    "Soviet Union": "União Soviética",
    su: "União Soviética",
  },
  it: {
    eu: "Unione Europea",
    "African union": "Unione Africana",
    SPQR: "Impero Romano",
    "West Roman Empire": "Impero Romano d'Occidente",
    "Byzantine Empire": "Impero Bizantino",
    "Holy Roman Empire": "Sacro Romano Impero",
    "Ottoman Empire": "Impero Ottomano",
    "Seljuk Empire": "Impero Selgiuchide",
    "Mongol Empire": "Impero Mongolo",
    "Russian Empire": "Impero Russo",
    Circassia: "Circassia (Adighezia)",
    "es-an": "Andalusia",
    pirate: "Pirata",
    Pirate: "Pirata",
    "Soviet Union": "Unione Sovietica",
    su: "Unione Sovietica",
  },
  "zh-CN": {
    eu: "欧洲联盟",
    "African union": "非洲联盟",
    SPQR: "罗马帝国",
    "West Roman Empire": "西罗马帝国",
    "Byzantine Empire": "拜占庭帝国",
    "Holy Roman Empire": "神圣罗马帝国",
    "Ottoman Empire": "奥斯曼帝国",
    "Seljuk Empire": "塞尔柱帝国",
    "Mongol Empire": "蒙古帝国",
    "Russian Empire": "俄罗斯帝国",
    Circassia: "切尔克西亚",
    "es-an": "安达卢西亚",
    pirate: "海盗",
    Pirate: "海盗",
    "Soviet Union": "苏联",
    su: "苏联",
  },
  ja: {
    eu: "欧州連合",
    "African union": "アフリカ連合",
    SPQR: "ローマ帝国",
    "West Roman Empire": "西ローマ帝国",
    "Byzantine Empire": "ビザンツ帝国",
    "Holy Roman Empire": "神聖ローマ帝国",
    "Ottoman Empire": "オスマン帝国",
    "Seljuk Empire": "セルジューク帝国",
    "Mongol Empire": "モンゴル帝国",
    "Russian Empire": "ロシア帝国",
    Circassia: "チェルケシア",
    "es-an": "アンダルシア",
    pirate: "海賊",
    Pirate: "海賊",
    "Soviet Union": "ソビエト連邦",
    su: "ソビエト連邦",
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
