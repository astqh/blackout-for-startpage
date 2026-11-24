const { initScript, launch, ai, IAsettings } = require("./lib"); const { AUDIT } = require("./ui-audit");
(async () => { const b = await launch();
  for (const [w, theme] of [[1600, true], [400, true], [1600, false], [400, false]]) {
    const name = w + (theme ? "-blackout" : "-light");
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } }); await ctx.addInitScript(initScript(theme ? "searxng" : false));
    const p = await ctx.newPage(); await p.goto("http://127.0.0.1:8888/");
    await p.evaluate((s) => { localStorage.clear(); localStorage.setItem("__gm_instant-answer:settings", s); localStorage.setItem("__gm_instant-answer:searxngHosts", '["127.0.0.1:8888"]'); }, IAsettings());
    await ai.reset(); await ai.mode("drip"); await p.goto("http://127.0.0.1:8888/search?q=speed+test+why+is+the+sky+blue"); await p.waitForTimeout(1600);
    await p.screenshot({ path: "shots/sx-stop-" + name + ".png", clip: { x: 0, y: 0, width: w, height: 520 } });
    await ai.mode("normal"); await p.goto("http://127.0.0.1:8888/search?q=why+is+the+sky+blue"); await p.waitForTimeout(2200);
    console.log(name, "answer", JSON.stringify(await p.evaluate(AUDIT, "#sp-instant-answer")));
    await p.screenshot({ path: "shots/sx-answer-" + name + ".png", clip: { x: 0, y: 0, width: w, height: 520 } });
    await p.evaluate(() => window.__menuFns["instant-answer: Instant Answer settings"]()); await p.waitForTimeout(500);
    console.log(name, "settings", JSON.stringify(await p.evaluate(AUDIT, "#sp-instant-answer")));
    await ctx.close(); }
  await b.close(); })();
