# Blackout for Startpage

A true-black theme and a set of small userscripts for [Startpage](https://www.startpage.com): a calmer results
page, a ⋮ menu on every result, widgets on the home page, an optional AI answer, a Formula 1 card and quick
answers. Each part works on its own; install only what you want.

Not affiliated with Startpage, Formula 1, the FIA or any team.

## What's inside

| Part | What it does | What leaves your computer |
|---|---|---|
| **Blackout theme** (Stylus) | Pure black (good on OLED), three accent colours, results moved centre-left on wide screens, promos hidden. System fonts only. | Nothing |
| **Tweaks** | Results open in the same tab, no "allow our ads" banner, no Private Search badge. A ⋮ menu on every result and keyboard keys. | Nothing |
| **Home widgets** | Clock, weather, shortcuts, notes, calendar, currency, timer and the next F1 race under the home-page search box. On/off, drag to reorder. | Weather: the city you type (once) and then its coordinates, to Open-Meteo. Currency: the currency codes, to Frankfurter. |
| **Instant Answer** | A short AI answer above your results, built from those results, plus one-page summaries. **Off until you turn it on.** | Only to the AI provider you choose: your search words and the results' titles and descriptions. For a summary, the page is fetched from the site without cookies and its text is sent. |
| **F1 card** | Formula 1 results (practice to race) with tyre strategy, standings and the weekend schedule in your time zone. | Requests like "2026 round 17 qualifying" to Jolpica-F1 and OpenF1. Never your search words. |
| **Quick answers** | Timer, parcel-tracking buttons, colour preview, coin, dice, random numbers, currency, and translation searches sent to Startpage's own translator. | Currency only: a request for the day's rates to Frankfurter. |

Nothing is sent to us: there is no server, no analytics and no account.

## Install

1. Install the add-ons you need: [Stylus](https://github.com/openstyles/stylus) for the theme, and
   [Violentmonkey](https://violentmonkey.github.io/) (or Tampermonkey) for the scripts.
2. **Chrome, Brave, Edge:** open your browser's extensions page → Violentmonkey → **Details** → turn on
   **Allow User Scripts**. Without it the scripts silently do nothing. Firefox doesn't need this.
3. Open the install page and click **Install** next to each part you want. Your add-on shows its own confirm page.
   - Online: this project's GitHub Pages address (the `index.html` at the top of the repository).
   - From a downloaded copy on Windows: double-click `tools\Install add-ons.cmd`. It serves the same page on
     `http://localhost:8777/`, to this computer only, until you close its window.

The add-ons check the address you installed from for new versions. Clicking Install again also updates.

## Using it

### Blackout theme
Stylus icon on a Startpage tab → the gear next to **Blackout for Startpage**:
- **Accent colour:** Soft blue, Lilac or Amber gold.
- **Results position (wide windows):** Left (Startpage's own), **Centre left** (default) or Centred. The search
  box, tabs, filters and results move together. Windows narrower than 1200 px keep Startpage's layout.

For the darkest start, also set Startpage's own theme to **Dark** in its settings.

### Tweaks
- **Same tab:** a left click opens a result in the same tab; Ctrl or middle click still opens a new tab. This also
  skips Startpage's own click logging (it records which result you click before opening it).
- **No banner, no badge:** the "allow Startpage ads" banner stays dismissed, and the Private Search badge (it only
  lists Startpage's promises) is hidden.
- **⋮ on every result:**

  | Item | Key | What it does |
  |---|---|---|
  | Summarize this page | `s` | 3–5 bullets under the result (needs Instant Answer) |
  | Open in Anonymous View | `a` | Startpage's proxy visits the site for you, so the site doesn't see your IP |
  | Copy link | `c` | |
  | Pin site to the top | `p` | That site's results move to the top of every search |
  | Hide site | `h` | That site's results are left out, with a line to show them |
  | Hidden and pinned sites | | Review the lists, remove or add a site |
  | Keyboard keys | `?` | The full list |

- **Keys** act on the result you pick with `j` / `k` (it gets an outline), or else on the one under the mouse.
  `Enter` or `o` opens it, `m` opens its ⋮ menu, `/` jumps to the search box. Keys do nothing while you type.
- Each part can be switched off in the Violentmonkey menu on a Startpage tab.

### Home widgets
Clock, Weather, Formula 1 (needs the F1 card script), Shortcuts and Notes show at first; Calendar, Currency and
Timer can be added. **Customize** (under the widgets) adds and hides widgets, moves them (drag the handle or use
‹ ›) and shows each widget's options: cities for the clock, your city and °F for the weather, your shortcuts, your
currency. Shortcuts show a coloured letter, so no site is contacted until you click it. Notes and everything else
stay in your browser. Defaults (currency, °C or °F, 24-hour clock) follow your browser's language setting.

### Instant Answer
Turn it on from the invitation above your results, then pick a provider:
- **OpenCode Go** with your own key, or
- **a model on your computer**: any OpenAI-compatible server (llama.cpp, LM Studio, Ollama…), which keeps
  everything on your computer. It uses whichever model is loaded and never switches models by itself.

"Smart" mode answers questions and longer searches by itself and offers an **Ask AI** button otherwise; you can
choose "only when I click" or "every search". It steps aside when Startpage shows one of its own answer boxes
(weather, calculator…). Summaries come from the ⋮ menu or the `s` key: the page is fetched directly from the
site without cookies (the site sees your IP, as if you opened it). PDFs, sign-in pages and pages built entirely
by scripts can't be summarized; it says which.

### F1 card
Searches like `monza qualifying`, `f1 standings`, `next f1 race`. Tabs for each session, the schedule, standings
and the calendar. Teams are shown by their colour and drivers by their initials. Tyre strategy bars on race and
sprint results (2023 onward). Options under ⚙ in the card.

### Quick answers
`5 minute timer`, a tracking number (`1Z999AA10123456784`), `#a3c4ff`, `flip a coin`, `roll 2d6`,
`random number between 1 and 50`, `100 euros`. Each card has its own on/off switch under ⚙.

**Translation:** Startpage's own translator only opens for searches that start with "translate". Searches like
`good morning in french`, `en to fr good morning` or `how do you say thank you in spanish` are sent to it as
"translate … to …" through Startpage's own search form; less clear ones (`parle francais english`) get a Translate
button, and `learn spanish` or `movies in french` are left alone. Going Back never sends you forward again.

## Optional: block Startpage's own statistics

Startpage sends its own usage statistics (scroll depth, theme, whether you block ads, page timings) to
`startpage.com/clev` and `/perf`, and its map widget can look up your location at MapQuest directly. If you use
uBlock Origin, paste [`filters/ublock.txt`](filters/ublock.txt) into **Dashboard → My filters**. Search and the map
keep working.

## Recommended Startpage settings

Startpage's own settings page, for a private and calm setup:

| Setting | Suggested | Why |
|---|---|---|
| Search method | POST | Keeps your search words out of the address bar and browser history |
| Theme | Dark | Matches Blackout, so nothing flashes white while loading |
| Region | Your country | Local shops, news and weather |
| Search location | Blank | Never tells Startpage where you are |
| Results per page | 20 | Fewer page loads |
| Open results in a new tab | Off | Same tab (Tweaks does this everywhere anyway) |
| Promotional messaging | Off | Fewer promos |
| Server region | Closest | Fastest |

Settings are kept in a cookie; if your browser clears cookies on close, save Startpage's "settings URL" as your
search engine address instead.

## If Startpage changes its page

The theme and scripts look for Startpage's page parts by their names as of October 2026 (`.w-gl`, `.result`,
`result-title`…). If Startpage renames them, the affected part stops working and the page stays usable. Please open
an issue with the search you used.

## Licence and credits

MIT (see [LICENSE](LICENSE)). Data sources and the icon notice are in [THIRD-PARTY.md](THIRD-PARTY.md).
Changes are listed in [CHANGELOG.md](CHANGELOG.md).
