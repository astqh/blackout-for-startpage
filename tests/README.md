# Tests

Browser tests for the theme and scripts. They load each userscript the way Violentmonkey does (the `GM_*`
functions are stand-ins backed by the page's storage) and the theme the way Stylus does, then check pages in
Chromium with Playwright. Nothing here is installed by users.

## What you need

- Node 18+, Playwright and Chromium (`npm i -g playwright && npx playwright install chromium`, or set `CHROME` to a
  Chromium binary).
- The stand-in AI service, `node tests/fakeai.js` (port 9999). `run-all.sh` starts it if it isn't running. It answers
  like an OpenAI-compatible service, streams its replies, logs every request, and can fail on purpose:
  `curl "http://127.0.0.1:9999/ctl?mode=401"` (modes: normal, 401, 429, slow, drip, hang, offline, empty, skip).

Startpage itself is never contacted: `sp-pages.js` serves sample Startpage pages at www.startpage.com inside the test
browser.

For the SearXNG suites, a SearXNG on 127.0.0.1:8888 with the offline test engine:

```sh
git clone --depth 1 https://github.com/searxng/searxng.git && cd searxng
python3 -m venv ../venv && ../venv/bin/pip install -r requirements.txt
cp ../blackout-for-startpage/tests/searxng-test-engine.py searx/engines/blackout_test.py
SEARXNG_SETTINGS_PATH=../blackout-for-startpage/tests/searxng-settings.yml ../venv/bin/python -m searx.webapp
```

## The suites

| File | What it checks |
|---|---|
| `diction.js` | Misspelt keywords (unit checks of the fixer, then the cards), "Did you mean", Instant Answer with misspelt questions |
| `ia-unit.js` | Instant Answer's pure helpers: when it answers by itself, when a follow-up needs a search |
| `sp.js` | Every part on sample Startpage pages: home widgets, ⋮ menu, keys, pin and hide, quick cards, Instant Answer |
| `speed.js` | The speed test card and its speedometer (Cloudflare answered by a stand-in) |
| `ia.js` | Instant Answer: prompts, interface at 1600 and 400 px with and without the theme, errors, Stop |
| `ia-bench.js` | Requests and time to the first words for an answer, a reload, follow-ups and a summary (`--check` to assert) |
| `ui-audit.js`, `other-audit.js` | Screenshots into `tests/shots/` plus overflow, unnamed controls and faint text |
| `harness.js` | Everything on the local SearXNG: theme, home, ⋮ menu, keys, quick cards, Instant Answer and its allow step, typos, Did you mean |
| `sx-align.js`, `sx-ui.js` | SearXNG: boxes line up with the results; Instant Answer's interface with and without the theme |
| `privau.js` | The same on the public instance priv.au, with real results (`LIVE_SITES=1 tests/run-all.sh` includes it) |

`node tests/ia.js rel long` adds the 90-second "no reply at all" check.

## Running

```sh
tests/run-all.sh
```

prints one line per suite (`== passed/total`). `REPO=/path/to/other/checkout node tests/sp.js` runs a suite against
another copy, e.g. an older commit to compare.

## The everyday-word lists

The scripts fix misspelt keywords but never change everyday words that happen to be close to one (`time` and
`timer`). Those lists are built from a list of common English words:

```sh
node tests/make-common.js google-10000-english-usa.txt
```

Run it after changing a script's keyword list (`/*VOCAB*/`); it rewrites the `/*COMMON*/` list in each script.
