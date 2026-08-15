import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
import { isOpenTroopApp } from "../AppMode";
import { loadActiveLocalGame } from "../LocalPersistantStats";
import { translateText } from "../Utils";
import "./CosmeticBackground";
import "./NavAccountMenu";
import "./NavUtilityIcons";
import "./NewsBox";
import "./SteamWishlist";
import "./StreamingNow";

@customElement("play-page")
export class PlayPage extends LitElement {
  @state() private languageRevision = 0;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("worldfront-language-changed", this.refreshLanguage);
  }

  disconnectedCallback() {
    window.removeEventListener(
      "worldfront-language-changed",
      this.refreshLanguage,
    );
    super.disconnectedCallback();
  }

  private refreshLanguage = () => {
    this.languageRevision += 1;
    this.requestUpdate();
  };

  createRenderRoot() {
    return this;
  }

  render() {
    // Read the revision so the app-mode home rerenders after a language change.
    void this.languageRevision;
    const appMode = isOpenTroopApp();
    const hasSavedGame = appMode && loadActiveLocalGame() !== null;
    if (appMode) {
      return html`
        <main id="page-play" class="opentroop-home">
          <!-- Keep the translation provider mounted in app mode. The visible
               language selector lives in the legacy footer, which OpenTroop
               intentionally removes. -->
          <lang-selector class="hidden" aria-hidden="true"></lang-selector>
          <!-- The offline lobby uses this shared identity source when it
               creates a local match; app mode has no visible profile row. -->
          <username-input class="hidden" aria-hidden="true"></username-input>
          <div class="opentroop-home__aurora" aria-hidden="true"></div>
          <header class="opentroop-home__topbar">
            <div class="opentroop-home__brand">
              <img
                src=${assetUrl("images/WorldFrontLogo.svg")}
                alt="WorldFront"
              />
            </div>
            <div class="opentroop-home__actions">
              <button
                class="opentroop-icon-button"
                aria-label=${translateText("select_lang.title")}
                @click=${this.openLanguagePicker}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
                  <circle cx="12" cy="12" r="8.5"></circle>
                  <path d="M3.5 12h17M12 3.5c2.3 2.3 3.4 5.1 3.4 8.5S14.3 18.2 12 20.5C9.7 18.2 8.6 15.4 8.6 12S9.7 5.8 12 3.5Z"></path>
                </svg>
              </button>
              <button
                class="opentroop-icon-button"
                aria-label="Help"
                @click=${() => window.showPage?.("page-help")}
              >
                ?
              </button>
            </div>
          </header>

          <section class="opentroop-home__content">
            <div class="opentroop-home__eyebrow">
              <span class="opentroop-home__eyebrow-line"></span>
              <span class="opentroop-home__eyebrow-text">${translateText("worldfront.home_eyebrow")}</span>
              <span class="opentroop-home__eyebrow-line"></span>
            </div>
            <h1>${translateText("worldfront.home_title")}</h1>
            <p>${translateText("worldfront.home_description")}</p>

            ${hasSavedGame
              ? html`
                  <button
                    class="opentroop-continue-button"
                    @click=${() =>
                      document.dispatchEvent(
                        new CustomEvent("resume-local-game"),
                      )}
                  >
                    <span class="opentroop-continue-button__icon">↻</span>
                    <span>
                      <small>${translateText("worldfront.active_battle")}</small>
                      <strong>${translateText("worldfront.continue_game")}</strong>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                `
              : nothing}

            <game-mode-selector></game-mode-selector>
          </section>
          <p class="worldfront-attribution">Based on OpenFront</p>
        </main>
      `;
    }
    return html`
      <div
        id="page-play"
        class="flex flex-col gap-2 w-full px-0 lg:px-4 min-h-0"
      >
        ${appMode
          ? nothing
          : html`
              <token-login class="absolute"></token-login>
              <rewards-modal class="absolute"></rewards-modal>
            `}

        <!-- Mobile: Fixed top bar -->
        <div
          class="lg:hidden fixed left-0 right-0 top-0 z-40 pt-[env(safe-area-inset-top)] bg-surface border-b border-white/10"
        >
          <div
            class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center h-14 px-2 gap-2"
          >
            <button
              id="hamburger-btn"
              class="col-start-1 justify-self-start h-10 shrink-0 aspect-[4/3] flex text-white/90 rounded-md items-center justify-center transition-colors"
              data-i18n-aria-label="main.menu"
              aria-expanded="false"
              aria-controls="sidebar-menu"
              aria-haspopup="dialog"
              data-i18n-title="main.menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="size-8"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>

            <div
              class="col-start-2 flex items-center justify-center text-malibu-blue min-w-0"
            >
              <img
                src=${assetUrl(
                  appMode ? "images/WorldFrontLogo.svg" : "images/OpenFrontLogo.svg",
                )}
                alt=${appMode ? "WorldFront" : "OpenFront"}
                class="h-full w-auto"
              />
            </div>

            <!-- Right slot: bell, help and the profile control. The menu is
                 the account affordance on every platform now — on CrazyGames
                 its "Sign in" item hands off to their SDK prompt. -->
            <div
              class="col-start-3 justify-self-end shrink-0 flex items-center gap-0.5"
            >
              <nav-utility-icons size="mobile"></nav-utility-icons>
              <nav-account-menu variant="mobile"></nav-account-menu>
            </div>
          </div>
        </div>

        <!-- Top strip: news + identity on the left, Streaming Now on the right. The 2fr/1fr
             split only exists while the panel is live (.streaming-live via has-[]) —
             otherwise the left column takes the full row. -->
        <div
          class="w-full pb-4 lg:pb-0 flex flex-col gap-4 sm:-mx-4 sm:w-[calc(100%+2rem)] lg:mx-0 lg:w-full lg:grid lg:grid-cols-1 lg:has-[.streaming-live]:grid-cols-[2fr_1fr] lg:gap-4 lg:items-stretch"
        >
          <!-- Mobile: spacer for fixed top bar -->
          <div
            class="lg:hidden h-[calc(env(safe-area-inset-top)+56px)] -mb-4"
          ></div>

          <!-- Left column: news banner + identity row, stacked tight. -->
          <div class="flex flex-col gap-2 min-w-0">
            <news-box></news-box>

            <!-- Identity row: username over the currently selected cosmetic background. -->
            <div
              class="relative bg-surface border-y border-white/10 overflow-visible flex items-center sm:min-h-[60px] sm:flex-1 sm:z-20 sm:border-y-0 sm:rounded-xl"
            >
              <!-- Selected skin/pattern fills the bubble like the player's territory in game. -->
              ${appMode
                ? nothing
                : html`<cosmetic-background
                    class="absolute inset-0 z-0 overflow-hidden sm:rounded-xl pointer-events-none"
                  ></cosmetic-background>`}
              <div
                class="relative z-10 flex h-full w-full min-w-0 items-center bg-surface/80 p-1 sm:rounded-xl"
              >
                <username-input
                  class="flex-1 min-w-0 h-10 sm:h-[50px]"
                ></username-input>
              </div>
            </div>
          </div>

          <!-- Right column: Streaming Now (desktop only), stretched to the left column's
               full height so the top strip has no dead space. -->
          ${appMode
            ? nothing
            : html`<streaming-now
                class="hidden lg:flex lg:h-full lg:flex-col w-full min-w-0"
              ></streaming-now>`}
        </div>

        <game-mode-selector></game-mode-selector>

        <!-- Desktop gets the compact footer button instead. -->
        ${appMode
          ? nothing
          : html`<steam-wishlist
              campaign="home_mobile"
              class="block px-2 pb-4 lg:hidden"
            ></steam-wishlist>`}
      </div>
    `;
  }

  private openLanguagePicker() {
    (
      document.querySelector("lang-selector") as {
        openLanguagePicker?: () => Promise<void>;
      } | null
    )?.openLanguagePicker?.();
  }
}
