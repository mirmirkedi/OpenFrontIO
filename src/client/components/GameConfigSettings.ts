import {
  LitElement,
  SVGTemplateResult,
  TemplateResult,
  html,
  nothing,
  svg,
} from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  DOOMSDAY_CLOCK_SPEEDS,
  DoomsdayClockSpeed,
} from "../../core/game/DoomsdayClock";
import {
  Difficulty,
  Duos,
  GameMapType,
  GameMode,
  HumansVsNations,
  Quads,
  Trios,
  UnitType,
} from "../../core/game/Game";
import { TeamCountConfig } from "../../core/Schemas";
import { translateText } from "../Utils";
import "./Difficulties";
import "./FluentSlider";
import "./map/MapPicker";

const ACTIVE_CARD =
  "bg-malibu-blue/20 border-malibu-blue/50 shadow-[var(--shadow-malibu-blue)]";
const INACTIVE_CARD =
  "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20";

const DISABLED_CARD =
  "w-full rounded-xl border transition-all duration-200 opacity-30 grayscale cursor-not-allowed bg-white/5 border-white/5";

function cardClass(active: boolean, extra = ""): string {
  return `w-full rounded-xl border cursor-pointer transition-all duration-200 active:scale-95 ${extra} ${active ? ACTIVE_CARD : INACTIVE_CARD}`;
}

const CARD_LABEL_CLASS =
  "text-xs uppercase font-bold tracking-wider leading-tight break-words hyphens-auto";

const DIFFICULTY_OPTIONS = Object.entries(Difficulty).filter(([key]) =>
  isNaN(Number(key)),
) as Array<[string, Difficulty]>;
const TEAM_COUNT_OPTIONS: TeamCountConfig[] = [
  2,
  3,
  4,
  5,
  6,
  7,
  Quads,
  Trios,
  Duos,
  HumansVsNations,
];

function stateTextClass(active: boolean): string {
  return active ? "text-white" : "text-white/60";
}

function renderTextCardButton(
  label: string,
  active: boolean,
  onClick: () => void,
  cardExtraClass: string,
  iconSvg?: SVGTemplateResult,
): TemplateResult {
  return html`
    <button
      class="${cardClass(
        active,
        `${cardExtraClass} game-config-card ${active ? "game-config-card--active" : ""}`,
      )} flex items-center justify-center"
      @click=${onClick}
    >
      ${iconSvg ? renderWatermarkIcon(iconSvg) : nothing}
      <span class="${CARD_LABEL_CLASS} ${stateTextClass(active)}">
        ${label}
      </span>
    </button>
  `;
}

function renderWatermarkIcon(iconSvg: SVGTemplateResult): TemplateResult {
  return html`
    <svg
      class="game-config-watermark"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.35"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      ${iconSvg}
    </svg>
  `;
}

function renderSection(
  iconSvg: SVGTemplateResult,
  colorClass: string,
  bgClass: string,
  titleKey: string,
  content: TemplateResult | TemplateResult[],
  sectionClass = "space-y-6",
  headerAction?: TemplateResult,
): TemplateResult {
  return html`
    <section class=${sectionClass}>
      ${renderSectionHeader(
        iconSvg,
        colorClass,
        bgClass,
        titleKey,
        headerAction,
      )}
      ${content}
    </section>
  `;
}

const unitOptions: { type: UnitType; translationKey: string }[] = [
  { type: UnitType.City, translationKey: "unit_type.city" },
  { type: UnitType.DefensePost, translationKey: "unit_type.defense_post" },
  { type: UnitType.Port, translationKey: "unit_type.port" },
  { type: UnitType.Warship, translationKey: "unit_type.warship" },
  { type: UnitType.TransportShip, translationKey: "unit_type.boat" },
  { type: UnitType.MissileSilo, translationKey: "unit_type.missile_silo" },
  { type: UnitType.SAMLauncher, translationKey: "unit_type.sam_launcher" },
  { type: UnitType.AtomBomb, translationKey: "unit_type.atom_bomb" },
  { type: UnitType.HydrogenBomb, translationKey: "unit_type.hydrogen_bomb" },
  { type: UnitType.MIRV, translationKey: "unit_type.mirv" },
  { type: UnitType.Factory, translationKey: "unit_type.factory" },
];

