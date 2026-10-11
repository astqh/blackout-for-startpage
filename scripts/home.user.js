// ==UserScript==
// @name         Home widgets for Startpage
// @namespace    blackout-for-startpage/home
// @version      1.0.0
// @license      MIT
// @description  Widgets under the search box on the Startpage home page: clock, weather, shortcuts, notes, calendar, currency, timer, and the F1 script's next race. Turn each one on or off and drag them into any order.
// @match        https://*.startpage.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      api.open-meteo.com
// @connect      geocoding-api.open-meteo.com
// @connect      api.frankfurter.dev
// @run-at       document-end
// @noframes
// ==/UserScript==

/*
 * What leaves your PC:
 *   - Weather: the city name you type goes once to Open-Meteo's place search; after that only the city's coordinates
 *     go to Open-Meteo for the forecast (at most every 20 minutes). Nothing until you set a city.
 *   - Currency: the currency codes go to Frankfurter (European Central Bank rates), at most every 6 hours.
 *   - Everything else (clock, shortcuts, notes, calendar, timer) stays in this browser.
 * Shortcuts show a coloured letter instead of the site's icon, so no site is contacted until you click it.
 * Customize (under the widgets) turns widgets on and off and lets you drag them into any order.
 * Other scripts can add a widget: the F1 script adds "Formula 1" (its next race and weekend times).
 */

