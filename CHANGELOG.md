# Changelog

Each release says which day's Startpage it was tested on. If something breaks, that date helps tell whether
Startpage changed its page since.

## 1.8.0 · 24 November 2026 (SearXNG)

Misspelt searches. Tested in Chromium with the scripts loaded the way Violentmonkey loads them, on sample Startpage
pages, a SearXNG running on the test machine and the public instance priv.au. Startpage's suggestion service itself
couldn't be reached from the test machine, so "Did you mean" on startpage.com is untested; it stays quiet if that
service doesn't answer.

| Part | Version |
|---|---|
| Blackout theme | 1.2.2 |
| Blackout theme for SearXNG | 1.0.2 |
| Tweaks | 1.2.1 |
| Home widgets | 1.3.0 |
| Instant Answer | 2.7.1 |
| F1 card | 1.4.1 |
| Quick answers | 1.4.0 |

- Misspelt keywords still find their card: `5 minut timer`, `spead test`, `flip a coinn`, `100 eruos`,
  `f1 standigns`, `monza qualifiyng`, `silverstne results`. The card says what it understood ("Timer · for “5 minute
  timer”"). Searches spelt right work exactly as before, and everyday words are never "corrected" (`5 minute time`,
  `test drive` and `nice weather` show nothing).
- Instant Answer treats `waht is …` and `diffrence between …` as the questions they are.
- New quick answer, **Did you mean**: when a search finds almost nothing (fewer than 3 results) and the search engine
  shows no correction of its own, it suggests a spelling, with a button to search it. On SearXNG the spelling comes
  from the instance's own autocomplete (whatever service you picked in its preferences, and nothing if it's off); on
  Startpage from Startpage's search suggestions. Its own switch is under ⚙.
- The Blackout theme for SearXNG now also darkens SearXNG's "Sorry! No results" box, which stayed bright pink.
- On a SearXNG search that found nothing, the cards line up with SearXNG's "no results" box.
- The test suites are now in the repository, in `tests/` (see `tests/README.md`).

## 1.7.0 · 23 November 2026 (SearXNG)

Instant Answer made faster, clearer and sturdier. Tested in Chromium with the scripts loaded the way Violentmonkey
loads them, on sample Startpage pages, a SearXNG running on the test machine and the public instance priv.au, against
a local stand-in AI that streams its replies, can fail on purpose and counts every request. Not yet tested with a real
AI service or on startpage.com itself.

| Part | Version |
|---|---|
| Blackout theme | 1.2.2 |
| Blackout theme for SearXNG | 1.0.1 |
| Tweaks | 1.2.1 |
| Home widgets | 1.3.0 |
| Instant Answer | 2.7.0 |
| F1 card | 1.4.0 |
| Quick answers | 1.3.1 |

Speed (measured with the stand-in, before → after):

- On SearXNG without the Blackout theme, the Instant Answer, quick-answer and F1 boxes sat against the left edge;
  they now line up with the text of the results at any width (and the theme no longer sets a fixed margin for them,
  which was 6 px off on phones).
- On SearXNG, Instant Answer no longer waits 0.4 s before starting, since SearXNG's own answers are part of the page
  from the start: the first words come about 610 ms → 225 ms after the page has loaded.
- A saved answer shows at once when you search again (about 480 ms → 80 ms), and also while your keys are locked,
  since it needs no key.
- A follow-up the results already cover no longer asks the AI to turn it into a search first: 2 requests → 1, about
  280 ms → 170 ms to the first words. Follow-ups that say "it", "that" or "and what about…" still get their own search.
- With a model app on your computer and no model picked, its model list is asked once a minute instead of before
  every request (a follow-up: 4 requests → 2, a summary: 2 → 1).

Answer quality (only changes that clearly help):

- The short answer and page summaries tell the AI that text from results and pages is information, never
  instructions, as conversations already did. A page can't steer the answer by writing orders into its text.