const MAP_ICON = svg`<path
  d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z"
/>`;

const DIFFICULTY_ICON = svg`<path
  fill-rule="evenodd"
  d="M12.97 3.97a.75.75 0 011.06 0l7.5 7.5a.75.75 0 010 1.06l-7.5 7.5a.75.75 0 11-1.06-1.06l6.22-6.22H3a.75.75 0 010-1.5h16.19l-6.22-6.22a.75.75 0 010-1.06z"
  clip-rule="evenodd"
/>`;

const MODE_ICON = svg`<path
  d="M11.25 4.533A9.707 9.707 0 006 3a9.735 9.735 0 00-3.25.555.75.75 0 00-.5.707v14.25a.75.75 0 001 .707A8.237 8.237 0 016 18.75c1.995 0 3.823.707 5.25 1.886V4.533zM12.75 20.636A8.214 8.214 0 0118 18.75c.966 0 1.89.166 2.75.47a.75.75 0 001-.708V4.262a.75.75 0 00-.5-.707A9.735 9.735 0 0018 3a9.707 9.707 0 00-5.25 1.533v16.103z"
/>`;

const OPTIONS_ICON = svg`<path
  fill-rule="evenodd"
  d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.922-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z"
  clip-rule="evenodd"
/>`;

const HOST_CHEATS_ICON = svg`<path
  fill-rule="evenodd"
  d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z"
  clip-rule="evenodd"
/>`;

const ENABLES_ICON = svg`<path
  fill-rule="evenodd"
  d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm0 8.625a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zM15.375 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zM7.5 10.875a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z"
  clip-rule="evenodd"
/>`;

const OPTION_WATERMARKS: Record<string, SVGTemplateResult> = {
  "game_settings.instant_build": svg`<path d="M13.3 2.5 5.8 13h5.1l-.9 8.5L18.2 11h-5.1l.2-8.5Z" />`,
  "game_settings.random_spawn": svg`<rect x="3.5" y="3.5" width="17" height="17" rx="3" /><circle cx="8" cy="8" r=".7" fill="currentColor" /><circle cx="16" cy="16" r=".7" fill="currentColor" /><circle cx="12" cy="12" r=".7" fill="currentColor" />`,
  "game_settings.infinite_gold": svg`<circle cx="12" cy="12" r="8.5" /><path d="M9 9.2c.5-1 1.5-1.5 3-1.5 1.7 0 2.8.8 2.8 2s-1 1.8-2.8 2.2-2.8 1-2.8 2.2 1.1 2 2.8 2 2.6-.6 3-1.6" /><path d="M12 6.2v11.6" />`,
  "game_settings.infinite_troops": svg`<circle cx="9" cy="8" r="3" /><circle cx="16.5" cy="9.5" r="2.3" /><path d="M3.5 19.5c.4-3.1 2.2-4.8 5.5-4.8s5.1 1.7 5.5 4.8M14 14.8c3.1-.2 5.2 1.3 6 4.7" />`,
  "game_settings.compact_map": svg`<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /><path d="M9 9 4 4M15 9l5-5M15 15l5 5M9 15l-5 5" />`,
  "game_settings.water_nukes": svg`<path d="M12 3.5c3.3 4.1 5.2 6.8 5.2 9.6a5.2 5.2 0 1 1-10.4 0C6.8 10.3 8.7 7.6 12 3.5Z" /><path d="M9.5 14.5c.3 1.1 1.1 1.8 2.3 2" />`,
  "game_settings.doomsday_clock": svg`<circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2M8 2.8 6.2 4.2M16 2.8l1.8 1.4" />`,
};

