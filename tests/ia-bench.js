// Instant Answer speed bench on Startpage sample pages with the streaming stand-in AI.
// For each provider setup: requests to the AI by path, bytes sent, and time to the first painted words.
// Usage: node ia-bench.js [--json]
const { initScript, launch, ai, AI } = require("./lib");
const { routeStartpage } = require("./sp-pages");
const SETUPS = {
  "local, model picked": { provider: "local", localUrl: AI + "/v1", localModel: "test-model" },
  "local, loaded model": { provider: "local", localUrl: AI + "/v1", localModel: "" },
  "online, choose for me": { provider: "cloud", cloudPreset: "custom", cloudUrl: AI + "/v1", cloudKey: "test-key", route: "auto", modelFast: "", modelStrong: "" },
};
const summary = (log) => { const by = {}; let bytes = 0; for (const e of log) { const k = e.path.replace(/^\/v1\//, ""); by[k] = (by[k] || 0) + 1; bytes += e.bytes; } return { requests: log.length, by, bytes }; };
async function waitText(p, fn, ms = 15000, arg) { const t0 = Date.now(); for (;;) { const v = await p.evaluate(fn, arg); if (v) return v; if (Date.now() - t0 > ms) return null; await p.waitForTimeout(10); } }
(async () => {
  const out = {};
  const browser = await launch();
  for (const [name, setup] of Object.entries(SETUPS)) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(initScript(false, ["tweaks", "instant-answer"]));
    await routeStartpage(ctx);
    const p = await ctx.newPage();
    await p.goto("https://www.startpage.com/sp/search?query=x"); 
    await p.evaluate((s) => { localStorage.clear(); localStorage.setItem("__gm_instant-answer:settings", s); }, JSON.stringify(Object.assign({ enabled: true, tools: true, depth: "balanced", mode: "smart" }, setup)));
    const row = {};
    // 1) a new answer
    await ai.reset();
    await p.goto("https://www.startpage.com/sp/search?query=why+is+the+sky+blue");
    const first = await waitText(p, () => { const h = document.getElementById("sp-instant-answer"); const b = h && h.shadowRoot.querySelector(".body"); return b && /\w{3}/.test(b.textContent) && !b.querySelector(".shimmer") ? Math.round(performance.now()) : 0; });
    await waitText(p, () => { const h = document.getElementById("sp-instant-answer"); return h && !h.shadowRoot.querySelector(".ov.busy") && h.shadowRoot.querySelector(".ask") ? 1 : 0; });
    row.answer = Object.assign(summary(await ai.log()), { firstWordsMs: first });
    // 2) the same search again (reload)
    await ai.reset();
    await p.reload();
    const again = await waitText(p, () => { const h = document.getElementById("sp-instant-answer"); const b = h && h.shadowRoot.querySelector(".body"); return b && /Rayleigh/.test(b.textContent) ? Math.round(performance.now()) : 0; });
    await p.waitForTimeout(800);
    row.reload = Object.assign(summary(await ai.log()), { firstWordsMs: again });
    // 3) follow-ups: one the results already cover, one that needs a search
    for (const [k, q] of [["followUpCovered", "why does rayleigh scattering make the sky blue"], ["followUpNew", "and what about sunsets?"]]) {
      await ai.reset();
      const n0 = await p.evaluate(() => document.getElementById("sp-instant-answer").shadowRoot.querySelectorAll(".turn").length);
      const t0 = await p.evaluate((q) => { const i = document.getElementById("sp-instant-answer").shadowRoot.querySelector(".ask input"); i.value = q; i.closest("form").requestSubmit(); return performance.now(); }, q);
      const t1 = await waitText(p, (n0) => { const t = document.getElementById("sp-instant-answer").shadowRoot.querySelectorAll(".turn")[n0]; const a = t && t.querySelector(".a"); return a && !a.querySelector(".shimmer") && /Rayleigh|scatter/.test(a.textContent) ? performance.now() : 0; }, 20000, n0);
      await p.waitForTimeout(1200);
      row[k] = Object.assign(summary(await ai.log()), { firstWordsMs: t1 ? Math.round(t1 - t0) : null });
    }
    // 4) a summary from the ⋮ menu
    await ai.reset();
    await p.locator(".w-gl > .result .wgl-title-link-container + span button").nth(2).click();
    const t0 = await p.evaluate(() => performance.now());
    await p.locator("#spt-ui .menu button[data-act=sum]").click();
    const t1 = await waitText(p, () => { const s = document.querySelectorAll(".sp-ai-summary"); const b = s.length && s[s.length - 1].shadowRoot.querySelector(".body"); return b && /Rayleigh|Test page/.test(b.textContent) ? performance.now() : 0; });
    await p.waitForTimeout(600);
    row.summary = Object.assign(summary(await ai.log()), { firstWordsMs: t1 ? Math.round(t1 - t0) : null });
    out[name] = row;
    await ctx.close();
  }
  await browser.close();
  if (process.argv.includes("--json")) return console.log(JSON.stringify(out));
  if (process.argv.includes("--check")) {
    const { check, done } = require("./lib").reporter();
    const a = out["local, model picked"], b = out["local, loaded model"], c = out["online, choose for me"];
    check("answer with a picked model = 1 request", a.answer.requests === 1);
    check("saved answer on reload = 0 requests, shown under 250 ms", [a, b, c].every((r) => r.reload.requests === 0 && r.reload.firstWordsMs < 250), [a, b, c].map((r) => r.reload.firstWordsMs).join("/"));
    check("follow-up the results cover = 1 chat request", [a, b, c].every((r) => (r.followUpCovered.by["chat/completions"] || 0) === 1));
    check("follow-up that needs a search = rewrite + answer", [a, b, c].every((r) => (r.followUpNew.by["chat/completions"] || 0) === 2));
    check("local model list asked at most once per page", (b.followUpNew.by.models || 0) === 0 && (b.summary.by.models || 0) === 0);
    check("online model list kept between pages", (c.followUpCovered.by.models || 0) === 0 && (c.summary.by.models || 0) === 0);
    return done();
  }
  const cols = ["answer", "reload", "followUpCovered", "followUpNew", "summary"];
  console.log("setup".padEnd(24) + cols.map((c) => c.padEnd(30)).join(""));
  for (const [n, r] of Object.entries(out)) console.log(n.padEnd(24) + cols.map((c) => { const x = r[c]; return (x.requests + " req " + Object.entries(x.by).map(([k, v]) => k + "×" + v).join(",") + " " + Math.round(x.bytes / 100) / 10 + "kB " + (x.firstWordsMs == null ? "-" : x.firstWordsMs + "ms")).padEnd(30); }).join(""));
})().catch((e) => { console.error(e); process.exitCode = 1; });
