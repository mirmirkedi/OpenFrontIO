import { html, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import Countries from "resources/countries.json" with { type: "json" };
import { assetUrl } from "../core/AssetUrls";
import { UserSettings } from "../core/game/UserSettings";
import {
  MAX_USERNAME_LENGTH,
  MIN_USERNAME_LENGTH,
  validateUsername,
} from "../core/validations/username";
import { genAnonUsername } from "./UsernameInput";
import { BaseModal } from "./components/BaseModal";
import { modalHeader } from "./components/ui/ModalHeader";
import { translateText } from "./Utils";

interface CountryEntry {
  code: string;
  name: string;
  continent?: string;
  restricted?: boolean;
}

@customElement("user-profile-modal")
export class UserProfileModal extends BaseModal {
  protected routerName = "user-profile";

  @state() private username: string = "";
  @state() private selectedFlagCode: string = "";
  @state() private searchQuery: string = "";
  @state() private selectedContinent: string = "all";
  @state() private validationError: string = "";

  private userSettings = new UserSettings();

  private readonly availableCountries: CountryEntry[] = (
    Countries as CountryEntry[]
  ).filter((c) => c.code !== "xx" && c.restricted !== true);

  protected modalConfig() {
    return {
      maxWidth: "820px",
    };
  }

  protected onOpen(): void {
    // Load cached username
    const storedUsername = localStorage.getItem("username");
    if (storedUsername && storedUsername.trim()) {
      this.username = storedUsername.trim();
    } else {
      this.username = genAnonUsername();
      localStorage.setItem("username", this.username);
    }

    // Load cached flag
    const storedFlag = this.userSettings.getFlag();
    if (storedFlag && storedFlag.startsWith("country:")) {
      const code = storedFlag.slice("country:".length);
      this.selectedFlagCode = code === "xx" ? "" : code;
    } else {
      this.selectedFlagCode = "";
    }

    this.searchQuery = "";
    this.selectedContinent = "all";
    this.validationError = "";
  }

  private handleUsernameInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const rawVal = input.value;
    // Strip brackets [ ] which are reserved for clan tags
    const sanitized = rawVal.replace(/[[\]]/g, "");
    if (sanitized !== rawVal) {
      input.value = sanitized;
    }

    this.username = sanitized;

    // Validate and auto-save
    const trimmed = sanitized.trim();
    if (trimmed.length >= MIN_USERNAME_LENGTH) {
      const result = validateUsername(trimmed);
      if (result.isValid) {
        this.validationError = "";
        // Auto-save username
        localStorage.setItem("username", trimmed);
        window.dispatchEvent(
          new CustomEvent("username-updated", {
            detail: { username: trimmed },
          }),
        );
      } else {
        this.validationError = result.error ?? "";
      }
    } else {
      this.validationError = translateText("username.too_short", {
        min: MIN_USERNAME_LENGTH,
      });
    }
  }

  private generateRandomName() {
    const newName = genAnonUsername();
    this.username = newName;
    this.validationError = "";
    // Auto-save random name
    localStorage.setItem("username", newName);
    window.dispatchEvent(
      new CustomEvent("username-updated", {
        detail: { username: newName },
      }),
    );
  }

  private selectFlag(code: string) {
    this.selectedFlagCode = code;
    // Auto-save flag
    this.userSettings.setFlag(`country:${code}`);
  }

  private clearFlag() {
    this.selectedFlagCode = "";
    // Auto-save clear flag
    this.userSettings.clearFlag(true);
  }

  private filteredCountries(): CountryEntry[] {
    const query = this.searchQuery.trim().toLowerCase();
    return this.availableCountries.filter((country) => {
      // Continent filter
      if (this.selectedContinent !== "all") {
        const continent = country.continent?.toLowerCase() ?? "";
        if (this.selectedContinent === "americas") {
          if (!continent.includes("america")) return false;
        } else if (!continent.includes(this.selectedContinent.toLowerCase())) {
          return false;
        }
      }

      // Search query filter
      if (query) {
        const matchesName = country.name.toLowerCase().includes(query);
        const matchesCode = country.code.toLowerCase().includes(query);
        return matchesName || matchesCode;
      }

      return true;
    });
  }

  protected renderHeaderSlot(): TemplateResult {
    return modalHeader({
      title: translateText("user_profile.title") || "Player Profile",
      onBack: () => this.close(),
      ariaLabel: translateText("common.back"),
    });
  }

  protected renderBody(): TemplateResult {
    const filtered = this.filteredCountries();

    return html`
      <div class="custom-scrollbar p-3 sm:p-5 flex flex-col gap-5 max-w-4xl mx-auto">
        <!-- Identity Showcase Card -->
        <section
          class="relative overflow-hidden rounded-2xl border border-sky-500/25 bg-gradient-to-r from-[#07192a]/95 via-[#0b243b]/90 to-[#07192a]/95 p-4 sm:p-5 shadow-2xl backdrop-blur-md"
        >
          <div
            class="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-sky-500/10 blur-3xl pointer-events-none"
          ></div>
          <div
            class="absolute -left-12 -bottom-12 w-48 h-48 rounded-full bg-blue-600/10 blur-3xl pointer-events-none"
          ></div>

          <div class="relative z-10 flex items-center justify-center sm:justify-start gap-4 sm:gap-6">
            ${this.selectedFlagCode
              ? html`
                  <div class="relative shrink-0">
                    <div
                      class="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-sky-400/40 bg-black/40 flex items-center justify-center shadow-[0_0_20px_rgba(56,189,248,0.2)]"
                    >
                      <img
                        src=${assetUrl(
                          `flags/${encodeURIComponent(this.selectedFlagCode)}.svg`,
                        )}
                        alt="Flag"
                        class="w-full h-full object-cover"
                        @error=${(e: Event) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  </div>
                `
              : null}

            <!-- Identity Info (Clean player name only) -->
            <div class="text-center sm:text-left min-w-0">
              <h2
                class="text-2xl sm:text-3xl font-black tracking-wide text-white truncate drop-shadow-md"
              >
                ${this.username || "Operator"}
              </h2>
            </div>
          </div>
        </section>

        <!-- Player Name Editing Section -->
        <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <label for="profile-username-input" class="text-xs font-black tracking-widest text-sky-400 uppercase flex items-center gap-2">
              <svg viewBox="0 0 24 24" class="w-4 h-4 stroke-current fill-none stroke-2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span>${translateText("user_profile.player_name") || "Player Name"}</span>
            </label>
            <span
              class="text-xs font-mono font-bold tracking-wider ${
                this.username.length > 24 ? "text-amber-400" : "text-white/40"
              }"
            >
              ${this.username.length} / ${MAX_USERNAME_LENGTH}
            </span>
          </div>

          <div class="flex flex-col sm:flex-row gap-2.5">
            <div class="relative flex-1">
              <input
                id="profile-username-input"
                type="text"
                .value=${this.username}
                @input=${this.handleUsernameInput}
                minlength="${MIN_USERNAME_LENGTH}"
                maxlength="${MAX_USERNAME_LENGTH}"
                placeholder="${translateText("user_profile.name_placeholder") || "Enter username..."}"
                class="w-full h-12 bg-black/50 border ${
                  this.validationError ? "border-red-500/80 focus:border-red-400 focus:ring-red-500/30" : "border-white/20 focus:border-sky-400 focus:ring-sky-500/30"
                } rounded-xl px-4 text-white text-base sm:text-lg font-bold tracking-wider placeholder-white/30 focus:outline-none focus:ring-2 transition-all shadow-inner"
              />
              ${this.username
                ? html`
                    <button
                      type="button"
                      title="Clear name"
                      aria-label="Clear name"
                      @click=${() => {
                        this.username = "";
                        this.validationError = translateText("username.too_short", {
                          min: MIN_USERNAME_LENGTH,
                        });
                      }}
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                        <path
                          fill-rule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </button>
                  `
                : null}
            </div>

            <!-- Randomize Name button -->
            <button
              type="button"
              @click=${this.generateRandomName}
              title=${translateText("user_profile.random_name") || "Randomize"}
              class="h-12 px-4 rounded-xl border border-sky-400/30 bg-sky-950/40 hover:bg-sky-900/60 text-sky-200 hover:text-white flex items-center justify-center gap-2 font-black text-xs uppercase tracking-wider transition-all duration-150 active:scale-95 shrink-0 cursor-pointer"
            >
              <!-- Dice Icon -->
              <svg viewBox="0 0 24 24" class="w-4 h-4 stroke-current fill-none stroke-2">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                <circle cx="8" cy="8" r="1.5" fill="currentColor"></circle>
                <circle cx="16" cy="8" r="1.5" fill="currentColor"></circle>
                <circle cx="12" cy="12" r="1.5" fill="currentColor"></circle>
                <circle cx="8" cy="16" r="1.5" fill="currentColor"></circle>
                <circle cx="16" cy="16" r="1.5" fill="currentColor"></circle>
              </svg>
              <span>${translateText("user_profile.random_name") || "Randomize"}</span>
            </button>
          </div>

          ${this.validationError
            ? html`
                <div
                  class="flex items-center gap-2 text-xs font-semibold text-red-300 bg-red-950/50 border border-red-500/40 rounded-lg px-3 py-2 animate-fadeIn"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 shrink-0 text-red-400">
                    <path
                      fill-rule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <span>${this.validationError}</span>
                </div>
              `
            : null}
        </section>

        <!-- Flag Selection Section -->
        <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 flex flex-col gap-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="text-xs font-black tracking-widest text-sky-400 uppercase flex items-center gap-2">
              <svg viewBox="0 0 24 24" class="w-4 h-4 stroke-current fill-none stroke-2">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                <line x1="4" y1="22" x2="4" y2="15"></line>
              </svg>
              <span>${translateText("user_profile.flag_heading") || "National Flag"}</span>
            </div>

            <!-- None / Clear Flag Button -->
            <button
              type="button"
              @click=${this.clearFlag}
              class="self-start sm:self-auto text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                !this.selectedFlagCode
                  ? "border-sky-400 bg-sky-500/20 text-sky-200"
                  : "border-white/15 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white"
              }"
            >
              ⊘ ${translateText("user_profile.no_flag") || "No Flag"}
            </button>
          </div>

          <!-- Search & Filters -->
          <div class="flex flex-col md:flex-row gap-2.5">
            <!-- Search Input -->
            <div class="relative flex-1">
              <div class="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">
                <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                  <path
                    fill-rule="evenodd"
                    d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <input
                type="text"
                .value=${this.searchQuery}
                @input=${(e: Event) => {
                  this.searchQuery = (e.target as HTMLInputElement).value;
                }}
                placeholder="${translateText("user_profile.search_flags") || "Search country or code..."}"
                class="w-full h-10 pl-10 pr-8 bg-black/40 border border-white/15 rounded-xl text-white text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 transition-all placeholder-white/30"
              />
              ${this.searchQuery
                ? html`
                    <button
                      type="button"
                      @click=${() => (this.searchQuery = "")}
                      class="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1 cursor-pointer"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                        <path
                          fill-rule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </button>
                  `
                : null}
            </div>

            <!-- Continent Filter Pills -->
            <div class="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
              ${[
                { id: "all", label: translateText("user_profile.all_continents") || "All" },
                { id: "europe", label: translateText("user_profile.continent_europe") || "Europe" },
                { id: "asia", label: translateText("user_profile.continent_asia") || "Asia" },
                { id: "americas", label: translateText("user_profile.continent_americas") || "Americas" },
                { id: "africa", label: translateText("user_profile.continent_africa") || "Africa" },
                { id: "oceania", label: translateText("user_profile.continent_oceania") || "Oceania" },
              ].map(
                (item) => html`
                  <button
                    type="button"
                    @click=${() => (this.selectedContinent = item.id)}
                    class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                      this.selectedContinent === item.id
                        ? "bg-sky-500 text-slate-950 shadow-md font-black"
                        : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/10"
                    }"
                  >
                    ${item.label}
                  </button>
                `,
              )}
            </div>
          </div>

          <!-- Flag Grid -->
          <div
            class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 max-h-[360px] overflow-y-auto custom-scrollbar p-1"
          >
            ${filtered.length === 0
              ? html`
                  <div class="col-span-full py-12 text-center text-white/40 text-sm font-semibold">
                    ${translateText("user_profile.no_flags_found") || "No flags match your search."}
                  </div>
                `
              : filtered.map((country) => {
                  const isSelected = this.selectedFlagCode === country.code;
                  return html`
                    <button
                      type="button"
                      title="${country.name} (${country.code.toUpperCase()})"
                      aria-label="${country.name}"
                      aria-pressed=${isSelected ? "true" : "false"}
                      @click=${() => this.selectFlag(country.code)}
                      class="group relative flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? "border-sky-400 bg-sky-500/20 shadow-[0_0_12px_rgba(56,189,248,0.25)] ring-1 ring-sky-400/50"
                          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.09] hover:border-white/25"
                      }"
                    >
                      <img
                        src=${assetUrl(`flags/${encodeURIComponent(country.code)}.svg`)}
                        alt="${country.name}"
                        loading="lazy"
                        class="w-8 h-5.5 object-cover rounded shadow-sm shrink-0 border border-white/10"
                        @error=${(e: Event) => {
                          (e.target as HTMLImageElement).style.visibility = "hidden";
                        }}
                      />
                      <div class="flex flex-col min-w-0 flex-1">
                        <span
                          class="text-xs font-bold tracking-wide truncate ${
                            isSelected ? "text-white" : "text-white/90 group-hover:text-white"
                          }"
                        >
                          ${country.name}
                        </span>
                        <span
                          class="text-[10px] font-mono uppercase tracking-widest ${
                            isSelected ? "text-sky-300" : "text-white/40"
                          }"
                        >
                          ${country.code}
                        </span>
                      </div>

                      ${isSelected
                        ? html`
                            <div class="shrink-0 text-sky-400">
                              <svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
                                <path
                                  fill-rule="evenodd"
                                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                  clip-rule="evenodd"
                                />
                              </svg>
                            </div>
                          `
                        : null}
                    </button>
                  `;
                })}
          </div>
        </section>
      </div>
    `;
  }
}
