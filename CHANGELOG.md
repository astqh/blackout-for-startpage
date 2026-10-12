# Changelog

Each release says which day's Startpage it was tested on. If something breaks, that date helps tell whether
Startpage changed its page since.

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