const UNIT_WATERMARKS: Partial<Record<UnitType, SVGTemplateResult>> = {
  [UnitType.City]: svg`<path d="M4 20V9h6v11M10 20V4h5v16M15 20v-8h5v8" /><path d="M6.5 12h1M6.5 15h1M12 7h1M12 10h1M12 13h1M17 15h1M17 18h1" />`,
  [UnitType.DefensePost]: svg`<path d="m12 3 7 3v5.2c0 4.2-2.8 7.7-7 9.8-4.2-2.1-7-5.6-7-9.8V6l7-3Z" /><path d="M12 8v6M9 11h6" />`,
  [UnitType.Port]: svg`<path d="M4 18h16M6 18v-4h12v4M8 14V9h8v5M5 21c2.3-1.3 4.7-1.3 7 0 2.3-1.3 4.7-1.3 7 0" /><path d="M12 9V4M9.5 6.5 12 4l2.5 2.5" />`,
  [UnitType.Warship]: svg`<path d="m3 15 3 3h11l4-3-3-1-2-5H8l-2 5-3 1Z" /><path d="M10 9V6h4v3M12 6V3" />`,
  [UnitType.TransportShip]: svg`<path d="m3 15 3 3h12l3-3-3-1-1.5-5h-8L7 14l-4 1Z" /><path d="M8 9V6h7v3M4 21c2-1 4-1 6 0s4 1 6 0 3-1 4 0" />`,
  [UnitType.MissileSilo]: svg`<path d="M7 20V9a5 5 0 0 1 10 0v11M4 20h16M9 13h6M9 16h6" />`,
  [UnitType.SAMLauncher]: svg`<path d="M5 19h14M7 19l2-6h6l2 6M10 13l2-8 2 8M12 5l5-3M12 5 8 3" />`,
  [UnitType.AtomBomb]: svg`<circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2" /><path d="M12 4.5v5.2M5.5 15.8l4.5-2.6M18.5 15.8 14 13.2" />`,
  [UnitType.HydrogenBomb]: svg`<path d="M8 4h8l-1 5.2a6 6 0 1 1-6 0L8 4Z" /><path d="M9 4h6M12 9v6M9.5 12h5" />`,
  [UnitType.MIRV]: svg`<path d="M12 20V8M12 8 8 4M12 8l4-4M8 4v5M16 4v5" /><path d="M5 20h14M8 17h8" />`,
  [UnitType.Factory]: svg`<path d="M4 20V9l5 3V9l5 3V7h6v13H4Z" /><path d="M8 16h1M12 16h1M16 11h1M16 15h1" />`,
};

function renderSectionHeader(
  iconSvg: SVGTemplateResult,
  colorClass: string,
  bgClass: string,
  titleKey: string,
  headerAction?: TemplateResult,
): TemplateResult {
  return html`
    <div class="flex items-center gap-4 pb-2 border-b border-white/10">
      <div
        class="w-8 h-8 rounded-lg flex items-center justify-center ${bgClass} ${colorClass}"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          class="w-5 h-5"
        >
          ${iconSvg}
        </svg>
      </div>
      <h3 class="text-lg font-bold text-white uppercase tracking-wider">
        ${translateText(titleKey)}
      </h3>
      ${headerAction ? html`<div class="ml-auto">${headerAction}</div>` : null}
    </div>
  `;
}

export interface ToggleOptionConfig {
  labelKey: string;
  checked: boolean;
  hidden?: boolean;
  // When set, this toggle's card expands to a pace dropdown while it is checked.
  doomsdayClockSpeed?: DoomsdayClockSpeed;
}

export interface GameConfigSettingsData {
  map: {
    selected: GameMapType;
    useRandom: boolean;
    allowRandomMap?: boolean;
    allowedMapIds?: string[];
    randomMapDivider?: boolean;
    showMedals?: boolean;
    mapWins?: Map<GameMapType, Set<Difficulty>>;
  };
  difficulty: {
    selected: Difficulty;
    disabled: boolean;
  };
  gameMode: {
    selected: GameMode;
  };
  teamCount: {
    selected: TeamCountConfig;
  };
  options: {
    titleKey: string;
    bots: {
      value: number;
      labelKey: string;
      disabledKey: string;
      max?: number;
    };
    nations?: {
      value: number;
      defaultValue?: number;
      labelKey: string;
      disabledKey: string;
      hidden?: boolean;
    };
    toggles: ToggleOptionConfig[];
    inputCards: TemplateResult[];
  };
  hostCheats?: {
    titleKey: string;
    visible: boolean;
    toggles: ToggleOptionConfig[];
    inputCards: TemplateResult[];
  };
  unitTypes: {
    titleKey: string;
    disabledUnits: UnitType[];
  };
}

