// ==UserScript==
// @name         Quick answers for Startpage
// @namespace    blackout-for-startpage/quick
// @version      1.1.0
// @license      MIT
// @homepageURL  https://github.com/astqh/blackout-for-startpage
// @supportURL   https://github.com/astqh/blackout-for-startpage/issues
// @downloadURL  https://astqh.github.io/blackout-for-startpage/scripts/quick.user.js
// @updateURL    https://astqh.github.io/blackout-for-startpage/scripts/quick.user.js
// @description  Small answers above Startpage results. A timer for searches like 5 minute timer, parcel tracking links, colour previews, coin flip, dice, random numbers, currency for searches Startpage's converter skips, and a shortcut to Startpage's translator. Each one can be turned off.
// @match        https://*.startpage.com/sp/search*
// @match        https://*.startpage.com/do/search*
// @match        https://*.startpage.com/do/dsearch*
// @match        https://*.startpage.com/search*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      api.frankfurter.dev
// @run-at       document-end
// @noframes
// ==/UserScript==

/*
 * Everything works on the page itself, with one exception: the currency card asks Frankfurter (free, open source,
 * European Central Bank rates) for the day's exchange rates. That request carries no search words and is cached
 * for 6 hours. Parcel buttons are plain links; nothing goes to a carrier until you click one.
 * When Startpage shows its own answer (its currency converter, its timer), the matching card here stays hidden.
 * Options: ⚙ on any card, or the Violentmonkey icon → "Quick answers on/off".
 */

