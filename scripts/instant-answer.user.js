// ==UserScript==
// @name         Instant Answer for Startpage
// @namespace    blackout-for-startpage/instant-answer
// @version      1.3.0
// @license      MIT
// @description  Instant Answer above Startpage results: a short AI answer built from the results on the page, plus one-page summaries from the Tweaks script's ⋮ menu. Off until you turn it on. Uses OpenCode Go or your local model.
// @match        https://*.startpage.com/sp/search*
// @match        https://*.startpage.com/do/search*
// @match        https://*.startpage.com/do/dsearch*
// @match        https://*.startpage.com/search*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      opencode.ai
// @connect      127.0.0.1
// @connect      localhost
// @connect      *
// @run-at       document-end
// @noframes
// ==/UserScript==

/*
 * How it decides to answer (mode "Smart", the default):
 *   - never: empty, maths ("12*7"), web addresses, site:/filetype: searches, sign-in/download/near-me/lyrics/tickets
 *            searches, and one or two words that are a well-known site ("youtube", "gmail").
 *   - by itself: questions ("...?", how/why/what/which/is/can/should..., "how to", "X vs Y", "difference between",
 *            "meaning of", "pros and cons") and any search of 5+ words.
 *   - otherwise: a small "Ask AI" button, nothing is sent until you click it.
 *   The AI also gets told to answer exactly SKIP when the results don't support a useful answer; the box then shrinks
 *   back to the "Ask AI" button. Startpage's own instant answers (calculator, weather...) also downgrade "by itself"
 *   to the button.
 * What is sent: your search words and the titles + short descriptions of the top results already on the page.
 * Nothing else: no cookies, no page contents, no browsing history. Only to the provider you pick.
 * Summaries ("Summarize this page" in the Tweaks script's ⋮ menu, or the s key) only run when you ask, for that one
 * result: the page is fetched from the site itself without cookies (the site sees your IP, the same as opening it;
 * that is what "@connect *" is for), and its text goes to the same provider.
 */

