# Changelog

Each release says which day's Startpage it was tested on. If something breaks, that date helps tell whether
Startpage changed its page since.

## 1.5.0 · 16 October 2026

Works on SearXNG as well as Startpage. Tested on SearXNG as it was on 16 October 2026 (its standard "simple" theme)
running on this computer, in Chromium, with the scripts loaded the way Violentmonkey loads them and a stand-in AI:
the theme, the ⋮ menu, pinning and hiding, keys, home widgets, quick answers, an answer, a follow-up that searched
SearXNG and a summary. Startpage checked again on sample pages. Not yet tested on a public SearXNG instance or with a
real AI service.

| Part | Version |
|---|---|
| Blackout theme | 1.2.1 |
| Blackout theme for SearXNG | 1.0.0 (new) |
| Tweaks | 1.2.0 |
| Home widgets | 1.3.0 |
| Instant Answer | 2.6.0 |
| F1 card | 1.4.0 |
| Quick answers | 1.2.0 |

- New: **Blackout for SearXNG**, the black theme for any SearXNG instance. It only changes pages that say they are
  SearXNG.
- Every script works on SearXNG instances at any address. Other sites are left alone.
- Instant Answer works only on the SearXNG instances you turn it on for, and its searches go to that instance.
- On SearXNG the ⋮ menu opens the archived copy (or the proxy) instead of Anonymous View, and the translator shortcut is off.
- On SearXNG the keys from Tweaks come before SearXNG's own keys with the same letters.

SearXNG page parts the scripts rely on: `<meta name="generator" content="searxng/…">`, `<meta name="endpoint">`,
`form#search`, `#q`, `#categories` (`.category_button.selected`), `#urls > article.result` with `a.url_header`,
`h3 a`, `p.content`, `a.cache_link`, `a.proxyfied_link`, and `#answers .answer`.

## 1.4.0 · 12 October 2026

Tested on Startpage as it was on 12 October 2026, in Firefox with Violentmonkey against a stand-in AI: a follow-up
rewritten into its own search, a real Startpage search, a page read with Readability, the sources listed under the
reply, and all of it back after a reload. Instant Answer not yet tested with a real AI service.

| Part | Version |
|---|---|
| Blackout theme | 1.2.1 |
| Tweaks | 1.1.0 |
| Home widgets | 1.2.0 |
| Instant Answer | 2.5.0 |
| F1 card | 1.3.2 |
| Quick answers | 1.1.0 |

- Follow-ups under an answer can search Startpage and read pages, like conversations, and list their sources.
- A research setting: Speed, Balanced or Deep. Balanced and Deep first turn your question into a search of its own.
- Pages are read with Mozilla Readability, and on long pages only the parts that match your question are sent.
- Settings for how long saved answers, follow-ups and kept conversations stay, and one button to delete them all.
- Services that need no key can be used without one.

## 1.3.0 · 12 October 2026

Tested on Startpage as it was on 12 October 2026: the theme's dictionary box on the live site in Firefox with Stylus,
and the key lock in the demo in Chromium. Instant Answer not yet tested with a real AI service.

| Part | Version |
|---|---|
| Blackout theme | 1.2.1 |
| Tweaks | 1.1.0 |
| Home widgets | 1.2.0 |
| Instant Answer | 2.3.0 |
| F1 card | 1.3.2 |
| Quick answers | 1.1.0 |

- Instant Answer runs sealed off from Startpage's own scripts, so they can't see your key while it works.
- Instant Answer has an optional key lock: your keys are stored encrypted with a passphrase (AES-GCM, PBKDF2 with
  600,000 rounds) and unlocked for as long as you choose.
- The theme styles Startpage's dictionary answer to match: a black card, quiet synonym chips and accent links.
- Instant Answer remembers each service's model list separately.

Page parts the scripts rely on, added in this release: dictionary `.dictionary-feedback-container`, `.dictionary`,
`.synonym`, `.dictionary-footer`.

## 1.2.0 · 12 October 2026

Tested on Startpage as it was on 12 October 2026: the home widgets on the live site in Firefox with Violentmonkey and
Stylus, and moving, resizing and Instant Answer's settings in the demo in Chromium. Instant Answer not yet tested with
a real AI service.