(function () {
  "use strict";
  if (window.top !== window.self) return;

  // Defaults follow the browser's language setting (e.g. "en-CA" → Canada → CAD, Celsius).
  const REGION = (() => { try { return new Intl.Locale(navigator.language).maximize().region || ""; } catch (e) { return ""; } })();
  const EURO = "AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES".split(" ");
  const localCurrency = () => ({ CA: "CAD", US: "USD", GB: "GBP", AU: "AUD", NZ: "NZD", JP: "JPY", CH: "CHF", IN: "INR", SE: "SEK", NO: "NOK", DK: "DKK",
    PL: "PLN", CZ: "CZK", HU: "HUF", BR: "BRL", MX: "MXN", ZA: "ZAR", SG: "SGD", HK: "HKD", KR: "KRW", CN: "CNY", TR: "TRY", IL: "ILS" }[REGION] || (EURO.includes(REGION) ? "EUR" : "USD"));
  const DEFAULTS = { enabled: true, timer: true, sound: true, parcel: true, colour: true, random: true, currency: true, translate: true, translateAuto: true, home: localCurrency() };
  const settings = () => Object.assign({}, DEFAULTS, GM_getValue("settings", {}));
  const saveSettings = (s) => GM_setValue("settings", s);
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function getQuery() {
    const box = $("#q") || $("input.search-form-input[name=query]");
    if (box && box.value.trim()) return box.value.trim();
    const p = new URLSearchParams(location.search);
    return (p.get("query") || p.get("q") || "").trim();
  }
  function getCategory() {
    const c = $('#search input[name="cat"]');
    return (c && c.value) || new URLSearchParams(location.search).get("cat") || "web";
  }
  // Startpage's own instant answers (currency converter, timer, weather...) sit in #ee-mainline-top.
  const startpageAnswered = () => Array.from(document.querySelectorAll("#ee-mainline-top *")).some((e) => e.children.length && e.offsetHeight > 40);

  // ---------------------------------------------------------------- understanding the search
  // Parcel tracking: the number's shape picks the carrier. A bare long number (could be a phone number, product
  // code or card number) only counts when the search also says "track", "parcel"... or names a carrier.
  const CARRIERS = {
    canadapost: ["Canada Post", (n) => "https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=" + n],
    ups: ["UPS", (n) => "https://www.ups.com/track?tracknum=" + n],
    fedex: ["FedEx", (n) => "https://www.fedex.com/fedextrack/?trknbr=" + n],
    purolator: ["Purolator", (n) => "https://www.purolator.com/en/shipping/tracker?pin=" + n],
    usps: ["USPS", (n) => "https://tools.usps.com/go/TrackConfirmAction?tLabels=" + n],
    dhl: ["DHL", (n) => "https://www.dhl.com/global-en/home/tracking.html?tracking-id=" + n + "&submit=1"],
    any: ["17TRACK (any carrier)", (n) => "https://t.17track.net/en#nums=" + n],
  };
  const CARRIER_WORDS = [[/\bcanada ?post\b|\bpostes? canada\b/, "canadapost"], [/\bups\b/, "ups"], [/\bfed ?ex\b/, "fedex"], [/\bpurolator\b/, "purolator"], [/\busps\b/, "usps"], [/\bdhl\b/, "dhl"]];
  const PARCEL_WORDS = /\b(track|tracking|trace|parcel|package|shipment|delivery|where is my)\b/;
  function parcel(raw, t) {
    const named = CARRIER_WORDS.filter(([re]) => re.test(t)).map(([, k]) => k);
    const n = raw.replace(/\b(track(ing)?|trace|my|parcel|package|shipment|delivery|number|no|where|is|canada ?post|postes? canada|ups|fed ?ex|purolator|usps|dhl)\b|[#:.]/gi, " ")
      .replace(/[\s-]/g, "").toUpperCase();
    if (!/^[A-Z0-9]{10,34}$/.test(n) || !/\d{6}/.test(n)) return null;
    const context = named.length > 0 || PARCEL_WORDS.test(t);
    let list;
    if (/^1Z[0-9A-Z]{16}$/.test(n)) list = ["ups"];
    else if (/^[A-Z]{2}\d{9}CA$/.test(n)) list = ["canadapost"];
    else if (/^[A-Z]{2}\d{9}US$/.test(n)) list = ["usps"];
    else if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(n)) list = REGION === "US" ? ["usps"] : REGION === "CA" ? ["canadapost"] : [];   // international post
    else if (/^TBA\d{12}$/.test(n)) return { type: "parcel", n, list: [], amazon: true };
    else if (/^[A-Z]{3}\d{9}$/.test(n)) list = ["purolator"];
    else if (/^\d+$/.test(n)) {
      if (!context) return null;
      const L = n.length;
      list = L === 16 ? ["canadapost"] : L === 12 ? ["fedex", "purolator"] : L === 15 ? ["fedex"] : L === 10 ? ["dhl"] : L >= 20 && L <= 22 ? ["usps", "fedex"] : [];
    } else if (context) list = [];
    else return null;
    return { type: "parcel", n, list: Array.from(new Set(named.concat(list, ["any"]))) };
  }

  // Colour: "#a3c4ff", "rgb(163, 196, 255)", "hsl(219, 100%, 82%)", "hex a3c4ff", "color picker".
  const hex2 = (v) => Math.round(v).toString(16).padStart(2, "0");
  const toHex = (rgb) => "#" + rgb.map(hex2).join("");
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    return [0, 8, 4].map((n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))));
  }
  function rgbToHsl(rgb) {
    const [r, g, b] = rgb.map((v) => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = Math.round(h * 60); if (h < 0) h += 360;
    }
    return [h, Math.round(s * 100), Math.round(l * 100)];
  }
  function colour(t) {
    if (/^(colou?r picker|pick a colou?r|hex colou?r picker)$/.test(t)) return { type: "colour", rgb: [163, 196, 255], picker: true };
    let rgb = null, token = "", m;
    if ((m = t.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/))) token = m[0];
    else if (/\b(hex|colou?r)\b/.test(t) && (m = t.match(/\b([0-9a-f]{6})\b/)) && /\d/.test(m[1])) token = m[0];
    if (token) { const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1]; rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
    else if ((m = t.match(/rgba?\s*\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})[^)]*\)?/))) { token = m[0]; rgb = [m[1], m[2], m[3]].map(Number); }
    else if ((m = t.match(/hsla?\s*\(\s*(\d{1,3}(?:\.\d+)?)(?:deg)?\s*[, ]\s*(\d{1,3}(?:\.\d+)?)%\s*[, ]\s*(\d{1,3}(?:\.\d+)?)%[^)]*\)?/))) { token = m[0]; rgb = hslToRgb(+m[1], +m[2], +m[3]); }
    if (!rgb || rgb.some((v) => v > 255)) return null;
    const left = t.replace(token, " ").replace(/\b(hex|colou?r|code|to|in|rgb|hsl|convert|value|what|is|the|of)\b/g, "").replace(/[\s?]+/g, "");
    return left ? null : { type: "colour", rgb };
  }

  // Coin, dice, random numbers.
  function random(t) {
    if (/^((flip|toss)( a)? coin|coin (flip|toss)|heads or tails|heads tails|(flip|toss)( a)? coin heads or tails)$/.test(t)) return { type: "random", kind: "coin" };
    if (/^(roll (a |an |one )?(die|dice|d6)|dice roll|roll dice)$/.test(t)) return { type: "random", kind: "dice", n: 1, sides: 6 };
    // "roll d20", "roll 2d6", "3d6"; a bare "d3" is left alone (it's also a code library)
    let m = t.match(/^roll (\d{1,2})? ?d(\d{1,3})$/) || t.match(/^(\d{1,2})d(\d{1,3})$/) || t.match(/^roll (\d{1,2}) (?:dice|die)$/);
    if (m) { const n = Math.min(+(m[1] || 1), 20), sides = +(m[2] || 6); if (n >= 1 && sides >= 2) return { type: "random", kind: "dice", n, sides }; }
    m = t.match(/^(?:(?:generate|get|give me) )?(?:a )?(?:random number(?: generator)?|random integer|rng|number generator|pick a (?:random )?number)(?: (?:between|from))? ?(-?\d+)?(?: ?(?:and|to|-|,) ?(-?\d+))?$/);
    if (m) { let lo = m[1] != null ? +m[1] : 1, hi = m[2] != null ? +m[2] : (m[1] != null ? +m[1] : 10); if (m[1] != null && m[2] == null) lo = 1; if (lo > hi) [lo, hi] = [hi, lo]; return { type: "random", kind: "number", lo, hi }; }
    return null;
  }

  // Timer: "5 minute timer", "timer 1h30m", "set a timer for 10 minutes", "timer 1:30", "pomodoro".
  // Plain "timer" or "stopwatch" is Startpage's own widget, so it's left to Startpage.
  function timer(t) {
    if (/^pomodoro( timer)?$/.test(t)) return { type: "timer", ms: 25 * 60e3, label: "Pomodoro" };
    if (!/\b(timer|countdown|count down)\b/.test(t)) return null;
    const core = t.replace(/\b(set|start|a|an|the|for|timer|countdown|count down|please|of|me)\b/g, " ").trim();
    let ms = 0, m;
    if ((m = core.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/))) ms = m[3] != null ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1e3 : (+m[1] * 60 + +m[2]) * 1e3;
    else if (/^\d+(\.\d+)?$/.test(core)) ms = parseFloat(core) * 60e3;
    else {
      const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![a-z])/g;
      let rest = core;
      while ((m = re.exec(core))) { const u = m[2][0]; ms += parseFloat(m[1]) * (u === "h" ? 3600e3 : u === "s" ? 1e3 : 60e3); rest = rest.replace(m[0], " "); }
      if (/\b(and a half|half)\b/.test(rest) && ms) ms *= 1.5;
      if (rest.replace(/\b(and|a|half)\b/g, "").trim()) return null;
    }
    return ms > 0 && ms <= 24 * 3600e3 ? { type: "timer", ms, label: "" } : null;
  }

  // Currency, only for what Startpage's own converter doesn't answer ("100 euros", "50 quid in dollars").
  const CURRENCIES = { AUD: "Australian dollar", BRL: "Brazilian real", CAD: "Canadian dollar", CHF: "Swiss franc", CNY: "Chinese yuan", CZK: "Czech koruna", DKK: "Danish krone",
    EUR: "Euro", GBP: "British pound", HKD: "Hong Kong dollar", HUF: "Hungarian forint", IDR: "Indonesian rupiah", ILS: "Israeli shekel", INR: "Indian rupee", ISK: "Icelandic króna",
    JPY: "Japanese yen", KRW: "South Korean won", MXN: "Mexican peso", MYR: "Malaysian ringgit", NOK: "Norwegian krone", NZD: "New Zealand dollar", PHP: "Philippine peso",
    PLN: "Polish złoty", RON: "Romanian leu", SEK: "Swedish krona", SGD: "Singapore dollar", THB: "Thai baht", TRY: "Turkish lira", USD: "US dollar", ZAR: "South African rand" };
  const CUR_WORDS = { "us dollar": "USD", "us dollars": "USD", "american dollars": "USD", dollar: "USD", dollars: "USD", bucks: "USD", "$": "USD", "us$": "USD",
    "canadian dollar": "CAD", "canadian dollars": "CAD", "c$": "CAD", loonie: "CAD", loonies: "CAD", euro: "EUR", euros: "EUR", "€": "EUR", pound: "GBP", pounds: "GBP", quid: "GBP",
    sterling: "GBP", "£": "GBP", yen: "JPY", "¥": "JPY", yuan: "CNY", rmb: "CNY", renminbi: "CNY", rupee: "INR", rupees: "INR", "₹": "INR", won: "KRW", franc: "CHF", francs: "CHF",
    "swiss franc": "CHF", "swiss francs": "CHF", peso: "MXN", pesos: "MXN", "mexican pesos": "MXN", "australian dollar": "AUD", "australian dollars": "AUD", "aussie dollars": "AUD",
    "new zealand dollar": "NZD", "new zealand dollars": "NZD", "hong kong dollar": "HKD", "hong kong dollars": "HKD", "singapore dollar": "SGD", "singapore dollars": "SGD",
    real: "BRL", reais: "BRL", krona: "SEK", kronor: "SEK", "danish krone": "DKK", krone: "NOK", kroner: "NOK", zloty: "PLN", baht: "THB", lira: "TRY", rand: "ZAR", shekel: "ILS",
    shekels: "ILS", ringgit: "MYR", rupiah: "IDR", forint: "HUF", koruna: "CZK", leu: "RON", lei: "RON", "philippine peso": "PHP", "philippine pesos": "PHP" };
  const curOf = (w) => { w = (w || "").trim(); return !w ? null : CURRENCIES[w.toUpperCase()] ? w.toUpperCase() : CUR_WORDS[w] || null; };
  function currency(t) {
    const m = t.match(/^(?:convert )?([$€£¥₹])?\s*(\d[\d,]*(?:\.\d+)?)\s*([$€£¥₹])?\s*([a-z$ ]{0,24}?)\s*(?:(?:to|in|into|=)\s+([a-z$€£¥₹ ]{1,24}))?$/);
    if (!m) return null;
    const from = curOf(m[1] || m[3] || m[4]);
    if (!from) return null;
    const amount = parseFloat(m[2].replace(/,/g, ""));
    let to = m[5] ? curOf(m[5]) : null;
    if (m[5] && !to) return null;
    if (!to) to = settings().home === from ? (from === "USD" ? "EUR" : "USD") : settings().home;
    return amount > 0 ? { type: "currency", amount, from, to } : null;
  }

  // Translation: Startpage's own translator only opens for searches that start with "translate". Other ways of asking
  // ("good morning in french", "en to fr good morning", "how do you say thanks in spanish", "parle francais english")
  // are sent to it as "translate <words> to <language>": straight away when the search is clear, otherwise as a button.
  const LANGS = { english: "English", french: "French", francais: "French", "français": "French", spanish: "Spanish", espanol: "Spanish", "español": "Spanish",
    german: "German", deutsch: "German", italian: "Italian", italiano: "Italian", portuguese: "Portuguese", portugues: "Portuguese", "português": "Portuguese",
    dutch: "Dutch", russian: "Russian", chinese: "Chinese", mandarin: "Chinese", cantonese: "Cantonese", japanese: "Japanese", korean: "Korean", arabic: "Arabic",
    hindi: "Hindi", turkish: "Turkish", polish: "Polish", swedish: "Swedish", norwegian: "Norwegian", danish: "Danish", finnish: "Finnish", greek: "Greek",
    hebrew: "Hebrew", ukrainian: "Ukrainian", czech: "Czech", hungarian: "Hungarian", romanian: "Romanian", vietnamese: "Vietnamese", thai: "Thai",
    indonesian: "Indonesian", malay: "Malay", tagalog: "Tagalog", filipino: "Filipino", persian: "Persian", farsi: "Persian", urdu: "Urdu", bengali: "Bengali",
    punjabi: "Punjabi", tamil: "Tamil", swahili: "Swahili", latin: "Latin", irish: "Irish", welsh: "Welsh", croatian: "Croatian", serbian: "Serbian",
    bulgarian: "Bulgarian", slovak: "Slovak", slovenian: "Slovenian", catalan: "Catalan", icelandic: "Icelandic" };
  const CODES = { en: "English", fr: "French", es: "Spanish", de: "German", it: "Italian", pt: "Portuguese", nl: "Dutch", ru: "Russian", zh: "Chinese",
    ja: "Japanese", ko: "Korean", ar: "Arabic", hi: "Hindi", tr: "Turkish", pl: "Polish", sv: "Swedish", uk: "Ukrainian", el: "Greek" };
  const LANG_RE = "(" + Object.keys(LANGS).sort((a, b) => b.length - a.length).join("|") + ")";
  // searches about a language rather than words to translate ("learn spanish", "movies in french", "french fries")
  const NOT_WORDS = new Set(("learn learning speak speaking lesson lessons course courses class classes book books movie movies film films show shows music song " +
    "songs news radio tv channel channels keyboard grammar dictionary alphabet numbers words phrases test exam app apps school schools food cuisine recipe " +
    "recipes culture people language languages translator translation version subtitles subtitle dub dubbed teacher tutor jobs job names history fries toast " +
    "bulldog press horn revolution literature restaurant restaurants").split(" "));
  function translation(raw) {
    const q = raw.replace(/\s+/g, " ").trim().replace(/[?!.]+$/, "");
    if (/^translat(e|or|ion)\b/i.test(q)) return null;                     // Startpage's own box takes these
    const lang = (w) => LANGS[w.toLowerCase()] || null;
    const words = (x) => x.toLowerCase().split(" ");
    const plain = (x) => !words(x).some((w) => NOT_WORDS.has(w)) && !lang(x);
    const hit = (text, to, sure) => ({ type: "translate", text: text.trim(), to, sure });
    let m;
    // "english to french", "english to french good morning", "from english into french: good morning"
    if ((m = new RegExp("^(?:from )?" + LANG_RE + " (?:to|into|->|→) " + LANG_RE + "(?:[: ]+(.+))?$", "i").exec(q))) return hit(m[3] || "", lang(m[2]), !!m[3]);
    // "en to fr good morning", "en-fr good morning"
    if ((m = /^([a-z]{2}) ?(?:to|->|→|-|\/) ?([a-z]{2})[: ]+(.+)$/i.exec(q)) && CODES[m[1].toLowerCase()] && CODES[m[2].toLowerCase()]) return hit(m[3], CODES[m[2].toLowerCase()], true);
    // "how do you say thank you in spanish", "what is gracias in english", "what does merci mean in english"
    if ((m = new RegExp("^(?:how (?:do (?:you|i)|to|would (?:you|i)|can i) say|what (?:is|does|do)) (.+?)(?: mean)? in " + LANG_RE + "$", "i").exec(q))) return hit(m[1], lang(m[2]), true);
    // "good morning in french": clear when short; a button when a bit longer
    if ((m = new RegExp("^(.+?) in " + LANG_RE + "$", "i").exec(q)) && plain(m[1])) {
      const n = words(m[1]).length;
      if (n <= 6) return hit(m[1], lang(m[2]), n <= 4);
    }
    // "parle francais english": words, then the language to put them in (always a button: it could be a normal search)
    if ((m = new RegExp("^(.+?) " + LANG_RE + "$", "i").exec(q)) && plain(m[1]) && words(m[1]).length <= 6) return hit(m[1], lang(m[2]), false);
    return null;
  }
  // Sends the search to Startpage's translator through Startpage's own search form, so your search settings (POST)
  // still apply. Remembered per tab, so going Back to this page never sends you forward again.
  const navType = () => { try { return performance.getEntriesByType("navigation")[0].type; } catch (e) { return ""; } };
  const trKey = (q) => "sp-quick-translate:" + q;
  function canAutoTranslate(q) {
    if (navType() === "back_forward") return false;
    try { return !sessionStorage.getItem(trKey(q)); } catch (e) { return true; }
  }
  function toTranslator(hit, q) {
    const box = $("#q"), form = $("#search");
    if (!box || !form) return false;
    try { sessionStorage.setItem(trKey(q), "1"); } catch (e) { /* storage blocked */ }
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(box, hit.text ? "translate " + hit.text + " to " + hit.to : "translate");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    if (form.requestSubmit) form.requestSubmit(); else form.submit();
    return true;
  }

  function detect(raw) {
    const t = raw.toLowerCase().replace(/\s+/g, " ").trim(), s = settings();
    if (!t || t.split(" ").length > 9) return null;
    const hit = parcel(raw, t) || colour(t) || random(t) || timer(t) || currency(t) || translation(raw);
    if (!hit) return null;
    const on = { parcel: s.parcel, colour: s.colour, random: s.random, timer: s.timer, currency: s.currency, translate: s.translate }[hit.type];
    if (!on) return null;
    if ((hit.type === "timer" || hit.type === "currency") && startpageAnswered()) return null;
    return hit;
  }

  // ---------------------------------------------------------------- UI
  const CSS = `
:host { all: initial; display: block; margin: 0 0 18px; color: inherit; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.card { font: 14px/1.45 var(--sp-font, "Segoe UI", system-ui, sans-serif); color: var(--sp-ink, inherit); border: 1px solid var(--sp-line-strong, rgba(127,127,127,.28)); border-radius: 16px; background: var(--sp-surface, rgba(127,127,127,.05)); overflow: hidden; font-variant-numeric: tabular-nums; }
.head { display: flex; align-items: center; gap: 10px; padding: 12px 12px 4px 16px; }
.head .ic { width: 18px; height: 18px; color: var(--sp-accent, #6677fb); flex: none; }
.head h2 { margin: 0; font-size: 14px; font-weight: 600; flex: 1; min-width: 0; }
.icon { all: unset; cursor: pointer; width: 28px; height: 28px; border-radius: 999px; display: inline-grid; place-items: center; color: var(--sp-ink-2, inherit); flex: none; }
.icon:hover, .icon[aria-expanded="true"] { background: var(--sp-surface-2, rgba(127,127,127,.14)); color: var(--sp-ink, inherit); }
.icon svg { width: 16px; height: 16px; }
.body { padding: 6px 16px 16px; }
.muted { color: var(--sp-muted, rgba(127,127,127,.9)); font-size: 12.5px; }
.big { font-size: 34px; font-weight: 600; line-height: 1.15; letter-spacing: -.01em; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.b { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 999px; font: 600 13px var(--sp-font, sans-serif); color: var(--sp-ink, inherit); border: 1px solid var(--sp-line-strong, rgba(127,127,127,.3)); text-decoration: none; }
.b:hover { border-color: var(--sp-accent, #6677fb); }
.b.pri { background: var(--sp-accent, #6677fb); border-color: var(--sp-accent, #6677fb); color: var(--sp-bg, #fff); }
.b svg { width: 14px; height: 14px; }
.icon:focus-visible, .b:focus-visible, input:focus-visible, select:focus-visible, .opts button:focus-visible { outline: 2px solid var(--sp-accent, #6677fb); outline-offset: 2px; }
input[type=number], input[type=text], select { font: 15px var(--sp-font, sans-serif); color: var(--sp-ink, inherit); background: var(--sp-field, transparent); border: 1px solid var(--sp-line-strong, rgba(127,127,127,.3)); border-radius: 10px; padding: 7px 10px; min-width: 0; }
select option { background: var(--sp-surface, Canvas); color: var(--sp-ink, CanvasText); }
/* timer */
.clock { font-size: 44px; font-weight: 600; letter-spacing: -.02em; line-height: 1.1; }
.track { height: 4px; border-radius: 4px; background: var(--sp-surface-2, rgba(127,127,127,.15)); overflow: hidden; margin: 10px 0 8px; }
.track i { display: block; height: 100%; width: 0; background: var(--sp-accent, #6677fb); transition: width .25s linear; }
.card.done .clock, .card.done .track i { color: #ff5c5c; background-color: #ff5c5c; }
.card.done .clock { background: none; }
.tsub { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
/* parcel */
.num { font: 600 17px var(--sp-mono, Consolas, monospace); letter-spacing: .03em; word-break: break-all; margin-bottom: 4px; }
/* colour */
.cgrid { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 16px; align-items: start; }
.sw { width: 96px; height: 96px; border-radius: 14px; box-shadow: inset 0 0 0 1px rgba(127,127,127,.35); display: grid; place-items: center; font: 600 22px var(--sp-font, sans-serif); position: relative; overflow: hidden; }
.sw input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; border: 0; padding: 0; }
.vals { display: grid; gap: 6px; }
.val { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.val b { font: 600 11px var(--sp-font, sans-serif); letter-spacing: .06em; color: var(--sp-muted, inherit); }
.val code { font: 14px var(--sp-mono, Consolas, monospace); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* random */
.coin { width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; font: 700 28px var(--sp-font, sans-serif); color: #1a1406; background: radial-gradient(circle at 35% 30%, #ffe9a8, #e0a92e 70%); box-shadow: inset 0 0 0 3px rgba(0,0,0,.12); }
.coin.flip { animation: flip .5s ease-out; }
@keyframes flip { from { transform: rotateY(0) scale(.85); } to { transform: rotateY(720deg) scale(1); } }
.dice { display: flex; flex-wrap: wrap; gap: 8px; }
.die { min-width: 52px; height: 52px; padding: 0 8px; border-radius: 12px; display: grid; place-items: center; font: 600 24px var(--sp-font, sans-serif); background: var(--sp-surface-2, rgba(127,127,127,.15)); box-shadow: inset 0 0 0 1px var(--sp-line-strong, rgba(127,127,127,.25)); }
.die.pip { font-size: 40px; line-height: 1; }
.rgrid { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.range { display: flex; gap: 8px; align-items: center; }
.range input { width: 92px; }
/* currency */
.conv { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 8px; align-items: center; margin: 12px 0 8px; max-width: 460px; }
.side { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr); gap: 6px; }
.side input { width: 100%; }
.conv .swap { grid-row: 1 / span 2; grid-column: 2; }
/* options */
.opts { display: grid; gap: 9px; padding: 10px 16px 12px; border-top: 1px solid var(--sp-line, rgba(127,127,127,.2)); border-bottom: 1px solid var(--sp-line, rgba(127,127,127,.2)); font-size: 13px; color: var(--sp-ink-2, inherit); }
.opts label, .opts .orow { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.opts input[type=checkbox] { appearance: none; -webkit-appearance: none; flex: none; width: 36px; height: 20px; margin: 0; border-radius: 999px; position: relative; cursor: pointer; background: var(--sp-line-strong, rgba(127,127,127,.4)); transition: background .15s; }
.opts input[type=checkbox]::after { content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: var(--sp-ink, #fff); transition: transform .15s; }
.opts input[type=checkbox]:checked { background: var(--sp-accent, #6677fb); }
.opts input[type=checkbox]:checked::after { transform: translateX(16px); background: var(--sp-bg, #fff); }
.opts select { font-size: 13px; padding: 4px 8px; }
.opts .off { font-size: 12px; color: var(--sp-muted, inherit); }
@media (prefers-reduced-motion: reduce) { .coin.flip { animation: none; } .track i { transition: none; } }
`;
  const ICON = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2h5M12 2v3"/></svg>',
    parcel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/></svg>',
    colour: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8l-.4-.9c-.5-1 .2-2.3 1.4-2.3H17a4 4 0 0 0 4-4c0-5-4-9-9-9Z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/></svg>',
    random: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>',
    currency: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>',
    translate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h10M8 3v2M5 5c.6 3.4 2.8 6.2 6 7.6M11 5c-.5 3.6-2.6 6.6-7 8.6"/><path d="m12 21 4.5-10 4.5 10M13.6 17.5h5.8"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>',
  };

  let host = null, root = null, current = null, optsOpen = false;
  function mount() {
    if (host && host.isConnected) return true;
    const list = $(".w-gl");
    if (!list || !list.parentNode) return false;
    host = document.createElement("div"); host.id = "sp-quick-widget";
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML = "<style>" + CSS + '</style><section class="card" style="container-type: inline-size"></section>';
    place();
    new MutationObserver(() => { if (host && !host.isConnected) requestAnimationFrame(place); }).observe(document.documentElement, { childList: true, subtree: true });
    return true;
  }
  function place() {
    if (!host || host.isConnected) return;
    const ai = document.getElementById("sp-instant-answer");                // sit above the Instant Answer
    const anchor = ai && ai.isConnected ? ai : $(".w-gl");
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(host, anchor);
  }
  const card = () => root.querySelector(".card");
  let cleanup = null;
  function remove() { if (cleanup) { cleanup(); cleanup = null; } if (host) { host.remove(); host = null; } }

  const TITLES = { timer: "Timer", parcel: "Track a parcel", colour: "Colour", currency: "Currency", random: "Random", translate: "Translate" };
  function shell(hit, title) {
    if (cleanup) { cleanup(); cleanup = null; }
    card().classList.remove("done");
    card().setAttribute("aria-label", title);
    card().innerHTML =
      '<div class="head">' + ICON[hit.type].replace("<svg", '<svg class="ic"') + "<h2></h2>" +
      '<button class="icon gear" type="button" title="Quick answer options" aria-label="Quick answer options" aria-expanded="false">' + ICON.gear + "</button>" +
      '<button class="icon x" type="button" title="Hide for this search" aria-label="Hide for this search">' + ICON.close + "</button></div>" +
      '<div class="opts" role="group" aria-label="Quick answer options" hidden></div><div class="body"></div>';
    root.querySelector("h2").textContent = title;
    root.querySelector(".x").addEventListener("click", remove);
    wireOptions();
    return root.querySelector(".body");
  }
  function wireOptions() {
    const btn = root.querySelector(".gear"), box = root.querySelector(".opts"), s = settings();
    box.innerHTML = [["timer", "Timer (“5 minute timer”)"], ["sound", "Alarm sound when a timer ends"], ["parcel", "Parcel tracking buttons"], ["colour", "Colour preview"],
      ["random", "Coin flip, dice, random number"], ["currency", "Currency (when Startpage has no converter)"],
      ["translate", "Translation searches → Startpage's translator"], ["translateAuto", "…straight away when the search is clear (otherwise a button)"]].map(([k, l]) =>
      '<label><span>' + l + '</span><input type="checkbox" data-opt="' + k + '"' + (s[k] ? " checked" : "") + "></label>").join("") +
      '<div class="orow"><span>Your currency (for “100 euros”)</span><select data-opt="home" aria-label="Your currency">' +
      Object.keys(CURRENCIES).map((c) => '<option value="' + c + '"' + (c === s.home ? " selected" : "") + ">" + c + " · " + esc(CURRENCIES[c]) + "</option>").join("") + "</select></div>" +
      '<div class="orow off"><span>Turn back on later: Violentmonkey icon → Quick answers on/off</span><button type="button" class="b offbtn">Turn quick answers off</button></div>';
    const show = (open) => { optsOpen = open; box.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
    show(optsOpen);
    btn.addEventListener("click", () => show(box.hidden));
    box.querySelectorAll("[data-opt]").forEach((el) => el.addEventListener("change", () => {
      const st = settings(); st[el.dataset.opt] = el.type === "checkbox" ? el.checked : el.value; saveSettings(st);
      if (el.dataset.opt !== "sound") start(true);                  // re-read the search with the new options
    }));
    box.querySelector(".offbtn").addEventListener("click", () => { const st = settings(); st.enabled = false; saveSettings(st); optsOpen = false; remove(); });
  }
  const copyBtn = (text, label) => '<button class="icon cp" type="button" data-copy="' + esc(text) + '" title="Copy ' + esc(label) + '" aria-label="Copy ' + esc(label) + '">' + ICON.copy + "</button>";
  function wireCopy(scope) {
    scope.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => {
      navigator.clipboard.writeText(b.dataset.copy).then(() => { b.title = "Copied"; }).catch(() => {});
    }));
  }
  const rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };   // fair: crypto, not Math.random

  // ---------------------------------------------------------------- cards
  function showParcel(hit) {
    const body = shell(hit, "Track a parcel");
    body.innerHTML = '<div class="num"></div>' +
      (hit.amazon ? '<p class="muted">This is an Amazon tracking ID. Amazon only shows it inside your account: Your Orders → Track package.</p>'
        : '<p class="muted" style="margin:0 0 10px">' + (hit.list.length > 1 ? "Opens the carrier's own tracking page. Nothing is sent until you click." : "") + "</p>" +
          '<div class="row">' + hit.list.map((k, i) => '<a class="b' + (i === 0 ? " pri" : "") + '" rel="noreferrer" href="' + esc(CARRIERS[k][1](encodeURIComponent(hit.n))) + '">' + esc(CARRIERS[k][0]) + "</a>").join("") +
          copyBtn(hit.n, "tracking number") + "</div>");
    body.querySelector(".num").textContent = hit.n;
    wireCopy(body);
  }

  function showColour(hit) {
    const body = shell(hit, hit.picker ? "Colour picker" : "Colour");
    body.innerHTML = '<div class="cgrid"><label class="sw" title="Pick another colour">Aa<input type="color" aria-label="Pick another colour"></label><div class="vals">' +
      ["HEX", "RGB", "HSL"].map((k) => '<div class="val"><b>' + k + '</b><code data-k="' + k + '"></code>' + copyBtn("", k) + "</div>").join("") +
      '<span class="muted tip"></span></div></div>';
    body.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => navigator.clipboard.writeText(b.dataset.copy).then(() => { b.title = "Copied"; }).catch(() => {})));
    // Updated in place, so the colour picker stays open while you drag.
    const paint = (rgb) => {
      const hex = toHex(rgb), hsl = rgbToHsl(rgb), lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
      const vals = { HEX: hex, RGB: "rgb(" + rgb.join(", ") + ")", HSL: "hsl(" + hsl[0] + ", " + hsl[1] + "%, " + hsl[2] + "%)" };
      const sw = body.querySelector(".sw"); sw.style.background = hex; sw.style.color = lum > 0.55 ? "#111" : "#fff";
      const input = body.querySelector("input[type=color]"); if (input.value !== hex) input.value = hex;
      body.querySelectorAll(".val").forEach((row) => { const k = row.querySelector("code").dataset.k; row.querySelector("code").textContent = vals[k]; row.querySelector("[data-copy]").dataset.copy = vals[k]; });
      body.querySelector(".tip").textContent = "Text on it reads best in " + (lum > 0.55 ? "black" : "white") + ". Click the swatch to pick another colour.";
    };
    body.querySelector("input[type=color]").addEventListener("input", (e) => { const h = e.target.value; paint([1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))); });
    paint(hit.rgb);
  }

  const PIPS = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  function showRandom(hit) {
    const body = shell(hit, hit.kind === "coin" ? "Coin flip" : hit.kind === "dice" ? (hit.n > 1 ? hit.n + " dice" : "Dice") + (hit.sides !== 6 ? " · d" + hit.sides : "") : "Random number");
    if (hit.kind === "coin") {
      const go = () => { const heads = rnd(2) === 0; body.innerHTML = '<div class="rgrid"><div class="coin flip" aria-hidden="true">' + (heads ? "H" : "T") + '</div><div class="big">' + (heads ? "Heads" : "Tails") + '</div></div><div class="row"><button class="b pri again" type="button">Flip again</button></div>'; body.querySelector(".again").addEventListener("click", go); };
      go();
    } else if (hit.kind === "dice") {
      const go = () => {
        const rolls = Array.from({ length: hit.n }, () => rnd(hit.sides) + 1), sum = rolls.reduce((a, b) => a + b, 0);
        body.innerHTML = '<div class="rgrid"><div class="dice">' + rolls.map((r) => hit.sides === 6 ? '<span class="die pip" title="' + r + '">' + PIPS[r - 1] + "</span>" : '<span class="die">' + r + "</span>").join("") + "</div>" +
          (hit.n > 1 ? '<div><div class="muted">Total</div><div class="big">' + sum + "</div></div>" : "") + '</div><div class="row"><button class="b pri again" type="button">Roll again</button></div>';
        body.querySelector(".again").addEventListener("click", go);
      };
      go();
    } else {
      const go = (lo, hi) => {
        const v = lo + rnd(hi - lo + 1);
        body.innerHTML = '<div class="rgrid"><div class="big">' + v + '</div></div><div class="row"><div class="range"><input type="number" aria-label="Lowest" value="' + lo + '"><span class="muted">to</span><input type="number" aria-label="Highest" value="' + hi + '"></div><button class="b pri again" type="button">Generate</button></div>';
        body.querySelector(".again").addEventListener("click", () => { let [a, b] = Array.from(body.querySelectorAll("input")).map((i) => Math.round(+i.value)); if (!isFinite(a) || !isFinite(b)) return; if (a > b) [a, b] = [b, a]; go(a, b); });
      };
      go(hit.lo, hit.hi);
    }
  }

  // Timer: starts right away, like Google. The alarm needs one click on the page first (browsers block sound
  // on pages you haven't touched); the card says so when that's still needed.
  let audio = null;
  function primeAudio() { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === "suspended") audio.resume(); } catch (e) { audio = null; } }
  function beep() {
    if (!audio || audio.state !== "running") return;
    const t0 = audio.currentTime + 0.05;
    [0, 0.18, 0.36].forEach((d) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "sine"; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.3, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.15);
      o.connect(g); g.connect(audio.destination); o.start(t0 + d); o.stop(t0 + d + 0.16);
    });
  }
  const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
  function showTimer(hit) {
    const body = shell(hit, hit.label || "Timer");
    const st = { total: hit.ms, endAt: Date.now() + hit.ms, left: hit.ms, paused: false, done: false };
    const title0 = document.title;
    body.innerHTML = '<div class="clock" role="timer"></div><div class="track"><i></i></div><div class="tsub"><span class="muted ends"></span><span class="muted snd" hidden>Click anywhere on the page once so the alarm can sound.</span></div>' +
      '<div class="row"><button class="b pri pause" type="button">Pause</button><button class="b plus" type="button">+1 min</button><button class="b reset" type="button">Reset</button></div>';
    const q = (c) => body.querySelector(c);
    let ring = 0, flash = 0;
    const stopAlarm = () => { clearInterval(ring); clearInterval(flash); ring = flash = 0; document.title = title0; card().classList.remove("done"); };
    const tick = () => {
      const now = Date.now(), left = st.paused || st.done ? st.left : st.endAt - now;
      if (!st.done && !st.paused && left <= 0) return finish();
      q(".clock").textContent = fmt(left);
      q(".track i").style.width = (100 * (1 - left / st.total)).toFixed(2) + "%";
      q(".ends").textContent = st.done ? "Time's up" : st.paused ? "Paused" : "Ends at " + new Date(st.endAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      q(".snd").hidden = !(settings().sound && !st.done && (!audio || audio.state !== "running"));
      if (!st.done) document.title = fmt(left) + " · " + (hit.label || "Timer");
    };
    const finish = () => {
      st.done = true; st.left = 0; card().classList.add("done");
      q(".pause").textContent = "Stop alarm";
      tick();
      if (settings().sound) { let n = 0; beep(); ring = setInterval(() => { beep(); if (++n >= 19) clearInterval(ring); }, 1500); }
      let on = false; flash = setInterval(() => { document.title = (on = !on) ? "Time's up!" : title0; }, 800);
    };
    q(".pause").addEventListener("click", () => {
      if (st.done) { stopAlarm(); q(".pause").textContent = "Done"; q(".pause").disabled = true; return; }
      if (!st.paused) { st.left = st.endAt - Date.now(); st.paused = true; q(".pause").textContent = "Resume"; }
      else { st.endAt = Date.now() + st.left; st.paused = false; q(".pause").textContent = "Pause"; }
      tick();
    });
    q(".plus").addEventListener("click", () => {
      if (st.done) { stopAlarm(); st.done = false; st.total = 60e3; st.endAt = Date.now() + 60e3; q(".pause").textContent = "Pause"; q(".pause").disabled = false; }
      else if (st.paused) { st.left += 60e3; st.total += 60e3; } else { st.endAt += 60e3; st.total += 60e3; }
      tick();
    });
    q(".reset").addEventListener("click", () => { stopAlarm(); Object.assign(st, { total: hit.ms, endAt: Date.now() + hit.ms, left: hit.ms, paused: false, done: false }); q(".pause").textContent = "Pause"; q(".pause").disabled = false; tick(); });
    const onGesture = () => { primeAudio(); tick(); };
    document.addEventListener("pointerdown", onGesture, true); document.addEventListener("keydown", onGesture, true);
    const iv = setInterval(tick, 250);
    primeAudio(); tick();
    cleanup = () => { clearInterval(iv); stopAlarm(); document.removeEventListener("pointerdown", onGesture, true); document.removeEventListener("keydown", onGesture, true); };
  }

  // Currency: one request for all of the day's rates (base EUR), cached 6 hours inside Violentmonkey.
  function rates() {
    const c = GM_getValue("rates", null);
    if (c && Date.now() - c.at < 6 * 3600e3) return Promise.resolve(c);
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET", url: "https://api.frankfurter.dev/v1/latest", anonymous: true, timeout: 10000, headers: { Accept: "application/json" },
        onload: (r) => { try { const j = JSON.parse(r.responseText); if (!j.rates) throw new Error("bad"); const v = { at: Date.now(), date: j.date, rates: Object.assign({ EUR: 1 }, j.rates) }; GM_setValue("rates", v); resolve(v); } catch (e) { reject(e); } },
        onerror: () => reject(new Error("offline")), ontimeout: () => reject(new Error("offline")),
      });
    });
  }
  const money = (v) => { try { return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: v >= 100 ? 2 : v >= 1 ? 4 : 6, minimumFractionDigits: v >= 100 ? 2 : 0 }); } catch (e) { return String(v); } };
  function showCurrency(hit) {
    const body = shell(hit, "Currency");
    body.innerHTML = '<p class="muted">Loading today’s rates…</p>';
    rates().then((R) => {
      const opts = (sel) => Object.keys(CURRENCIES).map((c) => '<option value="' + c + '"' + (c === sel ? " selected" : "") + ">" + c + " · " + esc(CURRENCIES[c]) + "</option>").join("");
      body.innerHTML = '<div class="muted line1"></div><div class="big line2"></div>' +
        '<div class="conv"><div class="side"><input type="number" class="a1" aria-label="Amount" step="any"><select class="c1" aria-label="From">' + opts(hit.from) + "</select></div>" +
        '<button class="icon swap" type="button" title="Swap" aria-label="Swap currencies">' + ICON.swap + "</button>" +
        '<div class="side"><input type="number" class="a2" aria-label="Converted amount" step="any"><select class="c2" aria-label="To">' + opts(hit.to) + "</select></div></div>" +
        '<div class="muted foot"></div>';
      const q = (c) => body.querySelector(c), rate = (a, b) => R.rates[b] / R.rates[a];
      const paint = (from) => {
        const c1 = q(".c1").value, c2 = q(".c2").value, r = rate(c1, c2);
        if (from === 2) q(".a1").value = +(+q(".a2").value / r).toFixed(4); else q(".a2").value = +(+q(".a1").value * r).toFixed(4);
        const a1 = +q(".a1").value, a2 = +q(".a2").value;
        q(".line1").textContent = money(a1) + " " + CURRENCIES[c1] + " equals";
        q(".line2").textContent = money(a2) + " " + CURRENCIES[c2];
        q(".foot").textContent = "1 " + c1 + " = " + money(r) + " " + c2 + " · European Central Bank rate, " + new Date(R.date + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) + " · Data: Frankfurter";
      };
      q(".a1").value = hit.amount;
      q(".a1").addEventListener("input", () => paint(1)); q(".a2").addEventListener("input", () => paint(2));
      q(".c1").addEventListener("change", () => paint(1)); q(".c2").addEventListener("change", () => paint(1));
      q(".swap").addEventListener("click", () => { const a = q(".c1").value; q(".c1").value = q(".c2").value; q(".c2").value = a; paint(1); });
      paint(1);
    }).catch(() => { body.innerHTML = '<p class="muted">Couldn’t load exchange rates right now. Try again in a minute.</p>'; });
  }

  function showTranslate(hit) {
    const body = shell(hit, TITLES.translate), q = getQuery();
    body.innerHTML = hit.text
      ? "<p>Translate <b>“" + esc(hit.text) + "”</b> to " + esc(hit.to) + " with Startpage’s translator?</p><div class=\"row\"><button class=\"b pri\" type=\"button\">Translate</button></div>"
      : "<p>Startpage’s translator opens for searches that start with “translate”.</p><div class=\"row\"><button class=\"b pri\" type=\"button\">Open the translator</button></div>";
    body.querySelector("button").addEventListener("click", () => toTranslator(hit, q));
  }

  // ---------------------------------------------------------------- start
  function start(again) {
    const s = settings();
    if (!s.enabled) { remove(); return; }
    if (getCategory() !== "web") return;
    const hit = detect(getQuery());
    if (!hit) { if (again) remove(); return; }
    if (!again && hit.type === "translate" && hit.sure && s.translateAuto && canAutoTranslate(getQuery()) && toTranslator(hit, getQuery())) return;
    if (!mount()) return;
    current = hit;
    ({ parcel: showParcel, colour: showColour, random: showRandom, timer: showTimer, currency: showCurrency, translate: showTranslate })[hit.type](hit);
    // Startpage draws its own converter/timer a moment after the page loads; if one turns up, this card goes.
    if (hit.type === "timer" || hit.type === "currency") [600, 1500, 3500].forEach((ms) => setTimeout(() => { if (current === hit && startpageAnswered()) { current = null; remove(); } }, ms));
  }

  // A clear translation search goes to Startpage's translator straight away, without waiting for the results to finish.
  (function translateEarly() {
    const st = settings(), q = getQuery();
    if (!st.enabled || !st.translate || !st.translateAuto || !q || getCategory() !== "web") return;
    const hit = detect(q);
    if (hit && hit.type === "translate" && hit.sure && canAutoTranslate(q)) toTranslator(hit, q);
  })();

  GM_registerMenuCommand("Quick answers on/off", () => { const s = settings(); s.enabled = !s.enabled; saveSettings(s); if (s.enabled) start(true); else remove(); });
  let tries = 0;
  const wait = () => { if ($(".w-gl .result") || tries++ > 40) start(false); else setTimeout(wait, 100); };
  if (document.readyState === "complete") setTimeout(wait, 50);
  else window.addEventListener("load", () => setTimeout(wait, 50), { once: true });
})();
