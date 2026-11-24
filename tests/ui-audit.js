// Screenshots + measurements of Instant Answer's interface: answer box, error, conversation panel, settings.
// Widths 1600 and 400, Blackout theme on (dark) and off (light page). Prints problems found.
const { launch, ai } = require("./lib");
const { freshPage, URL_Q, sr, ask } = require("./ia");
const tag = process.argv[2] || "now";
// inside the page: horizontal overflow, controls without a name, low-contrast text (WCAG ratio < 4.5 for small text)
const AUDIT = (rootSel) => {
  const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return { L: 0.2126 * r + 0.7152 * g + 0.0722 * b, a: m[3] == null ? 1 : +m[3] }; };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement || (e.getRootNode && e.getRootNode().host)) { const c = getComputedStyle(e).backgroundColor; const l = lum(c); if (l && l.a > 0.5) return l.L; } return lum(getComputedStyle(document.body).backgroundColor)?.a > 0.5 ? lum(getComputedStyle(document.body).backgroundColor).L : 1; };
  const out = { overflow: [], unnamed: [], contrast: [] };
  const roots = []; const host = document.querySelector(rootSel); if (host && host.shadowRoot) roots.push(host.shadowRoot);
  for (const r of roots) {
    for (const el of r.querySelectorAll("*")) {
      const st = getComputedStyle(el); if (st.display === "none" || st.visibility === "hidden" || !el.getClientRects().length) continue;
      const b = el.getBoundingClientRect();
      if (b.right > innerWidth + 1 && st.position !== "fixed") out.overflow.push(el.tagName + "." + el.className + " right=" + Math.round(b.right));
      if (/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(el.tagName) && el.type !== "hidden") {
        const name = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || el.placeholder || (el.labels && el.labels[0] && el.labels[0].textContent) || (el.closest("label") && el.closest("label").textContent) || "").trim();
        if (!name) out.unnamed.push(el.tagName + "." + el.className);
      }
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
      if (own) { const f = lum(st.color); if (f) { const bg = bgOf(el); const hi = Math.max(f.L, bg), lo = Math.min(f.L, bg); const ratio = (hi + 0.05) / (lo + 0.05); const big = parseFloat(st.fontSize) >= 18.6 || (parseFloat(st.fontSize) >= 14 && +st.fontWeight >= 700);
        if (ratio < (big ? 3 : 4.5) && f.a > 0.5) out.contrast.push(el.tagName + "." + (el.className || "") + " '" + el.textContent.trim().slice(0, 24) + "' " + ratio.toFixed(2)); } }
    }
  }
  out.docOverflow = document.documentElement.scrollWidth > innerWidth + 1 ? document.documentElement.scrollWidth : 0;
  return out;
};
module.exports = { AUDIT };
if (require.main === module) (async () => {
  const browser = await launch();
  const report = [];
  for (const width of [1600, 400]) for (const theme of [true, false]) {
    const name = width + "-" + (theme ? "blackout" : "light");
    const p = await freshPage(browser, { viewport: { width, height: width === 400 ? 860 : 1000 }, theme, light: !theme });
    await ai.reset();
    await p.goto(URL_Q("why is the sky blue")); await p.waitForTimeout(2500);
    await ask(p, "and what about sunsets?"); await p.waitForTimeout(3500);
    await p.screenshot({ path: "shots/" + tag + "-answer-" + name + ".png", fullPage: false });
    report.push([name + " answer", await p.evaluate(AUDIT, "#sp-instant-answer")]);
    // error
    await ai.mode("401"); await p.goto(URL_Q("how does a heat pump work")); await p.waitForTimeout(2500);
    await p.screenshot({ path: "shots/" + tag + "-error-" + name + ".png" });
    report.push([name + " error", await p.evaluate(AUDIT, "#sp-instant-answer")]);
    await ai.mode("normal");
    // conversation panel
    await p.goto(URL_Q("why is the sky blue")); await p.waitForTimeout(2000);
    await sr(p, () => document.getElementById("sp-instant-answer").shadowRoot.querySelector(".conv-open").click()); await p.waitForTimeout(600);
    await sr(p, () => { const r = document.getElementById("sp-instant-answer").shadowRoot; const t = r.querySelector(".conv textarea, .conv input"); if (t) { t.value = "and sunsets?"; t.closest("form").requestSubmit(); } }); await p.waitForTimeout(3500);
    await p.screenshot({ path: "shots/" + tag + "-conv-" + name + ".png" });
    report.push([name + " conversation", await p.evaluate(AUDIT, "#sp-instant-answer")]);
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
    // settings
    await sr(p, () => window.__menuFns["instant-answer: Instant Answer settings"]()); await p.waitForTimeout(600);
    await p.screenshot({ path: "shots/" + tag + "-settings-" + name + ".png" });
    report.push([name + " settings", await p.evaluate(AUDIT, "#sp-instant-answer")]);
    if (p.errors.length) report.push([name + " page errors", p.errors]);
    await p.context().close();
  }
  await browser.close();
  for (const [n, r] of report) console.log(n.padEnd(28), JSON.stringify(r));
})().catch((e) => { console.error(e); process.exitCode = 1; });
