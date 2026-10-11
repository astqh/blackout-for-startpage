// ==UserScript==
// @name         Tweaks for Startpage
// @namespace    blackout-for-startpage/tweaks
// @version      1.1.0
// @license      MIT
// @description  Startpage clean-ups and result tools: results open in the same tab, no ad-blocker banner, no "Private Search" badge, a ⋮ menu on every result (Anonymous View, summary, copy link, pin or hide a site) and keyboard keys. Each part can be switched off.
// @match        https://*.startpage.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @noframes
// ==/UserScript==

/*
 * Why a script: Startpage's own "open results in a new tab: off" setting only applies when your settings code
 * travels with the search (the Firefox address bar does that). Brave, and searches right after Startpage's
 * "Verifying your request" check, fall back to Startpage's default (new tab). This fixes it everywhere.
 * Nothing is sent anywhere: pinned and hidden sites stay in this browser. "Summarize" is done by the Instant Answer
 * script, only when you ask. Switch each part in the Violentmonkey menu on a Startpage tab.
 */

(function () {
  "use strict";
  if (window.top !== window.self) return;

  const DEFAULTS = { sameTab: true, noAdblockBanner: true, noPrivateBadge: true, tools: true, keys: true, anonInline: false };
  const S = Object.assign({}, DEFAULTS, GM_getValue("settings", {}));
  const save = () => GM_setValue("settings", S);
  const SITES = Object.assign({ hidden: [], pinned: [] }, GM_getValue("sites", {}));
  for (const k of ["hidden", "pinned"]) if (!Array.isArray(SITES[k])) SITES[k] = [];
  const saveSites = () => GM_setValue("sites", { hidden: SITES.hidden, pinned: SITES.pinned });

  // 1) Same tab. Startpage's own click code logs every result click (POST /sp/acl) and then opens the result
  //    itself, in a new tab unless your settings code came along. A plain left click on a link to another site
  //    is handled here first: it opens in this tab and Startpage's click code (and its click log) never runs.
  //    Ctrl/Shift/middle click still open a new tab, as usual.
  window.addEventListener("click", (e) => {
    if (!S.sameTab || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || !/^https?:/i.test(a.href)) return;
    // a link to another site, or "Visit in Anonymous View" (Startpage's proxy, a direct link too)
    const elsewhere = !/(^|\.)startpage\.com$/i.test(a.hostname) || /^\/av\/proxy/.test(a.pathname);
    if (a.target === "_blank" || elsewhere) a.target = "_self";
    if (elsewhere) e.stopImmediatePropagation();
  }, true);

  // 2) Ad-blocker banner ("Block creepy ads, not private search", "Supporting Startpage is easy").
  //    Startpage hides it for 30 days once dismissed, but browsers that clear site data forget that; mark it dismissed
  //    on every visit before Startpage decides, and hide it by its wording if it shows anyway.
  const BANNER = /Allow Startpage ads|Supporting Startpage is easy|Block creepy ads|Free thanks to private ads|Ads keep your private search results free|exempting us from your ad blocker/i;
  if (S.noAdblockBanner) {
    for (const store of [window.localStorage, window.sessionStorage]) { try { store.setItem("sp_support_banner_dismissed", String(Date.now())); } catch (e) { /* storage blocked */ } }
  }
  function hideBanner(root) {
    if (!S.noAdblockBanner) return;
    root.querySelectorAll("p, button, h2, h3, span").forEach((el) => {
      if (el.childElementCount > 2 || !BANNER.test(el.textContent) || el.closest(".w-gl, .result, #sp-instant-answer")) return;   // never a search result
      // climb to the banner box: the largest ancestor that is still only the banner (short text)
      let box = el;
      while (box.parentElement && box.parentElement !== document.body && box.parentElement.textContent.length < 320) box = box.parentElement;
      box.style.setProperty("display", "none", "important");
    });
  }

  // 3) "Private Search" badge next to the filters: only a list of Startpage's promises, no settings.
  //    Plus the page-level rules for the result tools below (pinned on top, hidden sites, the selected result).
  // The style goes at the very end of the page's <html>, the way Stylus adds styles: putting it inside <head>
  // before Startpage starts makes Startpage rebuild the whole page (and then clicks misbehave).
  const css = document.createElement("style");
  css.textContent = [
    S.noPrivateBadge ? ".private-search-dropdown-wrapper, .private-search-dropdown { display: none !important; }" : "",
    S.tools && !S.anonInline ? ".w-gl > .result .anonymous-view-link { display: none !important; }" : "",
    // pinned results move up by layout order only, so Startpage's own page code never sees its list change
    ".w-gl[data-spt-pins] { display: flex !important; flex-direction: column; }",
    ".w-gl[data-spt-pins] > :not(.result) { order: -2; }",
    ".w-gl > .result[data-spt-pin] { order: -1; }",
    ".w-gl > .result[data-spt-hide]:not([data-spt-show]) { display: none !important; }",
    ".w-gl > .result[data-spt-hide][data-spt-show] { opacity: .5; }",
    ".w-gl > .result[data-spt-sel] { outline: 2px solid var(--sp-accent, #6677fb); outline-offset: 6px; border-radius: 6px; }",
    ".w-gl > .result { scroll-margin: 120px 0 60px; }",
  ].join("\n");
  const addCss = () => { if (css.isConnected) return true; const at = document.documentElement; if (at) at.appendChild(css); return !!at; };
  if (!addCss()) new MutationObserver((m, obs) => { if (addCss()) obs.disconnect(); }).observe(document, { childList: true });

  // ---------------------------------------------------------------- result tools: ⋮ menu, site rules, keys
  // Startpage builds each result as .w-gl > .result: .upper (icon, site name, address), a.result-title, the
  // description, then "Visit in Anonymous View". The last .result in the list is a hidden trap link for bots
  // (class "h", it leads to startpage.com/clev); it is never touched or opened.
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  function linkOf(r) {
    const a = r.querySelector("a.result-title") || r.querySelector("a.result-link");
    if (!a || !/^https?:/i.test(a.href) || /(^|\.)startpage\.com$/i.test(a.hostname)) return null;
    return a;
  }
  // "en.wikipedia.org" -> "wikipedia.org", "bbc.co.uk" stays, "news.gc.ca" -> "news.gc.ca"
  function siteOf(hostname) {
    const p = hostname.toLowerCase().replace(/^www\d?\./, "").split(".");
    if (p.length <= 2) return p.join(".");
    const two = p[p.length - 1].length === 2 && /^(co|com|net|org|gov|edu|ac|gc|on|qc|bc|ab|mb|sk|ns|nb|nl|pe)$/.test(p[p.length - 2]);
    return p.slice(two ? -3 : -2).join(".");
  }
  const covers = (rule, hostname) => { const h = hostname.toLowerCase(); return h === rule || h.endsWith("." + rule); };
  const ruleFor = (list, hostname) => list.find((d) => covers(d, hostname)) || "";
  let nextId = 1;
  function info(r) {
    const a = linkOf(r);
    if (!a) return null;
    if (!r.hasAttribute("data-spt-id")) r.setAttribute("data-spt-id", String(nextId++));
    const av = r.querySelector(".anonymous-view-link a[href]"), t = r.querySelector(".wgl-title");
    return { el: r, id: r.getAttribute("data-spt-id"), url: a.href, host: a.hostname, site: siteOf(a.hostname),
      title: (t || a).textContent.replace(/\s+/g, " ").trim(), av: av ? av.href : "" };
  }
  const flag = (el, name, on) => { if (on && !el.hasAttribute(name)) el.setAttribute(name, ""); else if (!on && el.hasAttribute(name)) el.removeAttribute(name); };

  const ICON = {
    dots: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5c.4 4.9 2.6 7.1 7.5 7.5-4.9.4-7.1 2.6-7.5 7.5-.4-4.9-2.6-7.1-7.5-7.5 4.9-.4 7.1-2.6 7.5-7.5Z"/><path d="M19 15.5c.2 2.2 1.1 3.1 3.3 3.3-2.2.2-3.1 1.1-3.3 3.3-.2-2.2-1.1-3.1-3.3-3.3 2.2-.2 3.1-1.1 3.3-3.3Z" opacity=".7"/></svg>',
    anon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 11h20"/><path d="M5 11l2.2-6h9.6L19 11"/><circle cx="7" cy="16" r="2.6"/><circle cx="17" cy="16" r="2.6"/><path d="M9.6 16h4.8"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16v6"/><path d="M8.5 3h7l-1 6 3.5 3.5V16H6v-3.5L9.5 9l-1-6Z"/></svg>',
    hide: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.4 3.6"/><path d="M6.6 6.6C4.4 8 2.8 10.1 2 12c1 2.5 5 7 10 7 1.9 0 3.6-.6 5.1-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    show: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    kbd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  };

  // Colours come from the Blackout theme (--sp-*) when it is on, otherwise a plain light or dark look that
  // follows the page.
  const VARS = ":host { --bg: var(--sp-surface, #ffffff); --bg2: var(--sp-surface-2, #f1f3f4); --ink: var(--sp-ink, #1f1f1f); --ink2: var(--sp-ink-2, #474747);" +
    " --muted: var(--sp-muted, #70757a); --line: var(--sp-line-strong, #dadce0); --acc: var(--sp-accent, #1a0dab); --onacc: var(--sp-bg, #ffffff);" +
    ' --font: var(--sp-font, "Segoe UI", system-ui, sans-serif); --mono: var(--sp-mono, Consolas, ui-monospace, monospace); }' +
    " :host([data-dark]) { --bg: var(--sp-surface, #202124); --bg2: var(--sp-surface-2, #303134); --ink: var(--sp-ink, #e8eaed); --ink2: var(--sp-ink-2, #bdc1c6);" +
    " --muted: var(--sp-muted, #9aa0a6); --line: var(--sp-line-strong, #3c4043); --acc: var(--sp-accent, #8ab4f8); --onacc: var(--sp-bg, #202124); }" +
    " * { box-sizing: border-box; } [hidden] { display: none !important; }";
  let darkCache = null;
  function isDark() {
    if (darkCache !== null) return darkCache;
    const c = (getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    darkCache = c.length < 3 || c[3] === 0 ? matchMedia("(prefers-color-scheme: dark)").matches : 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] < 128;
    return darkCache;
  }
  function shadowHost(tag, styles, html) {
    const host = document.createElement(tag);
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = "<style>" + VARS + styles + "</style>" + html;
    if (isDark()) host.setAttribute("data-dark", "");
    return { host, root };
  }

  // ---- the ⋮ button on each result
  const DOTS_CSS = `
:host { all: initial; display: inline-flex; align-items: center; align-self: center; gap: 4px; margin-left: 4px; flex: none; }
button { all: unset; cursor: pointer; width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center; color: var(--muted); }
button:hover, button[aria-expanded="true"] { background: var(--bg2); color: var(--ink); }
button:focus-visible { outline: 2px solid var(--acc); outline-offset: 1px; }
svg { width: 18px; height: 18px; }
.tag { font: 600 11px/1 var(--font); color: var(--acc); padding: 4px 8px; border-radius: 999px; background: var(--bg2); }`;
  const dotsOf = new WeakMap();                   // result element -> { host, btn, tag }
  function dots(r, pinned) {
    let d = dotsOf.get(r);
    if (!d) {
      const { host, root } = shadowHost("span", DOTS_CSS,
        '<span class="tag" hidden>Pinned</span><button type="button" title="Result options" aria-label="Result options" aria-haspopup="menu" aria-expanded="false">' + ICON.dots + "</button>");
      d = { host, btn: root.querySelector("button"), tag: root.querySelector(".tag") };
      d.btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (menuFor === r) closeMenu(); else openMenu(r, d.btn); });
      dotsOf.set(r, d);
    }
    d.tag.hidden = !pinned;
    if (!r.contains(d.host)) {
      const up = r.querySelector(".upper"), after = up && up.querySelector(".wgl-title-link-container");
      if (after) after.after(d.host); else if (up) up.append(d.host); else r.prepend(d.host);
    }
  }

  // ---- "2 results from hidden sites" line under the results
  const NOTE_CSS = `
:host { all: initial; display: block; margin: 4px 0 18px; }
.n { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; font: 13px/1.4 var(--font); color: var(--muted); }
button { all: unset; cursor: pointer; font-weight: 600; color: var(--ink2); text-decoration: underline; text-underline-offset: 2px; }
button:hover { color: var(--ink); }
button:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; border-radius: 4px; }`;
  let note = null, showHidden = false;
  function hiddenNote(gl, count, sites) {
    if (!count) { if (note) note.host.remove(); return; }
    if (!note) {
      note = shadowHost("div", NOTE_CSS, '<div class="n"><span class="t"></span><button type="button" data-a="toggle"></button><button type="button" data-a="manage">Manage</button></div>');
      note.root.addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.a === "manage") return openSites();
        showHidden = !showHidden; apply();
      });
    }
    note.root.querySelector(".t").textContent = count + (count === 1 ? " result" : " results") + " from " + sites.join(", ") + (showHidden ? " shown faded." : " hidden.");
    note.root.querySelector('[data-a="toggle"]').textContent = showHidden ? "Hide again" : "Show";
    if (gl.nextElementSibling !== note.host) gl.after(note.host);
  }

  // ---- apply the rules to the results on the page (cheap; runs again whenever the page changes)
  let live = false;                               // buttons are added only once Startpage has finished building the page
  function apply() {
    const gl = document.querySelector(".w-gl");
    if (!gl) return;
    let pins = 0, hidden = 0;
    const sites = [];
    for (const r of gl.children) {
      if (!r.classList.contains("result") || r.classList.contains("h")) continue;
      const it = info(r);
      if (!it) continue;
      const pin = !!ruleFor(SITES.pinned, it.host), hide = !pin && !!ruleFor(SITES.hidden, it.host);
      flag(r, "data-spt-pin", pin); flag(r, "data-spt-hide", hide); flag(r, "data-spt-show", hide && showHidden);
      if (pin) pins++;
      if (hide) { hidden++; if (!sites.includes(it.site)) sites.push(it.site); }
      if (live) dots(r, pin);
    }
    flag(gl, "data-spt-pins", pins > 0);
    if (live) hiddenNote(gl, hidden, sites);
  }

  // ---- shared layer for the menu, little messages and the two panels (outside Startpage's own page parts)
  const UI_CSS = `
:host { all: initial; position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000; }
.menu { position: absolute; min-width: 250px; max-width: 340px; padding: 5px; display: grid; border-radius: 12px; background: var(--bg); color: var(--ink); border: 1px solid var(--line); box-shadow: 0 12px 32px rgba(0,0,0,.35); font: 13.5px/1.3 var(--font); }
.menu .head { padding: 6px 10px; font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.menu button { all: unset; cursor: pointer; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; }
.menu button:hover, .menu button:focus-visible { background: var(--bg2); outline: none; }
.menu svg { width: 16px; height: 16px; flex: none; color: var(--ink2); }
.menu .l { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
kbd { font: 600 11px/1 var(--mono); color: var(--muted); border: 1px solid var(--line); border-radius: 5px; padding: 3px 6px; min-width: 20px; text-align: center; display: inline-block; }
.sep { height: 1px; margin: 4px 6px; background: var(--line); }
.toast { position: fixed; z-index: 2; left: 50%; bottom: 24px; transform: translateX(-50%); display: flex; align-items: center; gap: 14px; width: max-content; max-width: calc(100vw - 32px); padding: 10px 14px 10px 16px; border-radius: 12px; background: var(--ink); color: var(--bg); font: 14px/1.35 var(--font); box-shadow: 0 10px 28px rgba(0,0,0,.4); }
.toast button { all: unset; cursor: pointer; font-weight: 700; text-decoration: underline; text-underline-offset: 2px; padding: 2px 4px; border-radius: 6px; }
.toast button:focus-visible { outline: 2px solid currentColor; }
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: grid; place-items: center; padding: 16px; }
.panel { width: min(480px, 100%); max-height: calc(100vh - 32px); overflow: auto; background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 16px; padding: 16px 20px 20px; font: 14px/1.5 var(--font); }
.ph { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.ph h2 { margin: 0; font-size: 17px; font-weight: 600; flex: 1; }
.x { all: unset; cursor: pointer; width: 30px; height: 30px; border-radius: 999px; display: grid; place-items: center; color: var(--ink2); }
.x:hover { background: var(--bg2); }
.x svg { width: 16px; height: 16px; }
.sub { margin: 0 0 14px; color: var(--muted); font-size: 13px; }
table { width: 100%; border-collapse: collapse; }
td { padding: 7px 4px; border-top: 1px solid var(--line); vertical-align: middle; }
td:first-child { width: 112px; white-space: nowrap; }
td kbd + kbd { margin-left: 4px; }
section + section { margin-top: 16px; }
h3 { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--ink2); text-transform: uppercase; letter-spacing: .06em; }
h3 span { color: var(--muted); font-weight: 400; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
li { display: flex; align-items: center; gap: 8px; padding: 5px 6px 5px 12px; border-radius: 10px; background: var(--bg2); }
li span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.none { margin: 0; color: var(--muted); font-size: 13px; }
li button, .add button { all: unset; cursor: pointer; font: 600 12.5px var(--font); padding: 5px 12px; border-radius: 999px; border: 1px solid var(--line); color: var(--ink); }
li button:hover, .add button:hover { border-color: var(--acc); }
.add { display: flex; gap: 6px; margin-top: 18px; }
.add input { flex: 1; min-width: 0; font: 14px var(--font); color: var(--ink); background: transparent; border: 1px solid var(--line); border-radius: 999px; padding: 6px 14px; outline: none; }
.add input:focus { border-color: var(--acc); }
button:focus-visible, .x:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
.fine { margin: 14px 0 0; font-size: 12.5px; color: var(--muted); }`;
  let ui = null;
  function UI() {
    if (!ui) {
      const { host, root } = shadowHost("div", UI_CSS, '<div class="menu" role="menu" aria-label="Result options" hidden></div><div class="toast" role="status" aria-live="polite" hidden></div>');
      host.id = "spt-ui";
      ui = { host, root, menu: root.querySelector(".menu"), toast: root.querySelector(".toast") };
      ui.menu.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-act]"); if (!b) return;
        const r = menuFor; closeMenu(); act(b.dataset.act, r);
      });
      ui.menu.addEventListener("keydown", (e) => {
        const items = Array.from(ui.menu.querySelectorAll("button")), i = items.indexOf(root.activeElement);
        const byKey = !e.ctrlKey && !e.altKey && !e.metaKey && items.find((b) => b.dataset.key === e.key);
        e.stopPropagation();
        if (e.key === "Escape") { e.preventDefault(); closeMenu(true); }
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus(); }
        else if (e.key === "Home" || e.key === "End") { e.preventDefault(); items[e.key === "Home" ? 0 : items.length - 1].focus(); }
        else if (e.key === "Tab") closeMenu();
        else if (byKey) { e.preventDefault(); byKey.click(); }
      });
    }
    if (!ui.host.isConnected) document.documentElement.appendChild(ui.host);
    return ui;
  }

  let menuFor = null;
  const item = (act, icon, label, key) => '<button type="button" role="menuitem" data-act="' + act + '"' + (key ? ' data-key="' + esc(key) + '"' : "") + ">" +
    ICON[icon] + '<span class="l">' + esc(label) + "</span>" + (key && S.keys ? "<kbd>" + esc(key) + "</kbd>" : "") + "</button>";
  function openMenu(r, anchor) {
    const it = info(r);
    if (!it) return;
    const u = UI();
    closeMenu();
    const pinned = ruleFor(SITES.pinned, it.host), hidden = ruleFor(SITES.hidden, it.host);
    u.menu.innerHTML = '<div class="head">' + esc(it.host.replace(/^www\./, "")) + "</div>" +
      (aiReady ? item("sum", "spark", "Summarize this page", "s") : "") +
      (it.av ? item("anon", "anon", "Open in Anonymous View", "a") : "") +
      item("copy", "copy", "Copy link", "c") +
      item("pin", "pin", pinned ? "Unpin " + pinned : "Pin " + it.site + " to the top", "p") +
      item("hide", hidden ? "show" : "hide", hidden ? "Stop hiding " + hidden : "Hide " + it.site, "h") +
      '<div class="sep"></div>' + item("sites", "list", "Hidden and pinned sites", "") + (S.keys ? item("keys", "kbd", "Keyboard keys", "?") : "");
    menuFor = r;
    const d = dotsOf.get(r);
    if (d) d.btn.setAttribute("aria-expanded", "true");
    // place it under the ⋮ (or above, near the bottom of the window), kept inside the window
    const m = u.menu, b = anchor.getBoundingClientRect();
    m.style.left = "0px"; m.style.top = "0px"; m.hidden = false;
    const w = m.offsetWidth, h = m.offsetHeight;
    let x = b.left, y = b.bottom + 4;
    if (x + w > innerWidth - 8) x = Math.max(8, innerWidth - 8 - w);
    if (y + h > innerHeight - 8 && b.top - h - 4 > 8) y = b.top - h - 4;
    m.style.left = Math.round(x + scrollX) + "px"; m.style.top = Math.round(y + scrollY) + "px";
    m.querySelector("button").focus({ preventScroll: true });
  }
  function closeMenu(refocus) {
    if (!ui || ui.menu.hidden) return;
    ui.menu.hidden = true;
    const d = menuFor && dotsOf.get(menuFor);
    if (d) { d.btn.setAttribute("aria-expanded", "false"); if (refocus) d.btn.focus(); }
    menuFor = null;
  }
  document.addEventListener("click", (e) => { if (ui && e.target !== ui.host) closeMenu(); });
  window.addEventListener("resize", () => closeMenu());

  let toastTimer = 0;
  function toast(text, action, fn) {
    const u = UI();
    u.toast.textContent = "";
    const t = document.createElement("span"); t.textContent = text; u.toast.append(t);
    if (action) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = action;
      b.addEventListener("click", () => { u.toast.hidden = true; fn(); });
      u.toast.append(b);
    }
    u.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { u.toast.hidden = true; }, action ? 6000 : 2600);
  }

  function panel(title, html) {
    const u = UI();
    closeMenu();
    const old = u.root.querySelector(".overlay"); if (old) old.remove();
    const back = document.activeElement;
    const ov = document.createElement("div"); ov.className = "overlay";
    ov.innerHTML = '<div class="panel" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="ph"><h2>' + esc(title) + "</h2>" +
      '<button type="button" class="x" aria-label="Close">' + ICON.close + "</button></div>" + html + "</div>";
    const close = () => { ov.remove(); if (back && back.focus) back.focus({ preventScroll: true }); };
    ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest(".x")) close(); });
    ov.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); close(); } });
    u.root.append(ov);
    ov.querySelector(".x").focus();
    return ov;
  }
  function openKeys() {
    const k = (...keys) => keys.map((x) => "<kbd>" + esc(x) + "</kbd>").join("");
    panel("Keyboard keys",
      '<p class="sub">Keys act on the result you picked with <b>j</b> / <b>k</b> (it gets an outline), or else on the one under your mouse pointer. They do nothing while you type in a box.</p><table>' +
      [[k("j", "k"), "Next / previous result"], [k("Enter", "o"), "Open it"], [k("a"), "Open it in Anonymous View (Startpage visits the site for you)"],
        [k("s"), "Summarize it (needs the Instant Answer script)"], [k("c"), "Copy its link"], [k("p"), "Pin its site to the top of your results"],
        [k("h"), "Hide its site from your results"], [k("m"), "Open its ⋮ menu"], [k("/"), "Jump to the search box"], [k("Esc"), "Close, or clear the outline"], [k("?"), "This list"]]
        .map((row) => "<tr><td>" + row[0] + "</td><td>" + row[1] + "</td></tr>").join("") + "</table>");
  }
  function cleanSite(v) {
    v = v.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/^www\d?\./, "");
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v) ? v : "";
  }
  function openSites() {
    const ov = panel("Hidden and pinned sites",
      '<p class="sub">Pinned sites move to the top of your results. Hidden sites are left out, with a line under the results to show them. Kept in this browser only.</p>' +
      '<div class="lists"></div><form class="add"><input type="text" placeholder="example.com" aria-label="Site to add" spellcheck="false" autocomplete="off">' +
      '<button type="submit" data-to="pinned">Pin</button><button type="submit" data-to="hidden">Hide</button></form>');
    const lists = ov.querySelector(".lists");
    const draw = () => {
      lists.innerHTML = [["pinned", "Pinned"], ["hidden", "Hidden"]].map(([k, name]) => "<section><h3>" + name + " <span>" + SITES[k].length + "</span></h3>" +
        (SITES[k].length ? "<ul>" + SITES[k].map((d) => "<li><span>" + esc(d) + '</span><button type="button" data-rm="' + k + '" data-d="' + esc(d) + '">Remove</button></li>').join("") + "</ul>"
          : '<p class="none">None yet. Use ⋮ on a result, or add one below.</p>') + "</section>").join("");
    };
    draw();
    lists.addEventListener("click", (e) => {
      const b = e.target.closest("[data-rm]"); if (!b) return;
      SITES[b.dataset.rm] = SITES[b.dataset.rm].filter((d) => d !== b.dataset.d);
      saveSites(); apply(); draw();
    });
    const form = ov.querySelector(".add");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const to = (e.submitter && e.submitter.dataset.to) || "hidden", other = to === "pinned" ? "hidden" : "pinned";
      const inp = form.querySelector("input"), d = cleanSite(inp.value);
      if (!d) { inp.focus(); return; }
      SITES[to] = SITES[to].filter((x) => x !== d).concat(d);
      SITES[other] = SITES[other].filter((x) => x !== d);
      saveSites(); apply(); draw(); inp.value = ""; inp.focus();
    });
  }

  // ---- what each menu item / key does
  function go(url) { if (S.sameTab) location.assign(url); else window.open(url, "_blank", "noopener"); }
  function copy(text) {
    try { if (typeof GM_setClipboard === "function") { GM_setClipboard(text, "text"); return; } } catch (e) { /* fall back */ }
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  }
  function toggleRule(list, it) {
    const before = { hidden: SITES.hidden.slice(), pinned: SITES.pinned.slice() };
    const hit = ruleFor(SITES[list], it.host), other = list === "pinned" ? "hidden" : "pinned";
    if (hit) SITES[list] = SITES[list].filter((d) => d !== hit);
    else { SITES[list] = SITES[list].concat(it.site); SITES[other] = SITES[other].filter((d) => !covers(d, it.host)); }
    saveSites(); apply();
    const undo = () => { SITES.hidden = before.hidden; SITES.pinned = before.pinned; saveSites(); apply(); };
    return { on: !hit, site: hit || it.site, undo };
  }
  // The Instant Answer script answers "sp-ai:ready" when it is installed; "Summarize" only shows then.
  let aiReady = false;
  window.addEventListener("sp-ai:ready", () => { aiReady = true; });
  function summarize(it) {
    const send = () => window.dispatchEvent(new CustomEvent("sp-ai:summarize", { detail: JSON.stringify({ id: it.id, url: it.url }) }));
    if (aiReady) return send();
    window.dispatchEvent(new CustomEvent("sp-ai:ping"));
    setTimeout(() => (aiReady ? send() : toast("Summaries need the Instant Answer script.")), 200);
  }
  function act(name, r) {
    if (name === "sites") return openSites();
    if (name === "keys") return openKeys();
    const it = r && info(r);
    if (!it) return;
    if (name === "open") return go(it.url);
    if (name === "anon") return it.av ? go(it.av) : toast("This result has no Anonymous View link.");
    if (name === "copy") { copy(it.url); return toast("Link copied"); }
    if (name === "sum") return summarize(it);
    if (name === "menu") { if (!live) return; dots(r, !!ruleFor(SITES.pinned, it.host)); return openMenu(r, dotsOf.get(r).btn); }
    if (name === "pin") {
      const res = toggleRule("pinned", it);
      return toast((res.on ? "Pinned " + res.site + " to the top" : "Unpinned " + res.site), "Undo", res.undo);
    }
    if (name === "hide") {
      if (selected === r) move(1);
      const res = toggleRule("hidden", it);
      if (selected === r && res.on) select(null);
      return toast((res.on ? "Hiding " + res.site + " from your results" : "Stopped hiding " + res.site), "Undo", res.undo);
    }
  }

  // ---- keyboard keys
  let hovered = null, selected = null;
  document.addEventListener("mouseover", (e) => {
    const r = e.target.closest && e.target.closest(".w-gl > .result");
    hovered = r && !r.classList.contains("h") ? r : null;
  }, { passive: true });
  const usable = (r) => r && r.isConnected && !r.classList.contains("h") && r.offsetHeight > 20 && linkOf(r);
  const visible = () => Array.from(document.querySelectorAll(".w-gl > .result")).filter(usable)
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  function select(r) {
    if (selected && selected !== r) selected.removeAttribute("data-spt-sel");
    selected = r;
    if (r) { r.setAttribute("data-spt-sel", ""); r.scrollIntoView({ block: "nearest" }); }
  }
  function move(dir) {
    const list = visible();
    if (!list.length) return;
    const i = usable(selected) ? list.indexOf(selected) : -1;
    if (i >= 0) return select(list[Math.max(0, Math.min(list.length - 1, i + dir))]);
    const h = usable(hovered) ? list.indexOf(hovered) : -1;
    const first = list.findIndex((r) => r.getBoundingClientRect().bottom > 80);
    select(list[h >= 0 ? h : Math.max(0, first)]);
  }
  const KEYS = { Enter: "open", o: "open", a: "anon", s: "sum", c: "copy", p: "pin", h: "hide", m: "menu", ".": "menu", ":": "menu" };
  document.addEventListener("keydown", (e) => {
    if (!S.keys || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.isComposing || !document.querySelector(".w-gl")) return;
    const t = e.target, page = t === document.body || t === document.documentElement;
    // only when nothing is being typed: the page itself, or something inside the results list
    if (!page && !(t.closest && t.closest(".w-gl") && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable)) return;
    const k = e.key;
    if (k === "/") {
      const box = document.querySelector("#q") || document.querySelector("input.search-form-input");
      if (!box) return;
      box.focus(); try { box.setSelectionRange(box.value.length, box.value.length); } catch (x) { /* not a text box */ }
    } else if (k === "j" || k === "k") move(k === "j" ? 1 : -1);
    else if (k === "?") openKeys();
    else if (k === "Escape") { if (!selected) return; select(null); }
    else {
      const name = KEYS[k];
      if (!name || (k === "Enter" && !page)) return;     // Enter on a focused link or button keeps its usual job
      if (!S.tools && /^(pin|hide|menu)$/.test(name)) return;
      const r = usable(selected) ? selected : usable(hovered) ? hovered : null;
      if (!r) toast("Press j to pick a result, or point at one with the mouse.");
      else act(name, r);
    }
    e.preventDefault();
  });

  // ---------------------------------------------------------------- start
  const onReady = () => {
    addCss();                                  // put back if the page removed it
    hideBanner(document.body);
    if (S.tools) apply();                      // attributes only (pinned, hidden) so nothing flashes
    let queued = false;
    new MutationObserver(() => {
      if (queued) return; queued = true;
      requestAnimationFrame(() => { queued = false; addCss(); hideBanner(document.body); if (S.tools) apply(); });
    }).observe(document.body, { childList: true, subtree: true });
    // ⋮ buttons go in once Startpage has finished building the page (adding them earlier makes it rebuild)
    const goLive = () => setTimeout(() => { live = true; if (S.tools) { window.dispatchEvent(new CustomEvent("sp-ai:ping")); apply(); } }, 300);
    if (document.readyState === "complete") goLive(); else window.addEventListener("load", goLive, { once: true });
  };
  if (document.body) onReady(); else document.addEventListener("DOMContentLoaded", onReady, { once: true });

  const LABELS = {
    sameTab: "Open results in the same tab",
    noAdblockBanner: "Hide the ad-blocker banner",
    noPrivateBadge: "Hide the Private Search badge",
    tools: "⋮ menu on results (summary, Anonymous View, pin, hide)",
    keys: "Keyboard keys (press ? on a results page)",
    anonInline: "Also show \"Visit in Anonymous View\" under each result",
  };
  Object.keys(LABELS).forEach((k) => GM_registerMenuCommand((S[k] ? "✓ " : "✗ ") + LABELS[k] + " (click to switch, then reload)", () => { S[k] = !S[k]; save(); location.reload(); }));
  GM_registerMenuCommand("Hidden and pinned sites…", () => openSites());
})();
