// ==UserScript==
// @name         F1 card for Startpage
// @namespace    blackout-for-startpage/f1
// @version      1.4.0
// @license      MIT
// @homepageURL  https://github.com/astqh/blackout-for-startpage
// @supportURL   https://github.com/astqh/blackout-for-startpage/issues
// @downloadURL  https://astqh.github.io/blackout-for-startpage/scripts/f1.user.js
// @updateURL    https://astqh.github.io/blackout-for-startpage/scripts/f1.user.js
// @description  Formula 1 on Startpage. Session results from practice to race with team colours, driver initials and tyre strategy, the weekend schedule in your time zone, standings, and the next race on the home page. Also works on SearXNG.
// @match        https://*.startpage.com/
// @match        https://*.startpage.com/?*
// @match        https://*.startpage.com/en/
// @match        https://*.startpage.com/sp/search*
// @match        https://*.startpage.com/do/search*
// @match        https://*.startpage.com/do/dsearch*
// @match        https://*.startpage.com/search*
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      api.jolpi.ca
// @connect      api.openf1.org
// @run-at       document-end
// @noframes
// ==/UserScript==

/*
 * Shows a compact F1 card above Startpage results for searches like "monza qualifying", "singapore gp",
 * "silverstone sprint 2025", "f1 standings", "constructors standings", "next f1 race", "f1 calendar".
 * Data: Jolpica-F1 (calendar, standings, qualifying/sprint/race) and OpenF1 (practice, sprint qualifying,
 * and fresh results before Jolpica updates). They only receive requests like "2026 round 17 qualifying";
 * never your search words, never cookies. Answers are saved inside Violentmonkey and shared by all tabs, so a
 * finished session is fetched once (see "data" below).
 * Teams are shown by their colour and drivers by their initials; no logos or photos are loaded.
 * Options (⚙ in the card): driver initials, tyre strategy, the next race on the home page.
 * SearXNG: the same card above the results and the next race on the home page of any SearXNG instance. Other pages
 * are left alone: the script stops at once unless the page carries SearXNG's <meta name="generator" content="searxng/…">.
 */