@customElement("game-config-settings")
export class GameConfigSettings extends LitElement {
  @property({ attribute: false }) settings?: GameConfigSettingsData;
  @property({ attribute: false }) sectionGapClass = "space-y-6";
  @state() private mapSearchQuery = "";

  createRenderRoot() {
    return this;
  }

  private emit<T>(name: string, detail: T) {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleMapSearchInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    this.mapSearchQuery = input.value;
  };

  private clearMapSearch = () => {
    this.mapSearchQuery = "";
  };

  private handleSelectMap = (map: GameMapType) => {
    this.emit("map-selected", { map });
  };

  private handleSelectRandom = () => {
    this.emit("random-map-selected", {});
  };

  private handleDifficultySelect = (difficulty: Difficulty) => {
    this.emit("difficulty-selected", { difficulty });
  };

  private handleDoomsdayClockSpeedChange = (e: Event) => {
    const speed = (e.target as HTMLSelectElement).value as DoomsdayClockSpeed;
    this.emit("doomsday-clock-speed-selected", { speed });
  };

  private handleGameModeSelect = (mode: GameMode) => {
    this.emit("game-mode-selected", { mode });
  };

  private handleTeamCountSelect = (count: TeamCountConfig) => {
    this.emit("team-count-selected", { count });
  };

  private handleOptionToggle = (toggle: ToggleOptionConfig) => {
    this.emit("option-toggle-changed", {
      labelKey: toggle.labelKey,
      checked: !toggle.checked,
    });
  };

  private handleBotsChanged = (event: Event) => {
    const customEvent = event as CustomEvent<{ value: number }>;
    this.emit("bots-changed", customEvent.detail);
  };

  private handleNationsChanged = (event: Event) => {
    const customEvent = event as CustomEvent<{ value: number }>;
    this.emit("nations-changed", customEvent.detail);
  };

  private handleHostCheatToggle = (toggle: ToggleOptionConfig) => {
    this.emit("host-cheat-toggle-changed", {
      labelKey: toggle.labelKey,
      checked: !toggle.checked,
    });
  };

  private handleUnitToggle = (unit: UnitType, checked: boolean) => {
    this.emit("unit-toggle-changed", { unit, checked });
  };

  private renderOptionToggle(toggle: ToggleOptionConfig): TemplateResult {
    if (toggle.hidden) return html``;

    if (toggle.doomsdayClockSpeed !== undefined) {
      return this.renderDoomsdayClockToggle(toggle);
    }

    return renderTextCardButton(
      translateText(toggle.labelKey),
      toggle.checked,
      () => this.handleOptionToggle(toggle),
      "p-4 text-center",
      OPTION_WATERMARKS[toggle.labelKey],
    );
  }

  // Same toggle card as the others, but when on it grows to hold the pace
  // dropdown. The card toggles on click; the dropdown stops propagation so
  // changing the pace doesn't flip the toggle.
  private renderDoomsdayClockToggle(
    toggle: ToggleOptionConfig,
  ): TemplateResult {
    const selected = toggle.doomsdayClockSpeed;
    return html`
      <div
        class="${cardClass(
          toggle.checked,
          // Centered label; when checked the dropdown is added below it so the
          // label shifts up and the dropdown is reachable.
          `p-4 flex flex-col items-center justify-center gap-2 text-center game-config-card ${toggle.checked ? "game-config-card--active" : ""}`,
        )}"
        @click=${() => this.handleOptionToggle(toggle)}
      >
        ${OPTION_WATERMARKS[toggle.labelKey]
          ? renderWatermarkIcon(OPTION_WATERMARKS[toggle.labelKey])
          : nothing}
        <span class="${CARD_LABEL_CLASS} ${stateTextClass(toggle.checked)}">
          ${translateText(toggle.labelKey)}
        </span>
        ${toggle.checked
          ? html`
              <select
                class="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-xs"
                @click=${(e: Event) => e.stopPropagation()}
                @change=${this.handleDoomsdayClockSpeedChange}
              >
                ${DOOMSDAY_CLOCK_SPEEDS.map(
                  (speed) => html`
                    <option value=${speed} ?selected=${selected === speed}>
                      ${translateText(`doomsday_clock_speed.${speed}`)}
                    </option>
                  `,
                )}
              </select>
            `
          : nothing}
      </div>
    `;
  }