| Part | Version |
|---|---|
| Blackout theme | 1.2.0 |
| Tweaks | 1.1.0 |
| Home widgets | 1.2.0 |
| Instant Answer | 2.1.0 |
| F1 card | 1.3.2 |
| Quick answers | 1.1.0 |

- Home widgets move like an iOS home screen. Hold any widget for a moment, or open Customize, and drag it anywhere.
  The others slide out of the way. There is no handle to find any more, and dragging stays smooth.
- Resizing a widget now scales everything inside it, text, numbers, pictures and spacing, to fill the new size. Small
  widgets drop their title so the rest can be bigger.
- Instant Answer's settings have the usual addresses for llama.cpp, LM Studio and Ollama, and say when you need to
  pick a model because your model app doesn't say which one is loaded.

Page parts the scripts rely on are the same as in 1.0.1.

## 1.1.0 · 11 October 2026

Tested on Startpage as it was on 11 October 2026. The home widgets and the F1 widget on the live site in Firefox with
Violentmonkey and Stylus, and in the demo in Chromium. Instant Answer in Firefox with Violentmonkey against a stand-in AI server, including a
real Startpage search made by the AI. Not yet tested with a real AI service.

| Part | Version |
|---|---|
| Blackout theme | 1.2.0 |
| Tweaks | 1.1.0 |
| Home widgets | 1.1.0 |
| Instant Answer | 2.0.0 |
| F1 card | 1.3.2 |
| Quick answers | 1.1.0 |

- Home widgets can be resized. Text and spacing follow each widget's size, and narrow windows stack them.
- Home widgets have a Look panel for your own accent, background, search bar and widget colours, a background
  picture and a glass look.
- Instant Answer works with any OpenAI-compatible service, picks a fast or a stronger model for each question, and
  has a thinking setting.
- Instant Answer can continue an answer as a conversation that searches Startpage and reads pages. Conversations are
  deleted when closed unless you keep them, and can be downloaded as Markdown.
- The F1 widget on the home page scales with its size and follows the widget colours.

Page parts the scripts rely on are the same as in 1.0.1.

## 1.0.1 · 11 October 2026

Tested on Startpage as it was on 11 October 2026, in Firefox with Violentmonkey and Stylus. The results page and
the home page had the same layout as on 10 October.

| Part | Version |
|---|---|
| Blackout theme | 1.2.0 |
| Tweaks | 1.1.0 |
| Home widgets | 1.0.0 |
| Instant Answer | 1.3.0 |
| F1 card | 1.3.1 |
| Quick answers | 1.1.0 |

- F1 card goes easier on its free data services. Answers are saved and shared by all tabs. A running session is
  kept 10 minutes and a finished one 30 days, and only answers that have results are kept long. Requests are
  spaced out, two parts of a page asking for the same thing share one request, and after a "too many requests"
  answer the card waits at least a minute and shows the last saved answer.
- The theme and scripts now check GitHub Pages for updates, also when installed from the download.
- A zip with the Windows install script is on the Releases page.
- A demo page and screenshots.
- Plainer descriptions.

Page parts the scripts rely on, as of this release: results `.w-gl > .result`, `.wgl-title-link-container`,
`a.result-title`, `.anonymous-view-link`, search box `#header-search-form`, `#search` and `#q`, home page `.search-home-inner`.

## 1.0.0 · 10 October 2026

First public release. Tested on Startpage as it was on 10 October 2026, in Chromium and in Firefox with
Violentmonkey and Stylus.

| Part | Version |
|---|---|
| Blackout theme | 1.2.0 |
| Tweaks | 1.1.0 |
| Home widgets | 1.0.0 |
| Instant Answer | 1.3.0 |
| F1 card | 1.3.0 |
| Quick answers | 1.1.0 |

- Blackout theme with three accent colours and a choice of where the results sit.
- Tweaks with same tab results and no click logging, no ad blocker banner or Private Search badge, a ⋮ menu on
  every result and keyboard keys.
- Home widgets for clock, weather, shortcuts, notes, calendar, currency, timer and Formula 1, each one on or off
  and in any order.
- Instant Answer with short answers above results and one page summaries. Off until turned on. Works with
  OpenCode Go or a model app on your computer.
- F1 card with session results, tyre strategy, standings, schedule and calendar. Teams by colour and drivers by
  initials.
- Quick answers for timer, parcel tracking, colour, coin, dice, random number, currency and translation searches
  passed to Startpage's own translator.
