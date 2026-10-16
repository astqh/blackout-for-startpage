// ==UserScript==
// @name         Home widgets for Startpage
// @namespace    blackout-for-startpage/home
// @version      1.3.0
// @license      MIT
// @homepageURL  https://github.com/astqh/blackout-for-startpage
// @supportURL   https://github.com/astqh/blackout-for-startpage/issues
// @downloadURL  https://astqh.github.io/blackout-for-startpage/scripts/home.user.js
// @updateURL    https://astqh.github.io/blackout-for-startpage/scripts/home.user.js
// @description  Widgets under the search box on the Startpage home page. Clock, weather, shortcuts, notes, calendar, currency, timer and the next F1 race. Turn each one on or off, drag them into any order and resize them. Pick your own accent, background, search bar and widget colours, with an optional glass look. Also works on SearXNG.
// @match        https://*.startpage.com/*
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      api.open-meteo.com
// @connect      geocoding-api.open-meteo.com
// @connect      api.frankfurter.dev
// @run-at       document-start
// @noframes
// ==/UserScript==

/*
 * What leaves your PC:
 *   - Weather: the city name you type goes once to Open-Meteo's place search; after that only the city's coordinates
 *     go to Open-Meteo for the forecast (at most every 20 minutes). Nothing until you set a city.
 *   - Currency: the currency codes go to Frankfurter (European Central Bank rates), at most every 6 hours.
 *   - Everything else (clock, shortcuts, notes, calendar, timer) stays in this browser.
 * Shortcuts show a coloured letter instead of the site's icon, so no site is contacted until you click it.
 * Customize (under the widgets) turns widgets on and off, lets you drag them into any order and resize them by their
 * corner, and has Look: your own accent colour (every Startpage page), and page, search bar and widget colours, a
 * picture and a glass look (the home page). The picture stays in this browser.
 * Other scripts can add a widget: the F1 script adds "Formula 1" (its next race and weekend times).
 * SearXNG: the same widgets under the search box of any SearXNG instance's home page. Other pages are left alone:
 * the script stops at once unless the page carries SearXNG's own <meta name="generator" content="searxng/…">.
 */