  private renderUnitTypeOptions(disabledUnits: UnitType[]): TemplateResult[] {
    return unitOptions.map(({ type, translationKey }) => {
      const isEnabled = !disabledUnits.includes(type);
      return html`
        <button
          class="${cardClass(
            isEnabled,
            `p-4 text-center game-config-card ${isEnabled ? "game-config-card--active" : ""}`,
          )}"
          aria-pressed=${isEnabled}
          @click=${() => this.handleUnitToggle(type, isEnabled)}
        >
          ${UNIT_WATERMARKS[type]
            ? renderWatermarkIcon(UNIT_WATERMARKS[type])
            : nothing}
          <span class="${CARD_LABEL_CLASS} ${stateTextClass(isEnabled)}">
            ${translateText(translationKey)}
          </span>
        </button>
      `;
    });
  }

  private renderMapSearchInput(): TemplateResult {
    return html`<div class="relative">
      <input
        type="text"
        placeholder="${translateText("map_component.search_maps")}"
        .value=${this.mapSearchQuery}
        @input=${this.handleMapSearchInput}
        class="w-48 px-3 py-1.5 pl-8 pr-7 rounded-lg text-sm bg-transparent border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-malibu-blue/50 transition-all"
      />
      <svg
        class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fill-rule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clip-rule="evenodd"
        />
      </svg>
      ${this.mapSearchQuery
        ? html`<button
            type="button"
            @click=${this.clearMapSearch}
            class="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <svg class="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
              <path
                d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
              />
            </svg>
          </button>`
        : null}
    </div>`;
  }

  render() {
    if (!this.settings) return nothing;
    const settings = this.settings;

    return html`
      <div class=${this.sectionGapClass}>
        ${renderSection(
          MAP_ICON,
          "text-aquarius",
          "bg-malibu-blue/20",
          "map.map",
          html`<map-picker
            .selectedMap=${settings.map.selected}
            .useRandomMap=${settings.map.useRandom}
            .allowRandomMap=${settings.map.allowRandomMap ?? true}
            .allowedMapIds=${settings.map.allowedMapIds}
            .randomMapDivider=${settings.map.randomMapDivider ?? false}
            .showMedals=${settings.map.showMedals ?? false}
            .mapWins=${settings.map.mapWins ?? new Map()}
            .onSelectMap=${this.handleSelectMap}
            .onSelectRandom=${this.handleSelectRandom}
            .searchQuery=${this.mapSearchQuery}
          ></map-picker>`,
          undefined,
          this.renderMapSearchInput(),
        )}
        ${renderSection(
          DIFFICULTY_ICON,
          "text-green-400",
          "bg-green-500/20",
          "difficulty.difficulty",
          html`
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              ${DIFFICULTY_OPTIONS.map(([key, value]) => {
                const isSelected = settings.difficulty.selected === value;
                const isDisabled = settings.difficulty.disabled;
                return html`
                  <button
                    ?disabled=${isDisabled}
                    @click=${() =>
                      !isDisabled &&
                      this.handleDifficultySelect(value as Difficulty)}
                    class="${isDisabled
                      ? `${DISABLED_CARD} flex flex-col items-center p-4 gap-3`
                      : cardClass(
                          isSelected,
                          "flex flex-col items-center p-4 gap-3",
                        )}"
                  >
                    <difficulty-display
                      .difficultyKey=${key}
                      class="transform scale-125 origin-center ${isDisabled
                        ? "pointer-events-none"
                        : ""}"
                    ></difficulty-display>
                    <span
                      class="${CARD_LABEL_CLASS} text-center mt-1 text-white"
                    >
                      ${translateText(`difficulty.${key.toLowerCase()}`)}
                    </span>
                  </button>
                `;
              })}
            </div>
          `,
        )}
        ${renderSection(
          MODE_ICON,
          "text-purple-400",
          "bg-purple-500/20",
          "host_modal.mode",
          html`
            <div class="grid grid-cols-2 gap-4">
              ${[GameMode.FFA, GameMode.Team].map((mode) => {
                const isSelected = settings.gameMode.selected === mode;
                return html`
                  <button
                    class="${cardClass(isSelected, "py-6 text-center")}"
                    @click=${() => this.handleGameModeSelect(mode)}
                  >
                    <span
                      class="text-sm font-bold text-white uppercase tracking-widest"
                    >
                      ${mode === GameMode.FFA
                        ? translateText("game_mode.ffa")
                        : translateText("game_mode.teams")}
                    </span>
                  </button>
                `;
              })}
            </div>
          `,
        )}
        ${settings.gameMode.selected === GameMode.FFA
          ? nothing
          : html`
              <section class="space-y-6">
                <div
                  class="text-xs font-bold text-white/40 uppercase tracking-widest mb-4 pl-2"
                >
                  ${translateText("host_modal.team_count")}
                </div>
                <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
                  ${TEAM_COUNT_OPTIONS.map((o) => {
                    const isSelected = settings.teamCount.selected === o;
                    return html`
                      <button
                        class="${cardClass(
                          isSelected,
                          "px-4 py-3 text-center",
                        )}"
                        @click=${() => this.handleTeamCountSelect(o)}
                      >
                        <span class="${CARD_LABEL_CLASS} text-white">
                          ${typeof o === "string"
                            ? o === HumansVsNations
                              ? translateText("public_lobby.teams_hvn")
                              : translateText(`host_modal.teams_${o}`)
                            : translateText("public_lobby.teams", { num: o })}
                        </span>
                      </button>
                    `;
                  })}
                </div>
              </section>
            `}
        ${renderSection(
          OPTIONS_ICON,
          "text-orange-400",
          "bg-orange-500/20",
          settings.options.titleKey,
          html`
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div
                class="col-span-2 rounded-xl p-4 flex flex-col justify-center border transition-all duration-200 ${settings
                  .options.bots.value > 0
                  ? ACTIVE_CARD
                  : INACTIVE_CARD}"
              >
                <fluent-slider
                  min="0"
                  max=${settings.options.bots.max ?? 400}
                  step="1"
                  .value=${settings.options.bots.value}
                  labelKey=${settings.options.bots.labelKey}
                  disabledKey=${settings.options.bots.disabledKey}
                  @value-changed=${this.handleBotsChanged}
                ></fluent-slider>
              </div>

