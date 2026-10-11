# Blackout for Startpage

A true black theme and a few small add-ons for [Startpage](https://www.startpage.com). Install only the parts you
want. Each one works on its own.

**[Try the demo](https://astqh.github.io/blackout-for-startpage/demo/)** ·
**[Install page](https://astqh.github.io/blackout-for-startpage/)** ·
**[Download](https://github.com/astqh/blackout-for-startpage/releases/latest)**

![Search results in the Blackout theme with a short answer at the top and the ⋮ menu open on a result](screenshots/results.png)

Not made by or connected to Startpage, Formula 1, the FIA or any team.

## What you get

| Part | What it does | What leaves your computer |
|---|---|---|
| **Blackout theme** | Black background, three accent colours, results moved a little toward the centre on wide screens. Hides ads and promos. | Nothing |
| **Tweaks** | Results open in the same tab. The ad blocker banner and the Private Search badge are hidden to reduce clutter. Every result gets a ⋮ menu, and there are keyboard keys. | Nothing |
| **Home widgets** | Clock, weather, shortcuts, notes, calendar, currency, timer and the next F1 race under the search box on the home page. | Weather sends the city you type once, then only its map position, to Open-Meteo. Currency asks Frankfurter for the day's rates. |
| **Instant Answer** | A short answer above your results, written from those results. Off until you turn it on. | Only when it's on, and only to the AI service you pick. It gets your search and the titles and descriptions of the results. |
| **F1 card** | Formula 1 results, tyre strategy, standings and the race weekend schedule in your time zone. | Requests like "2026 round 17 qualifying" to Jolpica-F1 and OpenF1. Never your search. |
| **Quick answers** | Timer, parcel tracking links, colour preview, coin flip, dice, random numbers, currency and a shortcut to Startpage's translator. | Currency only. It asks Frankfurter for the day's rates. |

There is no server, no account and no tracking. Nothing is ever sent to this project.

## Install

You need two free browser add-ons. [Stylus](https://github.com/openstyles/stylus) runs the theme and
[Violentmonkey](https://violentmonkey.github.io/) runs the scripts. Tampermonkey works too.

On Chrome, Brave or Edge, open your extensions page, click **Details** under Violentmonkey and turn on
**Allow User Scripts**. Without it the scripts do nothing. Firefox doesn't need this.

Then install in **one** of these two ways. Both give you the same add-ons.

### Install page (easiest)

Open the [install page](https://astqh.github.io/blackout-for-startpage/) and click **Install** next to each part
you want. Stylus or Violentmonkey opens a page where you confirm.

### Or download for Windows

For installing from files on your own computer.

1. Download the zip from the [latest release](https://github.com/astqh/blackout-for-startpage/releases/latest)
   and unzip it.
2. Double-click `tools\Install add-ons.cmd`. If Windows asks whether to run it, choose **Run**.
3. A small black window opens and your browser shows the same install page at `http://localhost:8777/`.
   Only your computer can open it.
4. Click **Install** next to each part. Close the black window when you're done.

Neither way needs admin rights. Either way, the add-ons check this project's install page for new versions by
themselves.

## How to use

- **Theme.** Click the Stylus icon on a Startpage tab, then the gear next to **Blackout for Startpage**. Pick an
  accent colour and where the results sit. Setting Startpage's own theme to Dark stops white flashes while pages
  load.
- **⋮ menu.** Click ⋮ next to a result's address to summarize the page, open it in Anonymous View, copy the link,
  or pin or hide that site.
- **Keys.** `j` and `k` move between results, `Enter` opens one and `?` lists all keys.
- **Home widgets.** Click **Customize** under the widgets to add, hide, move or set them up.
- **Instant Answer.** Click **Turn on Instant Answer** above your results, then pick a service.
- **F1 card.** Search things like `monza qualifying`, `f1 standings` or `next f1 race`.
- **Quick answers.** Search `5 minute timer`, `#a3c4ff`, `flip a coin`, `roll 2d6` or `100 euros`.
- **Switches.** Click the Violentmonkey icon on a Startpage tab. Each script lists its on and off switches there.

## Demo and screenshots

The [demo](https://astqh.github.io/blackout-for-startpage/demo/) runs the real scripts on a sample page in your
browser. Everything on it is made up and nothing is sent anywhere. The F1 card isn't in the demo because it needs
live race data.

<img src="screenshots/home.png" width="640" alt="Home page with clock, weather, shortcuts, notes, calendar and currency widgets under the search box">

<img src="screenshots/summary.png" width="640" alt="A three point summary of one result, opened from its ⋮ menu">

<p>
<img src="screenshots/timer.png" width="49%" alt="A five minute timer above the results">
<img src="screenshots/translate.png" width="49%" alt="A Translate button for the search parle francais english">
</p>

## More about each part

### Blackout theme

The theme has two settings under the gear in Stylus.

- **Accent colour.** Soft blue, Lilac or Amber gold.
- **Results position.** Left like Startpage, centre left (the default) or centred. The search box, tabs, filters
  and results move together. Windows narrower than 1200 pixels keep Startpage's own layout.

It uses fonts already on your computer, so it loads nothing.

### Tweaks

A normal click opens a result in the same tab. Ctrl click or a middle click still opens a new tab. This also skips
Startpage's click logging, which records the result you pick before opening it.

The ⋮ menu on every result has these items.

| Item | Key | What it does |
|---|---|---|
| Summarize this page | `s` | 3 to 5 points under the result. Needs Instant Answer. |
| Open in Anonymous View | `a` | Startpage visits the site for you, so the site doesn't see your IP address |
| Copy link | `c` | |
| Pin site to the top | `p` | That site's results move to the top of every search |
| Hide site | `h` | That site's results are left out, with a line to show them again |
| Hidden and pinned sites | | See the lists and add or remove sites |
| Keyboard keys | `?` | The full list |

Keys work on the result you pick with `j` and `k`, which gets an outline, or else on the one under the mouse.
`m` opens its ⋮ menu and `/` jumps to the search box. Keys do nothing while you type in a box.

### Home widgets

Clock, weather, shortcuts and notes show at first, plus Formula 1 if the F1 card is installed. Calendar, currency
and timer can be added. Under **Customize** you can set the clock's cities, your weather city and °F, your
shortcuts and your currency. Shortcuts show a coloured letter, so no site is contacted until you click one. Notes
stay in your browser. Currency, °C or °F and the 12 or 24 hour clock start from your browser's language setting.

### Instant Answer

Pick one of two services.

- **OpenCode Go** with your own key.
- **A model app on your computer** such as LM Studio, Ollama or llama.cpp. Everything stays on your computer. It
  uses whichever model is loaded.

By default it answers questions and longer searches by itself and shows an **Ask AI** button for the rest. You can
change that to only when you click, or every search. It stays out of the way when Startpage shows its own answer
box, like weather or a calculator.

For a summary, the page is fetched straight from the site without cookies, so the site sees your IP address as if
you opened it. PDFs, sign in pages and some app style pages can't be summarized. It tells you when that happens.

### F1 card

Tabs for each session, the schedule, standings and the season calendar. Teams are shown by colour and drivers by
their initials. Race and sprint results show tyre strategy from 2023 on. Options are under ⚙ in the card.

The data comes from two free services. To go easy on them, every answer is saved in your browser and shared by all
tabs. A session that is still running is kept for 10 minutes and a finished one for 30 days. Requests are spaced
out, and if a service says it's busy the card waits at least a minute and shows the last saved answer.

### Quick answers

Try `5 minute timer`, a tracking number like `1Z999AA10123456784`, `#a3c4ff`, `flip a coin`, `roll 2d6`,
`random number between 1 and 50` or `100 euros`. Each card has its own switch under ⚙.

Startpage's own translator only opens when a search starts with "translate". Searches like
`good morning in french` or `how do you say thank you in spanish` are passed to it for you. Less clear ones like
`parle francais english` get a Translate button. Searches like `learn spanish` are left alone. Going back never
sends you forward again.

## Optional extras

### Block Startpage's own statistics

Startpage sends its own usage statistics, like scroll depth and page timings, to `startpage.com/clev` and `/perf`.
Its map widget can also ask MapQuest for your location. If you use uBlock Origin, paste
[`filters/ublock.txt`](filters/ublock.txt) into **Dashboard › My filters**. Search and the map keep working.

### Suggested Startpage settings

These are in Startpage's own settings page.

| Setting | Suggested | Why |
|---|---|---|
| Search method | POST | Keeps your searches out of the address bar and history |
| Theme | Dark | Matches Blackout, so nothing flashes white |
| Region | Your country | Local shops, news and weather |
| Search location | Blank | Startpage never learns where you are |
| Results per page | 20 | Fewer page loads |
| Open results in a new tab | Off | Tweaks opens them in the same tab anyway |
| Promotional messaging | Off | Fewer promos |
| Server region | Closest | Fastest |

Startpage keeps these in a cookie. If your browser clears cookies when it closes, save Startpage's settings URL as
your search engine address instead.

## If something stops working

The theme and scripts find parts of Startpage's page by name. If Startpage changes its page, the affected part
stops and the rest of the page keeps working. The [changelog](CHANGELOG.md) lists the date of the Startpage page
each release was tested on. Please [open an issue](https://github.com/astqh/blackout-for-startpage/issues) with
your release, your browser and the search you used.

## Licence and credits

MIT. See [LICENSE](LICENSE). Data sources and the icon notice are in [THIRD-PARTY.md](THIRD-PARTY.md). Changes
are in the [changelog](CHANGELOG.md).
