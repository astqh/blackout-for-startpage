// The same interface audit for the other parts: Tweaks ⋮ menu and panels, quick-answer cards, home widgets.
const { initScript, launch } = require("./lib");
const { routeStartpage } = require("./sp-pages");
const { AUDIT } = require("./ui-audit");
(async () => {
  const b = await launch();
  for (const [w, theme] of [[1600, true], [400, true], [1600, false], [400, false]]) {
    const name = w + (theme ? "-blackout" : "-light");
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    await ctx.addInitScript(initScript(theme ? "startpage" : false, ["tweaks", "home", "quick"]));
    await routeStartpage(ctx, { light: !theme });
    const p = await ctx.newPage();
    await p.goto("https://www.startpage.com/sp/search?query=why"); await p.waitForTimeout(1500);
    await p.evaluate(() => document.querySelector(".w-gl > .result .wgl-title-link-container + span").shadowRoot.querySelector("button").click());
    console.log(name, "tweaks menu", JSON.stringify(await p.evaluate(AUDIT, "#spt-ui")));
    await p.screenshot({ path: "shots/other-tweaks-" + name + ".png" });
    await p.keyboard.press("Escape");
    for (const q of ["5 minute timer", "#a3c4ff", "roll 2d6", "speed test"]) {
      await p.goto("https://www.startpage.com/sp/search?query=" + encodeURIComponent(q)); await p.waitForTimeout(1300);
      console.log(name, "quick " + q, JSON.stringify(await p.evaluate(AUDIT, "#sp-quick-widget")));
    }
    await p.screenshot({ path: "shots/other-quick-" + name + ".png" });
    await p.goto("https://www.startpage.com/"); await p.waitForTimeout(1500);
    console.log(name, "home", JSON.stringify(await p.evaluate(AUDIT, "#sp-home")));
    await p.screenshot({ path: "shots/other-home-" + name + ".png" });
    await ctx.close();
  }
  await b.close();
})();