              ${settings.options.nations && !settings.options.nations.hidden
                ? html`<div
                    class="col-span-2 rounded-xl p-4 flex flex-col justify-center border transition-all duration-200 ${settings
                      .options.nations.value > 0
                      ? ACTIVE_CARD
                      : INACTIVE_CARD}"
                  >
                    <fluent-slider
                      min="0"
                      max="400"
                      step="1"
                      .value=${settings.options.nations.value}
                      .defaultValue=${settings.options.nations.defaultValue}
                      defaultLabelKey="common.map_default"
                      labelKey=${settings.options.nations.labelKey}
                      disabledKey=${settings.options.nations.disabledKey}
                      @value-changed=${this.handleNationsChanged}
                    ></fluent-slider>
                  </div>`
                : nothing}
              ${settings.options.toggles.map((toggle) =>
                this.renderOptionToggle(toggle),
              )}
              ${settings.options.inputCards}
            </div>
          `,
        )}
        ${settings.hostCheats?.visible
          ? renderSection(
              HOST_CHEATS_ICON,
              "text-yellow-400",
              "bg-yellow-500/20",
              settings.hostCheats.titleKey,
              html`
                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  ${settings.hostCheats.toggles.map((toggle) =>
                    renderTextCardButton(
                      translateText(toggle.labelKey),
                      toggle.checked,
                      () => this.handleHostCheatToggle(toggle),
                      "p-4 text-center",
                    ),
                  )}
                  ${settings.hostCheats.inputCards}
                </div>
              `,
            )
          : nothing}
        ${renderSection(
          ENABLES_ICON,
          "text-teal-400",
          "bg-teal-500/20",
          settings.unitTypes.titleKey,
          html`
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              ${this.renderUnitTypeOptions(settings.unitTypes.disabledUnits)}
            </div>
          `,
          "space-y-6 pb-6",
        )}
      </div>
    `;
  }
}