(function () {
  "use strict";
  if (window.top !== window.self) return;
  // Startpage, or a SearXNG instance at any address (known by its generator tag)
  const SP = /(^|\.)startpage\.com$/i.test(location.hostname);
  if (!SP && !document.querySelector('meta[name="generator"][content^="searx" i]')) return;

  // photos: driver initials in team colours; tyres: stint bars on race and sprint results; home: the next race on the home page
  const SETTINGS_DEFAULT = { enabled: true, collapsed: false, photos: true, tyres: true, home: true };
  const settings = () => Object.assign({}, SETTINGS_DEFAULT, GM_getValue("settings", {}));
  const saveSettings = (s) => GM_setValue("settings", s);
  const JOLPICA = "https://api.jolpi.ca/ergast/f1/";
  const OPENF1 = "https://api.openf1.org/v1/";
  const ROWS = 10;

  // Team colours (OpenF1's 2026 values); older teams fall back to grey or OpenF1's colour when known.
  const TEAM_COLOUR = {
    alpine: "#00A1E8", aston_martin: "#229971", audi: "#F50537", cadillac: "#909090", ferrari: "#ED1131", haas: "#9C9FA2",
    mclaren: "#F47600", mercedes: "#00D7B6", rb: "#6C98FF", red_bull: "#4781D7", williams: "#1868DB",
    sauber: "#52E252", alphatauri: "#6C98FF", toro_rosso: "#469BFF", renault: "#FFF500", racing_point: "#F596C8",
    force_india: "#F596C8", alfa: "#C92D4B", lotus_f1: "#FFB800",
  };
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const key = (s) => norm(s).replace(/ /g, "");

  // ---------------------------------------------------------------- teams and drivers
  // Teams are shown by their colour stripe and drivers by their initials in a team-coloured circle.
  const teamLogo = () => "";
  const inkOn = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return "#fff"; const n = parseInt(m[1], 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150 ? "#111" : "#fff"; };
  const initials = (r) => (r.name || "").split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  // ---------------------------------------------------------------- query understanding
  function parseQuery(q) {
    const s = " " + norm(q) + " ";
    const has = (re) => re.test(s);
    const yearM = s.match(/ (19[5-9]\d|20\d\d) /);
    let session = null;
    if (has(/ (fp1|practice 1|first practice|free practice 1) /)) session = "FP1";
    else if (has(/ (fp2|practice 2|second practice|free practice 2) /)) session = "FP2";
    else if (has(/ (fp3|practice 3|third practice|free practice 3) /)) session = "FP3";
    else if (has(/ (sprint qualifying|sprint quali|sprint shootout|sq) /)) session = "SQ";
    else if (has(/ sprint /)) session = "S";
    else if (has(/ (qualifying|quali|qualy|qualification|pole|pole position|grid|starting grid|q3) /)) session = "Q";
    else if (has(/ (race|results?|winner|won|podium|classification) /)) session = "R";
    else if (has(/ (practice|fp) /)) session = "FP";
    const standings = has(/ (standings?|championship|wdc|wcc|points table|points|leaderboard|table) /)
      ? (has(/ (constructors?|constructor s|teams?|wcc) /) ? "constructors" : "drivers") : null;
    const calendar = has(/ (calendar|season schedule|full schedule|race schedule) /);
    const schedule = calendar || has(/ (schedule|timetable|start time|what time|when is|when does|times) /);
    const next = has(/ (next|upcoming|this weekend) /);
    const strong = has(/ (f1|formula 1|formula one|formula1|grand prix|gp|wdc|wcc|constructors? (standings?|championship)|drivers? championship) /);
    const words = s.trim().split(" ").length;
    return { s, year: yearM ? +yearM[1] : null, session, standings, calendar, schedule, next, strong, words };
  }

  // Words that never identify a race on their own.
  const STOP = new Set("grand prix gp circuit international autodromo nazionale di de del do the of street park ring raceway speedway city f1 formula one race track jose carlos pace hermanos rodriguez gilles villeneuve enzo dino ferrari internacional strip bull road national lake corniche".split(" "));
  const EXTRA = {
    silverstone: ["uk", "britain", "great britain", "england"], americas: ["cota", "usa", "us", "united states", "austin", "texas"],
    miami: ["usa", "us"], vegas: ["las vegas", "vegas", "usa", "us"], catalunya: ["barcelona", "spain"], madring: ["madrid"],
    villeneuve: ["montreal", "canada"], interlagos: ["brazil", "sao paulo"], rodriguez: ["mexico"], yas_marina: ["abu dhabi", "yas"],
    red_bull_ring: ["austria", "spielberg"], hungaroring: ["hungary", "budapest"], zandvoort: ["netherlands", "holland", "dutch"],
    imola: ["emilia romagna", "san marino"], albert_park: ["melbourne", "australia"], marina_bay: ["singapore"], baku: ["azerbaijan"],
    jeddah: ["saudi", "saudi arabia"], bahrain: ["sakhir"], losail: ["qatar", "lusail"], shanghai: ["china"], suzuka: ["japan"],
    spa: ["belgium", "spa francorchamps"], monza: ["italy"], monaco: ["monte carlo"],
  };
  function aliasesFor(race) {
    const out = new Set();
    const add = (t) => { t = norm(t); if (t && t.length > 1 && !STOP.has(t)) out.add(t); };
    const rn = norm(race.raceName);
    add(rn.replace(/ grand prix.*$/, ""));
    const inPart = rn.split(" grand prix in ")[1]; if (inPart) add(inPart);
    add(race.Circuit.circuitId.replace(/_/g, " "));
    add(race.Circuit.Location.locality); add(race.Circuit.Location.country);
    add(race.Circuit.circuitName);
    norm(race.Circuit.circuitName).split(" ").filter((w) => w.length >= 4).forEach(add);
    (EXTRA[race.Circuit.circuitId] || []).forEach(add);
    return [...out];
  }
  function matchRace(races, s) {
    let best = null;
    for (const race of races) {
      for (const a of aliasesFor(race)) {
        if (s.includes(" " + a + " ") && (!best || a.length > best.len)) best = { race, len: a.length };
      }
    }
    if (!best) return null;
    // Several races can share a short alias ("usa"): prefer the one closest to today.
    const tied = races.filter((r) => aliasesFor(r).some((a) => a.length === best.len && s.includes(" " + a + " ")));
    const now = Date.now();
    tied.sort((a, b) => Math.abs(raceTime(a) - now) - Math.abs(raceTime(b) - now));
    return tied[0];
  }

  // ---------------------------------------------------------------- data (cached inside Violentmonkey)
  // Jolpica and OpenF1 are free services with rate limits, and the card and the home widget can run on every search
  // and new tab. So every answer is saved and shared by all tabs: a session that is running or just ended for
  // 10 minutes, a finished session with results for 30 days, the calendar and meeting lists for 6 hours, standings
  // for 1 hour. Requests to each service are spaced out, two parts of the page asking for the same thing share one
  // request, and after a "too many requests" answer every tab leaves that service alone for at least a minute and
  // shows the last saved answer if there is one.
  const TTL = { schedule: 6 * 3600e3, standings: 3600e3, past: 30 * 86400e3, fresh: 10 * 60e3, meetings: 6 * 3600e3 };
  const STALE = 7 * 86400e3;   // expired answers are kept this long, only for when a service is busy or unreachable
  const cacheEntry = (url) => GM_getValue("cache", {})[url] || null;
  function cacheGet(url) { const e = cacheEntry(url); return e && Date.now() < e.until ? e.data : null; }
  function cachePut(url, data, ttl) {
    const c = GM_getValue("cache", {}); const now = Date.now();
    for (const k of Object.keys(c)) if (c[k].until + STALE < now) delete c[k];
    c[url] = { data, until: now + ttl, at: now };
    const keys = Object.keys(c).sort((a, b) => c[b].at - c[a].at);
    for (const k of keys.slice(80)) delete c[k];
    GM_setValue("cache", c);
  }
  function fetchJSON(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET", url, anonymous: true, timeout: 12000, headers: { Accept: "application/json" },
        onload: (r) => {
          if (r.status === 429) {
            const e = new Error("busy"), m = /^retry-after:\s*(\d+)/im.exec(r.responseHeaders || "");
            e.limited = true; e.wait = m ? +m[1] * 1000 : 0;
            return reject(e);
          }
          if (r.status >= 400) return reject(new Error("HTTP " + r.status));
          try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(new Error("bad data")); }
        },
        onerror: () => reject(new Error("offline")), ontimeout: () => reject(new Error("offline")),
      });
    });
  }
  // Jolpica allows about 4 requests a second and OpenF1 about 3: space each one's requests out.
  const GAP = { jolpica: 300, openf1: 400 }, nextAt = { jolpica: 0, openf1: 0 };
  const serviceOf = (url) => (url.startsWith(OPENF1) ? "openf1" : "jolpica");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const slot = (sv) => { const now = Date.now(), at = Math.max(now, nextAt[sv]); nextAt[sv] = at + GAP[sv]; return sleep(at - now); };
  const pausedUntil = (sv) => GM_getValue("pause", {})[sv] || 0;
  function pause(sv, ms) { const p = GM_getValue("pause", {}); p[sv] = Date.now() + Math.min(3600e3, Math.max(60e3, ms)); GM_setValue("pause", p); }
  const inFlight = new Map();
  // ttl: how long to keep the answer, or a function that picks it from the answer.
  function getJSON(url, ttl) {
    const hit = cacheGet(url);
    if (hit) return Promise.resolve(hit);
    if (!inFlight.has(url)) inFlight.set(url, load(url, ttl).finally(() => inFlight.delete(url)));
    return inFlight.get(url);
  }
  async function load(url, ttl) {
    const sv = serviceOf(url);
    for (let attempt = 0; ; attempt++) {
      try {
        if (Date.now() < pausedUntil(sv)) throw new Error("busy");
        await slot(sv);
        const data = await fetchJSON(url);
        const keep = typeof ttl === "function" ? ttl(data) : ttl;
        if (keep) cachePut(url, data, keep);
        return data;
      } catch (e) {
        if (e.limited) {
          // A short burst limit clears in a second or two: try twice more. Otherwise leave the service alone.
          if (attempt < 2 && e.wait <= 5000) { await sleep(Math.max(e.wait, 1200 * (attempt + 1))); continue; }
          pause(sv, e.wait);
        }
        const old = (e.message === "busy" || e.message === "offline") && cacheEntry(url);
        if (old) return old.data;
        throw e;
      }
    }
  }
  const seasonSchedule = (season) => getJSON(JOLPICA + season + ".json?limit=40", TTL.schedule).then((d) => d.MRData.RaceTable.Races);
  const raceTime = (r) => Date.parse(r.date + "T" + (r.time || "14:00:00Z"));

  const SESSION_DEFS = [
    ["FirstPractice", "FP1", "Practice 1", 60], ["SecondPractice", "FP2", "Practice 2", 60], ["ThirdPractice", "FP3", "Practice 3", 60],
    ["SprintQualifying", "SQ", "Sprint Qualifying", 45], ["SprintShootout", "SQ", "Sprint Shootout", 45],
    ["Sprint", "S", "Sprint", 60], ["Qualifying", "Q", "Qualifying", 60],
  ];
  const SHORT = { FP1: "FP1", FP2: "FP2", FP3: "FP3", SQ: "Sprint Q", S: "Sprint", Q: "Quali", R: "Race" };
  const LONG = { FP1: "Practice 1", FP2: "Practice 2", FP3: "Practice 3", SQ: "Sprint Qualifying", S: "Sprint", Q: "Qualifying", R: "Race" };
  function buildEvent(race) {
    const sessions = [];
    for (const [key, code, label, mins] of SESSION_DEFS) {
      if (race[key] && race[key].date) {
        const start = Date.parse(race[key].date + "T" + (race[key].time || "12:00:00Z"));
        sessions.push({ code, label, start, end: start + mins * 60e3 });
      }
    }
    const rs = raceTime(race);
    sessions.push({ code: "R", label: "Race", start: rs, end: rs + 120 * 60e3 });
    sessions.sort((a, b) => a.start - b.start);
    return {
      race, season: +race.season, round: +race.round, name: race.raceName, circuitId: race.Circuit.circuitId,
      circuit: race.Circuit.circuitName, place: race.Circuit.Location.locality + ", " + race.Circuit.Location.country,
      sessions, first: sessions[0].start, last: sessions[sessions.length - 1].end, sprint: sessions.some((x) => x.code === "S"),
    };
  }

  // Results rows: { pos, name, short, team, teamId, colour, cells: [..], note }
  const fmtLap = (sec) => { if (sec == null || isNaN(sec)) return ""; const m = Math.floor(sec / 60), s = (sec - m * 60).toFixed(3).padStart(6, "0"); return m ? m + ":" + s : s; };
  const fmtTotal = (sec) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = (sec % 60).toFixed(3).padStart(6, "0"); return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + s; };
  const driverName = (d) => ({ name: d.givenName + " " + d.familyName, short: d.givenName[0] + ". " + d.familyName, code: d.code || "", last: d.familyName });

  async function jolpicaSession(ev, code) {
    const kind = code === "Q" ? "qualifying" : code === "S" ? "sprint" : "results";
    const url = JOLPICA + ev.season + "/" + ev.round + "/" + kind + ".json?limit=40";
    const ses = ev.sessions.find((x) => x.code === code), done = Date.now() > (ses ? ses.end : ev.last) + 6 * 3600e3;
    const d = await getJSON(url, (a) => (done && a.MRData.RaceTable.Races.length ? TTL.past : TTL.fresh));
    const race = d.MRData.RaceTable.Races[0];
    if (!race) return null;
    const list = race.QualifyingResults || race.SprintResults || race.Results || [];
    if (!list.length) return null;
    if (code === "Q") {
      return { cols: ["Q1", "Q2", "Q3"], dim: [0, 1], narrowHide: 0, rows: list.map((r) => Object.assign(driverName(r.Driver), {
        pos: r.position, team: r.Constructor.name, teamId: r.Constructor.constructorId, cells: [r.Q1 || "", r.Q2 || "", r.Q3 || ""] })) };
    }
    return { cols: ["Time", "Pts"], dim: [], rows: list.map((r) => Object.assign(driverName(r.Driver), {
      num: r.number, pos: /^\d+$/.test(r.positionText) ? r.positionText : ({ R: "DNF", D: "DSQ", W: "DNS", N: "NC", E: "EX", F: "DNQ" }[r.positionText] || r.positionText),
      team: r.Constructor.name, teamId: r.Constructor.constructorId,
      cells: [r.Time ? (r.position === "1" ? r.Time.time : r.Time.time) : r.status, r.points === "0" ? "" : r.points],
      fastest: r.FastestLap && r.FastestLap.rank === "1" })) };
  }

  async function openf1Meeting(ev) {
    if (ev.season < 2023) return null;
    const meetings = await getJSON(OPENF1 + "meetings?year=" + ev.season, TTL.meetings);
    const target = ev.first;
    const m = meetings.filter((x) => Math.abs(Date.parse(x.date_start) - target) < 4 * 86400e3)
      .sort((a, b) => Math.abs(Date.parse(a.date_start) - target) - Math.abs(Date.parse(b.date_start) - target))[0];
    return m ? m.meeting_key : null;
  }
  const OF1_NAMES = { FP1: ["Practice 1"], FP2: ["Practice 2"], FP3: ["Practice 3"], SQ: ["Sprint Qualifying", "Sprint Shootout"], S: ["Sprint"], Q: ["Qualifying"], R: ["Race"] };
  async function openf1SessionInfo(ev, code) {
    const mk = await openf1Meeting(ev);
    if (!mk) return null;
    const sessions = await getJSON(OPENF1 + "sessions?meeting_key=" + mk, TTL.meetings);
    return sessions.find((x) => OF1_NAMES[code].includes(x.session_name)) || null;
  }
  // Tyre stints per car number, e.g. { 16: [{ c: "SOFT", a: 1, b: 15 }, { c: "HARD", a: 16, b: 58 }] }, plus the lap count.
  async function tyreStints(ev, code) {
    if (ev.season < 2023) return null;
    const ses = await openf1SessionInfo(ev, code);
    if (!ses) return null;
    const done = Date.now() > Date.parse(ses.date_end) + 6 * 3600e3;
    const list = await getJSON(OPENF1 + "stints?session_key=" + ses.session_key, (a) => (done && a.length ? TTL.past : TTL.fresh));
    if (!list.length) return null;
    const by = {}; let laps = 0;
    list.slice().sort((x, y) => x.stint_number - y.stint_number).forEach((st) => {
      const a = st.lap_start || 1, b = st.lap_end || a, c = st.compound || "UNKNOWN", age = st.tyre_age_at_start;
      laps = Math.max(laps, b);
      const mine = by[st.driver_number] = by[st.driver_number] || [], prev = mine[mine.length - 1];
      // OpenF1 sometimes splits one set of tyres into several stints (red flags, data gaps): same compound and the
      // tyre age carries on, so join them back into one segment.
      if (prev && prev.c === c && age != null && prev.age != null && age === prev.age + (prev.b - prev.a + 1)) { prev.b = b; return; }
      mine.push({ c, a, b, age });
    });
    return { by, laps };
  }
  async function openf1Session(ev, code) {
    const ses = await openf1SessionInfo(ev, code);
    if (!ses) return null;
    const done = Date.now() > Date.parse(ses.date_end) + 6 * 3600e3;
    const [res, drivers] = await Promise.all([
      getJSON(OPENF1 + "session_result?session_key=" + ses.session_key, (a) => (done && a.length ? TTL.past : TTL.fresh)),
      getJSON(OPENF1 + "drivers?session_key=" + ses.session_key, (a) => (a.length ? TTL.past : TTL.fresh)),
    ]);
    if (!res.length) return null;
    const byNum = {}; drivers.forEach((d) => { byNum[d.driver_number] = d; });
    const name = (n) => { const d = byNum[n] || {}; const last = (d.last_name || "").replace(/^./, (c) => c.toUpperCase()); return { name: (d.first_name || "") + " " + last, short: (d.first_name || "?")[0] + ". " + last, code: d.name_acronym || "", team: d.team_name || "", colour: d.team_colour ? "#" + d.team_colour : "", last, num: n }; };
    const status = (r) => (r.dsq ? "DSQ" : r.dns ? "DNS" : r.dnf ? "DNF" : "");
    res.sort((a, b) => (a.position || 99) - (b.position || 99));
    if (code === "Q" || code === "SQ") {
      return { cols: code === "Q" ? ["Q1", "Q2", "Q3"] : ["SQ1", "SQ2", "SQ3"], dim: [0, 1], narrowHide: 0, rows: res.map((r) => Object.assign(name(r.driver_number), {
        pos: r.position || status(r) || "–", cells: [0, 1, 2].map((i) => (Array.isArray(r.duration) ? fmtLap(r.duration[i]) : "")) })) };
    }
    if (code === "R" || code === "S") {
      return { cols: ["Time", "Laps"], dim: [1], rows: res.map((r) => Object.assign(name(r.driver_number), {
        pos: r.position || status(r) || "–",
        cells: [status(r) || (r.position === 1 ? fmtTotal(r.duration) : typeof r.gap_to_leader === "number" ? "+" + r.gap_to_leader.toFixed(3) : String(r.gap_to_leader || "")), r.number_of_laps || ""] })) };
    }
    return { cols: ["Best", "Gap", "Laps"], dim: [1, 2], narrowHide: 2, rows: res.map((r) => Object.assign(name(r.driver_number), {
      pos: r.position || status(r) || "–", cells: [fmtLap(r.duration), r.position === 1 ? "" : (typeof r.gap_to_leader === "number" ? "+" + r.gap_to_leader.toFixed(3) : ""), r.number_of_laps || ""] })) };
  }
  async function sessionTable(ev, code) {
    if (code === "Q" || code === "S" || code === "R") {
      const j = await jolpicaSession(ev, code).catch(() => null);
      if (j) return Object.assign(j, { source: "Jolpica-F1" });
    }
    // A busy or unreachable service is reported as such, not as "no results yet".
    const o = await openf1Session(ev, code).catch((e) => { if (e && (e.message === "busy" || e.message === "offline")) throw e; return null; });
    return o ? Object.assign(o, { source: "OpenF1" }) : null;
  }
  async function standingsTable(season, which) {
    const url = JOLPICA + season + "/" + (which === "constructors" ? "constructorstandings" : "driverstandings") + ".json?limit=40";
    const d = await getJSON(url, TTL.standings);
    const list = d.MRData.StandingsTable.StandingsLists[0];
    if (!list) return null;
    if (which === "constructors") {
      return { after: list.round, cols: ["Wins", "Pts"], dim: [0], rows: list.ConstructorStandings.map((c) => ({ pos: c.position, name: c.Constructor.name, short: c.Constructor.name, team: "", teamId: c.Constructor.constructorId, cells: [c.wins, c.points] })) };
    }
    return { after: list.round, cols: ["Wins", "Pts"], dim: [0], rows: list.DriverStandings.map((r) => Object.assign(driverName(r.Driver), {
      pos: r.position, team: (r.Constructors[r.Constructors.length - 1] || {}).name || "", teamId: (r.Constructors[r.Constructors.length - 1] || {}).constructorId, cells: [r.wins, r.points] })) };
  }

  // ---------------------------------------------------------------- time helpers
  const fmtDay = (t) => new Date(t).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const fmtTime = (t) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const fmtRange = (a, b) => {
    const da = new Date(a), db = new Date(b);
    const m = (d) => d.toLocaleDateString(undefined, { month: "short" });
    return da.getMonth() === db.getMonth() ? da.getDate() + "–" + db.getDate() + " " + m(db) : da.getDate() + " " + m(da) + " – " + db.getDate() + " " + m(db);
  };
  function countdown(ms) {
    const m = Math.max(0, Math.round(ms / 60e3)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return d ? d + " d " + h + " h" : h ? h + " h " + mm + " m" : mm + " min";
  }
  function weekendState(ev, now) {
    const live = ev.sessions.find((x) => now >= x.start && now <= x.end);
    if (live) return { kind: "live", session: live };
    const next = ev.sessions.find((x) => x.start > now);
    if (next) return { kind: "next", session: next };
    return { kind: "done" };
  }

  // ---------------------------------------------------------------- UI
  const CSS = `
:host { all: initial; display: block; margin: 0 0 18px; color: inherit; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.card { font: 14px/1.45 var(--sp-font, "Segoe UI", system-ui, sans-serif); color: var(--sp-ink, inherit); border: 1px solid var(--sp-line-strong, rgba(127,127,127,.28)); border-radius: 16px; background: var(--sp-surface, rgba(127,127,127,.05)); container-type: inline-size; overflow: hidden; }
.head { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px 10px; }
.mark { flex: none; display: block; margin-top: 3px; font: 800 12px/1 var(--sp-font, sans-serif); color: var(--sp-accent, #6677fb); border: 1.5px solid currentColor; border-radius: 5px; padding: 3px 5px; }
.ttl { min-width: 0; flex: 1; }
.ttl h2 { margin: 0; font-size: 17px; font-weight: 650; line-height: 1.3; }
.ttl .sub { color: var(--sp-muted, rgba(127,127,127,.9)); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.right { display: flex; align-items: center; gap: 6px; flex: none; }
.pill { font: 600 12px var(--sp-font, sans-serif); padding: 3px 9px; border-radius: 999px; background: var(--sp-surface-2, rgba(127,127,127,.15)); color: var(--sp-ink-2, inherit); white-space: nowrap; }
.pill.live { background: #e10600; color: #fff; }
.pill.live::before { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #fff; margin-right: 6px; vertical-align: 1px; animation: blink 1.2s infinite; }
@keyframes blink { 50% { opacity: .2; } }
.icon { all: unset; cursor: pointer; width: 28px; height: 28px; border-radius: 999px; display: inline-grid; place-items: center; color: var(--sp-ink-2, inherit); }
.icon:hover { background: var(--sp-surface-2, rgba(127,127,127,.14)); }
.icon svg { width: 16px; height: 16px; }
.icon.chev svg { transition: transform .15s; }
.card.collapsed .icon.chev svg { transform: rotate(-90deg); }
.card.collapsed .tabs, .card.collapsed .pane, .card.collapsed .foot { display: none; }
.tabs { display: flex; gap: 5px; padding: 0 16px 10px; overflow-x: auto; scrollbar-width: none; }
.tabs.scrolls { -webkit-mask-image: linear-gradient(to right, #000 85%, transparent); mask-image: linear-gradient(to right, #000 85%, transparent); }
.tabs::-webkit-scrollbar { display: none; }
.tab { all: unset; cursor: pointer; flex: none; font: 600 12.5px var(--sp-font, sans-serif); padding: 5px 10px; border-radius: 999px; border: 1px solid var(--sp-line-strong, rgba(127,127,127,.3)); color: var(--sp-ink-2, inherit); }
.tab:hover { border-color: var(--sp-accent, #6677fb); color: var(--sp-ink, inherit); }
.tab[aria-selected="true"] { background: var(--sp-accent, #6677fb); border-color: var(--sp-accent, #6677fb); color: var(--sp-bg, #fff); }
.tab.sep { margin-left: 6px; }
.icon:focus-visible, .tab:focus-visible, .more:focus-visible, a:focus-visible { outline: 2px solid var(--sp-accent, #6677fb); outline-offset: 2px; }
.pane { border-top: 1px solid var(--sp-line, rgba(127,127,127,.2)); }
.msg { padding: 14px 16px; color: var(--sp-ink-2, inherit); }
.msg b { color: var(--sp-ink, inherit); }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
th { font: 600 11px var(--sp-font, sans-serif); letter-spacing: .05em; text-transform: uppercase; color: var(--sp-muted, inherit); text-align: right; padding: 8px 10px 6px; }
th:first-child, th.l { text-align: left; }
td { padding: 6px 10px; border-top: 1px solid var(--sp-line, rgba(127,127,127,.15)); text-align: right; white-space: nowrap; }
td.pos { width: 34px; text-align: center; font-weight: 700; color: var(--sp-ink-2, inherit); }
td.who { text-align: left; white-space: normal; }
td.who .n { font-weight: 600; }
td.who .t { color: var(--sp-muted, inherit); font-size: 12px; }
td.who .bar { display: inline-block; width: 3px; height: 14px; border-radius: 2px; margin-right: 8px; vertical-align: -2px; }
td.who .fl { font: 700 9.5px var(--sp-font, sans-serif); color: #b46cff; border: 1px solid #b46cff; border-radius: 4px; padding: 0 3px; margin-left: 6px; vertical-align: 1px; }
td.who .ph { display: inline-block; width: 24px; height: 24px; border-radius: 50%; vertical-align: middle; margin: -4px 8px -3px 0; object-fit: cover; background: var(--sp-surface-2, rgba(127,127,127,.15)); }
td.who span.ph { display: inline-grid; place-items: center; font: 700 9px/1 var(--sp-font, sans-serif); color: var(--sp-muted, inherit); }
img.lg { display: inline-block; width: 18px; height: 12px; object-fit: contain; vertical-align: -1px; margin-right: 4px; filter: drop-shadow(0 0 1px rgba(0,0,0,.6)); }
td.who.team img.lg { width: 26px; height: 17px; margin-right: 9px; vertical-align: -4px; }
th.ty, td.ty { text-align: left; width: 1%; padding-left: 4px; }
.stints { display: inline-flex; gap: 1px; width: 100px; height: 12px; border-radius: 3px; overflow: hidden; vertical-align: -1px; }
.stints i { display: block; height: 100%; font: 700 9px/12px var(--sp-font, sans-serif); font-style: normal; color: #fff; text-shadow: 0 0 2px rgba(0,0,0,.95), 0 0 1px #000; text-align: center; overflow: hidden; }
.tyre-key { display: inline-flex; gap: 9px; align-items: center; }
.tyre-key i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
td.dim { color: var(--sp-muted, inherit); }
tr.extra { display: none; }
.all tr.extra { display: table-row; }
tbody tr:hover td { background: var(--sp-surface-2, rgba(127,127,127,.07)); }
@container (max-width: 520px) { td.who .t { display: block; } .hide-narrow { display: none; } }
@container (min-width: 521px) { td.who .t::before { content: " · "; } }
.more { all: unset; cursor: pointer; display: block; width: 100%; text-align: center; padding: 9px; font: 600 13px var(--sp-font, sans-serif); color: var(--sp-ink-2, inherit); border-top: 1px solid var(--sp-line, rgba(127,127,127,.2)); }
.more:hover { color: var(--sp-accent, #6677fb); }
.sched td { text-align: left; }
.sched td.when { color: var(--sp-ink-2, inherit); }
.sched td.st { text-align: right; color: var(--sp-muted, inherit); }
.sched tr.now td { color: var(--sp-ink, inherit); }
.sched tr.now td.st { color: #e10600; font-weight: 700; }
.sched tr.next td.st { color: var(--sp-accent, #6677fb); font-weight: 600; }
.sched tr.done td { color: var(--sp-muted, inherit); }
.subtabs { display: flex; gap: 6px; padding: 10px 16px 4px; }
.foot { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 8px 16px 10px; border-top: 1px solid var(--sp-line, rgba(127,127,127,.2)); font-size: 11.5px; color: var(--sp-muted, inherit); }
.foot a { color: var(--sp-accent, #6677fb); text-decoration: none; font-weight: 600; }
.foot a:hover { text-decoration: underline; }
.foot .live { color: #e10600; font-weight: 700; }
.opts { display: grid; gap: 10px; padding: 10px 16px 12px; border-top: 1px solid var(--sp-line, rgba(127,127,127,.2)); font-size: 13px; color: var(--sp-ink-2, inherit); }
.card.collapsed .opts { display: none; }
.opts .row { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.opts .seg { display: inline-flex; gap: 3px; padding: 3px; border-radius: 999px; background: var(--sp-surface-2, rgba(127,127,127,.12)); flex: none; }
.opts .seg button { all: unset; cursor: pointer; padding: 3px 10px; border-radius: 999px; font: 600 12px var(--sp-font, sans-serif); color: var(--sp-ink-2, inherit); }
.opts .seg button[aria-pressed="true"] { background: var(--sp-accent, #6677fb); color: var(--sp-bg, #fff); }
.opts input[type=checkbox] { appearance: none; -webkit-appearance: none; flex: none; width: 36px; height: 20px; margin: 0; border-radius: 999px; position: relative; cursor: pointer; background: var(--sp-line-strong, rgba(127,127,127,.4)); transition: background .15s; }
.opts input[type=checkbox]::after { content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: var(--sp-ink, #fff); transition: transform .15s; }
.opts input[type=checkbox]:checked { background: var(--sp-accent, #6677fb); }
.opts input[type=checkbox]:checked::after { transform: translateX(16px); background: var(--sp-bg, #fff); }
.opts .off { font-size: 12px; color: var(--sp-muted, inherit); }
.opts .offbtn { all: unset; cursor: pointer; flex: none; font: 600 12.5px var(--sp-font, sans-serif); color: var(--sp-ink-2, inherit); padding: 4px 11px; border-radius: 999px; border: 1px solid var(--sp-line-strong, rgba(127,127,127,.3)); }
.opts .offbtn:hover { border-color: var(--sp-accent, #6677fb); color: var(--sp-ink, inherit); }
.opts button:focus-visible, .opts input:focus-visible { outline: 2px solid var(--sp-accent, #6677fb); outline-offset: 2px; }
.icon.gear[aria-expanded="true"] { background: var(--sp-surface-2, rgba(127,127,127,.14)); color: var(--sp-ink, inherit); }
.skel { padding: 12px 16px 14px; display: grid; gap: 9px; }
.skel i { display: block; height: 11px; border-radius: 6px; background: var(--sp-surface-2, rgba(127,127,127,.15)); }
.skel i:nth-child(2) { width: 85%; } .skel i:nth-child(3) { width: 70%; }
@media (prefers-reduced-motion: reduce) { .pill.live::before { animation: none; } }
`;
  const ICON = {
    logo: '<span class="mark" role="img" aria-label="Formula 1">F1</span>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  };

  // Above the web results: before Startpage's list, or at the top of SearXNG's (its results page is a grid)
  function resultsSlot() {
    if (SP) { const l = $(".w-gl"); return l && l.parentNode ? [l.parentNode, l] : null; }
    const u = $("#urls"); return u ? [u, u.firstChild] : null;
  }
  // SearXNG's selected category tab (a button, or a ticked box when it searches only on the magnifier); general = web
  function sxCategory() {
    const b = $("#categories .category_button.selected, #categories input[type=checkbox]:checked");
    const name = b ? b.name.replace(/^category_/, "") : (new URLSearchParams(location.search).get("categories") || "").split(",")[0];
    return !name || name === "general" ? "web" : name;
  }

  let host = null, root = null;
  function mount() {
    if (host && host.isConnected) return true;
    if (!resultsSlot()) return false;
    host = document.createElement("div"); host.id = "sp-f1-widget";
    root = host.attachShadow({ mode: "closed" });
    const st = document.createElement("style"); st.textContent = CSS;
    const card = document.createElement("section"); card.className = "card"; card.setAttribute("aria-label", "Formula 1");
    root.append(st, card);
    place();
    new MutationObserver(() => { if (host && !host.isConnected) requestAnimationFrame(place); }).observe(document.documentElement, { childList: true, subtree: true });
    return true;
  }
  function place() {
    if (!host || host.isConnected) return;
    const ai = document.getElementById("sp-instant-answer");                // sit above the Instant Answer when both show
    if (ai && ai.isConnected) { ai.parentNode.insertBefore(host, ai); return; }
    const at = resultsSlot();
    if (at) at[0].insertBefore(host, at[1]);
  }
  const card = () => root.querySelector(".card");
  function remove() { if (host) { host.remove(); host = null; } }

  const cellClass = (t, ci) => [(t.dim || []).includes(ci) ? "dim" : "", ci === t.narrowHide ? "hide-narrow" : ""].join(" ").trim();
  function rowsHTML(table, showAllInit) {
    const s = settings();
    const many = table.rows.length > ROWS;
    const colour = (r) => r.colour || TEAM_COLOUR[r.teamId] || "#888";
    const img = (src, cls) => '<img class="' + cls + '" alt="" src="' + esc(src) + '">';
    // Photos only when most drivers in the table have one (older seasons fall back to the plain list).
    const photos = s.photos && !table.constructors;
    const who = (r) => {
      const logo = teamLogo(r, s), bar = '<span class="bar" style="background:' + esc(colour(r)) + '"></span>';
      if (table.constructors) return '<td class="who team">' + bar + (logo ? img(logo, "lg") : "") + '<span class="n">' + esc(r.name) + "</span></td>";
      const ph = !photos ? "" : '<span class="ph" aria-hidden="true" style="background:' + esc(colour(r)) + ";color:" + inkOn(colour(r)) + '">' + esc(initials(r)) + "</span>";
      return '<td class="who">' + bar + ph + '<span class="n">' + esc(r.name) + "</span>" + (r.fastest ? '<span class="fl" title="Fastest lap">FL</span>' : "") +
        (r.team ? '<span class="t">' + (logo ? img(logo, "lg") : "") + esc(r.team) + "</span>" : "") + "</td>";
    };
    const body = table.rows.map((r, i) =>
      '<tr class="' + (i >= ROWS ? "extra" : "") + '"' + (r.num != null ? ' data-num="' + esc(r.num) + '"' : "") + '><td class="pos">' + esc(r.pos) + "</td>" + who(r) +
      r.cells.map((c, ci) => '<td class="' + cellClass(table, ci) + '">' + esc(c) + "</td>").join("") + "</tr>").join("");
    const headCells = table.cols.map((c, ci) => '<th class="' + (ci === table.narrowHide ? "hide-narrow" : "") + '">' + esc(c) + "</th>").join("");
    return '<div class="tw' + (showAllInit ? " all" : "") + '"><table><thead><tr><th>Pos</th><th class="l">' + (table.constructors ? "Team" : "Driver") + "</th>" + headCells + "</tr></thead><tbody>" + body + "</tbody></table>" +
      (many ? '<button class="more" type="button">Show all ' + table.rows.length + "</button>" : "") + "</div>";
  }
  function wireMore(pane) {
    const more = pane.querySelector(".more"); if (!more) return;
    more.addEventListener("click", () => { const tw = pane.querySelector(".tw"); const open = tw.classList.toggle("all"); more.textContent = open ? "Show top " + ROWS : "Show all " + pane.querySelectorAll("tbody tr").length; });
  }
  // Tyre strategy: one bar per driver, a segment per stint sized by laps (a short bar means the car retired).
  const TYRE = { SOFT: ["S", "#ff3d3d", "Soft"], MEDIUM: ["M", "#ffd12e", "Medium"], HARD: ["H", "#ececec", "Hard"], INTERMEDIATE: ["I", "#3fb950", "Intermediate"], WET: ["W", "#2f81f7", "Wet"] };
  const tyreOf = (c) => TYRE[c] || ["?", "#777", "Unknown"];
  function stintBar(list, laps) {
    if (!list || !list.length) return "";
    const tip = list.map((x) => tyreOf(x.c)[2] + " laps " + x.a + "–" + x.b).join(" · ") + " · " + list.length + (list.length === 1 ? " set of tyres" : " sets of tyres");
    return '<span class="stints" title="' + esc(tip) + '">' + list.map((x) => {
      const share = (x.b - x.a + 1) / laps, t = tyreOf(x.c);
      return '<i style="width:' + Math.max(4, share * 100).toFixed(1) + "%;background:" + t[1] + '">' + (share >= 0.12 ? t[0] : "") + "</i>";
    }).join("") + "</span>";
  }
  function addTyres(box, st) {
    const table = box.querySelector("table");
    if (!table || !st || table.querySelector(".ty")) return;
    table.querySelector("thead tr").insertAdjacentHTML("beforeend", '<th class="ty hide-narrow">Tyres</th>');
    table.querySelectorAll("tbody tr").forEach((tr) => tr.insertAdjacentHTML("beforeend", '<td class="ty hide-narrow">' + stintBar(st.by[tr.dataset.num], st.laps) + "</td>"));
    const used = new Set(); Object.values(st.by).forEach((l) => l.forEach((x) => used.add(x.c)));
    const legend = Object.keys(TYRE).filter((c) => used.has(c)).map((c) => '<span><i style="background:' + TYRE[c][1] + '"></i>' + TYRE[c][2] + "</span>").join("");
    const foot = root.querySelector(".foot");
    if (foot && legend) foot.insertAdjacentHTML("beforeend", '<span class="tyre-key hide-narrow">' + legend + "</span>");
  }
  const errText = (e) => (e && e.message === "busy" ? "The F1 data service is busy. Try again in a minute." : e && e.message === "offline" ? "Couldn't reach the F1 data service." : "Couldn't load this.");

  // ---------------------------------------------------------------- views
  function shell(title, sub, pillHTML) {
    const s = settings();
    card().classList.toggle("collapsed", !!s.collapsed);
    card().innerHTML =
      '<div class="head">' + ICON.logo + '<div class="ttl"><h2></h2><div class="sub"></div></div>' +
      '<div class="right">' + (pillHTML || "") +
      '<button class="icon gear" type="button" title="Card options" aria-label="Card options" aria-expanded="false">' + ICON.gear + "</button>" +
      '<button class="icon chev" type="button" title="Collapse or expand" aria-label="Collapse or expand">' + ICON.chev + "</button>" +
      '<button class="icon x" type="button" title="Hide for this search" aria-label="Hide for this search">' + ICON.close + "</button></div></div>" +
      '<div class="opts" role="group" aria-label="F1 card options" hidden></div>' +
      '<div class="tabs" role="tablist"></div><div class="pane"></div>' +
      '<div class="foot"><span class="src">Times in your time zone · Data: Jolpica-F1, OpenF1</span></div>';
    root.querySelector("h2").textContent = title;
    root.querySelector(".sub").textContent = sub;
    root.querySelector(".chev").addEventListener("click", () => { const st = settings(); st.collapsed = !card().classList.contains("collapsed"); saveSettings(st); card().classList.toggle("collapsed", st.collapsed); });
    root.querySelector(".x").addEventListener("click", remove);
    wireOptions();
  }

  // Options panel (⚙). Every change is saved and the card redraws in place, on the same tab.
  let optsOpen = false, view = null;
  function wireOptions() {
    const btn = root.querySelector(".gear"), box = root.querySelector(".opts"), s = settings();
    box.innerHTML =
      [["photos", "Driver initials"], ["tyres", "Tyre strategy on race and sprint results"], ["home", "Next-race countdown on the home page"]].map(([k, l]) =>
        '<label class="row"><span>' + l + '</span><input type="checkbox" data-opt="' + k + '"' + (s[k] ? " checked" : "") + "></label>").join("") +
      '<div class="row off"><span>To turn it back on: Violentmonkey icon → F1 card on/off</span><button type="button" class="offbtn">Turn the F1 card off</button></div>';
    const show = (open) => { optsOpen = open; box.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
    show(optsOpen);
    btn.addEventListener("click", () => show(box.hidden));
    const change = (k, v, focusSel) => {
      const st = settings(); st[k] = v; saveSettings(st); redraw();
      const f = root && root.querySelector(focusSel); if (f) f.focus();
    };
    box.querySelectorAll("[data-opt]").forEach((c) => c.addEventListener("change", () => change(c.dataset.opt, c.checked, '[data-opt="' + c.dataset.opt + '"]')));
    box.querySelector(".offbtn").addEventListener("click", () => { const st = settings(); st.enabled = false; saveSettings(st); optsOpen = false; remove(); });
  }
  function redraw() {
    if (!view || !host) return;
    if (view.type === "event") eventView(view.ev, view.q, view.races, view.tab);
    else seasonView(view.season, view.races, view.q, view.tab);
  }
  function setTabs(tabs, active, onPick) {
    const bar = root.querySelector(".tabs"); bar.innerHTML = "";
    tabs.forEach((t) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "tab" + (t.sep ? " sep" : ""); b.setAttribute("role", "tab");
      b.textContent = t.label; b.dataset.id = t.id; b.setAttribute("aria-selected", String(t.id === active));
      b.addEventListener("click", () => { bar.querySelectorAll(".tab").forEach((x) => x.setAttribute("aria-selected", String(x === b))); onPick(t.id); });
      bar.append(b);
    });
    requestAnimationFrame(() => bar.classList.toggle("scrolls", bar.scrollWidth > bar.clientWidth + 2));
    const act = bar.querySelector('[aria-selected="true"]'); if (act) act.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  const pane = () => root.querySelector(".pane");
  const loading = () => { pane().innerHTML = '<div class="skel"><i></i><i></i><i></i></div>'; };

  async function showSession(ev, code) {
    loading();
    const ses = ev.sessions.find((x) => x.code === code);
    const now = Date.now();
    if (ses && now < ses.start) { pane().innerHTML = '<div class="msg"><b>' + esc(ses.label) + "</b> starts " + esc(fmtDay(ses.start)) + ", " + esc(fmtTime(ses.start)) + " (in " + esc(countdown(ses.start - now)) + ").</div>"; return; }
    try {
      const t = await sessionTable(ev, code);
      if (!t) {
        const liveNow = ses && now <= ses.end + 30 * 60e3;
        pane().innerHTML = '<div class="msg">' + (liveNow
          ? "<b>" + esc(ses.label) + " is on now.</b> Results appear here shortly after it ends."
          : ev.season < 2023 && /^(FP|SQ)/.test(code) ? "Practice and sprint-qualifying results aren't available for seasons before 2023." : "No results published for this session yet.") + "</div>";
        return;
      }
      pane().innerHTML = rowsHTML(t, false);
      wireMore(pane());
      root.querySelector(".src").textContent = "Times in your time zone · Data: " + t.source;
      if ((code === "R" || code === "S") && settings().tyres) {
        const box = pane().querySelector(".tw");
        tyreStints(ev, code).then((st) => { if (box.isConnected) addTyres(box, st); }).catch(() => { /* tyres are optional */ });
      }
    } catch (e) { pane().innerHTML = '<div class="msg">' + esc(errText(e)) + "</div>"; }
  }
  function showSchedule(ev) {
    const now = Date.now();
    const nextIdx = ev.sessions.findIndex((x) => x.end >= now);
    pane().innerHTML = '<table class="sched"><tbody>' + ev.sessions.map((x, i) => {
      const cls = now >= x.start && now <= x.end ? "now" : i === nextIdx ? "next" : x.end < now ? "done" : "";
      const st = cls === "now" ? "LIVE" : cls === "next" ? "in " + countdown(x.start - now) : cls === "done" ? "Done" : "";
      return '<tr class="' + cls + '"><td><b>' + esc(x.label) + '</b></td><td class="when">' + esc(fmtDay(x.start)) + "</td><td class=\"when\">" + esc(fmtTime(x.start)) + '</td><td class="st">' + esc(st) + "</td></tr>";
    }).join("") + "</tbody></table>";
  }
  async function showStandings(season, which, hostPane, noSubtabs) {
    const p = hostPane || pane();
    p.innerHTML = '<div class="subtabs"></div><div class="tbl"><div class="skel"><i></i><i></i><i></i></div></div>';
    const sub = p.querySelector(".subtabs");
    if (noSubtabs) sub.remove();
    else [["drivers", "Drivers"], ["constructors", "Constructors"]].forEach(([id, label]) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "tab"; b.textContent = label; b.setAttribute("aria-selected", String(id === which));
      b.addEventListener("click", () => showStandings(season, id, p)); sub.append(b);
    });
    try {
      const t = await standingsTable(season, which);
      const box = p.querySelector(".tbl");
      if (!t) { box.innerHTML = '<div class="msg">No standings yet for ' + season + ".</div>"; return; }
      t.constructors = which === "constructors";
      box.innerHTML = rowsHTML(t, false); wireMore(box);
      root.querySelector(".src").textContent = "After round " + t.after + " · Data: Jolpica-F1";
    } catch (e) { p.querySelector(".tbl").innerHTML = '<div class="msg">' + esc(errText(e)) + "</div>"; }
  }
  function showCalendar(races) {
    const now = Date.now();
    const nextIdx = races.findIndex((r) => raceTime(r) + 2 * 3600e3 > now);
    const from = Math.max(0, (nextIdx < 0 ? races.length : nextIdx) - 2);
    pane().innerHTML = '<div class="tw"><table class="sched"><tbody>' + races.map((r, i) => {
      const ev = buildEvent(r);
      const cls = i === nextIdx ? "next" : raceTime(r) < now ? "done" : "";
      const st = i === nextIdx ? (now >= ev.first ? "This weekend" : "in " + countdown(ev.first - now)) : cls === "done" ? "Done" : "";
      return '<tr class="' + cls + (i < from || i > from + 7 ? " extra" : "") + '"><td class="pos">' + esc(r.round) + "</td><td><b>" + esc(r.raceName.replace(/ Grand Prix/, " GP")) + '</b></td><td class="when">' + esc(fmtRange(ev.first, ev.last)) + '</td><td class="st">' + esc(st) + "</td></tr>";
    }).join("") + '</tbody></table><button class="more" type="button">Show full calendar</button></div>';
    const more = pane().querySelector(".more");
    more.addEventListener("click", () => { const tw = pane().querySelector(".tw"); const open = tw.classList.toggle("all"); more.textContent = open ? "Show less" : "Show full calendar"; });
  }

  function eventView(ev, q, races, tab) {
    view = { type: "event", ev, q, races, tab };
    const now = Date.now();
    const state = weekendState(ev, now);
    const pill = state.kind === "live" ? '<span class="pill live">' + esc(LONG[state.session.code]) + "</span>"
      : state.kind === "next" ? '<span class="pill">' + esc(LONG[state.session.code]) + " in " + esc(countdown(state.session.start - now)) + "</span>"
      : '<span class="pill">Finished</span>';
    shell(ev.name + " " + ev.season, "Round " + ev.round + " · " + ev.circuit + " · " + fmtRange(ev.first, ev.last), pill);
    if (state.kind === "live") {
      const f = root.querySelector(".foot");
      const a = document.createElement("span"); a.innerHTML = '<span class="live">● Live now</span>';
      f.prepend(a);
    }
    const tabs = ev.sessions.map((x) => ({ id: x.code, label: SHORT[x.code] }));
    tabs.push({ id: "sched", label: "Schedule", sep: true }, { id: "stand", label: "Standings" });
    if (races) tabs.push({ id: "cal", label: "Calendar" });
    // Default tab: what was asked for, else the latest session that has started, else the schedule.
    let active;
    if (q.standings) active = "stand";
    else if (q.calendar) active = "cal";
    else if (q.schedule || q.next) active = "sched";
    else if (q.session === "FP") { const p = ev.sessions.filter((x) => /^FP/.test(x.code) && x.start <= now).pop(); active = p ? p.code : "sched"; }
    else if (q.session && ev.sessions.some((x) => x.code === q.session)) active = q.session;
    else { const started = ev.sessions.filter((x) => x.start <= now).pop(); active = started ? started.code : "sched"; }
    if (tab) active = tab;
    if (!tabs.some((t) => t.id === active)) active = "sched";
    const pick = (id) => {
      view.tab = id;
      root.querySelectorAll(".tyre-key").forEach((k) => k.remove());
      root.querySelector(".src").textContent = "Times in your time zone · Data: Jolpica-F1, OpenF1";
      if (id === "sched") showSchedule(ev);
      else if (id === "stand") showStandings(ev.season, q.standings || "drivers");
      else if (id === "cal") seasonSchedule(ev.season).then(showCalendar).catch((e) => { pane().innerHTML = '<div class="msg">' + esc(errText(e)) + "</div>"; });
      else showSession(ev, id);
    };
    setTabs(tabs, active, pick);
    pick(active);
  }

  function seasonView(season, races, q, tab) {
    view = { type: "season", season, races, q, tab };
    const now = Date.now();
    const next = races.find((r) => raceTime(r) + 2 * 3600e3 > now);
    const nextEv = next && buildEvent(next);
    const st = nextEv && weekendState(nextEv, now);
    const pill = st && st.kind === "live" ? '<span class="pill live">' + esc(LONG[st.session.code]) + "</span>" : "";
    const done = races.filter((r) => raceTime(r) + 2 * 3600e3 <= now).length;
    shell("Formula 1 " + season, done + " of " + races.length + " races done" + (nextEv ? " · Next: " + nextEv.name.replace(/ Grand Prix/, " GP") + (now >= nextEv.first ? " (this weekend)" : " in " + countdown(nextEv.first - now)) : ""), pill);
    const active = tab || (q.calendar ? "cal" : q.standings === "constructors" ? "constructors" : "drivers");
    const pick = (id) => {
      view.tab = id;
      if (id === "cal") { root.querySelector(".src").textContent = "Times in your time zone · Data: Jolpica-F1"; showCalendar(races); }
      else showStandings(season, id, null, true);
    };
    setTabs([{ id: "drivers", label: "Drivers" }, { id: "constructors", label: "Constructors" }, { id: "cal", label: "Calendar" }], active, pick);
    pick(active);
  }

  // ---------------------------------------------------------------- start
  async function start() {
    const s = settings();
    if (!s.enabled) return;
    const box = $("#q") || $("input.search-form-input[name=query]");
    const query = ((box && box.value) || new URLSearchParams(location.search).get("query") || new URLSearchParams(location.search).get("q") || "").trim();
    const cat = SP ? $('#search input[name="cat"]') : { value: sxCategory() };
    if (!query || (cat && cat.value && cat.value !== "web")) return;
    const q = parseQuery(query);
    const intent = q.strong || q.session || q.standings || q.schedule;
    if (!intent || q.words > 7) return;                    // not an F1-looking search: no network at all
    const thisYear = new Date().getFullYear();
    const season = q.year || thisYear;
    let races;
    try { races = await seasonSchedule(season); } catch (e) { return; }
    if (!races.length && !q.year) { try { races = await seasonSchedule(season - 1); } catch (e) { return; } }
    let race = matchRace(races, q.s);
    const matched = !!race;
    if (!race && !q.strong) return;                          // "race condition", "standings" alone: not F1
    if (!mount()) return;
    card().innerHTML = '<div class="skel"><i></i><i></i><i></i></div>';
    const now = Date.now();
    const sessionStarted = (r) => { const ev = buildEvent(r); return ev.sessions.some((x) => (q.session === "FP" ? /^FP/.test(x.code) : x.code === q.session) && x.start <= now); };
    if (race && !q.year && q.session && !sessionStarted(race)) {
      // Asked for results of a Grand Prix that hasn't run that session yet this season: show last year's, like Google.
      const prev = await seasonSchedule(season - 1).catch(() => []);
      const same = prev.find((r) => r.Circuit.circuitId === race.Circuit.circuitId);
      if (same) race = same;
    }
    if (!race) {
      // F1 search without a specific Grand Prix: next race for schedule/next/calendar; for a session, the latest
      // weekend where that session has happened; otherwise the latest weekend.
      const upcoming = races.find((r) => raceTime(r) + 2 * 3600e3 > now);
      const started = races.filter((r) => buildEvent(r).first <= now).pop();
      const withSession = q.session ? races.filter(sessionStarted).pop() : null;
      race = (q.schedule || q.next || q.calendar) ? (upcoming || races[races.length - 1]) : (withSession || started || upcoming || races[0]);
    }
    if (!race) { remove(); return; }
    if (!matched && (q.standings || q.calendar) && !q.session) { seasonView(race.season, races, q); return; }
    eventView(buildEvent(race), q, races);
  }

  // ---------------------------------------------------------------- home page countdown
  // A small pill under the home-page search box: the next (or current) Grand Prix and its next session.
  // Clicking it searches that Grand Prix. Uses only the cached season calendar.
  const HOME_CSS = `
:host { all: initial; display: flex; justify-content: center; margin: 16px 0 0; }
button { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; padding: 7px 15px 7px 13px; border-radius: 999px; font: 13px/1.3 var(--sp-font, "Segoe UI", system-ui, sans-serif); color: var(--sp-ink-2, #c8c8d0); background: var(--sp-surface-2, rgba(127,127,127,.16)); font-variant-numeric: tabular-nums; }
button:hover { color: var(--sp-ink, #fff); box-shadow: inset 0 0 0 1px var(--sp-accent, #6677fb); }
button:focus-visible { outline: 2px solid var(--sp-accent, #6677fb); outline-offset: 2px; }
.mark { flex: none; display: block; font: 800 10px/1 var(--sp-font, sans-serif); color: var(--sp-accent, #6677fb); border: 1.5px solid currentColor; border-radius: 4px; padding: 2px 4px; }
b { color: var(--sp-ink, #fff); font-weight: 600; }
.live { color: #ff4d4d; font-weight: 700; }
`;
  // With the Home script installed this becomes its "Formula 1" widget instead: next race, place, countdown and the
  // weekend's times in your time zone.
  const WIDGET_CSS = `
:host { all: initial; display: block; font: inherit; font-size: inherit; line-height: 1.45; font-family: var(--sp-font, "Segoe UI", system-ui, sans-serif); color: var(--home-ink2, var(--sp-ink-2, #c8c8d0)); }
* { box-sizing: border-box; }
.top { display: flex; align-items: center; gap: .6em; }
.mark { flex: none; display: block; font: 800 .72em/1 var(--sp-font, sans-serif); color: var(--home-acc, var(--sp-accent, #6677fb)); border: 1.5px solid currentColor; border-radius: .3em; padding: .15em .3em; }
button.gp { all: unset; cursor: pointer; font-weight: 600; font-size: 1.1em; color: var(--home-ink, var(--sp-ink, #fff)); }
button.gp:hover { text-decoration: underline; }
button.gp:focus-visible, a:focus-visible { outline: 2px solid var(--home-acc, var(--sp-accent, #6677fb)); outline-offset: 2px; border-radius: 4px; }
.place { color: var(--home-muted, var(--sp-muted, #8a8a94)); font-size: .92em; margin: 1px 0 .6em; }
.state { color: var(--home-ink, var(--sp-ink, #fff)); font-weight: 600; margin-bottom: .45em; font-variant-numeric: tabular-nums; }
.state a { color: var(--home-acc, var(--sp-accent, #6677fb)); font-weight: 400; }
.live { color: #ff4d4d; }
table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; font-size: inherit; color: inherit; }
td { padding: .15em 0; white-space: nowrap; }
td.w { color: var(--home-muted, var(--sp-muted, #8a8a94)); padding-left: .75em; text-align: right; }
tr.done td { opacity: .5; }
tr.next td:first-child, tr.now td:first-child { color: var(--home-acc, var(--sp-accent, #6677fb)); font-weight: 600; }
`;
  let homeStarted = false;
  async function homeCountdown() {
    const s = settings();
    if (!s.enabled || !s.home) return;
    const form = $("#search");
    if (!form || homeStarted) return;
    homeStarted = true;
    const year = new Date().getFullYear();
    let races = await seasonSchedule(year).catch(() => null);
    if (!races) return;
    const upcoming = () => races.find((r) => raceTime(r) + 2 * 3600e3 > Date.now());
    if (!upcoming()) races = await seasonSchedule(year + 1).catch(() => []);
    const race = upcoming();
    if (!race) return;
    const ev = buildEvent(race), name = ev.name.replace(/ Grand Prix/, " GP");
    const pill = document.createElement("div"); pill.id = "sp-f1-home";
    const r = pill.attachShadow({ mode: "closed" });
    r.innerHTML = "<style>" + HOME_CSS + '</style><button type="button"></button>';
    const btn = r.querySelector("button");
    btn.title = "Search " + ev.name + " " + ev.season;
    const paint = () => {
      const now = Date.now(), st = weekendState(ev, now);
      btn.innerHTML = ICON.logo + "<span>" + (st.kind === "live"
        ? '<span class="live">● ' + esc(LONG[st.session.code]) + " live</span> · <b>" + esc(name) + "</b>"
        : st.kind === "next" ? "<b>" + esc(name) + "</b> · " + esc(LONG[st.session.code]) + " in " + esc(countdown(st.session.start - now))
          : "<b>" + esc(name) + "</b> · Finished") + "</span>";
    };
    const searchFor = (text) => {
      const q = $("#q"), f = $("#search"); if (!q || !f) return;
      // Startpage's page keeps its own copy of the box's text; set it the way typing would, then send the form.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(q, text);
      q.dispatchEvent(new Event("input", { bubbles: true }));
      if (f.requestSubmit) f.requestSubmit(); else f.submit();
    };
    btn.addEventListener("click", () => searchFor(ev.name + " " + ev.season));
    // the widget for the Home script
    const widget = document.createElement("div");
    widget.setAttribute("slot", "ext-f1");
    const wr = widget.attachShadow({ mode: "closed" });
    wr.innerHTML = "<style>" + WIDGET_CSS + '</style><div class="w"></div>';
    const w = wr.querySelector(".w");
    const paintWidget = () => {
      const now = Date.now(), st = weekendState(ev, now), nextIdx = ev.sessions.findIndex((x) => x.end >= now);
      w.innerHTML = '<div class="top">' + ICON.logo + '<button type="button" class="gp" title="Search ' + esc(ev.name + " " + ev.season) + '">' + esc(ev.name) + "</button></div>" +
        '<div class="place">' + esc(ev.circuit) + " · " + esc(ev.place) + "</div>" +
        '<div class="state">' + (st.kind === "live" ? '<span class="live">● ' + esc(LONG[st.session.code]) + ' live</span>'
          : st.kind === "next" ? esc(LONG[st.session.code]) + " in " + esc(countdown(st.session.start - now)) : "Weekend finished") + "</div>" +
        "<table>" + ev.sessions.map((x, i) => '<tr class="' + (now >= x.start && now <= x.end ? "now" : i === nextIdx ? "next" : x.end < now ? "done" : "") + '"><td>' + esc(x.label) +
          '</td><td class="w">' + esc(fmtDay(x.start)) + '</td><td class="w">' + esc(fmtTime(x.start)) + "</td></tr>").join("") + "</table>";
      w.querySelector(".gp").addEventListener("click", () => searchFor(ev.name + " " + ev.season));
    };
    paint(); paintWidget(); setInterval(() => { paint(); paintWidget(); }, 30e3);
    const useWidget = () => {
      const home = document.getElementById("sp-home");
      if (!home) return false;
      if (pill.isConnected) pill.remove();
      if (widget.parentElement !== home) home.append(widget);
      window.dispatchEvent(new CustomEvent("sp-home:register", { detail: JSON.stringify({ id: "f1", title: "Formula 1" }) }));
      return true;
    };
    window.addEventListener("sp-home:ready", useWidget);
    // The search box itself is absolutely positioned (for the suggestions list); go after its outer box.
    const put = () => { const f = $("#search"); const anchor = f && ((SP && (f.closest(".search-form-relative-container") || f.closest(".search-form-container"))) || f); if (anchor && !pill.isConnected) anchor.after(pill); };
    if (!useWidget()) put();
    new MutationObserver(() => {
      if (document.getElementById("sp-home")) { if (!widget.isConnected) requestAnimationFrame(useWidget); }
      else if (!pill.isConnected) requestAnimationFrame(put);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  GM_registerMenuCommand("F1 card on/off", () => { const s = settings(); s.enabled = !s.enabled; saveSettings(s); if (!s.enabled) remove(); else start(); });
  const isHome = SP ? /^\/(en\/?)?$/.test(location.pathname) : !!$('meta[name="endpoint"][content="index"]') || document.body.classList.contains("index_endpoint");
  let tries = 0;
  const wait = () => {
    if (isHome) { if ($("#search")) homeCountdown(); else if (tries++ < 40) setTimeout(wait, 100); return; }
    if ($(SP ? ".w-gl .result" : "#urls .result") || tries++ > 40) start(); else setTimeout(wait, 100);
  };
  if (document.readyState === "complete") setTimeout(wait, 50);
  else window.addEventListener("load", () => setTimeout(wait, 50), { once: true });
})();