(function () {
  "use strict";
  if (window.top !== window.self) return;
  if (!/^\/([a-z]{2}\/?)?$/i.test(location.pathname)) return;       // the home page only

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
  };
  function load() {
    const s = Object.assign({}, DEFAULTS, GM_getValue("settings", {}));
    for (const k of ["on", "clock", "weather", "currency", "timer"]) s[k] = Object.assign({}, DEFAULTS[k], s[k]);
    s.order = s.order.filter((id, i) => s.order.indexOf(id) === i).concat(DEFAULTS.order.filter((id) => !s.order.includes(id)));
    if (!Array.isArray(s.shortcuts)) s.shortcuts = DEFAULTS.shortcuts.slice();
    return s;
  }
  let S = load();
  const save = () => GM_setValue("settings", S);

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
    grip: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
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
  const CSS = `
:host { all: initial; display: block; width: min(980px, calc(100% - 32px)); margin: 30px auto 24px; position: relative; z-index: 1;
  --bg: var(--sp-surface, #ffffff); --bg2: var(--sp-surface-2, #f1f3f4); --ink: var(--sp-ink, #1f1f1f); --ink2: var(--sp-ink-2, #474747);
  --muted: var(--sp-muted, #70757a); --line: var(--sp-line, #e3e3e8); --line2: var(--sp-line-strong, #dadce0); --acc: var(--sp-accent, #1a0dab); --onacc: var(--sp-bg, #ffffff);
  --font: var(--sp-font, "Segoe UI", system-ui, sans-serif); --mono: var(--sp-mono, Consolas, ui-monospace, monospace); }
:host([data-dark]) { --bg: var(--sp-surface, #1f2025); --bg2: var(--sp-surface-2, #2a2b31); --ink: var(--sp-ink, #e8eaed); --ink2: var(--sp-ink-2, #bdc1c6);
  --muted: var(--sp-muted, #9aa0a6); --line: var(--sp-line, #2c2d33); --line2: var(--sp-line-strong, #3c4043); --acc: var(--sp-accent, #8ab4f8); --onacc: var(--sp-bg, #202124); }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.wrap { font: 14px/1.45 var(--font); color: var(--ink); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(290px, 100%), 1fr)); gap: 14px; }
.card { background: var(--bg); border: 1px solid var(--line); border-radius: 16px; padding: 12px 16px 16px; min-height: 150px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.card.wide { grid-column: span 2; }
.card.dragging { opacity: .55; outline: 2px dashed var(--acc); outline-offset: 2px; }
.moving, .moving * { user-select: none; cursor: grabbing !important; }
.editing .card { border-style: dashed; border-color: var(--line2); }
.ch { display: flex; align-items: center; gap: 4px; min-height: 28px; }
.ch h2 { margin: 0; flex: 1; min-width: 0; font: 600 11.5px var(--font); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.tools { display: flex; gap: 2px; }
.ib { all: unset; cursor: pointer; width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; color: var(--muted); }
.ib:hover { background: var(--bg2); color: var(--ink); }
.ib svg { width: 16px; height: 16px; }
.ib.drag { cursor: grab; touch-action: none; }
.ib.drag:active { cursor: grabbing; }
.cb { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
button.link { all: unset; cursor: pointer; color: var(--ink2); font-size: 13px; display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 8px; }
button.link:hover { color: var(--ink); background: var(--bg2); }
button.link svg { width: 15px; height: 15px; }
.btn { all: unset; cursor: pointer; font: 600 13px var(--font); padding: 6px 14px; border-radius: 999px; border: 1px solid var(--line2); color: var(--ink); text-align: center; }
.btn:hover { border-color: var(--acc); }
.btn.primary { background: var(--acc); border-color: var(--acc); color: var(--onacc); }
.btn.small { padding: 4px 10px; font-size: 12.5px; }
.chip { all: unset; cursor: pointer; font: 600 12.5px var(--font); padding: 5px 12px; border-radius: 999px; background: var(--bg2); color: var(--ink2); }
.chip:hover { color: var(--ink); box-shadow: inset 0 0 0 1px var(--acc); }
input[type=text], input[type=number], select, textarea { font: 14px var(--font); color: var(--ink); background: transparent; border: 1px solid var(--line2); border-radius: 10px; padding: 6px 10px; outline: none; min-width: 0; }
input:focus, select:focus, textarea:focus { border-color: var(--acc); }
select option { background: var(--bg); color: var(--ink); }
.row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.row input[type=text] { flex: 1; }
.row .sp { flex: 1; }
.muted { color: var(--muted); font-size: 12.5px; }
.muted a { color: inherit; }
.credit { font-size: 11.5px; }
.bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; min-height: 32px; justify-content: flex-end; }
.editing .bar { justify-content: flex-start; padding: 10px 12px; border-radius: 14px; background: var(--bg); border: 1px solid var(--line); }
.bar .lbl { color: var(--muted); font-size: 13px; margin-right: 2px; }
.bar .sp { flex: 1; }
.ib:focus-visible, button.link:focus-visible, .btn:focus-visible, .chip:focus-visible, .tile:focus-visible, .cal button:focus-visible, .presets button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
/* clock */
.time { font: 300 46px/1.05 var(--font); letter-spacing: -.02em; font-variant-numeric: tabular-nums; color: var(--ink); }
.time small { font-size: 18px; color: var(--muted); margin-left: 4px; letter-spacing: 0; }
.date { color: var(--ink2); }
.zones { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 2px; }
.zones li { display: flex; gap: 8px; align-items: center; font-variant-numeric: tabular-nums; }
.zones li span:first-child { flex: 1; color: var(--ink2); }
.zones li .d { color: var(--muted); font-size: 12px; }
/* weather */
.wx { display: flex; align-items: center; gap: 14px; }
.wx svg { width: 44px; height: 44px; color: var(--acc); flex: none; }
.temp { font: 300 42px/1 var(--font); font-variant-numeric: tabular-nums; }
.days { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: auto; }
.days div { background: var(--bg2); border-radius: 10px; padding: 6px 8px; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 12.5px; font-variant-numeric: tabular-nums; }
.days svg { width: 20px; height: 20px; color: var(--ink2); }
.days b { font-weight: 600; color: var(--ink); }
.places { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.places button { all: unset; cursor: pointer; display: block; width: 100%; padding: 5px 8px; border-radius: 8px; color: var(--ink2); }
.places button:hover, .places button:focus-visible { background: var(--bg2); color: var(--ink); outline: none; }
/* shortcuts */
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }
.tile { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px 8px; border-radius: 12px; text-decoration: none; color: var(--ink2); min-width: 0; }
.tile:hover { background: var(--bg2); color: var(--ink); }
.tile .av { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font: 600 17px var(--font); color: #fff; }
.tile .nm { font-size: 12.5px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tile .x { position: absolute; top: 2px; right: 2px; width: 22px; height: 22px; border-radius: 50%; background: var(--bg2); }
.tile .x svg { width: 12px; height: 12px; }
.addform { display: grid; grid-template-columns: 1fr 1.6fr auto; gap: 6px; }
/* notes */
textarea { width: 100%; flex: 1; min-height: 110px; resize: vertical; line-height: 1.5; }
/* calendar */
.cal { display: grid; gap: 4px; }
.cal .mh { display: flex; align-items: center; gap: 4px; }
.cal .mh b { flex: 1; font-weight: 600; }
.cal table { width: 100%; border-collapse: collapse; text-align: center; font-variant-numeric: tabular-nums; font-size: 13px; }
.cal th { font-weight: 600; color: var(--muted); font-size: 11.5px; padding: 2px 0; }
.cal td { padding: 1px 0; }
.cal td span { display: inline-grid; place-items: center; width: 28px; height: 26px; border-radius: 8px; color: var(--ink2); }
.cal td.out span { color: var(--muted); opacity: .5; }
.cal td.today span { background: var(--acc); color: var(--onacc); font-weight: 700; }
/* currency */
.fx { display: grid; gap: 4px; font-variant-numeric: tabular-nums; }
.fx div { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; border-bottom: 1px solid var(--line); }
.fx div:last-child { border-bottom: 0; }
.fx b { font-weight: 600; }
.amount { width: 110px; }
/* timer */
.tm { font: 300 44px/1 var(--font); font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.tm.done { color: var(--acc); animation: blink 1s steps(2) infinite; }
@keyframes blink { 50% { opacity: .35; } }
.presets { display: flex; gap: 6px; flex-wrap: wrap; }
.presets button { all: unset; cursor: pointer; font: 600 12.5px var(--font); padding: 4px 10px; border-radius: 999px; background: var(--bg2); color: var(--ink2); }
.presets button:hover { color: var(--ink); }
.err { color: var(--ink2); }
@media (max-width: 640px) { .card.wide { grid-column: auto; } .addform { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .tm.done { animation: none; } }
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
  const pageTitle = document.title;
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

  // ---------------------------------------------------------------- layout, customize, drag
  let host = null, root = null, editing = false;
  function draw() {
    for (const t of timers) clearInterval(t);
    timers.clear();
    const wrap = root.querySelector(".wrap"), grid = root.querySelector(".grid");
    wrap.classList.toggle("editing", editing);
    grid.textContent = "";
    for (const id of S.order) if (known(id) && S.on[id]) grid.append(card(id));
    drawBar();
  }
  function card(id) {
    const def = W[id] || EXT[id];
    const c = document.createElement("section");
    c.className = "card" + (def.wide ? " wide" : "");
    c.dataset.id = id;
    c.setAttribute("aria-label", def.title);
    c.innerHTML = '<div class="ch"><h2>' + esc(def.title) + '</h2><div class="tools">' + (editing
      ? '<button class="ib drag" type="button" aria-label="Drag to move ' + esc(def.title) + '" title="Drag to move">' + ICON.grip + "</button>" +
        '<button class="ib" type="button" data-move="-1" aria-label="Move ' + esc(def.title) + ' earlier" title="Move earlier">' + ICON.left + "</button>" +
        '<button class="ib" type="button" data-move="1" aria-label="Move ' + esc(def.title) + ' later" title="Move later">' + ICON.right + "</button>" +
        '<button class="ib" type="button" data-hide aria-label="Hide ' + esc(def.title) + '" title="Hide">' + ICON.close + "</button>" : "") + '</div></div><div class="cb"></div>';
    const body = c.querySelector(".cb");
    if (def.ext) body.innerHTML = '<slot name="ext-' + id + '"><span class="muted">Loading…</span></slot>';
    else def.render(body);
    return c;
  }
  function drawBar() {
    const bar = root.querySelector(".bar");
    if (!editing) { bar.innerHTML = '<button class="link" type="button" data-a="edit">' + ICON.edit + "Customize</button>"; return; }
    const hidden = S.order.filter((id) => known(id) && !S.on[id]);
    bar.innerHTML = (hidden.length ? '<span class="lbl">Add:</span>' + hidden.map((id) => '<button class="chip" type="button" data-add="' + esc(id) + '">+ ' + esc(titleOf(id)) + "</button>").join("")
      : '<span class="lbl">Every widget is showing.</span>') +
      '<span class="sp"></span><button class="link" type="button" data-a="off">Turn widgets off</button><button class="btn primary" type="button" data-a="done">Done</button>';
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
      return;
    }
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
  // Drag a card by its handle; the others make room as you go.
  function onPointerDown(e) {
    const h = e.target.closest(".drag");
    if (!h || !editing || e.button !== 0) return;
    const c = h.closest(".card"), grid = c.parentElement;
    let last = null;                                  // the card last swapped with: wait until the pointer leaves it
    e.preventDefault();
    c.classList.add("dragging");
    root.querySelector(".wrap").classList.add("moving");
    // follow the pointer on the whole window: the card itself moves in the page as you drag, so it can't hold on to it
    const move = (ev) => {
      const el = root.elementFromPoint(ev.clientX, ev.clientY), over = el && el.closest && el.closest(".card");
      if (over !== last) last = null;
      if (!over || over === c || over === last || over.parentElement !== grid) return;
      last = over;
      const r = over.getBoundingClientRect();
      const after = ev.clientY > r.bottom - r.height / 3 || (ev.clientY >= r.top + r.height / 3 && ev.clientX > r.left + r.width / 2);
      if (after) over.after(c); else over.before(c);
    };
    const up = () => {
      window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true);
      c.classList.remove("dragging");
      root.querySelector(".wrap").classList.remove("moving");
      orderFromGrid();
    };
    window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", up, true); window.addEventListener("pointercancel", up, true);
  }

  function isDark() {
    const c = (getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    return c.length < 3 || c[3] === 0 ? matchMedia("(prefers-color-scheme: dark)").matches : 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] < 128;
  }
  function place() {
    if (!host) return false;
    if (host.isConnected) return true;
    // under the logo + search box block; it grows the page, so "Learn more" moves down below the widgets
    const inner = document.querySelector(".search-home-inner");
    const f = document.querySelector("#search");
    const anchor = inner || (f && (f.closest(".search-form-relative-container") || f.parentElement));
    if (!anchor) return false;
    anchor.after(host);
    return true;
  }
  function mount() {
    if (!S.enabled || host) return;
    host = document.createElement("div");
    host.id = "sp-home";
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML = "<style>" + CSS + '</style><div class="wrap"><div class="grid"></div><div class="bar"></div></div>';
    if (isDark()) host.setAttribute("data-dark", "");
    root.addEventListener("click", onClick);
    root.addEventListener("pointerdown", onPointerDown);
    // typing in a widget stays in the widget (Startpage's page would otherwise react to the keys)
    for (const type of ["keydown", "keyup", "keypress", "input"]) host.addEventListener(type, (e) => e.stopPropagation());
    if (!place()) { host = null; return; }
    draw();
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