(function () {
  "use strict";
  if (window.top !== window.self) return;

  // ---------------------------------------------------------------- settings
  const DEFAULTS = {
    enabled: null,                 // null = not chosen yet (one-time invite), false = completely off, true = on
    provider: "opencode",          // "opencode" | "local"
    opencodeKey: "",
    opencodeModel: "",
    localUrl: "http://127.0.0.1:8080/v1",
    localKey: "",
    localModel: "",
    mode: "smart",                 // "smart" | "click" | "always"
    sources: true,                 // show which results the answer used
  };
  const load = () => Object.assign({}, DEFAULTS, GM_getValue("settings", {}));
  const save = (s) => GM_setValue("settings", s);
  let S = load();

  const PROVIDERS = {
    opencode: { label: "OpenCode Go", keyName: "OpenCode Go key", base: () => "https://opencode.ai/zen/go/v1", key: (s) => s.opencodeKey, model: (s) => s.opencodeModel, modelField: "opencodeModel" },
    local: { label: "Local model", keyName: "key for your local model", base: (s) => (s.localUrl || DEFAULTS.localUrl).replace(/\/+$/, ""), key: (s) => s.localKey, model: (s) => s.localModel, modelField: "localModel" },
  };
  // Fast, cheap models are preferred when no model has been picked yet.
  const PREFERRED = [/flash/i, /mini/i, /air/i, /lite/i, /turbo/i, /fast/i, /kimi/i, /glm/i, /deepseek/i];

  // ---------------------------------------------------------------- page reading
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function getQuery() {
    const box = $("#q") || $("input.search-form-input[name=query]");
    if (box && box.value.trim()) return box.value.trim();
    const p = new URLSearchParams(location.search);
    return (p.get("query") || p.get("q") || "").trim();
  }
  function getCategory() {
    const c = $('#search input[name="cat"]');
    if (c && c.value) return c.value;
    return new URLSearchParams(location.search).get("cat") || "web";
  }
  // Reuse Startpage's own favicon only (inline, or served by Startpage); never load icons from the sites themselves.
  function iconOf(img) {
    const src = img && (img.currentSrc || img.src);
    if (!src || !img.complete || img.naturalWidth < 12) return "";       // skip blank lazy-load placeholders
    return (/^data:image\//.test(src) || /^https:\/\/([a-z0-9-]+\.)*startpage\.com\//i.test(src)) ? src : "";
  }
  // Skips Startpage's hidden trap link for bots (the last ".result.h", leading to startpage.com) and sites you hid
  // with the Tweaks script.
  function getResults(limit) {
    return $$(".w-gl .result:not(.h):not([data-spt-hide])").map((r) => {
      const a = $("a.result-title", r) || $("a.result-link", r);
      const t = $(".wgl-title", r);
      if (!a || !t || !/^https?:/i.test(a.href) || /(^|\.)startpage\.com$/i.test(a.hostname)) return null;
      const d = $(".description", r);
      const img = $(".favicon img", r);
      let host = "";
      try { host = new URL(a.href).hostname.replace(/^www\./, ""); } catch (e) { /* keep empty */ }
      return {
        url: a.href,
        title: t.textContent.replace(/\s+/g, " ").trim(),
        snippet: d ? d.textContent.replace(/\s+/g, " ").trim().slice(0, 320) : "",
        host,
        icon: iconOf(img),
        imgEl: img,
      };
    }).filter(Boolean).slice(0, limit);
  }
  // Startpage's own instant answers (calculator, weather, definitions...) sit above the web results.
  function hasInstantAnswer() {
    // The F1 card and the quick-answer cards (timer, dice, colour...) already answer those searches.
    for (const id of ["sp-f1-widget", "sp-quick-widget"]) { const w = document.getElementById(id); if (w && w.isConnected && w.offsetHeight > 40) return true; }
    // Startpage's own answers (weather, time, dictionary, calculator, currency, timer) fill #ee-mainline-top,
    // which is empty on ordinary searches (checked 10 Oct 2026).
    return $$("#ee-mainline-top *").some((e) => e.children.length && e.offsetHeight > 40);
  }

  // ---------------------------------------------------------------- when to answer
  const NAV = new Set(("youtube gmail facebook instagram reddit amazon netflix twitter x github google outlook hotmail " +
    "wikipedia spotify twitch linkedin tiktok whatsapp discord ebay paypal yahoo bing maps translate weather news login " +
    "chatgpt claude proton protonmail tuta tutanota bitwarden startpage duckduckgo brave firefox chrome steam epic " +
    "classroom drive docs sheets calendar teams zoom slack canvas office onedrive dropbox icloud").split(" "));
  const Q_START = /^(what|whats|what's|why|how|when|where|who|whom|whose|which|is|are|was|were|am|can|could|should|would|will|do|does|did|has|have|had|explain|define|definition|describe|compare|difference|meaning|summari[sz]e|summary|tell me|guide to|ways? to|best way|tips? (for|on|to)|steps? to|history of|overview of|eli5)\b/;
  const Q_ANY = /\?\s*$|\b(vs\.?|versus|difference between|how to|what is|what are|meaning of|pros and cons|explained|in simple terms|for beginners|step by step|is it (safe|worth|good|bad|possible|legal)|should i|can i|why does|why do|why is|how does|how do|how much|how many|how long|how often|what happens)\b/;
  const NO_AI = /(^|\s)(site|inurl|intitle|filetype|ext):|^https?:\/\/|^www\.|^\S+\.(com|org|net|io|ca|co|uk|de|fr|nl|app|dev|gov|edu|ai|tv|me|gg|xyz)(\/\S*)?$|\b(login|log in|sign in|signin|sign up|download|near me|open now|coupon|promo code|tickets?|lyrics|torrent)\b/;
  const MATH = /^[\d\s.+\-*/^()%,=x×÷]+$/;

  function classify(query) {
    const s = query.toLowerCase().replace(/\s+/g, " ").trim();
    if (s.length < 2 || MATH.test(s) || NO_AI.test(s)) return "none";
    const words = s.split(" ");
    if (words.length <= 2 && words.every((w) => NAV.has(w.replace(/[^a-z0-9]/g, "")))) return "none";
    if (/^".*"$/.test(s)) return "offer";                       // exact-phrase searches want the raw results
    if (Q_START.test(s) || Q_ANY.test(s)) return "auto";
    if (words.length >= 5) return "auto";
    return "offer";
  }
  function decide(query) {
    const c = classify(query);
    if (c === "none") return "none";
    if (S.mode === "click") return "offer";
    if (S.mode === "always") return "auto";
    if (hasInstantAnswer()) return c === "auto" ? "offer" : "none";   // Startpage already answered (weather, time, dictionary...)
    return c;
  }

  // ---------------------------------------------------------------- prompt
  function systemPrompt(allowSkip) {
    const today = new Date().toISOString().slice(0, 10);
    return [
      "You write the short 'Instant Answer' shown above web search results. Today is " + today + ".",
      "Use the numbered search results as your sources. Use general knowledge only to connect or explain them, never to add facts the results don't support.",
      "Answer the question directly in the first sentence. Then add only what helps: 1-4 short sentences, or a short bullet list (at most 6 bullets) for steps, options or comparisons.",
      "Keep it under 130 words. Put **bold** on the few key terms. Start bullets with '- '.",
      "Cite sources inline right after the claim they support, like [2] or [1][3]. Cite only numbers that exist.",
      "No headings, no preamble, no closing summary, no links, no phrases like 'according to the search results'.",
      "If sources disagree or the answer depends on something, say so in one short clause.",
      "Reply in the language of the search.",
      allowSkip
        ? "If the results don't contain enough to give a useful, accurate answer, or the search is clearly someone looking for one website, a product listing or a local place, reply with exactly: SKIP"
        : "Give the best answer the results allow; if they are thin, say what is uncertain.",
    ].join("\n");
  }
  function resultsBlock(query, results) {
    return "Search: " + query + "\n\nResults:\n" + results.map((r, i) =>
      "[" + (i + 1) + "] " + r.title + " (" + r.host + ")\n" + (r.snippet || "(no description)")).join("\n\n");
  }

  // ---------------------------------------------------------------- network
  function request(method, url, key, body, handlers, timeout) {
    const headers = { "Content-Type": "application/json", Accept: method === "GET" ? "application/json" : "text/event-stream" };
    if (key) headers.Authorization = "Bearer " + key;
    return GM_xmlhttpRequest({
      method, url, headers, timeout: timeout || 60000,
      data: body ? JSON.stringify(body) : undefined,
      anonymous: true,                                 // never send cookies to the AI provider
      onprogress: handlers.progress, onreadystatechange: handlers.progress,
      onload: handlers.load, onerror: handlers.error, ontimeout: handlers.timeout, onabort: handlers.abort,
    });
  }
  function listModels(providerId, s) {
    const P = PROVIDERS[providerId];
    return new Promise((resolve, reject) => {
      request("GET", P.base(s) + "/models", P.key(s), null, {
        load: (r) => {
          if (r.status === 401 || r.status === 403) return reject(new Error("key"));
          if (r.status >= 400) return reject(new Error("HTTP " + r.status));
          try {
            const j = JSON.parse(r.responseText);
            const list = (j.data || j.models || []).map((m) => ({ id: m.id || m.name, loaded: m.status && (m.status.value || m.status) === "loaded" })).filter((m) => m.id);
            resolve(list);
          } catch (e) { reject(new Error("bad reply")); }
        },
        error: () => reject(new Error("offline")),
        timeout: () => reject(new Error("offline")),
      }, 8000);
    });
  }
  function pickModel(providerId, list) {
    if (!list.length) return "";
    if (providerId === "local") { const l = list.find((m) => m.loaded); return l ? l.id : ""; } // never swap the GPU model on its own
    for (const re of PREFERRED) { const m = list.find((x) => re.test(x.id)); if (m) return m.id; }
    return list[0].id;
  }
  async function ensureModel(prov) {
    const P = PROVIDERS[prov];
    if (P.model(S)) return P.model(S);
    const list = await listModels(prov, S);
    if (prov === "local") {
      // Local default: whichever model is loaded right now, so a model you're using elsewhere is never swapped out.
      const loaded = list.find((m) => m.loaded);
      if (loaded) return loaded.id;
      if (list.length === 1) return list[0].id;              // single-model server: nothing to swap
      throw new Error("noloaded");
    }
    const id = pickModel(prov, list);
    if (!id) throw new Error("nomodel");
    S[P.modelField] = id; save(S);
    return id;
  }

  // Streams a chat completion. Returns an abort function.
  function streamChat(prov, messages, onText, onDone, onFail, onModel) {
    const P = PROVIDERS[prov];
    let seen = 0, buf = "", text = "", finished = false, gotSSE = false;
    const finish = (fn, arg) => { if (finished) return; finished = true; fn(arg); };
    const feed = (raw) => {
      if (typeof raw !== "string" || raw.length <= seen) return;
      buf += raw.slice(seen); seen = raw.length;
      const lines = buf.split(/\r?\n/); buf = lines.pop();
      for (const line of lines) {
        const m = /^data:\s?(.*)$/.exec(line);
        if (!m) continue;
        gotSSE = true;
        if (m[1].trim() === "[DONE]") continue;
        try {
          const j = JSON.parse(m[1]);
          const c = j.choices && j.choices[0];
          const piece = c && ((c.delta && c.delta.content) || (c.message && c.message.content));
          if (piece) { text += piece; onText(text); }
        } catch (e) { /* partial or non-JSON line */ }
      }
    };
    let req;
    ensureModel(prov).then((model) => {
      if (finished) return;
      if (onModel) onModel(model);
      req = request("POST", P.base(S) + "/chat/completions", P.key(S), {
        model, messages, stream: true, temperature: 0.2, max_tokens: 900,
      }, {
        progress: (r) => { if (r && r.readyState >= 3 && r.status < 400) feed(r.responseText); },
        load: (r) => {
          if (r.status === 401 || r.status === 403) return finish(onFail, "key");
          if (r.status === 404 && /model/i.test(r.responseText || "")) return finish(onFail, "model");
          if (r.status >= 400) return finish(onFail, "HTTP " + r.status + ": " + String(r.responseText || "").slice(0, 160));
          feed((r.responseText || "") + "\n");
          if (!gotSSE) {                               // provider ignored stream:true
            try { const j = JSON.parse(r.responseText); text = (j.choices[0].message.content || ""); onText(text); } catch (e) { /* fall through */ }
          }
          finish(onDone, text);
        },
        error: () => finish(onFail, "offline"),
        timeout: () => finish(onFail, "timeout"),
      }, 60000);
    }).catch((e) => finish(onFail, e.message || "offline"));
    return () => { finished = true; try { req && req.abort(); } catch (e) { /* ignore */ } };
  }

  // ---------------------------------------------------------------- cache (private to the script, 30 min)
  const CACHE_MS = 30 * 60 * 1000;
  function cacheKey(prov, query, results) {
    const P = PROVIDERS[prov];
    return [prov, P.model(S), query.toLowerCase(), results.slice(0, 5).map((r) => r.url).join("|")].join("\u0001");
  }
  function cacheGet(k) {
    const c = GM_getValue("cache", {}); const e = c[k];
    return e && Date.now() - e.at < CACHE_MS ? e : null;
  }
  function cachePut(k, text) {
    const c = GM_getValue("cache", {}); const now = Date.now();
    for (const key of Object.keys(c)) if (now - c[key].at > CACHE_MS) delete c[key];
    c[k] = { text, at: now };
    const keys = Object.keys(c).sort((a, b) => c[b].at - c[a].at);
    for (const key of keys.slice(40)) delete c[key];
    GM_setValue("cache", c);
  }

  // ---------------------------------------------------------------- answer text -> safe HTML
  const esc = (s) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  function cleanAnswer(t) {
    t = t.replace(/<think>[\s\S]*?(<\/think>|$)/gi, "");          // reasoning models that inline their thinking
    return t.replace(/^\s+/, "");
  }
  function isSkip(t) { return /^\s*\**SKIP\**\.?\s*$/i.test(t); }
  function maybeSkip(t) { return /^\s*\**S?K?I?P?\**$/i.test(t) && t.trim().length <= 6; }
  function citeHTML(list, results) {
    const nums = [];
    for (const part of list.split(/\s*[,;]\s*/)) {
      const r = /^(\d+)\s*[-–]\s*(\d+)$/.exec(part);
      if (r) for (let n = +r[1]; n <= +r[2] && n - +r[1] < 10; n++) nums.push(n); else if (/^\d+$/.test(part)) nums.push(+part);
    }
    return nums.filter((n, i) => results[n - 1] && nums.indexOf(n) === i).map((n) => {
      const r = results[n - 1];
      return '<a class="cite" href="' + esc(r.url) + '" data-n="' + n + '" title="' + esc(r.title + " · " + r.host) + '">' + n + "</a>";
    }).join("");
  }
  function inline(s, results) {
    s = esc(s);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*(?!\s)([^*]+?)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\s*((?:\[\d+(?:\s*[-–,;]\s*\d+)*\])+)/g, (m, group) => {
      const html = group.match(/\[([^\]]+)\]/g).map((g) => citeHTML(g.slice(1, -1), results)).join("");
      return html ? '<span class="cites">' + html + "</span>" : "";
    });
    return s;
  }
  function render(text, results) {
    const lines = text.replace(/\r/g, "").split("\n");
    let html = "", list = null, para = [];
    const flushPara = () => { if (para.length) { html += "<p>" + inline(para.join(" "), results) + "</p>"; para = []; } };
    const flushList = () => { if (list) { html += "<" + list.tag + ">" + list.items.map((i) => "<li>" + inline(i, results) + "</li>").join("") + "</" + list.tag + ">"; list = null; } };
    for (const raw of lines) {
      const line = raw.trim();
      const ul = /^[-*•]\s+(.*)$/.exec(line), ol = /^\d+[.)]\s+(.*)$/.exec(line), h = /^#{1,6}\s+(.*)$/.exec(line);
      if (!line) { flushPara(); flushList(); continue; }
      if (ul || ol) {
        flushPara();
        const tag = ul ? "ul" : "ol";
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push((ul || ol)[1]);
      } else if (h) { flushPara(); flushList(); html += "<p><strong>" + inline(h[1], results) + "</strong></p>"; }
      else { flushList(); para.push(line); }
    }
    flushPara(); flushList();
    return html;
  }

  // ---------------------------------------------------------------- UI
  // No box: A slim header, the first few lines of the answer fading out, and "Show more" to open the
  // rest (full answer, source chips, follow-up). One hairline underneath separates it from the real results.
  const CSS = `
:host { all: initial; display: block; margin: 0 0 20px; color: inherit; color-scheme: inherit; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
.wrap { font: 15px/1.6 var(--sp-font, "Segoe UI", system-ui, sans-serif); color: var(--sp-ink, inherit); }
.ov { padding-bottom: 14px; border-bottom: 1px solid var(--sp-line, rgba(127,127,127,.2)); }
.head { display: flex; align-items: center; gap: 8px; min-height: 30px; margin-bottom: 2px; }
.spark { width: 18px; height: 18px; flex: none; color: var(--sp-accent, #6677fb); }
.ov.busy .spark { animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .45; transform: scale(.82); } }
.title { font-weight: 600; font-size: 14px; letter-spacing: .01em; flex: none; }
.meta { color: var(--sp-muted, rgba(127,127,127,.9)); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.right { margin-left: auto; display: flex; align-items: center; gap: 2px; flex: none; }
.icon { all: unset; cursor: pointer; width: 28px; height: 28px; border-radius: 999px; display: inline-grid; place-items: center; color: var(--sp-ink-2, inherit); }
.icon:hover, .icon[aria-expanded="true"] { background: var(--sp-surface-2, rgba(127,127,127,.14)); color: var(--sp-ink, inherit); }
.icon svg { width: 16px; height: 16px; }
.stack { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px 0 5px; border-radius: 999px; font: 600 12px var(--sp-font, "Segoe UI", sans-serif); color: var(--sp-ink-2, inherit); }
.stack:hover { background: var(--sp-surface-2, rgba(127,127,127,.14)); color: var(--sp-ink, inherit); }
.stack svg, .more svg, .less svg { width: 14px; height: 14px; flex: none; transition: transform .15s; }
.stack[aria-expanded="true"] svg, .less svg { transform: rotate(180deg); }
.fv { display: inline-flex; }
.fv > * + * { margin-left: -6px; }
img.fav, .dot { width: 18px; height: 18px; border-radius: 50%; flex: none; background: var(--sp-favicon, #fff); box-shadow: 0 0 0 2px var(--sp-bg, Canvas); }
.dot { display: inline-grid; place-items: center; font: 700 9px/1 var(--sp-font, sans-serif); color: #111; }
.menu-wrap { position: relative; }
.menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 10; min-width: 200px; padding: 5px; display: grid; border-radius: 12px; background: var(--sp-surface, Canvas); color: var(--sp-ink, CanvasText); border: 1px solid var(--sp-line-strong, rgba(127,127,127,.3)); box-shadow: 0 12px 32px rgba(0,0,0,.4); }
.menu button { all: unset; cursor: pointer; display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 8px; font: 13.5px var(--sp-font, "Segoe UI", sans-serif); }
.menu button:hover, .menu button:focus-visible { background: var(--sp-surface-2, rgba(127,127,127,.14)); outline: none; }
.menu svg { width: 16px; height: 16px; color: var(--sp-ink-2, inherit); }
.icon:focus-visible, .stack:focus-visible, .more:focus-visible, .less:focus-visible, .chip:focus-visible, .chips a:focus-visible, .cite:focus-visible, button.btn:focus-visible, .panel input:focus-visible, .panel select:focus-visible { outline: 2px solid var(--sp-accent, #6677fb); outline-offset: 2px; }
.main { position: relative; }
.body { color: var(--sp-ink, inherit); }
.body.clamped { max-height: 8em; overflow: hidden; -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 3.4em), transparent); mask-image: linear-gradient(to bottom, #000 calc(100% - 3.4em), transparent); }
.body > :last-child { margin-bottom: 0; }
.body p { margin: 0 0 .6em; }
.body ul, .body ol { margin: 0 0 .6em; padding-left: 1.25em; }
.body li { margin: .2em 0; }
.body li::marker { color: var(--sp-muted, inherit); }
.body strong { font-weight: 600; color: var(--sp-ink, inherit); }
.body code { font: 13px var(--sp-mono, Consolas, monospace); background: var(--sp-surface-2, rgba(127,127,127,.15)); padding: 1px 5px; border-radius: 5px; }
.cites { white-space: nowrap; }
.cite { display: inline-grid; place-items: center; min-width: 17px; height: 17px; padding: 0 5px; margin-left: 3px; border-radius: 999px; font: 600 10.5px/1 var(--sp-font, "Segoe UI", sans-serif); text-decoration: none; vertical-align: 2px; color: var(--sp-ink-2, inherit); background: var(--sp-surface-2, rgba(127,127,127,.18)); }
.cite:hover, .cite.hot { background: var(--sp-accent, #6677fb); color: var(--sp-bg, #fff); }
.more { all: unset; cursor: pointer; position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px 6px 16px; border-radius: 999px; font: 600 13px var(--sp-font, "Segoe UI", sans-serif); white-space: nowrap; color: var(--sp-ink, inherit); background: var(--sp-surface-2, rgba(127,127,127,.2)); box-shadow: 0 0 0 1px var(--sp-line-strong, rgba(127,127,127,.3)), 0 6px 18px rgba(0,0,0,.35); }
.more:hover { box-shadow: 0 0 0 1px var(--sp-accent, #6677fb), 0 6px 18px rgba(0,0,0,.35); }
.ext { display: none; }
.ov.open .ext { display: grid; gap: 12px; margin-top: 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chips a { display: inline-flex; align-items: center; gap: 7px; max-width: 100%; height: 28px; padding: 0 10px 0 5px; border-radius: 999px; text-decoration: none; font: 12.5px var(--sp-font, "Segoe UI", sans-serif); color: var(--sp-ink-2, inherit); background: var(--sp-surface-2, rgba(127,127,127,.12)); }
.chips a .dot, .chips a img.fav { box-shadow: none; }
.chips a:hover, .chips a.hot { color: var(--sp-ink, inherit); box-shadow: inset 0 0 0 1px var(--sp-accent, #6677fb); }
.chips .h { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 24ch; }
.chips .n { font-weight: 700; font-size: 11px; color: var(--sp-muted, inherit); }
.turn { padding-top: 12px; border-top: 1px solid var(--sp-line, rgba(127,127,127,.2)); }
.turn .q { font-weight: 600; margin-bottom: 4px; }
.turn .a > :last-child { margin-bottom: 0; }
.turn .a p { margin: 0 0 .6em; } .turn .a ul, .turn .a ol { margin: 0 0 .6em; padding-left: 1.25em; }
.ask { display: flex; align-items: center; gap: 4px; padding: 2px 3px 2px 16px; border-radius: 999px; background: var(--sp-surface-2, rgba(127,127,127,.12)); box-shadow: inset 0 0 0 1px transparent; }
.ask:focus-within { box-shadow: inset 0 0 0 1px var(--sp-accent, #6677fb); }
.ask input { flex: 1; min-width: 0; appearance: none; border: 0; outline: none; background: transparent; padding: 7px 0; font: 14px var(--sp-font, "Segoe UI", sans-serif); color: var(--sp-ink, inherit); }
.ask input::placeholder { color: var(--sp-muted, inherit); }
.fine { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--sp-muted, inherit); }
.less { all: unset; cursor: pointer; margin-left: auto; display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 999px; font: 600 12.5px var(--sp-font, "Segoe UI", sans-serif); color: var(--sp-ink-2, inherit); }
.less:hover { background: var(--sp-surface-2, rgba(127,127,127,.14)); color: var(--sp-ink, inherit); }
.shimmer { display: grid; gap: 9px; padding: 6px 0 4px; }
.shimmer i { display: block; height: 10px; border-radius: 5px; background: linear-gradient(90deg, var(--sp-surface-2, rgba(127,127,127,.12)) 0%, var(--sp-line-strong, rgba(127,127,127,.28)) 50%, var(--sp-surface-2, rgba(127,127,127,.12)) 100%); background-size: 200% 100%; animation: sh 1.4s linear infinite; }
.shimmer i:nth-child(2) { width: 88%; } .shimmer i:nth-child(3) { width: 64%; }
@keyframes sh { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.err { color: var(--sp-ink-2, inherit); }
.err b { color: var(--sp-ink, inherit); }
.row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
button.btn { all: unset; cursor: pointer; font: 600 13px var(--sp-font, sans-serif); padding: 6px 14px; border-radius: 999px; border: 1px solid var(--sp-line-strong, rgba(127,127,127,.3)); color: var(--sp-ink, inherit); }
button.btn.primary { background: var(--sp-accent, #6677fb); border-color: var(--sp-accent, #6677fb); color: var(--sp-bg, #fff); }
button.btn:hover { border-color: var(--sp-accent, #6677fb); }
.chiprow { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.chip { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; padding: 6px 14px 6px 11px; border-radius: 999px; font: 600 13px var(--sp-font, sans-serif); color: var(--sp-ink, inherit); background: var(--sp-surface-2, rgba(127,127,127,.14)); }
.chip:hover { box-shadow: inset 0 0 0 1px var(--sp-accent, #6677fb); }
.chip svg { width: 15px; height: 15px; color: var(--sp-accent, #6677fb); }
.chip-note { font-size: 12.5px; color: var(--sp-muted, inherit); }
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: grid; place-items: center; z-index: 2147483000; padding: 16px; }
.panel { width: min(520px, 100%); max-height: calc(100vh - 32px); overflow: auto; background: var(--sp-surface, Canvas); color: var(--sp-ink, CanvasText); border: 1px solid var(--sp-line-strong, rgba(127,127,127,.3)); border-radius: 16px; padding: 20px 22px; font: 14px/1.5 var(--sp-font, "Segoe UI", system-ui, sans-serif); }
.panel h2 { font-size: 18px; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
.panel h2 svg { width: 20px; height: 20px; color: var(--sp-accent, #6677fb); }
.panel .sub { color: var(--sp-muted, inherit); margin: 0 0 14px; font-size: 13px; }
.panel fieldset { border: 0; padding: 0; margin: 0 0 14px; display: grid; gap: 6px; }
.panel legend { font-weight: 600; margin-bottom: 4px; padding: 0; }
.panel label.opt { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; }
.panel label.opt span small { display: block; color: var(--sp-muted, inherit); font-size: 12.5px; }
.panel input[type=text], .panel input[type=password], .panel select { width: 100%; font: 14px var(--sp-font, sans-serif); color: inherit; background: var(--sp-field, transparent); border: 1px solid var(--sp-line-strong, rgba(127,127,127,.3)); border-radius: 10px; padding: 8px 10px; }
.panel .grp { display: grid; gap: 6px; padding: 10px 12px; border-radius: 12px; background: var(--sp-surface-2, rgba(127,127,127,.08)); }
.panel .grp[hidden] { display: none; }
.panel .lbl { font-size: 12.5px; color: var(--sp-ink-2, inherit); }
.panel .status { font-size: 12.5px; color: var(--sp-muted, inherit); min-height: 1.2em; }
.panel .status.ok { color: var(--sp-accent, #6677fb); }
.switch { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 12px; background: var(--sp-surface-2, rgba(127,127,127,.08)); margin-bottom: 14px; }
.switch b { font-size: 15px; }
.switch input { appearance: none; -webkit-appearance: none; flex: none; width: 42px; height: 24px; border-radius: 999px; background: var(--sp-line-strong, rgba(127,127,127,.4)); position: relative; cursor: pointer; transition: background .15s; margin: 0; }
.switch input::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: var(--sp-ink, #fff); transition: transform .15s; }
.switch input:checked { background: var(--sp-accent, #6677fb); }
.switch input:checked::after { transform: translateX(18px); background: var(--sp-bg, #fff); }
.switch input:focus-visible { outline: 2px solid var(--sp-accent, #6677fb); outline-offset: 2px; }
.panel input[type=radio], .panel input[type=checkbox] { accent-color: var(--sp-accent, #6677fb); }
.panel .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }
@media (prefers-reduced-motion: reduce) { .shimmer i, .ov.busy .spark { animation: none; } .stack svg, .more svg, .less svg { transition: none; } }
`;
  const ICON = {
    spark: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5c.4 4.9 2.6 7.1 7.5 7.5-4.9.4-7.1 2.6-7.5 7.5-.4-4.9-2.6-7.1-7.5-7.5 4.9-.4 7.1-2.6 7.5-7.5Z"/><path d="M19 15.5c.2 2.2 1.1 3.1 3.3 3.3-2.2.2-3.1 1.1-3.3 3.3-.2-2.2-1.1-3.1-3.3-3.3 2.2-.2 3.1-1.1 3.3-3.3Z" opacity=".7"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  };

  let host = null, root = null, ctx = null, stop = null;

  function mount() {
    if (host && host.isConnected) return true;
    const list = $(".w-gl");
    if (!list || !list.parentNode) return false;
    host = document.createElement("div");
    host.id = "sp-instant-answer";
    root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style"); style.textContent = CSS;
    const wrap = document.createElement("div"); wrap.className = "wrap";
    root.append(style, wrap);
    list.parentNode.insertBefore(host, list);
    // Close the ⋯ menu on any click outside it (clicks inside the box arrive here; clicks on the page arrive at document).
    root.addEventListener("click", (e) => { const mw = root.querySelector(".menu-wrap"); if (mw && !mw.contains(e.target)) closeMenu(); });
    document.addEventListener("click", (e) => { if (e.target !== host) closeMenu(); });
    guard();
    return true;
  }
  // Startpage re-renders parts of the results page after loading, which can drop our box. Put the same box back
  // (its state and any answer still streaming stay intact). Checks at most once per frame.
  let guarding = false, queued = false;
  function guard() {
    if (guarding) return;
    guarding = true;
    new MutationObserver(() => {
      if (queued || !host || host.isConnected) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (host.isConnected) return;
        const list = $(".w-gl");
        if (list && list.parentNode) list.parentNode.insertBefore(host, list);
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  const wrapEl = () => root.querySelector(".wrap");
  function clear() { if (stop) { stop(); stop = null; } if (root) wrapEl().textContent = ""; if (host) { host.style.visibility = ""; host.style.height = ""; } }
  function hide() { clear(); if (host) host.style.display = "none"; }
  function show() { if (host) host.style.display = ""; }

  function chipRow(text, note, onClick) {
    clear(); show();
    const row = document.createElement("div"); row.className = "chiprow";
    const b = document.createElement("button"); b.className = "chip"; b.type = "button";
    b.innerHTML = ICON.spark; b.append(document.createTextNode(text)); b.addEventListener("click", onClick);
    row.append(b);
    if (note) { const n = document.createElement("span"); n.className = "chip-note"; n.textContent = note; row.append(n); }
    wrapEl().append(row);
  }

  function invite() {
    clear(); show();
    const row = document.createElement("div"); row.className = "chiprow";
    const on = document.createElement("button"); on.className = "chip"; on.type = "button";
    on.innerHTML = ICON.spark; on.append(document.createTextNode("Turn on Instant Answer"));
    on.addEventListener("click", () => openSettings(true));
    const no = document.createElement("button"); no.className = "btn"; no.type = "button"; no.textContent = "No thanks";
    no.addEventListener("click", () => { S.enabled = false; save(S); hide(); });
    const n = document.createElement("span"); n.className = "chip-note";
    n.textContent = "Optional: short answers above your results, from OpenCode Go or your local model.";
    row.append(on, no, n);
    wrapEl().append(row);
  }

  function setMeta(extra) {
    const m = root.querySelector(".meta"); if (!m || !ctx) return;
    const P = PROVIDERS[ctx.prov], model = ctx.model || P.model(S);
    m.textContent = "· " + (model || P.label) + (extra ? " · " + extra : "");
    m.title = P.label + (model ? " · " + model : "");
  }

  function closeMenu() {
    const menu = root && root.querySelector(".menu");
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    root.querySelector(".dots").setAttribute("aria-expanded", "false");
  }

  function boxSkeleton() {
    clear(); show();
    wrapEl().innerHTML =
      '<section class="ov busy" aria-label="Instant Answer">' +
      '<div class="head">' + ICON.spark.replace("<svg", '<svg class="spark"') + '<span class="title">Instant Answer</span><span class="meta"></span>' +
      '<div class="right"><button class="stack" type="button" aria-expanded="false" hidden></button>' +
      '<div class="menu-wrap"><button class="icon dots" type="button" title="More options" aria-label="More options" aria-haspopup="menu" aria-expanded="false">' + ICON.dots + "</button>" +
      '<div class="menu" role="menu" hidden>' +
      '<button type="button" role="menuitem" data-act="redo">' + ICON.redo + "Regenerate</button>" +
      '<button type="button" role="menuitem" data-act="copy">' + ICON.copy + "Copy answer</button>" +
      '<button type="button" role="menuitem" data-act="gear">' + ICON.gear + "Settings</button>" +
      '<button type="button" role="menuitem" data-act="close">' + ICON.close + "Hide for this search</button>" +
      "</div></div></div></div>" +
      '<div class="main"><div class="body"><div class="shimmer" role="status" aria-label="Writing the overview"><i></i><i></i><i></i></div></div>' +
      '<button class="more" type="button" hidden>Show more' + ICON.down + "</button></div>" +
      '<div class="ext"><div class="chips" hidden></div><div class="turns"></div>' +
      '<form class="ask"><input type="text" placeholder="Ask a follow-up…" aria-label="Ask a follow-up"><button class="icon" type="submit" title="Ask" aria-label="Ask">' + ICON.send + "</button></form>" +
      '<div class="fine"><span>AI can make mistakes. Check the sources.</span><button class="less" type="button">Show less' + ICON.down + "</button></div></div>" +
      "</section>";
    setMeta();
    const dots = root.querySelector(".dots"), menu = root.querySelector(".menu");
    dots.addEventListener("click", () => {
      if (!menu.hidden) return closeMenu();
      menu.hidden = false; dots.setAttribute("aria-expanded", "true");
      menu.querySelector("button").focus();
    });
    menu.addEventListener("keydown", (e) => {
      const items = Array.from(menu.querySelectorAll("button")), i = items.indexOf(root.activeElement);
      if (e.key === "Escape") { e.preventDefault(); closeMenu(); dots.focus(); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus(); }
    });
    const act = {
      redo: () => run(ctx.query, ctx.results, { force: true, fresh: true, provider: ctx.prov }),
      copy: () => {
        const txt = (ctx.answer || "").replace(/\s*\[\d+(?:\s*[-–,;]\s*\d+)*\]/g, "");
        navigator.clipboard.writeText(txt).then(() => { setMeta("copied"); setTimeout(() => setMeta(ctx.cached ? "saved" : ""), 1500); }).catch(() => {});
      },
      gear: () => openSettings(false),
      close: () => chipRow("Show Instant Answer", "", () => run(ctx.query, ctx.results, { force: true })),
    };
    menu.addEventListener("click", (e) => { const b = e.target.closest("button[data-act]"); if (!b) return; closeMenu(); act[b.dataset.act](); });
    root.querySelector(".more").addEventListener("click", () => setOpen(true));
    root.querySelector(".less").addEventListener("click", () => setOpen(false));
    root.querySelector(".stack").addEventListener("click", () => setOpen(!root.querySelector(".ov").classList.contains("open")));
  }

  function setOpen(open) {
    const ov = root.querySelector(".ov");
    if (!ov || !ctx.done) return;
    ov.classList.toggle("open", open);
    ctx.expanded = open;
    root.querySelector(".stack").setAttribute("aria-expanded", String(open));
    if (open) { root.querySelector(".body").classList.remove("clamped"); root.querySelector(".more").hidden = true; return; }
    clampBody(true);
    if (host.getBoundingClientRect().top < 0) host.scrollIntoView({ block: "start" });
  }

  // Folds the answer to 5 lines that fade out. While streaming it folds as soon as it passes 5 lines; at the end
  // it only stays folded if at least ~1.5 more lines are hidden (no "Show more" for one stray line).
  function clampBody(final) {
    const body = root.querySelector(".body"), more = root.querySelector(".more");
    if (!body || ctx.expanded) return;
    const cs = getComputedStyle(body), fs = parseFloat(cs.fontSize) || 15, lh = parseFloat(cs.lineHeight) || fs * 1.6;
    const limit = 8 * fs;
    const fold = body.scrollHeight > (final ? limit + 1.5 * lh : limit);
    body.classList.toggle("clamped", fold);
    more.hidden = !(fold && final);
  }

  function linkHover(container) {
    const all = () => root.querySelectorAll("[data-n]");
    container.addEventListener("mouseover", (e) => {
      const n = e.target.closest && e.target.closest("[data-n]"); if (!n) return;
      all().forEach((x) => x.classList.toggle("hot", x.dataset.n === n.dataset.n));
    });
    container.addEventListener("mouseleave", () => all().forEach((x) => x.classList.remove("hot")));
  }

  function citedNums(text, results) {
    const cited = [];
    (text.match(/\[(\d+(?:\s*[-–,;]\s*\d+)*)\]/g) || []).forEach((g) => g.slice(1, -1).split(/\s*[,;]\s*/).forEach((p) => {
      const r = /^(\d+)\s*[-–]\s*(\d+)$/.exec(p);
      if (r) { for (let n = +r[1]; n <= +r[2] && n - +r[1] < 10; n++) cited.push(n); } else if (/^\d+$/.test(p)) cited.push(+p);
    }));
    return cited.filter((n, i) => results[n - 1] && cited.indexOf(n) === i);
  }
  function favHTML(r) {
    const icon = iconOf(r.imgEl) || r.icon;                             // icons often finish loading after the page
    return icon ? '<img class="fav" alt="" src="' + esc(icon) + '">' : '<span class="dot">' + esc((r.host[0] || "?").toUpperCase()) + "</span>";
  }
  // Header: a small stack of the cited sites' icons ("3 sources ⌄") that opens the rest. Open: one chip per source.
  function fillSources(results, text) {
    const chips = root.querySelector(".chips"), stack = root.querySelector(".stack");
    const nums = S.sources ? citedNums(text, results).slice(0, 6).sort((a, b) => a - b) : [];
    stack.innerHTML = (nums.length
      ? '<span class="fv">' + nums.slice(0, 3).map((n) => favHTML(results[n - 1])).join("") + "</span>" + nums.length + " source" + (nums.length > 1 ? "s" : "")
      : "More") + ICON.down;
    stack.title = nums.length ? "Sources and follow-up" : "Follow-up";
    stack.hidden = false;
    chips.innerHTML = nums.map((n) => {
      const r = results[n - 1];
      return '<a href="' + esc(r.url) + '" data-n="' + n + '" title="' + esc(r.title) + '">' + favHTML(r) +
        '<span class="h">' + esc(r.host) + '</span><span class="n">' + n + "</span></a>";
    }).join("");
    chips.hidden = !nums.length;
  }

  // [message, button ("gear" = settings, "retry"), extra ("opencode" = offer OpenCode Go instead)]
  function errMsg(kind, prov) {
    const P = PROVIDERS[prov];
    return {
      key: ["<b>The " + esc(P.keyName) + " was refused.</b> Check it in settings.", "gear"],
      nokey: ["<b>Add your " + esc(P.keyName) + "</b> in settings to get answers.", "gear"],
      offline: prov === "local"
        ? ["<b>Your local model isn't answering.</b> Start your local model server, then try again. Nothing was sent anywhere else.", "retry", "opencode"]
        : ["<b>Couldn't reach " + esc(P.label) + ".</b> Check your connection and try again.", "retry"],
      timeout: ["<b>The answer took too long.</b> Try again, or pick a faster model in settings.", "retry"],
      noloaded: ["<b>No local model is loaded right now.</b> Load one in your model server (or pick one in settings), then try again.", "retry", "opencode"],
      nomodel: ["<b>No models were offered.</b> Check the provider in settings.", "gear"],
      model: ["<b>That model isn't available here.</b> Pick another one in settings.", "gear"],
    }[kind] || ["<b>Something went wrong:</b> " + esc(String(kind)), "retry"];
  }
  function showError(kind, retry, prov) {
    const body = root.querySelector(".body");
    const msg = errMsg(kind, prov);
    root.querySelector(".ov").classList.remove("busy");
    root.querySelector(".more").hidden = true;
    body.classList.remove("clamped");
    body.innerHTML = '<p class="err">' + msg[0] + '</p><div class="row"></div>';
    const row = body.querySelector(".row");
    const add = (label, fn, primary) => { const b = document.createElement("button"); b.className = "btn" + (primary ? " primary" : ""); b.type = "button"; b.textContent = label; b.addEventListener("click", fn); row.append(b); };
    if (msg[1] === "gear") add("Open settings", () => openSettings(false), true);
    if (msg[1] === "retry") add("Try again", retry, true);
    if (msg[2] === "opencode" && S.opencodeKey) add("Use OpenCode Go for this search", () => run(ctx.query, ctx.results, { force: true, provider: "opencode" }));
  }

  // ---------------------------------------------------------------- main flow
  function run(query, results, opts) {
    opts = opts || {};
    const prov = opts.provider || S.provider;
    ctx = { query, results, answer: "", turns: [], expanded: false, done: false, cached: false, prov };
    boxSkeleton();
    const body = root.querySelector(".body");
    linkHover(root.querySelector(".ov"));
    if (prov === "opencode" && !S.opencodeKey) return showError("nokey", () => run(query, results, opts), prov);
    const key = cacheKey(prov, query, results);
    const hit = !opts.fresh && cacheGet(key);
    const finishAnswer = (text, fromCache) => {
      ctx.answer = text; ctx.done = true; ctx.cached = fromCache;
      root.querySelector(".ov").classList.remove("busy");
      body.innerHTML = render(text, results);
      fillSources(results, text);
      clampBody(true);
      const form = root.querySelector(".ask");
      form.onsubmit = (e) => { e.preventDefault(); const inp = form.querySelector("input"); const q = inp.value.trim(); if (q) { inp.value = ""; followUp(q); } };
      setMeta(fromCache ? "saved" : "");
    };
    if (hit) return finishAnswer(hit.text, true);
    const messages = [{ role: "system", content: systemPrompt(!opts.force) }, { role: "user", content: resultsBlock(query, results) }];
    // Quiet start: an automatic answer only shows its box once real text arrives (or after 0.7 s),
    // so a search the AI skips never flashes a box.
    let frame = 0, latest = "", revealTimer = 0;
    const reveal = () => { clearTimeout(revealTimer); host.style.visibility = ""; host.style.height = ""; };
    if (!opts.force) { host.style.visibility = "hidden"; host.style.height = "0"; revealTimer = setTimeout(reveal, 700); }
    const paint = () => {
      frame = 0;
      const t = cleanAnswer(latest);
      if (!t || maybeSkip(t) || /^<\/?t?h?i?n?k?>?$/i.test(t.trim())) return;
      reveal();
      body.innerHTML = render(t, results);
      clampBody(false);
    };
    stop = streamChat(prov, messages, (text) => {
      latest = text;
      if (!frame) frame = requestAnimationFrame(paint);
    }, (text) => {
      stop = null;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      const t = cleanAnswer(text).trim();
      if (!isSkip(t)) reveal(); else clearTimeout(revealTimer);
      if (!t) return showError("Empty answer. Try again or pick another model.", () => run(query, results, opts), prov);
      if (isSkip(t)) {
        host.style.visibility = ""; host.style.height = "";
        return chipRow("Ask AI anyway", "No Instant Answer for this search.", () => run(query, results, { force: true }));
      }
      ctx.turns = [{ role: "user", content: resultsBlock(query, results) }, { role: "assistant", content: t }];
      cachePut(key, t);
      finishAnswer(t, false);
    }, (err) => {
      stop = null; reveal();
      showError(err, () => run(query, results, opts), prov);
    }, (model) => { ctx.model = model; setMeta(); });
  }

  function followUp(question) {
    setOpen(true);
    const turn = document.createElement("div"); turn.className = "turn";
    turn.innerHTML = '<div class="q"></div><div class="a"><div class="shimmer"><i></i><i></i><i></i></div></div>';
    turn.querySelector(".q").textContent = question;
    root.querySelector(".turns").append(turn);
    const a = turn.querySelector(".a");
    if (!ctx.turns.length) ctx.turns = [{ role: "user", content: resultsBlock(ctx.query, ctx.results) }, { role: "assistant", content: ctx.answer }];
    const messages = [{ role: "system", content: systemPrompt(false) + "\nThis is a follow-up question in the same conversation. Keep using the same numbered results when they help; say so plainly if they don't cover it." }]
      .concat(ctx.turns, [{ role: "user", content: question }]);
    let latest = "", frame = 0;
    stop = streamChat(ctx.prov, messages, (t) => { latest = t; if (!frame) frame = requestAnimationFrame(() => { frame = 0; const c = cleanAnswer(latest); if (c) a.innerHTML = render(c, ctx.results); }); },
      (t) => { stop = null; if (frame) { cancelAnimationFrame(frame); frame = 0; } const c = cleanAnswer(t).trim(); a.innerHTML = c ? render(c, ctx.results) : '<p class="err">No answer.</p>'; ctx.turns.push({ role: "user", content: question }, { role: "assistant", content: c }); },
      (err) => { stop = null; a.innerHTML = '<p class="err"><b>Follow-up failed</b> (' + esc(String(err)) + ").</p>"; });
  }

  // ---------------------------------------------------------------- one-page summaries (asked for by the Tweaks script)
  // The Tweaks script's ⋮ menu (or its s key) sends "sp-ai:summarize" with a result's id. The link is read from that
  // result on the page, never taken from the message, and only right after a click or key press, so nothing else
  // on the page can make this script fetch pages.
  const SUM_CSS = CSS + `
:host { margin: 12px 0 4px; }
.sum { padding: 10px 14px 12px; border-radius: 12px; background: var(--sp-surface, rgba(127,127,127,.07)); border: 1px solid var(--sp-line, rgba(127,127,127,.22)); }
.sum.busy .spark { animation: pulse 1.6s ease-in-out infinite; }
.sum .head { min-height: 26px; margin-bottom: 4px; }
.sum .body { font-size: 14px; line-height: 1.55; }
.sum .body ul { margin-bottom: 0; }
.step { margin: 0 0 6px !important; font-size: 13px; color: var(--sp-muted, inherit); }
.sum .fine { margin-top: 8px; }
@media (prefers-reduced-motion: reduce) { .sum.busy .spark { animation: none; } }`;
  const sums = new Map();                          // result id -> { host, root, stop, busy, done }
  // Readable text of a fetched page: the article (or main part) without menus, scripts and forms.
  function pageText(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");     // inert: no scripts run, nothing loads
    const meta = (sel) => { const m = doc.querySelector(sel); return m ? (m.getAttribute("content") || "").trim() : ""; };
    const desc = meta('meta[name="description"]') || meta('meta[property="og:description"]');
    doc.querySelectorAll("script, style, noscript, template, svg, iframe, object, nav, header, footer, aside, form, button, select, dialog, [hidden], [aria-hidden='true'], [role=navigation], [role=banner], [role=contentinfo]").forEach((e) => e.remove());
    const main = doc.querySelector("article") || doc.querySelector("main, [role=main]") || doc.body;
    const blocks = [];
    if (main) main.querySelectorAll("h1, h2, h3, h4, p, li, blockquote, pre, dt, dd, td, th, figcaption").forEach((el) => {
      if (el.querySelector("p, li, h1, h2, h3, h4, blockquote, pre, td")) return;          // innermost blocks only
      const t = el.textContent.replace(/\s+/g, " ").trim();
      if (t.length > 1) blocks.push(/^H\d$/.test(el.tagName) ? "## " + t : el.tagName === "LI" ? "- " + t : t);
    });
    let text = blocks.join("\n");
    if (text.length < 400 && main) text = main.textContent.replace(/\s+/g, " ").trim();
    return ((desc ? "Description: " + desc + "\n\n" : "") + text).slice(0, 12000);
  }
  function fetchPage(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET", url, anonymous: true, timeout: 15000,       // no cookies: the site sees only your IP
        headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
        onload: (r) => {
          if (r.status === 401 || r.status === 403 || r.status === 429 || r.status === 451) return reject(new Error("blocked"));
          if (r.status >= 400) return reject(new Error("HTTP " + r.status));
          const type = /^content-type:\s*([^\r\n;]+)/im.exec(r.responseHeaders || "");
          if (type && !/html|xml|text\/plain/i.test(type[1])) return reject(new Error(/pdf/i.test(type[1]) ? "pdf" : "type"));
          resolve(String(r.responseText || "").slice(0, 3000000));
        },
        onerror: () => reject(new Error("unreachable")),
        ontimeout: () => reject(new Error("slow")),
      });
    });
  }
  function summaryPrompt(query) {
    return [
      "You summarize one web page for someone deciding whether to open it from their search results. Today is " + new Date().toISOString().slice(0, 10) + ".",
      "Write 3 to 5 short bullets starting with '- ': what the page is, then its main facts or answer, then anything worth knowing (date, price, whose opinion, forum thread, shop, paywall). Most useful first.",
      "Under 90 words. Put **bold** on a few key terms. No preamble, no headings, no links.",
      "Use only the page text given. If it is mostly a cookie notice, sign-in wall, captcha, error or menus, reply with exactly: UNREADABLE",
      query ? "Reply in the language of this search: " + query : "Reply in English.",
    ].join("\n");
  }
  const PAGE_ERR = {
    blocked: "<b>The site turned the visit away.</b> It may block automatic visits or need a sign-in.",
    pdf: "<b>This is a PDF.</b> Summaries work on web pages only.",
    type: "<b>This isn't a web page</b>, so there is nothing to summarize.",
    unreachable: "<b>Couldn't reach the site.</b>",
    slow: "<b>The site took too long to answer.</b>",
    empty: "<b>No readable text on this page.</b> It probably builds itself with scripts, which summaries don't run.",
    unreadable: "<b>Couldn't read this page.</b> It is mostly a cookie notice, sign-in wall or menus.",
  };
  function summarize(req) {
    if (!req || !/^\d+$/.test(String(req.id))) return;
    if (navigator.userActivation && !navigator.userActivation.isActive) return;        // only right after a click or key press
    const r = document.querySelector('.w-gl > .result[data-spt-id="' + req.id + '"]');
    const a = r && ($("a.result-title", r) || $("a.result-link", r));
    if (!a || r.classList.contains("h") || !/^https?:/i.test(a.href) || /(^|\.)startpage\.com$/i.test(a.hostname)) return;
    let s = sums.get(req.id);
    if (s && r.contains(s.host)) { s.host.scrollIntoView({ block: "nearest" }); if (s.busy || s.done) return; }
    if (!s) {
      const host = document.createElement("div");
      host.className = "sp-ai-summary";
      const sr = host.attachShadow({ mode: "closed" });
      sr.innerHTML = "<style>" + SUM_CSS + '</style><div class="wrap"></div>';
      s = { host, root: sr, stop: null, busy: false, done: false };
      sums.set(req.id, s);
    }
    if (!r.contains(s.host)) r.append(s.host);
    const t = $(".wgl-title", r);
    runSummary(s, { url: a.href, host: a.hostname.replace(/^www\./, ""), title: (t || a).textContent.replace(/\s+/g, " ").trim() });
  }
  function runSummary(s, page, opts) {
    opts = opts || {};
    S = load();
    if (s.stop) { s.stop(); s.stop = null; }
    const prov = S.provider, P = PROVIDERS[prov];
    const wrap = s.root.querySelector(".wrap");
    wrap.innerHTML = '<section class="sum busy" aria-label="Summary of ' + esc(page.host) + '"><div class="head">' + ICON.spark.replace("<svg", '<svg class="spark"') +
      '<span class="title">Summary</span><span class="meta"></span><div class="right">' +
      '<button class="icon x" type="button" title="Close summary" aria-label="Close summary">' + ICON.close + "</button></div></div>" +
      '<div class="body" role="status"><p class="step">Reading the page…</p><div class="shimmer"><i></i><i></i><i></i></div></div></section>';
    const sec = wrap.firstChild, body = sec.querySelector(".body"), meta = sec.querySelector(".meta");
    s.busy = true; s.done = false;
    sec.querySelector(".x").addEventListener("click", () => { if (s.stop) s.stop(); s.stop = null; s.busy = false; s.host.remove(); });
    const again = () => runSummary(s, page, { fresh: true });
    const openPage = () => location.assign(page.url);
    const fail = (html, buttons) => {
      s.busy = false;
      sec.classList.remove("busy");
      body.innerHTML = '<p class="err">' + html + '</p><div class="row"></div>';
      const row = body.querySelector(".row");
      (buttons || []).forEach(([label, fn], i) => { const b = document.createElement("button"); b.className = "btn" + (i ? "" : " primary"); b.type = "button"; b.textContent = label; b.addEventListener("click", fn); row.append(b); });
    };
    const setModel = (m) => { meta.textContent = "· " + (m || P.model(S) || P.label); meta.title = P.label + (m ? " · " + m : ""); };
    if (S.enabled !== true) return fail("<b>Instant Answer is off.</b> Turn it on to get summaries. Nothing has been sent.", [["Turn on Instant Answer", () => openSettings(true)]]);
    if (prov === "opencode" && !S.opencodeKey) return fail(errMsg("nokey", prov)[0], [["Open settings", () => openSettings(false)]]);
    setModel("");
    const key = ["sum", prov, P.model(S), page.url].join("\u0001");
    const hit = !opts.fresh && cacheGet(key);
    const finish = (text, saved) => {
      s.busy = false; s.done = true;
      sec.classList.remove("busy");
      body.innerHTML = render(text, []) + '<div class="fine"><span>From the page itself' + (saved ? " · saved" : "") + ". AI can make mistakes.</span>" +
        '<button class="less redo" type="button">Redo</button></div>';
      body.querySelector(".redo").addEventListener("click", again);
    };
    if (hit) return finish(hit.text, true);
    fetchPage(page.url).then((html) => {
      if (!s.busy || !s.host.isConnected) return;
      const text = pageText(html);
      if (text.length < 120) return fail(PAGE_ERR.empty, [["Open the page", openPage]]);
      body.querySelector(".step").textContent = "Summarizing…";
      const messages = [{ role: "system", content: summaryPrompt(getQuery()) },
        { role: "user", content: "Page: " + page.title + " (" + page.host + ")\nLink: " + page.url + "\n\nPage text:\n" + text }];
      let latest = "", frame = 0;
      s.stop = streamChat(prov, messages, (t) => {
        latest = t;
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; const c = cleanAnswer(latest).trim(); if (c && !/^\**U?N?R?E?A?D?A?B?L?E?\**$/.test(c)) body.innerHTML = render(c, []); });
      }, (t) => {
        s.stop = null;
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
        const c = cleanAnswer(t).trim();
        if (!c) return fail("<b>Empty answer.</b> Try again or pick another model.", [["Try again", again]]);
        if (/^\**UNREADABLE\**\.?$/i.test(c)) return fail(PAGE_ERR.unreadable, [["Open the page", openPage]]);
        cachePut(key, c);
        finish(c, false);
      }, (err) => {
        s.stop = null;
        const m = errMsg(err, prov);
        fail(m[0], m[1] === "gear" ? [["Open settings", () => openSettings(false)]] : [["Try again", again]]);
      }, setModel);
    }).catch((e) => {
      if (!s.busy) return;
      fail(PAGE_ERR[e.message] || "<b>Couldn't load the page</b> (" + esc(e.message) + ").", [["Try again", again], ["Open the page", openPage]]);
    });
  }

  // ---------------------------------------------------------------- settings panel
  function openSettings(fromInvite) {
    if (!root && !mount()) return;
    show();
    const old = root.querySelector(".overlay"); if (old) old.remove();
    const draft = Object.assign({}, S);
    if (fromInvite && draft.enabled !== true) draft.enabled = true;
    const ov = document.createElement("div"); ov.className = "overlay";
    ov.innerHTML =
      '<form class="panel" role="dialog" aria-modal="true" aria-label="Instant Answer settings">' +
      "<h2>" + ICON.spark + "Instant Answer</h2>" +
      '<p class="sub">Short answers above your Startpage results, written from those results. Only your search words and the result titles and descriptions are sent, and only to the provider below.</p>' +
      '<label class="switch"><span><b>Instant Answer</b><br><small class="lbl">Off means it never runs and shows nothing.</small></span><input type="checkbox" id="ai-on"></label>' +
      '<fieldset><legend>Provider</legend>' +
      '<label class="opt"><input type="radio" name="prov" value="opencode"><span>OpenCode Go<small>Your OpenCode Go subscription. Always available; goes over the internet.</small></span></label>' +
      '<div class="grp" data-for="opencode"><span class="lbl">API key (from the OpenCode Zen console)</span><input type="password" id="oc-key" autocomplete="off" spellcheck="false">' +
      '<span class="lbl">Model</span><select id="oc-model"></select><span class="status" id="oc-status"></span></div>' +
      '<label class="opt"><input type="radio" name="prov" value="local"><span>Local model<small>Any OpenAI-compatible server on your PC (llama.cpp, LM Studio, Ollama…). Private and free; only works while it is running.</small></span></label>' +
      '<div class="grp" data-for="local"><span class="lbl">Address</span><input type="text" id="lc-url" spellcheck="false">' +
      '<span class="lbl">API key (the router key)</span><input type="password" id="lc-key" autocomplete="off" spellcheck="false">' +
      '<span class="lbl">Model</span><select id="lc-model"></select><span class="status" id="lc-status"></span></div>' +
      "</fieldset>" +
      '<fieldset><legend>When to answer</legend>' +
      '<label class="opt"><input type="radio" name="mode" value="smart"><span>Smart<small>By itself for questions and longer searches; a small "Ask AI" button otherwise; nothing for sites, maths or sign-ins.</small></span></label>' +
      '<label class="opt"><input type="radio" name="mode" value="click"><span>Only when I click<small>Always just the "Ask AI" button. Nothing is sent until you click.</small></span></label>' +
      '<label class="opt"><input type="radio" name="mode" value="always"><span>Every search<small>Except sites, maths and sign-ins.</small></span></label>' +
      "</fieldset>" +
      '<label class="opt" style="margin-bottom:12px"><input type="checkbox" id="ai-src"><span>Show sources with the answer</span></label>' +
      '<div class="actions"><button type="button" class="btn" id="ai-clear">Clear saved answers</button><button type="button" class="btn" id="ai-cancel">Cancel</button><button type="submit" class="btn primary">Save</button></div>' +
      "</form>";
    root.append(ov);
    const f = ov.querySelector("form"), q = (s) => f.querySelector(s);
    q("#ai-on").checked = draft.enabled === true;
    f.querySelector('input[name=prov][value="' + draft.provider + '"]').checked = true;
    f.querySelector('input[name=mode][value="' + draft.mode + '"]').checked = true;
    q("#ai-src").checked = draft.sources;
    q("#oc-key").value = draft.opencodeKey; q("#lc-key").value = draft.localKey; q("#lc-url").value = draft.localUrl;
    const fillSelect = (sel, list, current, note) => {
      sel.innerHTML = "";
      if (sel.id === "lc-model") { const o = document.createElement("option"); o.value = ""; o.textContent = "Whichever is loaded right now (recommended)"; sel.append(o); }
      const opts = list.length ? list : (current ? [{ id: current }] : []);
      if (!opts.length && sel.id !== "lc-model") { const o = document.createElement("option"); o.value = ""; o.textContent = note || "(load with a key)"; sel.append(o); }
      opts.forEach((m) => { const o = document.createElement("option"); o.value = m.id; o.textContent = m.id + (m.loaded ? "  (loaded now)" : ""); sel.append(o); });
      sel.value = current || "";
    };
    fillSelect(q("#oc-model"), [], draft.opencodeModel); fillSelect(q("#lc-model"), [], draft.localModel, "");
    const loadList = (prov) => {
      const tmp = Object.assign({}, draft, { opencodeKey: q("#oc-key").value.trim(), localKey: q("#lc-key").value.trim(), localUrl: q("#lc-url").value.trim() || DEFAULTS.localUrl });
      const st = q(prov === "opencode" ? "#oc-status" : "#lc-status"), sel = q(prov === "opencode" ? "#oc-model" : "#lc-model");
      if (prov === "opencode" && !tmp.opencodeKey) { st.textContent = "Paste your key to load the models."; st.className = "status"; return; }
      st.textContent = "Checking…"; st.className = "status";
      listModels(prov, tmp).then((list) => {
        const cur = prov === "local" ? sel.value : (sel.value || pickModel(prov, list));
        fillSelect(sel, list, cur);
        st.textContent = "Connected · " + list.length + " models" + (prov === "local" && !list.some((m) => m.loaded) ? " · none loaded right now" : ""); st.className = "status ok";
      }).catch((e) => {
        st.className = "status";
        st.textContent = e.message === "key" ? "Key refused." : e.message === "offline" ? (prov === "local" ? "Not running right now (start your model server)." : "Can't reach it.") : "Error: " + e.message;
      });
    };
    const syncGroups = () => {
      const prov = f.querySelector("input[name=prov]:checked").value;
      f.querySelectorAll(".grp").forEach((g) => { g.hidden = g.dataset.for !== prov; });
    };
    f.querySelectorAll("input[name=prov]").forEach((r) => r.addEventListener("change", () => { syncGroups(); loadList(r.value); }));
    q("#oc-key").addEventListener("change", () => loadList("opencode"));
    q("#lc-key").addEventListener("change", () => loadList("local"));
    q("#lc-url").addEventListener("change", () => loadList("local"));
    syncGroups();
    loadList(draft.provider);
    const close = () => ov.remove();
    q("#ai-cancel").addEventListener("click", () => { close(); if (S.enabled === null) invite(); });
    q("#ai-clear").addEventListener("click", (e) => { GM_setValue("cache", {}); e.currentTarget.textContent = "Cleared"; });
    ov.addEventListener("click", (e) => { if (e.target === ov) q("#ai-cancel").click(); });
    ov.addEventListener("keydown", (e) => { if (e.key === "Escape") q("#ai-cancel").click(); });
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      S = Object.assign(load(), {
        enabled: q("#ai-on").checked,
        provider: f.querySelector("input[name=prov]:checked").value,
        mode: f.querySelector("input[name=mode]:checked").value,
        sources: q("#ai-src").checked,
        opencodeKey: q("#oc-key").value.trim(), opencodeModel: q("#oc-model").value,
        localUrl: q("#lc-url").value.trim() || DEFAULTS.localUrl, localKey: q("#lc-key").value.trim(), localModel: q("#lc-model").value,
      });
      save(S); close(); start(true);
    });
    setTimeout(() => q("#ai-on").focus(), 0);
  }

  // ---------------------------------------------------------------- start
  function start(userAction) {
    S = load();
    if (getCategory() !== "web") return;
    const query = getQuery();
    if (!query) return;
    if (S.enabled === false) { hide(); return; }
    const results = getResults(8);
    if (!results.length || !mount()) return;
    if (S.enabled === null) { if (classify(query) !== "none") invite(); else hide(); return; }
    const d = decide(query);
    if (d === "none") return userAction ? chipRow("Ask AI", "", () => run(query, results, { force: true })) : hide();
    if (d === "offer") {
      chipRow("Ask AI", "", () => run(query, results, { force: true }));
      // The F1 card or a quick-answer card can finish loading after this. For a non-question search, step aside
      // when one appears (unless the button was already clicked); questions keep the button, as decide() would.
      const offered = wrapEl().firstChild;
      if (S.mode === "smart" && classify(query) === "offer") [1500, 4000].forEach((ms) => setTimeout(() => { if (offered.isConnected && hasInstantAnswer()) hide(); }, ms));
      return;
    }
    run(query, results);
  }

  // Tells the Tweaks script that summaries are available (its ⋮ menu shows "Summarize" only then).
  const announce = () => window.dispatchEvent(new CustomEvent("sp-ai:ready"));
  window.addEventListener("sp-ai:ping", announce);
  window.addEventListener("sp-ai:summarize", (e) => { let req = null; try { req = JSON.parse(e.detail); } catch (x) { return; } summarize(req); });
  announce();

  GM_registerMenuCommand("Instant Answer settings", () => openSettings(false));
  GM_registerMenuCommand("Turn Instant Answer on/off", () => { S = load(); S.enabled = S.enabled !== true; save(S); if (S.enabled) start(true); else hide(); });

  // Start once the page has finished loading (Startpage re-renders while loading), and the results are there.
  let tries = 0;
  // Startpage draws its own answer boxes a moment after the results; give them 0.4 s before deciding.
  const wait = () => { if ($(".w-gl .result") || tries++ > 40) setTimeout(() => start(false), 400); else setTimeout(wait, 100); };
  if (document.readyState === "complete") setTimeout(wait, 50);
  else window.addEventListener("load", () => setTimeout(wait, 50), { once: true });
})();
