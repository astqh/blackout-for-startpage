// Shared test helpers: load the userscripts the way Violentmonkey would (GM_* shims backed by localStorage, shadow
// roots forced open so tests can look inside) and the theme the way Stylus would. REPO (default: this checkout) can
// point the suites at another copy, e.g. an older commit to compare against.
const fs = require("fs"), path = require("path");
// Playwright: the project's own install if there is one, else a global one.
const { chromium } = (() => { try { return require("playwright"); } catch (e) { return require(require("child_process").execSync("npm root -g").toString().trim() + "/playwright"); } })();
const REPO = process.env.REPO || path.resolve(__dirname, "..");
const src = (f) => fs.readFileSync(path.join(REPO, f), "utf8");
const SCRIPTS = [["tweaks", "start"], ["home", "start"], ["f1", "end"], ["quick", "end"], ["instant-answer", "end"]];
const AI = "http://127.0.0.1:9999";
function shim(ns) {
  return `(function () {
    const K = "__gm_${ns}:";
    var GM_getValue = (k, d) => { const v = localStorage.getItem(K + k); return v == null ? d : JSON.parse(v); };
    var GM_setValue = (k, v) => localStorage.setItem(K + k, JSON.stringify(v));
    var GM_setClipboard = (t) => { window.__clip = t; };
    var GM_registerMenuCommand = (label, fn) => { (window.__menu = window.__menu || []).push("${ns}: " + label); (window.__menuFns = window.__menuFns || {})["${ns}: " + label] = fn; };
    var GM_xmlhttpRequest = (o) => {
      const ctl = new AbortController(); let done = false;
      const t = o.timeout ? setTimeout(() => { if (done) return; done = true; ctl.abort(); o.ontimeout && o.ontimeout({}); }, o.timeout) : 0;
      (async () => {
        try {
          const r = await fetch(o.url, { method: o.method || "GET", headers: o.headers || {}, body: o.data, credentials: o.anonymous ? "omit" : "include", signal: ctl.signal });
          const h = [...r.headers].map(([a, b]) => a + ": " + b).join("\\r\\n");
          let text = "";
          if (r.body && o.responseType !== "arraybuffer") {
            const rd = r.body.getReader(), dec = new TextDecoder();
            for (;;) { const { value, done: end } = await rd.read(); if (end) break; text += dec.decode(value, { stream: true });
              const st = { status: r.status, responseText: text, responseHeaders: h, readyState: 3, loaded: text.length };
              o.onprogress && o.onprogress(st); o.onreadystatechange && o.onreadystatechange(st); }
          } else await r.arrayBuffer();
          if (done) return; done = true; clearTimeout(t);
          o.onload && o.onload({ status: r.status, responseText: text, responseHeaders: h, readyState: 4 });
        } catch (e) { if (done) return; done = true; clearTimeout(t); (ctl.signal.aborted ? o.onabort : o.onerror) && (ctl.signal.aborted ? o.onabort : o.onerror)({}); }
      })();
      return { abort: () => { if (!done) ctl.abort(); } };
    };
`;
}
function initScript(theme, which) {
  let out = "(() => { const orig = Element.prototype.attachShadow; Element.prototype.attachShadow = function (o) { return orig.call(this, Object.assign({}, o, { mode: 'open' })); }; })();\n";
  if (theme) {
    const file = theme === "startpage" ? "theme/blackout.user.css" : "theme/blackout-searxng.user.css";
    if (fs.existsSync(path.join(REPO, file))) {
      const css = src(file).replace(/@-moz-document [^{]+\{/, "").replace(/\}\s*$/, "");
      out += `(() => { const st = document.createElement("style"); st.textContent = ${JSON.stringify(":root{--accent:#a3c4ff;--layout:0.6}\n" + css)};
        const add = () => document.documentElement ? document.documentElement.appendChild(st) : setTimeout(add, 0); add(); })();\n`;
    }
  }
  for (const [name, at] of SCRIPTS) {
    if (which && !which.includes(name)) continue;
    const body = shim(name) + src("scripts/" + name + ".user.js") + "\n})();";
    out += at === "start" ? body + "\n" : `document.addEventListener("DOMContentLoaded", () => { ${body} });\n`;
  }
  return out;
}
// Chromium: CHROME if set, else the newest one under PLAYWRIGHT_BROWSERS_PATH, else Playwright's own.
function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  try {
    for (const d of fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse())
      for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome"]) if (fs.existsSync(path.join(base, d, sub))) return path.join(base, d, sub);
  } catch (e) { /* none there */ }
  return undefined;
}
const launch = () => chromium.launch({ executablePath: chromePath(),
  args: ["--disable-features=BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,LocalNetworkAccessChecks"] });
const ai = { reset: () => fetch(AI + "/reset"), mode: (m) => fetch(AI + "/ctl?mode=" + m), log: () => fetch(AI + "/log").then((r) => r.json()) };
function reporter() {
  const out = []; let fails = 0;
  const check = (n, ok, x) => { if (!ok) fails++; if (process.env.LIVE) console.log((ok ? "PASS " : "FAIL ") + n); out.push((ok ? "PASS " : "FAIL ") + n + (x !== undefined && x !== "" ? "  (" + String(x).slice(0, 300) + ")" : "")); };
  const done = () => { console.log(out.join("\n")); console.log("== " + (out.length - fails) + "/" + out.length + " passed"); process.exitCode = fails ? 1 : 0; };
  return { check, done, out };
}
const IAtext = (p) => p.evaluate(() => { const h = document.getElementById("sp-instant-answer"); return h ? h.shadowRoot.querySelector(".wrap").textContent.replace(/\s+/g, " ") : ""; });
const IAsettings = (extra) => JSON.stringify(Object.assign({ enabled: true, provider: "local", localUrl: AI + "/v1", localModel: "test-model", tools: true, depth: "balanced" }, extra || {}));
module.exports = { REPO, src, initScript, launch, ai, reporter, IAtext, IAsettings, AI };