(function home() {
  "use strict";
  if (window.top !== window.self) return;
  // Startpage, or a SearXNG instance at any address (known by its generator tag, so wait until <head> is read)
  const SP = /(^|\.)startpage\.com$/i.test(location.hostname);
  if (!SP && document.readyState === "loading") return void document.addEventListener("DOMContentLoaded", home, { once: true });
  if (!SP && !document.querySelector('meta[name="generator"][content^="searx" i]')) return;
  // widgets on the home page; your accent on every page
  const isHome = SP ? /^\/([a-z]{2}\/?)?$/i.test(location.pathname)
    : !!document.querySelector('meta[name="endpoint"][content="index"]') || document.body.classList.contains("index_endpoint");
  const SITE = SP ? "Startpage" : "SearXNG";
  // the home page parts Look colours: Startpage's, or SearXNG's (its own colour variables follow the Blackout theme)
  const PAGE = SP ? { clear: "body,#root,#___gatsby,.themeProvider,.Layout,.home,.search-home,.hero", box: ".search-home .search-form-container",
    input: ".search-home .search-form-input", icons: ".search-home :is(.search-btn,.x-btn) svg" }
    : { clear: "body,#main_index,.index,footer", box: ".index .search_box", input: ".index #q", icons: ".index :is(#send_search,#clear_search)" };

  // ---------------------------------------------------------------- settings
  // Defaults follow the browser's language setting (e.g. "en-CA" → Canada → CAD, Celsius).
  const REGION = (() => { try { return new Intl.Locale(navigator.language).maximize().region || ""; } catch (e) { return ""; } })();
  const EURO = "AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES".split(" ");
  const localCurrency = () => ({ CA: "CAD", US: "USD", GB: "GBP", AU: "AUD", NZ: "NZD", JP: "JPY", CH: "CHF", IN: "INR", SE: "SEK", NO: "NOK", DK: "DKK",
    PL: "PLN", CZ: "CZK", HU: "HUF", BR: "BRL", MX: "MXN", ZA: "ZAR", SG: "SGD", HK: "HKD", KR: "KRW", CN: "CNY", TR: "TRY", IL: "ILS" }[REGION] || (EURO.includes(REGION) ? "EUR" : "USD"));
  const DEFAULTS = {
    enabled: true,
    order: ["clock", "weather", "f1", "shortcuts", "notes", "calendar", "currency", "timer"],
    on: { clock: true, weather: true, f1: true, shortcuts: true, notes: true, calendar: false, currency: false, timer: false },
    clock: { h24: !new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12, zones: [] },                      // zones: [{ label, tz }]
    weather: { place: null, unit: REGION === "US" ? "fahrenheit" : "celsius" },            // place: { name, region, lat, lon }
    shortcuts: [
      { name: "Wikipedia", url: "https://en.wikipedia.org/" },
      { name: "YouTube", url: "https://www.youtube.com/" },
      { name: "Reddit", url: "https://www.reddit.com/" },
      { name: "GitHub", url: "https://github.com/" },
    ],
    notes: "",
    currency: { base: localCurrency(), list: ["USD", "EUR", "GBP", "CAD"].filter((c) => c !== localCurrency()).slice(0, 3), amount: 1 },
    timer: { minutes: 5, endAt: 0, left: 0 },
    size: {},                                             // per widget: { w: columns out of 6, h: height in px, 0 = fits its content }
    look: { accent: "", page: "", search: "", widget: "", glass: false, imgLight: false },   // "" = the theme's own colour
  };
  function load() {
    const s = Object.assign({}, DEFAULTS, GM_getValue("settings", {}));
    for (const k of ["on", "clock", "weather", "currency", "timer", "size", "look"]) s[k] = Object.assign({}, DEFAULTS[k], s[k]);
    s.order = s.order.filter((id, i) => s.order.indexOf(id) === i).concat(DEFAULTS.order.filter((id) => !s.order.includes(id)));
    if (!Array.isArray(s.shortcuts)) s.shortcuts = DEFAULTS.shortcuts.slice();
    return s;
  }
  let S = load();
  const save = () => GM_setValue("settings", S);

  // ---------------------------------------------------------------- your colours (Look)
  // One style element, added as early as possible outside the page's own markup. The accent applies on every page;
  // the background, picture, search bar and glass on the home page. Text turns dark or light to stay readable.
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c.toLowerCase() : "");
  function luma(h) {
    const n = parseInt(h.slice(1), 16), f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
  }
  const INK = {
    onDark: { ink: "#e6e6e9", ink2: "#b4b4bc", muted: "#8a8a94", line: "rgba(255,255,255,.09)", line2: "rgba(255,255,255,.18)" },
    onLight: { ink: "#1b1b1f", ink2: "#3f3f47", muted: "#686871", line: "rgba(0,0,0,.10)", line2: "rgba(0,0,0,.20)" },
  };
  const inkOn = (h) => (luma(h) > 0.18 ? INK.onLight : INK.onDark);
  const extraCSS = [];
  let lookImage = isHome ? GM_getValue("lookImage", "") : "";
  const lookStyle = document.createElement("style");
  lookStyle.id = "sp-home-look";
  function lookCSS() {
    const L = S.look, a = hex(L.accent), p = hex(L.page), s = hex(L.search);
    let css = "";
    if (a) css += ":root:root{--sp-accent:" + a + "!important;--sp-link:" + a + "!important;--sp-visited:color-mix(in oklab," + a + " 62%,#6b6b78)!important;" +
      "--sp-select:color-mix(in srgb," + a + " 28%,transparent)!important}" + (SP ? ".home.home,.home.home[data-theme]{--primary:" + a + "!important}"
        : ":root:root{--color-result-link-font:" + a + "!important;--color-url-font:" + a + "!important;--color-categories-item-border-selected:" + a + "!important;" +
          "--color-btn-background:" + a + "!important;--color-search-background-hover:" + a + "!important}");
    if (!isHome) return css;
    // the page colour (or the picture's brightness) sets the home page's whole palette, so menus and widgets match it
    const base = p || (lookImage ? (L.imgLight ? "#f4f4f6" : "#000000") : "");
    if (base) {
      const k = inkOn(base), mix = (pct) => "color-mix(in srgb," + base + " " + pct + "%," + k.ink + ")";
      css += ":root:root{--sp-bg:" + base + "!important;--sp-surface:" + mix(94) + "!important;--sp-surface-2:" + mix(88) + "!important;--sp-field:" + mix(92) + "!important;" +
        "--sp-ink:" + k.ink + "!important;--sp-ink-2:" + k.ink2 + "!important;--sp-muted:" + k.muted + "!important;--sp-line:" + k.line + "!important;--sp-line-strong:" + k.line2 + "!important}" +
        ":root:root,:root:root body{background:" + base + "!important}" + (SP ? ".home.home,.home.home[data-theme]{--background:" + base + "!important;background:" + base + "!important}"
          : ":root:root{--color-base-background:" + base + "!important;--color-footer-background:" + base + "!important}");
    }
    if (lookImage) css += ':root:root{background:' + base + ' url("' + lookImage + '") center/cover no-repeat fixed!important}' +
      ":root:root :is(" + PAGE.clear + "){background:transparent!important}";
    if (s || L.glass) {
      const fill = s || "var(--sp-field,#16161a)";
      css += ":root:root " + PAGE.box + "{background:" + (L.glass ? "color-mix(in srgb," + fill + " 55%,transparent)" : fill) + "!important" +
        (L.glass ? ";backdrop-filter:blur(18px) saturate(1.4)!important" : "") + "}";
      // SearXNG paints the box, the clear button and the search button separately
      if (!SP) css += ":root:root .index :is(#q,#send_search,#clear_search){background:transparent!important}";
    }
    if (s) {
      const k = inkOn(s);
      css += ":root:root " + PAGE.box + "{border-color:" + k.line2 + "!important}:root:root " + PAGE.box + ":focus-within{border-color:var(--sp-accent)!important}" +
        ":root:root " + PAGE.input + "{color:" + k.ink + "!important}:root:root " + PAGE.input + "::placeholder{color:" + k.muted + "!important}" +
        ":root:root " + PAGE.icons + "{color:" + k.muted + "!important}";
    }
    return css;
  }
  function pageLook() {
    const css = lookCSS() + extraCSS.map((x) => (typeof x === "function" ? x() : x)).join("");
    lookStyle.textContent = css;
    if (css && !lookStyle.isConnected) document.documentElement.append(lookStyle);
    else if (!css) lookStyle.remove();
  }
  // the widgets' own colours (the host element only exists on the home page, once the widgets are shown)
  function hostLook() {
    if (!host) return;
    const L = S.look, w = hex(L.widget), a = hex(L.accent), st = host.style;
    for (const k of ["--wbg", "--wbg2", "--wink", "--wink2", "--wmuted", "--wline", "--wline2", "--wonacc"]) st.removeProperty(k);
    if (w) {
      const k = inkOn(w);
      st.setProperty("--wbg", w); st.setProperty("--wbg2", "color-mix(in srgb," + w + " 88%," + k.ink + ")");
      st.setProperty("--wink", k.ink); st.setProperty("--wink2", k.ink2); st.setProperty("--wmuted", k.muted); st.setProperty("--wline", k.line); st.setProperty("--wline2", k.line2);
    }
    if (a) st.setProperty("--wonacc", luma(a) > 0.18 ? "#000000" : "#ffffff");
    host.toggleAttribute("data-glass", !!L.glass);
  }


  pageLook();
  if (!isHome) return;

  // ---------------------------------------------------------------- helpers
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const pad = (n) => String(n).padStart(2, "0");
  function getJSON(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET", url, anonymous: true, timeout: 12000, headers: { Accept: "application/json" },
        onload: (r) => { if (r.status >= 400) return reject(new Error("HTTP " + r.status)); try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(new Error("bad reply")); } },
        onerror: () => reject(new Error("offline")), ontimeout: () => reject(new Error("offline")),
      });
    });
  }
  const cacheGet = (k, ms) => { const c = GM_getValue("cache", {})[k]; return c && Date.now() - c.at < ms ? c.data : null; };
  const cachePut = (k, data) => { const c = GM_getValue("cache", {}); c[k] = { at: Date.now(), data }; GM_setValue("cache", c); };

  const ICON = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    resize: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M11 4 4 11M11 8.5 8.5 11"/></svg>',
    look: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.7 1.6-1.6 0-.5-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.6-9-7.6Z"/><circle cx="7.5" cy="11.5" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8" r="1.2" fill="currentColor"/></svg>',
  };
  // weather symbols, drawn simply
  const WX = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/></svg>',
    part: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 5.2A4 4 0 0 1 14.6 8"/><path d="M5 4.5 4 3.5M3 9H2M12 2.5V2"/><path d="M7 19h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.2 3.2 0 0 0 7 19Z"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 19h10a4.5 4.5 0 0 0 .4-9 6 6 0 0 0-11.5 1.7A3.7 3.7 0 0 0 7 19Z"/></svg>',
    fog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 9h16M3 13h18M5 17h14M8 21h8"/></svg>',
    rain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15h10a4.5 4.5 0 0 0 .4-9 6 6 0 0 0-11.5 1.7A3.7 3.7 0 0 0 7 15Z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/></svg>',
    snow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14h10a4.5 4.5 0 0 0 .4-9 6 6 0 0 0-11.5 1.7A3.7 3.7 0 0 0 7 14Z"/><path d="M8 18h.01M12 20h.01M16 18h.01M10 22h.01M14 22h.01"/></svg>',
    storm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14h10a4.5 4.5 0 0 0 .4-9 6 6 0 0 0-11.5 1.7A3.7 3.7 0 0 0 7 14Z"/><path d="m12 15-2 4h4l-2 4"/></svg>',
  };
  // WMO weather codes (used by Open-Meteo)
  function wmo(code, day) {
    if (code === 0) return ["Clear", day ? "sun" : "moon"];
    if (code === 1) return ["Mainly clear", day ? "sun" : "moon"];
    if (code === 2) return ["Partly cloudy", "part"];
    if (code === 3) return ["Overcast", "cloud"];
    if (code === 45 || code === 48) return ["Fog", "fog"];
    if (code >= 51 && code <= 57) return ["Drizzle", "rain"];
    if (code >= 61 && code <= 67) return ["Rain", "rain"];
    if (code >= 71 && code <= 77) return ["Snow", "snow"];
    if (code >= 80 && code <= 82) return ["Showers", "rain"];
    if (code === 85 || code === 86) return ["Snow showers", "snow"];
    if (code >= 95) return ["Thunderstorm", "storm"];
    return ["", "cloud"];
  }

  // ---------------------------------------------------------------- look
  // Everything inside a widget is sized in em, so one font size per widget (--fs, set by fit()) scales its text,
  // spacing and pictures together. The Look panel sets the --w* colours on the host.
  const CSS = `
:host { all: initial; display: block; width: min(980px, calc(100% - 32px)); margin: 30px auto 24px; position: relative; z-index: 1;
  --bg: var(--wbg, var(--sp-surface, #ffffff)); --bg2: var(--wbg2, var(--sp-surface-2, #f1f3f4)); --ink: var(--wink, var(--sp-ink, #1f1f1f)); --ink2: var(--wink2, var(--sp-ink-2, #474747));
  --muted: var(--wmuted, var(--sp-muted, #70757a)); --line: var(--wline, var(--sp-line, #e3e3e8)); --line2: var(--wline2, var(--sp-line-strong, #dadce0));
  --acc: var(--sp-accent, #1a0dab); --onacc: var(--wonacc, var(--sp-bg, #ffffff));
  --font: var(--sp-font, "Segoe UI", system-ui, sans-serif); --mono: var(--sp-mono, Consolas, ui-monospace, monospace); }
:host([data-dark]) { --bg: var(--wbg, var(--sp-surface, #1f2025)); --bg2: var(--wbg2, var(--sp-surface-2, #2a2b31)); --ink: var(--wink, var(--sp-ink, #e8eaed)); --ink2: var(--wink2, var(--sp-ink-2, #bdc1c6));
  --muted: var(--wmuted, var(--sp-muted, #9aa0a6)); --line: var(--wline, var(--sp-line, #2c2d33)); --line2: var(--wline2, var(--sp-line-strong, #3c4043));
  --acc: var(--sp-accent, #8ab4f8); --onacc: var(--wonacc, var(--sp-bg, #202124)); }
:host { --home-ink: var(--ink); --home-ink2: var(--ink2); --home-muted: var(--muted); --home-acc: var(--acc); --home-bg2: var(--bg2); }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.wrap { font: 14px/1.45 var(--font); color: var(--ink); container: home / inline-size; }
.grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; }
.card { font-size: var(--fs, 14px); position: relative; grid-column: span 2; background: var(--bg); border: 1px solid var(--line); border-radius: 16px; min-height: 150px; display: flex; flex-direction: column; min-width: 0; container-type: inline-size; }
.card[data-w="3"] { grid-column: span 3; } .card[data-w="4"] { grid-column: span 4; } .card[data-w="5"] { grid-column: span 5; } .card[data-w="6"] { grid-column: span 6; }
.card.sized { container-type: size; min-height: 0; }
.ch, .cb { --pad: 1.15em; }
:host([data-glass]) .card, :host([data-glass]) .editing .bar, :host([data-glass]) .look { background: color-mix(in srgb, var(--bg) 55%, transparent); backdrop-filter: blur(18px) saturate(1.4); border-color: color-mix(in srgb, var(--ink) 15%, transparent); }
/* iOS style editing: the widgets wiggle; the one you hold lifts and follows the pointer, and the others glide aside */
.editing .card { touch-action: none; cursor: grab; animation: wig .26s ease-in-out infinite alternate; }
.editing .card:nth-child(2n) { animation-delay: -.13s; animation-duration: .3s; }
.editing .card:nth-child(3n) { animation-delay: -.07s; }
@keyframes wig { from { rotate: -.45deg; } to { rotate: .45deg; } }
.card.lifted { animation: none; z-index: 5; cursor: grabbing; box-shadow: 0 18px 40px rgba(0,0,0,.45); transition: box-shadow .18s, scale .18s; scale: 1.04; }
.card.pressing { transition: scale .5s ease-out; scale: .97; }
.card.resizing { outline: 2px dashed var(--acc); outline-offset: 2px; }
.moving, .moving * { user-select: none; cursor: grabbing !important; }
.sizing, .sizing * { user-select: none; cursor: nwse-resize !important; }
.editing .card { border-style: dashed; border-color: var(--line2); }
.ch { display: flex; align-items: center; gap: .3em; min-height: 2em; padding: calc(var(--pad) * .7) var(--pad) 0; }
.ch h2 { margin: 0; flex: 1; min-width: 0; font: 600 .82em var(--font); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.tools { display: flex; gap: 2px; }
.ib { all: unset; cursor: pointer; width: 2em; height: 2em; border-radius: .57em; display: grid; place-items: center; color: var(--muted); }
.ib:hover { background: var(--bg2); color: var(--ink); }
.ib svg { width: 1.15em; height: 1.15em; }
.cb { flex: 1; display: flex; flex-direction: column; gap: .6em; min-width: 0; min-height: 0; padding: .55em var(--pad) var(--pad); }
.card.sized > .cb { overflow: hidden; }
.editing .card.sized > .cb { overflow: auto; scrollbar-width: thin; }   /* settings shown while editing can scroll */
.card.compact > .ch { display: none; }   /* small widgets drop their title, like iOS widgets */
.editing .card.compact:not(.measure) > .ch { display: flex; }
.card.measure { position: absolute; left: 0; top: 0; visibility: hidden; pointer-events: none; animation: none; }
.rs { all: unset; position: absolute; right: 3px; bottom: 3px; width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; color: var(--muted); cursor: nwse-resize; touch-action: none; }
.rs:hover, .rs:focus-visible { color: var(--ink); background: var(--bg2); }
.rs svg { width: 12px; height: 12px; }
button.link { all: unset; cursor: pointer; color: var(--ink2); font-size: .93em; display: inline-flex; align-items: center; gap: .43em; padding: .3em .45em; border-radius: .57em; }
button.link:hover { color: var(--ink); background: var(--bg2); }
button.link svg { width: 1.07em; height: 1.07em; }
.btn { all: unset; cursor: pointer; font: 600 .93em var(--font); padding: .45em 1.05em; border-radius: 999px; border: 1px solid var(--line2); color: var(--ink); text-align: center; }
.btn:hover { border-color: var(--acc); }
.btn.primary { background: var(--acc); border-color: var(--acc); color: var(--onacc); }
.btn.small { padding: .32em .78em; font-size: .9em; }
.chip { all: unset; cursor: pointer; font: 600 12.5px var(--font); padding: 5px 12px; border-radius: 999px; background: var(--bg2); color: var(--ink2); }
.chip:hover { color: var(--ink); box-shadow: inset 0 0 0 1px var(--acc); }
input[type=text], input[type=number], select, textarea { font: 1em var(--font); color: var(--ink); background: transparent; border: 1px solid var(--line2); border-radius: .7em; padding: .43em .7em; outline: none; min-width: 0; }
input:focus, select:focus, textarea:focus { border-color: var(--acc); }
select option { background: var(--bg); color: var(--ink); }
.row { display: flex; gap: .43em; align-items: center; flex-wrap: wrap; }
.row input[type=text] { flex: 1; }
.row .sp { flex: 1; }
.muted { color: var(--muted); font-size: .89em; }
.muted a { color: inherit; }
.credit { font-size: .82em; }
.bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; min-height: 32px; justify-content: flex-end; }
.editing .bar { justify-content: flex-start; padding: 10px 12px; border-radius: 14px; background: var(--bg); border: 1px solid var(--line); }
.bar .lbl { color: var(--muted); font-size: 13px; margin-right: 2px; }
.bar .sp { flex: 1; }
.ib:focus-visible, button.link:focus-visible, .btn:focus-visible, .chip:focus-visible, .tile:focus-visible, .cal button:focus-visible, .presets button:focus-visible, .look input:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
/* look panel */
.look { display: grid; gap: 10px; margin-top: 10px; padding: 14px 16px; border-radius: 14px; background: var(--bg); border: 1px solid var(--line); }
.look .lh { display: flex; align-items: center; gap: 8px; }
.look .lh b { flex: 1; font-weight: 600; }
.look .lr { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-height: 32px; }
.look .lr > span:first-child { width: 8.5em; color: var(--ink2); }
.look input[type=color] { width: 44px; height: 28px; padding: 2px; border: 1px solid var(--line2); border-radius: 8px; background: transparent; cursor: pointer; }
.look .st { color: var(--muted); font-size: 12.5px; }
.look .sp { flex: 1; }
.look label.row { color: var(--ink2); }
/* clock */
.time { font: 300 3.2em/1.05 var(--font); letter-spacing: -.02em; font-variant-numeric: tabular-nums; color: var(--ink); }
.time small { font-size: .39em; color: var(--muted); margin-left: .1em; letter-spacing: 0; }
.date { color: var(--ink2); }
.zones { list-style: none; margin: .3em 0 0; padding: 0; display: grid; gap: 2px; }
.zones li { display: flex; gap: .57em; align-items: center; font-variant-numeric: tabular-nums; }
.zones li span:first-child { flex: 1; color: var(--ink2); }
.zones li .d { color: var(--muted); font-size: .86em; }
/* weather */
.wx { display: flex; align-items: center; gap: 1em; }
.wx svg { width: 3.1em; height: 3.1em; color: var(--acc); flex: none; }
.temp { font: 300 2.95em/1 var(--font); font-variant-numeric: tabular-nums; }
.days { display: grid; grid-template-columns: repeat(3, 1fr); gap: .43em; margin-top: auto; }
.days div { background: var(--bg2); border-radius: .7em; padding: .43em .57em; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: .89em; font-variant-numeric: tabular-nums; }
.days svg { width: 1.6em; height: 1.6em; color: var(--ink2); }
.days b { font-weight: 600; color: var(--ink); }
.places { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.places button { all: unset; cursor: pointer; display: block; width: 100%; padding: .35em .57em; border-radius: .57em; color: var(--ink2); }
.places button:hover, .places button:focus-visible { background: var(--bg2); color: var(--ink); outline: none; }
/* shortcuts */
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(6em, 1fr)); gap: .57em; }
.tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: .43em; padding: .7em .3em .57em; border-radius: .85em; text-decoration: none; color: var(--ink2); min-width: 0; }
.tile:hover { background: var(--bg2); color: var(--ink); }
.tile .av { width: 2.85em; height: 2.85em; border-radius: .85em; display: grid; place-items: center; font: 600 1.2em var(--font); color: #fff; }
.tile .nm { font-size: .89em; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tile .x { position: absolute; top: 2px; right: 2px; width: 1.6em; height: 1.6em; border-radius: 50%; background: var(--bg2); }
.tile .x svg { width: .86em; height: .86em; }
.addform { display: grid; grid-template-columns: 1fr 1.6fr auto; gap: .43em; }
/* notes */
textarea { width: 100%; flex: 1; min-height: 7.5em; resize: vertical; line-height: 1.5; }
.card.sized textarea { min-height: 3em; resize: none; }
/* calendar */
.cal { display: grid; gap: .3em; }
.cal .mh { display: flex; align-items: center; gap: .3em; }
.cal .mh b { flex: 1; font-weight: 600; }
.cal table { width: 100%; border-collapse: collapse; text-align: center; font-variant-numeric: tabular-nums; font-size: .93em; }
.cal th { font-weight: 600; color: var(--muted); font-size: .88em; padding: 2px 0; }
.cal td { padding: 1px 0; }
.cal td span { display: inline-grid; place-items: center; width: 2.15em; height: 2em; border-radius: .6em; color: var(--ink2); }
.cal td.out span { color: var(--muted); opacity: .5; }
.cal td.today span { background: var(--acc); color: var(--onacc); font-weight: 700; }
/* currency */
.fx { display: grid; gap: .3em; font-variant-numeric: tabular-nums; }
.fx div { display: flex; justify-content: space-between; gap: .7em; padding: .3em 0; border-bottom: 1px solid var(--line); }
.fx div:last-child { border-bottom: 0; }
.fx b { font-weight: 600; }
.amount { width: 8em; }
/* timer */
.tm { font: 300 3.1em/1 var(--font); font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.tm.done { color: var(--acc); animation: blink 1s steps(2) infinite; }
@keyframes blink { 50% { opacity: .35; } }
.presets { display: flex; gap: .43em; flex-wrap: wrap; }
.presets button { all: unset; cursor: pointer; font: 600 .89em var(--font); padding: .3em .75em; border-radius: 999px; background: var(--bg2); color: var(--ink2); }
.presets button:hover { color: var(--ink); }
.err { color: var(--ink2); }
/* narrower windows: four columns, then one */
@container home (max-width: 859px) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } .card[data-w="5"], .card[data-w="6"] { grid-column: span 4; } }
@container home (max-width: 539px) {
  .grid { grid-template-columns: minmax(0, 1fr); } .card, .card[data-w] { grid-column: auto; }
  .card.sized { height: auto !important; min-height: 150px; container-type: inline-size; }
  .rs { display: none; } .addform { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .tm.done, .editing .card { animation: none; } .card.lifted, .card.pressing { transition: none; } }
`;

  // ---------------------------------------------------------------- widgets
  const timers = new Set();
  const every = (fn, ms) => { fn(); timers.add(setInterval(fn, ms)); };

  // Clock: local time and date, plus any extra cities.
  function zoneFor(city) {
    const want = city.trim().toLowerCase().replace(/\s+/g, "_");
    if (!want) return null;
    let zones = [];
    try { zones = Intl.supportedValuesOf("timeZone"); } catch (e) { /* older browser */ }
    const last = (z) => z.split("/").pop().toLowerCase();
    return zones.find((z) => last(z) === want) || zones.find((z) => z.toLowerCase() === want) || zones.find((z) => last(z).includes(want)) || null;
  }
  function renderClock(body) {
    body.innerHTML = '<div class="time"></div><div class="date"></div><ul class="zones"></ul>' +
      (editing ? '<label class="row muted"><input type="checkbox" class="h24"' + (S.clock.h24 ? " checked" : "") + '> 24-hour clock</label>' +
        '<form class="row addzone"><input type="text" placeholder="Add a city, e.g. London" aria-label="City to add"><button class="btn small" type="submit">Add</button></form><span class="muted zmsg"></span>' : "");
    const t = body.querySelector(".time"), d = body.querySelector(".date"), ul = body.querySelector(".zones");
    const opts = () => ({ hour: S.clock.h24 ? "2-digit" : "numeric", minute: "2-digit", hour12: !S.clock.h24 });
    const dayKey = (date, tz) => date.toLocaleDateString("en-CA", { timeZone: tz });
    // city rows are drawn once; only their times change each second (so their buttons stay clickable)
    const rows = () => {
      ul.innerHTML = S.clock.zones.map((z, i) => "<li><span>" + esc(z.label) + '</span><span class="d"></span><span class="zt"></span>' +
        (editing ? '<button class="ib" type="button" data-rmzone="' + i + '" aria-label="Remove ' + esc(z.label) + '">' + ICON.close + "</button>" : "") + "</li>").join("");
    };
    rows();
    every(() => {
      const now = new Date(), here = dayKey(now);
      t.innerHTML = esc(now.toLocaleTimeString(undefined, opts())) + "<small>" + pad(now.getSeconds()) + "</small>";
      d.textContent = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
      ul.querySelectorAll("li").forEach((li, i) => {
        const z = S.clock.zones[i]; if (!z) return;
        const other = dayKey(now, z.tz);
        li.querySelector(".d").textContent = other > here ? "tomorrow" : other < here ? "yesterday" : "";
        li.querySelector(".zt").textContent = now.toLocaleTimeString(undefined, Object.assign({ timeZone: z.tz }, opts()));
      });
    }, 1000);
    if (!editing) return;
    body.querySelector(".h24").addEventListener("change", (e) => { S.clock.h24 = e.target.checked; save(); });
    body.querySelector(".addzone").addEventListener("submit", (e) => {
      e.preventDefault();
      const inp = e.target.querySelector("input"), tz = zoneFor(inp.value), msg = body.querySelector(".zmsg");
      if (!tz) { msg.textContent = "No time zone found for that city. Try a bigger city nearby."; return; }
      S.clock.zones.push({ label: tz.split("/").pop().replace(/_/g, " "), tz }); save(); rows(); inp.value = ""; msg.textContent = "";
    });
    ul.addEventListener("click", (e) => { const b = e.target.closest("[data-rmzone]"); if (!b) return; S.clock.zones.splice(+b.dataset.rmzone, 1); save(); rows(); });
  }

  // Weather from Open-Meteo for the city you choose.
  function renderWeather(body) {
    const place = S.weather.place;
    if (!place || editing) return weatherSetup(body);
    body.innerHTML = '<div class="muted">Loading the forecast for ' + esc(place.name) + "…</div>";
    const unit = S.weather.unit === "fahrenheit" ? "fahrenheit" : "celsius";
    const key = "wx|" + place.lat + "|" + place.lon + "|" + unit;
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + place.lat + "&longitude=" + place.lon +
      "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&timezone=auto&forecast_days=4&wind_speed_unit=kmh&temperature_unit=" + unit;
    const cached = cacheGet(key, 20 * 60e3);
    (cached ? Promise.resolve(cached) : getJSON(url).then((j) => { cachePut(key, j); return j; })).then((j) => {
      const c = j.current, [label, icon] = wmo(c.weather_code, c.is_day), deg = "°";
      const days = j.daily.time.slice(1, 4).map((day, i) => {
        const [l, ic] = wmo(j.daily.weather_code[i + 1], 1);
        return '<div title="' + esc(l) + '"><span>' + esc(new Date(day + "T12:00").toLocaleDateString(undefined, { weekday: "short" })) + "</span>" + WX[ic] +
          "<span><b>" + Math.round(j.daily.temperature_2m_max[i + 1]) + deg + "</b> " + Math.round(j.daily.temperature_2m_min[i + 1]) + deg + "</span></div>";
      }).join("");
      const rain = j.daily.precipitation_probability_max[0];
      body.innerHTML = '<div class="wx">' + WX[icon] + '<div><div class="temp">' + Math.round(c.temperature_2m) + deg + "</div><div>" + esc(label) + "</div></div></div>" +
        '<div class="muted">' + esc(place.name) + " · feels " + Math.round(c.apparent_temperature) + deg + " · wind " + Math.round(c.wind_speed_10m) + " km/h" +
        (rain != null ? " · rain " + rain + "%" : "") + " · today " + Math.round(j.daily.temperature_2m_max[0]) + deg + "/" + Math.round(j.daily.temperature_2m_min[0]) + deg + '</div><div class="days">' + days + "</div>" +
        '<div class="muted credit">Weather data by <a href="https://open-meteo.com/" rel="noreferrer">Open-Meteo.com</a></div>';
    }).catch(() => { body.innerHTML = '<div class="err">Couldn\'t get the forecast right now.</div><div><button class="btn small" type="button">Try again</button></div>'; body.querySelector("button").onclick = () => renderWeather(body); });
  }
  function weatherSetup(body) {
    const place = S.weather.place;
    body.innerHTML = (place ? '<div class="muted">Now: ' + esc(place.name + (place.region ? ", " + place.region : "")) + "</div>" : '<div class="muted">Type your city to see its weather. Only the city name and then its coordinates go to Open-Meteo.</div>') +
      '<form class="row"><input type="text" placeholder="City" aria-label="City" value=""><button class="btn small" type="submit">Find</button></form><ul class="places"></ul>' +
      '<label class="row muted"><input type="checkbox" class="fahr"' + (S.weather.unit === "fahrenheit" ? " checked" : "") + "> Fahrenheit</label>";
    const list = body.querySelector(".places");
    body.querySelector(".fahr").addEventListener("change", (e) => { S.weather.unit = e.target.checked ? "fahrenheit" : "celsius"; save(); });
    body.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const q = e.target.querySelector("input").value.trim();
      if (!q) return;
      list.innerHTML = '<li class="muted">Searching…</li>';
      getJSON("https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&format=json&name=" + encodeURIComponent(q)).then((j) => {
        const rs = (j.results || []);
        list.innerHTML = rs.length ? rs.map((r, i) => '<li><button type="button" data-i="' + i + '">' + esc(r.name + (r.admin1 ? ", " + r.admin1 : "") + (r.country ? ", " + r.country : "")) + "</button></li>").join("") : '<li class="muted">No place found.</li>';
        list.onclick = (ev) => {
          const b = ev.target.closest("[data-i]"); if (!b) return;
          const r = rs[+b.dataset.i];
          S.weather.place = { name: r.name, region: [r.admin1, r.country].filter(Boolean).join(", "), lat: Math.round(r.latitude * 100) / 100, lon: Math.round(r.longitude * 100) / 100 };
          save(); draw();
        };
      }).catch(() => { list.innerHTML = '<li class="muted">Couldn\'t search right now.</li>'; });
    });
  }

  // Shortcuts: your sites as letter tiles (no icons are fetched).
  const hueOf = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  function renderShortcuts(body) {
    body.innerHTML = '<div class="tiles">' + S.shortcuts.map((x, i) => {
      let host = ""; try { host = new URL(x.url).hostname.replace(/^www\./, ""); } catch (e) { /* keep empty */ }
      const inner = '<span class="av" style="background:hsl(' + hueOf(host || x.name) + ' 42% 34%)">' + esc((x.name || host || "?").trim()[0].toUpperCase()) + '</span><span class="nm">' + esc(x.name || host) + "</span>";
      return editing   // while customizing, tiles aren't links, so a click can only remove
        ? '<div class="tile" title="' + esc(host) + '">' + inner + '<button class="ib x" type="button" data-rmtile="' + i + '" aria-label="Remove ' + esc(x.name) + '">' + ICON.close + "</button></div>"
        : '<a class="tile" href="' + esc(x.url) + '" title="' + esc(host) + '">' + inner + "</a>";
    }).join("") + "</div>" + (editing || !S.shortcuts.length
      ? '<form class="addform"><input type="text" placeholder="Name" aria-label="Shortcut name"><input type="text" placeholder="example.com" aria-label="Shortcut address"><button class="btn small" type="submit">Add</button></form>' : "");
    body.querySelector(".tiles").addEventListener("click", (e) => {
      const b = e.target.closest("[data-rmtile]"); if (!b) return;
      e.preventDefault(); S.shortcuts.splice(+b.dataset.rmtile, 1); save(); draw();
    });
    const form = body.querySelector(".addform");
    if (form) form.addEventListener("submit", (e) => {
      e.preventDefault();
      const [nameIn, urlIn] = form.querySelectorAll("input");
      let url = urlIn.value.trim();
      if (!url) return urlIn.focus();
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      let host;
      try { host = new URL(url).hostname; } catch (x) { urlIn.focus(); return; }
      const name = nameIn.value.trim() || host.replace(/^www\./, "").split(".")[0].replace(/^./, (c) => c.toUpperCase());
      S.shortcuts.push({ name, url }); save(); draw();
    });
  }

  // Notes: saved in this browser as you type.
  function renderNotes(body) {
    body.innerHTML = '<textarea aria-label="Notes" placeholder="Anything to remember…" spellcheck="true"></textarea><span class="muted st">Kept in this browser only.</span>';
    const ta = body.querySelector("textarea"), st = body.querySelector(".st");
    ta.value = S.notes || "";
    let t = 0;
    ta.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { S.notes = ta.value; save(); st.textContent = "Saved"; }, 400); });
  }

  // Calendar: this month, today marked.
  let calOffset = 0;
  function firstDay() {
    try { const l = new Intl.Locale(navigator.language); const w = (l.getWeekInfo && l.getWeekInfo()) || l.weekInfo; if (w && w.firstDay) return w.firstDay % 7; } catch (e) { /* older browser */ }
    return /^(en-(US|CA)|ja|ko|he|pt-BR)/.test(navigator.language) ? 0 : 1;
  }
  function renderCalendar(body) {
    const now = new Date(), view = new Date(now.getFullYear(), now.getMonth() + calOffset, 1), fd = firstDay();
    const start = new Date(view); start.setDate(1 - ((view.getDay() - fd + 7) % 7));
    const names = Array.from({ length: 7 }, (_, i) => new Date(2026, 1, 1 + ((fd + i) % 7)).toLocaleDateString(undefined, { weekday: "narrow" }));  // 1 Feb 2026 is a Sunday
    let rows = "";
    for (let w = 0; w < 6; w++) {
      rows += "<tr>";
      for (let i = 0; i < 7; i++) {
        const day = new Date(start); day.setDate(start.getDate() + w * 7 + i);
        const cls = day.toDateString() === now.toDateString() ? "today" : day.getMonth() !== view.getMonth() ? "out" : "";
        rows += '<td class="' + cls + '"><span>' + day.getDate() + "</span></td>";
      }
      rows += "</tr>";
    }
    body.innerHTML = '<div class="cal"><div class="mh"><b>' + esc(view.toLocaleDateString(undefined, { month: "long", year: "numeric" })) + "</b>" +
      '<button class="ib" type="button" data-cal="-1" aria-label="Previous month">' + ICON.left + '</button><button class="ib" type="button" data-cal="1" aria-label="Next month">' + ICON.right + "</button></div>" +
      "<table><thead><tr>" + names.map((n) => "<th>" + esc(n) + "</th>").join("") + "</tr></thead><tbody>" + rows + "</tbody></table></div>";
    body.querySelector(".mh").addEventListener("click", (e) => { const b = e.target.closest("[data-cal]"); if (!b) return; calOffset += +b.dataset.cal; renderCalendar(body); });
  }

  // Currency: today's European Central Bank rates against your currency, from Frankfurter.
  function renderCurrency(body) {
    const c = S.currency, base = c.base, list = c.list.filter((x) => x !== base);
    if (editing) {
      body.innerHTML = '<label class="row muted">Your currency <input type="text" class="base" maxlength="3" size="4" value="' + esc(base) + '" aria-label="Your currency"></label>' +
        '<label class="row muted">Compare with <input type="text" class="list" value="' + esc(c.list.join(", ")) + '" aria-label="Currencies to compare"></label><span class="muted">Three-letter codes, e.g. USD, EUR, JPY.</span>';
      const fix = (v) => v.toUpperCase().replace(/[^A-Z]/g, "");
      body.querySelector(".base").addEventListener("change", (e) => { const v = fix(e.target.value); if (v.length === 3) { c.base = v; save(); } });
      body.querySelector(".list").addEventListener("change", (e) => { c.list = e.target.value.split(/[,\s]+/).map(fix).filter((x) => x.length === 3).slice(0, 8); save(); });
      return;
    }
    body.innerHTML = '<div class="muted">Loading rates…</div>';
    const key = "fx|" + base + "|" + list.join(",");
    const cached = cacheGet(key, 6 * 3600e3);
    (cached ? Promise.resolve(cached) : getJSON("https://api.frankfurter.dev/v1/latest?base=" + base + "&symbols=" + list.join(",")).then((j) => { cachePut(key, j); return j; })).then((j) => {
      const paint = () => {
        const amt = Math.max(0, +c.amount || 1);
        body.querySelector(".fx").innerHTML = list.filter((x) => j.rates[x]).map((x) =>
          "<div><span>" + amt.toLocaleString() + " " + esc(x) + "</span><b>" + (amt / j.rates[x]).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " " + esc(base) + "</b></div>").join("");
      };
      body.innerHTML = '<label class="row muted">Amount <input type="number" class="amount" min="0" step="any" value="' + esc(c.amount) + '" aria-label="Amount"></label><div class="fx"></div>' +
        '<span class="muted">European Central Bank rates of ' + esc(new Date(j.date + "T12:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })) + ', via <a href="https://frankfurter.dev/" rel="noreferrer">Frankfurter</a></span>';
      paint();
      body.querySelector(".amount").addEventListener("input", (e) => { c.amount = e.target.value; paint(); clearTimeout(renderCurrency.t); renderCurrency.t = setTimeout(save, 500); });
    }).catch(() => { body.innerHTML = '<div class="err">Couldn\'t get today\'s rates.</div>'; });
  }

  // Timer: presets or your own minutes; keeps running if you reload the page.
  let audio = null;
  let pageTitle = "";   // read when the widgets appear (this script starts before the page has a title)
  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.35, 0.7].forEach((at) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(audio.destination); o.start(audio.currentTime + at); o.stop(audio.currentTime + at + 0.2); });
    } catch (e) { /* sound blocked */ }
  }
  function renderTimer(body) {
    const T = S.timer;
    body.innerHTML = '<div class="tm" role="timer" aria-live="off"></div><div class="presets">' + [1, 5, 10, 25].map((m) => '<button type="button" data-min="' + m + '">' + m + " min</button>").join("") + "</div>" +
      '<form class="row"><input type="number" min="1" max="600" step="1" class="mins" value="' + esc(T.minutes) + '" aria-label="Minutes" style="width:80px"><span class="muted">min</span><span class="sp"></span>' +
      '<button class="btn small primary go" type="submit"></button><button class="btn small reset" type="button">Reset</button></form>';
    const tm = body.querySelector(".tm"), go = body.querySelector(".go");
    let rang = false;
    const left = () => (T.endAt ? Math.max(0, T.endAt - Date.now()) : T.left || T.minutes * 60e3);
    const show = () => {
      const ms = left(), s = Math.ceil(ms / 1000);
      tm.textContent = (s >= 3600 ? Math.floor(s / 3600) + ":" + pad(Math.floor(s / 60) % 60) : Math.floor(s / 60)) + ":" + pad(s % 60);
      const done = T.endAt && ms === 0;
      go.textContent = done ? "Restart" : T.endAt ? "Pause" : T.left ? "Resume" : "Start";
      tm.classList.toggle("done", !!done);
      if (done && !rang) { rang = true; beep(); document.title = "Time's up · " + pageTitle; }
    };
    every(show, 250);
    const start = (ms) => { T.endAt = Date.now() + ms; T.left = 0; rang = false; save(); show(); };
    body.querySelector(".presets").addEventListener("click", (e) => { const b = e.target.closest("[data-min]"); if (!b) return; T.minutes = +b.dataset.min; body.querySelector(".mins").value = T.minutes; start(T.minutes * 60e3); });
    body.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (T.endAt && left() > 0) { T.left = left(); T.endAt = 0; save(); return show(); }           // pause
      if (T.left) return start(T.left);                                                          // resume
      T.minutes = Math.max(1, Math.min(600, +body.querySelector(".mins").value || 5)); start(T.minutes * 60e3);
    });
    body.querySelector(".reset").addEventListener("click", () => { T.endAt = 0; T.left = 0; save(); document.title = pageTitle; show(); });
  }

  const W = {
    clock: { title: "Clock", render: renderClock },
    weather: { title: "Weather", render: renderWeather },
    shortcuts: { title: "Shortcuts", wide: true, render: renderShortcuts },
    notes: { title: "Notes", render: renderNotes },
    calendar: { title: "Calendar", render: renderCalendar },
    currency: { title: "Currency", render: renderCurrency },
    timer: { title: "Timer", render: renderTimer },
  };
  // Widgets added by other scripts: they send "sp-home:register" and put their content in a slot="ext-<id>" child.
  const EXT = {};
  const known = (id) => !!(W[id] || EXT[id]);
  const titleOf = (id) => (W[id] || EXT[id] || {}).title || id;
  window.addEventListener("sp-home:register", (e) => {
    let d; try { d = JSON.parse(e.detail); } catch (x) { return; }
    if (!d || !/^[a-z0-9-]{1,20}$/.test(d.id) || W[d.id] || EXT[d.id]) return;
    EXT[d.id] = { title: String(d.title || d.id).slice(0, 30), wide: !!d.wide, ext: true };
    if (!S.order.includes(d.id)) S.order.push(d.id);
    if (S.on[d.id] === undefined) S.on[d.id] = true;
    if (root) draw();
  });

  // ---------------------------------------------------------------- layout, customize, drag, resize
  let host = null, root = null, editing = false, lookOpen = false;
  function draw() {
    for (const t of timers) clearInterval(t);
    timers.clear();
    const wrap = root.querySelector(".wrap"), grid = root.querySelector(".grid");
    wrap.classList.toggle("editing", editing);
    grid.textContent = "";
    for (const id of S.order) if (known(id) && S.on[id]) grid.append(card(id));
    fitAll();
    if (!editing) lookOpen = false;
    renderLook();
    drawBar();
  }
  // Widths are columns out of 6 (2 = a third, 3 = half, 6 = the full row); a height of 0 means "fit the content".
  function sizeOf(id) {
    const def = W[id] || EXT[id] || {}, z = S.size[id] || {};
    return { w: Math.min(6, Math.max(2, z.w || (def.wide ? 4 : 2))), h: z.h > 0 ? z.h : 0 };
  }
  function applySize(c, z) {
    c.dataset.w = z.w;
    c.classList.toggle("sized", z.h > 0);
    c.style.height = z.h > 0 ? z.h + "px" : "";
    fit(c);
  }
  // One font size per widget scales everything in it. A widget without a height scales with its width (and grows
  // taller with it). A widget with a height gets the largest size whose content still fits the box both ways, as the
  // widget looks normally: while editing, its settings don't count (they scroll), so it is measured on a hidden copy.
  const FIT = { min: 8, autoMax: 22, max: 72 };
  const sizeVar = (el, v) => el.style.setProperty("--fs", v.toFixed(2) + "px");
  function largestFit(el, w, h) {
    const body = el.querySelector(".cb");
    const fits = () => body.scrollHeight <= body.clientHeight + 1 && body.scrollWidth <= body.clientWidth + 1;
    let lo = FIT.min, hi = Math.min(FIT.max, Math.max(FIT.min, w * 0.12, h * 0.12));
    sizeVar(el, hi);
    if (fits()) return hi;
    for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; sizeVar(el, mid); if (fits()) lo = mid; else hi = mid; }
    return lo;
  }
  function measureAsShown(c, w, h, compact) {
    const id = c.dataset.id, def = W[id];
    if (!editing || !def) { c.classList.toggle("compact", compact); return largestFit(c, w, h); }   // other scripts' widgets look the same while editing
    const m = document.createElement("section");
    m.className = "card sized measure" + (compact ? " compact" : ""); m.dataset.w = c.dataset.w;
    m.style.width = c.offsetWidth + "px"; m.style.height = c.offsetHeight + "px";
    m.innerHTML = '<div class="ch"><h2>' + esc(def.title) + '</h2><div class="tools"></div></div><div class="cb"></div>';
    const had = new Set(timers);
    editing = false;
    try { def.render(m.querySelector(".cb")); } finally { editing = true; }
    for (const t of timers) if (!had.has(t)) { clearInterval(t); timers.delete(t); }   // the copy's clock doesn't tick
    root.querySelector(".wrap").append(m);
    try { return largestFit(m, w, h); } finally { m.remove(); }
  }
  const fitted = new WeakMap();   // card -> what it was fitted for, so unchanged widgets are skipped
  function fit(c, force) {
    const body = c.querySelector(".cb"), w = c.clientWidth;
    if (!body || !w) return;
    const fixed = c.classList.contains("sized") && getComputedStyle(c).containerType === "size";   // a height that applies
    const size = (v) => sizeVar(c, v);
    if (!fixed) {
      c.classList.remove("compact");
      const fs = Math.max(12, Math.min(FIT.autoMax, w * 0.046)), was = fitted.get(c);
      if (force || !was || was.fs !== fs) size(fs);
      fitted.set(c, { fs });
      return;
    }
    const h = c.clientHeight, sig = w + "x" + h + ":" + editing + ":" + body.getElementsByTagName("*").length + ":" + (host ? host.childElementCount : 0);
    const was = fitted.get(c);
    if (!force && was && was.sig === sig) return;
    // a small widget without its title often fits much bigger text: use that when it does
    let v = measureAsShown(c, w, h, false), compact = false;
    if (v < 14) { const v2 = measureAsShown(c, w, h, true); if (v2 > v * 1.12) { v = v2; compact = true; } }
    c.classList.toggle("compact", compact);
    size(v);
    fitted.set(c, { sig });
  }
  function fitAll(force) { if (root) for (const c of root.querySelectorAll(".grid > .card")) fit(c, force); }
  // widgets fill in later (weather, rates, the F1 card) and windows change size: fit again, at most once a frame
  let fitQueued = false;
  const fitSoon = () => { if (fitQueued) return; fitQueued = true; requestAnimationFrame(() => { fitQueued = false; fitAll(); }); };
  function card(id) {
    const def = W[id] || EXT[id];
    const c = document.createElement("section");
    c.className = "card";
    c.dataset.id = id;
    c.setAttribute("aria-label", def.title);
    c.innerHTML = '<div class="ch"><h2>' + esc(def.title) + '</h2><div class="tools">' + (editing
      ? '<button class="ib" type="button" data-move="-1" aria-label="Move ' + esc(def.title) + ' earlier" title="Move earlier">' + ICON.left + "</button>" +
        '<button class="ib" type="button" data-move="1" aria-label="Move ' + esc(def.title) + ' later" title="Move later">' + ICON.right + "</button>" +
        '<button class="ib" type="button" data-hide aria-label="Hide ' + esc(def.title) + '" title="Hide">' + ICON.close + "</button>" : "") + '</div></div><div class="cb"></div>';
    const body = c.querySelector(".cb");
    if (def.ext) body.innerHTML = '<slot name="ext-' + id + '"><span class="muted">Loading…</span></slot>';
    else def.render(body);
    applySize(c, sizeOf(id));
    if (editing) c.insertAdjacentHTML("beforeend", '<button class="rs" type="button" aria-label="Resize ' + esc(def.title) + '" title="Drag to resize. Arrow keys work too. Double-click to reset.">' + ICON.resize + "</button>");
    return c;
  }
  function drawBar() {
    const bar = root.querySelector(".bar");
    if (!editing) { bar.innerHTML = '<button class="link" type="button" data-a="edit">' + ICON.edit + "Customize</button>"; return; }
    const hidden = S.order.filter((id) => known(id) && !S.on[id]);
    bar.innerHTML = (hidden.length ? '<span class="lbl">Add:</span>' + hidden.map((id) => '<button class="chip" type="button" data-add="' + esc(id) + '">+ ' + esc(titleOf(id)) + "</button>").join("")
      : '<span class="lbl">Every widget is showing.</span>') +
      '<span class="sp"></span><button class="link" type="button" data-a="look" aria-expanded="' + lookOpen + '">' + ICON.look + "Look</button>" +
      '<button class="link" type="button" data-a="off">Turn widgets off</button><button class="btn primary" type="button" data-a="done">Done</button>';
  }

  // The Look panel: your accent, background (colour or picture), search bar and widget colours, and glass.
  const LOOK_ROWS = [
    ["accent", "Accent", "--sp-accent", "#a3c4ff"],
    ["page", "Background", "--sp-bg", "#000000"],
    ["search", "Search bar", "--sp-field", "#0b0b0d"],
    ["widget", "Widgets", "--sp-surface", "#0b0b0d"],
  ];
  function toHex(c) {
    const cx = toHex.cx || (toHex.cx = document.createElement("canvas").getContext("2d"));
    cx.fillStyle = "#010203"; cx.fillStyle = (c || "").trim();
    const v = String(cx.fillStyle);
    return /^#[0-9a-f]{6}$/i.test(v) && (v !== "#010203" || /^#010203$/i.test(c)) ? v : "";
  }
  function renderLook() {
    const panel = root.querySelector(".look");
    panel.hidden = !lookOpen;
    if (!lookOpen) return;
    const L = S.look, cs = getComputedStyle(document.documentElement);
    const status = (k) => (hex(L[k]) ? 'Your colour <button class="link" type="button" data-theme-k="' + k + '">Use the theme\'s</button>'
      : (k === "search" || k === "widget") && (hex(L.page) || lookImage) ? "Follows the background" : "The theme's colour");
    panel.innerHTML = '<div class="lh"><b>Look</b><button class="link" type="button" data-a="look-reset">Reset all</button></div>' +
      LOOK_ROWS.map(([k, label, cssVar, fallback]) => '<div class="lr"><span>' + label + '</span><input type="color" data-k="' + k + '" aria-label="' + label + ' colour" value="' +
        (hex(L[k]) || toHex(cs.getPropertyValue(cssVar)) || fallback) + '"><span class="st" data-st="' + k + '">' + status(k) + "</span>" +
        (k === "page" ? '<span class="sp"></span><button class="btn small" type="button" data-a="pic">' + (lookImage ? "Change picture" : "Picture…") + "</button>" +
          (lookImage ? '<button class="link" type="button" data-a="nopic">Remove picture</button>' : "") : "") + "</div>").join("") +
      '<label class="row"><input type="checkbox" class="glass"' + (L.glass ? " checked" : "") + "> Glass: see-through widgets and search bar</label>" +
      '<span class="st">The accent shows on every ' + SITE + ' page, the rest on this home page. A picture stays in this browser. Text turns dark or light by itself to stay readable.</span>' +
      '<input type="file" accept="image/*" hidden class="file">';
  }
  let lookSaveT = 0;
  function lookChanged(rerender) {
    pageLook(); hostLook();
    clearTimeout(lookSaveT); lookSaveT = setTimeout(save, 300);
    if (rerender) renderLook();
  }
  // a picture is made at most 1920×1200 and saved as a JPEG; its brightness picks dark or light text
  function readPicture(file) {
    return new Promise((ok, bad) => {
      if (!file || !/^image\//.test(file.type) || file.size > 30e6) return bad(new Error("Pick a picture file (up to 30 MB)."));
      const fr = new FileReader();
      fr.onerror = () => bad(new Error("Couldn't read that file."));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => bad(new Error("That file isn't a picture this browser can show."));
        img.onload = () => {
          const k = Math.min(1, 1920 / img.naturalWidth, 1200 / img.naturalHeight), c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          const t = document.createElement("canvas"); t.width = t.height = 16;
          const tg = t.getContext("2d"); tg.drawImage(c, 0, 0, 16, 16);
          const d = tg.getImageData(0, 0, 16, 16).data; let sum = 0;
          for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          ok({ data: c.toDataURL("image/jpeg", 0.82), light: sum / 256 / 255 > 0.55 });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function onLookInput(e) {
    const t = e.target;
    if (t.matches && t.matches("input[type=color][data-k]")) {
      S.look[t.dataset.k] = t.value; lookChanged(false);
      const st = root.querySelector('[data-st="' + t.dataset.k + '"]');
      if (st && !st.querySelector("button")) st.innerHTML = 'Your colour <button class="link" type="button" data-theme-k="' + t.dataset.k + '">Use the theme\'s</button>';
    } else if (t.matches && t.matches(".glass")) { S.look.glass = t.checked; lookChanged(false); }
    else if (t.matches && t.matches(".file") && t.files && t.files[0]) {
      readPicture(t.files[0]).then((p) => { lookImage = p.data; GM_setValue("lookImage", p.data); S.look.imgLight = p.light; lookChanged(true); })
        .catch((err) => { const st = root.querySelector('[data-st="page"]'); if (st) st.textContent = err.message; });
    }
  }
  // Resize a card by its corner: across in whole columns, down in 10 px steps.
  function startResize(e, c) {
    const grid = c.parentElement, gs = getComputedStyle(grid), cols = gs.gridTemplateColumns.split(" ").filter(Boolean).length;
    if (cols < 2) return;
    e.preventDefault();
    const gap = parseFloat(gs.columnGap) || 14, colW = (grid.clientWidth - gap * (cols - 1)) / cols, r = c.getBoundingClientRect();
    const id = c.dataset.id, z = sizeOf(id), x0 = e.clientX, y0 = e.clientY, wrap = root.querySelector(".wrap");
    let tall = z.h > 0;
    c.classList.add("resizing"); wrap.classList.add("sizing");
    const move = (ev) => {
      z.w = Math.max(2, Math.min(cols, Math.round((r.width + ev.clientX - x0 + gap) / (colW + gap))));
      if (Math.abs(ev.clientY - y0) > 6) tall = true;
      if (tall) z.h = Math.max(100, Math.round((r.height + ev.clientY - y0) / 10) * 10);
      if (z.w !== c._w || z.h !== c._h) { c._w = z.w; c._h = z.h; applySize(c, z); }
    };
    const up = () => {
      window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true);
      c.classList.remove("resizing"); wrap.classList.remove("sizing");
      S.size[id] = { w: z.w, h: z.h }; save();
    };
    window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", up, true); window.addEventListener("pointercancel", up, true);
  }
  // On the corner button: arrow keys resize (left and right by a column, up and down by 20 px), Home resets.
  function onKeyDown(e) {
    const rs = e.target.closest && e.target.closest(".rs");
    if (!rs || !editing) return;
    const c = rs.closest(".card"), id = c.dataset.id, z = sizeOf(id);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") z.w = Math.max(2, Math.min(6, z.w + (e.key === "ArrowRight" ? 1 : -1)));
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") z.h = Math.max(120, (z.h || Math.round(c.getBoundingClientRect().height)) + (e.key === "ArrowDown" ? 20 : -20));
    else if (e.key === "Home") { delete S.size[id]; save(); applySize(c, sizeOf(id)); e.preventDefault(); return; }
    else return;
    e.preventDefault();
    S.size[id] = { w: z.w, h: z.h }; save(); applySize(c, z);
  }
  function onDblClick(e) {
    const rs = e.target.closest && e.target.closest(".rs");
    if (!rs) return;
    const c = rs.closest(".card");
    delete S.size[c.dataset.id]; save(); applySize(c, sizeOf(c.dataset.id));
  }
  function orderFromGrid() {
    const shown = Array.from(root.querySelectorAll(".grid > .card")).map((c) => c.dataset.id);
    S.order = shown.concat(S.order.filter((id) => !shown.includes(id)));
    save();
  }
  function onClick(e) {
    const t = e.target;
    const a = t.closest("[data-a]");
    if (a) {
      if (a.dataset.a === "edit") { editing = true; draw(); root.querySelector("[data-a=done]").focus(); }
      else if (a.dataset.a === "done") { editing = false; draw(); root.querySelector("[data-a=edit]").focus(); }
      else if (a.dataset.a === "off") { S.enabled = false; save(); host.remove(); host = null; }
      else if (a.dataset.a === "look") { lookOpen = !lookOpen; renderLook(); drawBar(); }
      else if (a.dataset.a === "look-reset") { S.look = Object.assign({}, DEFAULTS.look); lookImage = ""; GM_setValue("lookImage", ""); lookChanged(true); }
      else if (a.dataset.a === "pic") root.querySelector(".look .file").click();
      else if (a.dataset.a === "nopic") { lookImage = ""; GM_setValue("lookImage", ""); S.look.imgLight = false; lookChanged(true); }
      return;
    }
    const th = t.closest("[data-theme-k]");
    if (th) { S.look[th.dataset.themeK] = ""; lookChanged(true); return; }
    const add = t.closest("[data-add]");
    if (add) { const id = add.dataset.add; S.on[id] = true; S.order = S.order.filter((x) => x !== id).concat(id); save(); draw(); return; }
    const c = t.closest(".card");
    if (!c) return;
    if (t.closest("[data-hide]")) { S.on[c.dataset.id] = false; save(); draw(); return; }
    const mv = t.closest("[data-move]");
    if (mv) {
      const sib = +mv.dataset.move < 0 ? c.previousElementSibling : c.nextElementSibling;
      if (!sib) return;
      if (+mv.dataset.move < 0) sib.before(c); else sib.after(c);
      orderFromGrid();
      mv.focus();
    }
  }
  // Moving widgets, like editing an iOS home screen. Hold a widget for half a second to start editing (and keep
  // holding to carry it), or open Customize. While editing, press anywhere on a widget and move: it lifts and follows
  // the pointer, and the others glide out of the way. Only transforms move during the drag, so it stays smooth.
  const NO_DRAG = "input, textarea, select, button, label, [contenteditable], .rs, .look";
  let press = null;
  function onPointerDown(e) {
    const rs = e.target.closest(".rs");
    if (rs && editing && e.button === 0) return startResize(e, rs.closest(".card"));
    const c = e.target.closest(".grid > .card");
    if (!c || e.button !== 0 || press) return;
    if (editing ? e.target.closest(NO_DRAG) : e.target.closest("input, textarea, select, [contenteditable]")) return;
    press = { id: c.dataset.id, x: e.clientX, y: e.clientY, last: e, card: c, timer: 0, drag: null, held: false, raf: 0 };
    if (editing) e.preventDefault();   // no text selection while carrying a widget
    else {
      c.classList.add("pressing");
      press.timer = setTimeout(() => {   // held long enough: edit mode, and carry this widget on
        if (!press) return;
        c.classList.remove("pressing");
        if (navigator.vibrate) try { navigator.vibrate(12); } catch (x) { /* not on this device */ }
        editing = true; draw();
        press.card = root.querySelector('.grid > .card[data-id="' + press.id + '"]');
        press.held = true;
        if (press.card) beginDrag(press.last);
      }, 480);
    }
    window.addEventListener("pointermove", onPressMove, true);
    window.addEventListener("pointerup", onPressEnd, true);
    window.addEventListener("pointercancel", onPressEnd, true);
  }
  function onPressMove(ev) {
    if (!press) return;
    press.last = ev;
    const far = Math.hypot(ev.clientX - press.x, ev.clientY - press.y);
    if (!editing) { if (far > 8) cancelPress(); return; }   // moved before the hold finished: an ordinary drag or scroll
    if (!press.drag) { if (far > 4) beginDrag(ev); else return; }
    ev.preventDefault();
    if (!press.raf) press.raf = requestAnimationFrame(() => { if (press) { press.raf = 0; dragTo(press.last); } });
  }
  function cancelPress() {
    if (!press) return;
    clearTimeout(press.timer);
    if (press.card) press.card.classList.remove("pressing");
    window.removeEventListener("pointermove", onPressMove, true);
    window.removeEventListener("pointerup", onPressEnd, true);
    window.removeEventListener("pointercancel", onPressEnd, true);
    press = null;
  }
  const gridPos = (el, grid) => ({ x: el.offsetLeft - grid.offsetLeft, y: el.offsetTop - grid.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
  function beginDrag(ev) {
    const c = press.card, grid = c.parentElement, g = grid.getBoundingClientRect(), p = gridPos(c, grid);
    press.drag = { grid, grabX: ev.clientX - g.left - p.x, grabY: ev.clientY - g.top - p.y, last: null };
    c.classList.remove("pressing"); c.classList.add("lifted");
    root.querySelector(".wrap").classList.add("moving");
    dragTo(ev);
  }
  // follow the pointer; when it is over another widget, move into that widget's place and let the others glide
  function dragTo(ev) {
    const d = press.drag, c = press.card, grid = d.grid, g = grid.getBoundingClientRect();
    const px = ev.clientX - g.left, py = ev.clientY - g.top;
    let over = null;
    for (const o of grid.children) {
      if (o === c) continue;
      const r = gridPos(o, grid);
      if (px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h) { over = o; break; }
    }
    if (over !== d.last) d.last = null;
    if (over && over !== d.last) {
      d.last = over;
      const cards = Array.from(grid.children), before = new Map(cards.map((o) => [o, gridPos(o, grid)]));
      if (cards.indexOf(over) < cards.indexOf(c)) over.before(c); else over.after(c);
      for (const o of cards) {
        if (o === c) continue;
        const p0 = before.get(o), p1 = gridPos(o, grid);
        if (p0.x === p1.x && p0.y === p1.y) continue;
        o.style.transition = "none";
        o.style.transform = "translate(" + (p0.x - p1.x) + "px," + (p0.y - p1.y) + "px)";
        o.getBoundingClientRect();
        o.style.transition = "transform .26s cubic-bezier(.2,.8,.2,1)";
        o.style.transform = "";
      }
    }
    const p = gridPos(c, grid);
    c.style.transition = "none";
    c.style.transform = "translate(" + (px - d.grabX - p.x) + "px," + (py - d.grabY - p.y) + "px)";
  }
  function onPressEnd() {
    if (!press) return;
    const c = press.card, dragged = !!press.drag, held = press.held;
    if (press.raf) cancelAnimationFrame(press.raf);
    cancelPress();
    if (dragged && c) {
      c.style.transition = "transform .24s cubic-bezier(.2,.8,.2,1)";
      c.style.transform = "";
      c.classList.remove("lifted");
      root.querySelector(".wrap").classList.remove("moving");
      setTimeout(() => { c.style.transition = ""; for (const o of c.parentElement ? c.parentElement.children : []) o.style.transition = ""; }, 300);
      orderFromGrid();
    }
    // the click that ends a drag or a long press doesn't open or press anything
    if (dragged || held) window.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); }, { capture: true, once: true });
  }
  function onContextMenu(e) { if (press && (press.held || press.drag)) e.preventDefault(); }

  function isDark() {
    const c = (getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    return c.length < 3 || c[3] === 0 ? matchMedia("(prefers-color-scheme: dark)").matches : 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] < 128;
  }
  function place() {
    if (!host) return false;
    if (host.isConnected) return true;
    // under the logo + search box block; it grows the page, so "Learn more" moves down below the widgets
    // (SearXNG: right after its search form, inside the home page's centred block)
    const inner = SP ? document.querySelector(".search-home-inner") : null;
    const f = document.querySelector("#search");
    const anchor = inner || (f && (SP ? f.closest(".search-form-relative-container") || f.parentElement : f));
    if (!anchor) return false;
    anchor.after(host);
    return true;
  }
  function mount() {
    if (!S.enabled || host) return;
    host = document.createElement("div");
    host.id = "sp-home";
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML = "<style>" + CSS + '</style><div class="wrap"><div class="grid"></div><div class="look" hidden></div><div class="bar"></div></div>';
    if (isDark()) host.setAttribute("data-dark", "");
    hostLook();
    pageTitle = document.title;
    root.addEventListener("click", onClick);
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("contextmenu", onContextMenu);
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("dblclick", onDblClick);
    root.addEventListener("input", onLookInput);
    root.addEventListener("change", (e) => { if (e.target.matches && e.target.matches("input[type=color][data-k]")) { clearTimeout(lookSaveT); save(); } });
    // typing in a widget stays in the widget (Startpage's page, or SearXNG's hotkeys, would otherwise react to the keys)
    for (const type of ["keydown", "keyup", "keypress", "input"]) host.addEventListener(type, (e) => e.stopPropagation());
    if (!place()) { host = null; return; }
    draw();
    new ResizeObserver(fitSoon).observe(root.querySelector(".grid"));
    new MutationObserver(fitSoon).observe(root.querySelector(".grid"), { childList: true, subtree: true });
    new MutationObserver(fitSoon).observe(host, { childList: true, subtree: true });   // widgets from other scripts
    window.dispatchEvent(new CustomEvent("sp-home:ready"));
    let queued = false;
    new MutationObserver(() => {
      if (queued || !host || host.isConnected) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; place(); });
    }).observe(document.body, { childList: true, subtree: true });
  }

  GM_registerMenuCommand("Home widgets on/off", () => {
    S = load(); S.enabled = !S.enabled; save();
    if (S.enabled) mount(); else if (host) { host.remove(); host = null; }
  });
  // Startpage builds its home page while loading; add the widgets once it has finished (earlier makes it rebuild).
  const start = () => setTimeout(() => { let n = 0; const tryMount = () => { mount(); if (!host && S.enabled && n++ < 40) setTimeout(tryMount, 150); }; tryMount(); }, 250);
  if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
})();
