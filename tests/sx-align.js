// Boxes line up with the result text on SearXNG, with and without the Blackout theme, wide and narrow.
const { initScript, launch, ai, IAsettings, reporter } = require("./lib"); const { check, done } = reporter();
(async () => { const b = await launch();
  for (const [w, theme] of [[1600, true], [400, true], [1600, false], [400, false]]) {
    const name = w + (theme ? " blackout" : " light");
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } }); await ctx.addInitScript(initScript(theme ? "searxng" : false));
    const p = await ctx.newPage(); await p.goto("http://127.0.0.1:8888/");
    await p.evaluate((s) => { localStorage.clear(); localStorage.setItem("__gm_instant-answer:settings", s); localStorage.setItem("__gm_instant-answer:searxngHosts", '["127.0.0.1:8888"]'); }, IAsettings());
    await ai.reset(); await p.goto("http://127.0.0.1:8888/search?q=flip+a+coin"); await p.waitForTimeout(2200);
    const x = await p.evaluate(() => { const r = document.querySelector("#urls .result h3 a").getBoundingClientRect().left; const q = document.getElementById("sp-quick-widget").getBoundingClientRect().left; const a = document.getElementById("sp-instant-answer"); return { result: Math.round(r), quick: Math.round(q), ia: a && a.offsetHeight ? Math.round(a.getBoundingClientRect().left) : null }; });
    check(name + ": quick card lines up with the result text", Math.abs(x.quick - x.result) <= 4, JSON.stringify(x));
    await p.screenshot({ path: "shots/sx-align-" + name.replace(" ", "-") + ".png", clip: { x: 0, y: 0, width: w, height: 600 } });
    await p.goto("http://127.0.0.1:8888/search?q=why+is+the+sky+blue"); await p.waitForTimeout(2200);
    const y = await p.evaluate(() => ({ result: Math.round(document.querySelector("#urls .result h3 a").getBoundingClientRect().left), ia: Math.round(document.getElementById("sp-instant-answer").shadowRoot.querySelector(".title").getBoundingClientRect().left) }));
    check(name + ": Instant Answer lines up with the result text", Math.abs(y.ia - y.result) <= 30 && y.ia >= y.result - 4, JSON.stringify(y));
    await ctx.close(); }
  await b.close(); done(); })();