- The follow-up search knows today's date, so "what about this year" searches for the year itself.
- A follow-up that already stands on its own keeps its words as the search, instead of being reworded.
- Reviewed and kept as they are: when it answers by itself or shows Ask AI, the SKIP rule, and which results are sent
  (the top 8, without hidden sites or Startpage's trap link, descriptions cut at 320 characters).

Interface (checked at 1600 and 400 pixels wide, with the Blackout theme and on a light page without it):

- Every field in Instant Answer's settings has a label that screen readers announce.
- A finished answer or follow-up is read out once by screen readers, not word by word as it is written.
- Tab stays inside the settings and conversation panels while they are open, and closing them puts the focus back
  where it was, also when they were opened from the ⋯ menu.
- Small grey text is easier to read: the Blackout themes' grey is a little lighter, on Startpage and SearXNG (contrast 3.9 → 5.4), and on light
  pages without the theme, Instant Answer, quick answers and the ⋮ menu use darker greys and a darker accent so text
  and buttons reach a contrast of 4.5. The speed test's upload colour is darker on light pages.

Reliability (each failure tried with the stand-in):

- A **Stop** button shows while the answer, a follow-up or a conversation reply is being written. It keeps the words
  so far (marked "stopped", not saved); stopped before any words, it offers Ask AI again.
- A stopped conversation reply no longer leaves the panel stuck: the next message is answered.
- When the AI service is busy or you've reached its limit (429), it says so, with the wait the service asks for, and
  doesn't retry by itself.
- An empty reply says so in plain words instead of "Something went wrong".
- When Startpage asks for its "verify" check during the AI's own search, the step says to search once on
  startpage.com, and the answer still comes from what it has.
- Checked and unchanged: offline, a refused key, a slow service (3 s to the first words) and no reply at all (it gives
  up after 90 s with "The answer took too long").
## 1.6.0 · 17 October 2026 (SearXNG)

Works on SearXNG as well as Startpage. Tested on SearXNG as it was on 16 October 2026 (its standard "simple" theme)
running on this computer, in Chromium, with the scripts loaded the way Violentmonkey loads them and a stand-in AI:
the theme, the ⋮ menu, pinning and hiding, keys, home widgets, quick answers, an answer, a follow-up that searched
SearXNG and a summary. Also tested on the public instance priv.au on 17 October 2026 with real results, mixed web and
video results, and the images tab. Startpage checked again on sample pages. Not yet tested with a real AI service.

| Part | Version |
|---|---|
| Blackout theme | 1.2.1 |
| Blackout theme for SearXNG | 1.0.0 (new) |
| Tweaks | 1.2.0 |
| Home widgets | 1.3.0 |
| Instant Answer | 2.6.0 |
| F1 card | 1.4.0 |
| Quick answers | 1.3.0 |

- New: **Blackout for SearXNG**, the black theme for any SearXNG instance. It only changes pages that say they are
  SearXNG.
- Every script works on SearXNG instances at any address. Other sites are left alone.
- Instant Answer works only on the SearXNG instances you turn it on for, and its searches go to that instance.
- On SearXNG the ⋮ menu opens the archived copy (or the proxy) instead of Anonymous View, and the translator shortcut is off.
- On SearXNG the keys from Tweaks come before SearXNG's own keys with the same letters.
- The speed test from 1.5.0, with its speedometer, works on SearXNG too. Instant Answer sits below the quick-answer
  and F1 cards there, as on Startpage.

SearXNG page parts the scripts rely on: `<meta name="generator" content="searxng/…">`, `<meta name="endpoint">`,
`form#search`, `#q`, `#categories` (`.category_button.selected`), `article.result` in `#urls` or in its
`div.template_group_*` groups, with `a.url_header`, `h3 a`, `p.content`, `a.cache_link`, `a.proxyfied_link`, and
`#answers .answer`.

## 1.5.0 · 17 October 2026

Tested in Chromium with the scripts loaded the way Violentmonkey loads them, on a sample Startpage page, with a local
stand-in for Cloudflare's speed test service (the real one couldn't be reached from the test machine). Not yet tested
against speed.cloudflare.com itself.

| Part | Version |
|---|---|
| Blackout theme | 1.2.1 |
| Tweaks | 1.1.0 |
| Home widgets | 1.2.0 |
| Instant Answer | 2.5.0 |
| F1 card | 1.3.2 |
| Quick answers | 1.2.0 |

- Quick answers has an internet speed test for searches like `speed test` or `test my wifi`: download, upload, latency
  and jitter, measured with Cloudflare's speed test service, with a speedometer you can turn off under ⚙. It starts
  only when you click Start test.

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
