// Speed test card; speed.cloudflare.com answered by an in-test stand-in (the real host is blocked here).
// Usage: node speed.js            (Startpage sample page)   node speed.js searxng   (local SearXNG)
const { initScript, launch, reporter } = require("./lib");
const { routeStartpage } = require("./sp-pages");
const { check, done } = reporter();
const SEARX = process.argv[2] === "searxng";
(async () => {
  const browser = await launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(initScript(false, ["quick", "instant-answer"]));
  let down = 0, up = 0, pings = 0;
  await ctx.route("https://speed.cloudflare.com/**", async (r) => {
    const u = new URL(r.request().url()), h = { "cf-ray": "8f00aa11bb22cc33-YYZ", "access-control-allow-origin": "*", "access-control-expose-headers": "cf-ray", "access-control-allow-headers": "*" };
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: h });
    await new Promise((res) => setTimeout(res, 20));
    if (u.pathname === "/__up") { up++; return r.fulfill({ status: 200, headers: h, body: "" }); }
    const n = +u.searchParams.get("bytes"); if (n === 0) pings++; else down++;
    return r.fulfill({ status: 200, headers: Object.assign({ "content-type": "application/octet-stream" }, h), body: Buffer.alloc(n) });
  });
  await routeStartpage(ctx);
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const base = SEARX ? "http://127.0.0.1:8888/search?q=" : "https://www.startpage.com/sp/search?query=";
  for (const [q, want] of [["speed test", true], ["internet speed test", true], ["test my wifi", true], ["how fast is my internet", true], ["speed test cars", false], ["typing speed test", false]]) {
    await p.goto(base + encodeURIComponent(q)); await p.waitForTimeout(1300);
    check("detect “" + q + "”", /Internet speed/.test(await p.evaluate(() => document.getElementById("sp-quick-widget")?.shadowRoot.textContent || "")) === want);
  }
  const before = pings + down + up;
  await p.goto(base + "speed+test"); await p.waitForTimeout(1500);
  check("nothing sent before Start", pings + down + up === before);
  await p.locator("#sp-quick-widget .go").click();
  await p.waitForFunction(() => /Done|stopped/.test(document.getElementById("sp-quick-widget").shadowRoot.querySelector(".state").textContent), null, { timeout: 90000 });
  const res = await p.evaluate(() => { const r = document.getElementById("sp-quick-widget").shadowRoot; return { state: r.querySelector(".state").textContent, vals: Array.from(r.querySelectorAll(".stat .v")).map((v) => v.textContent), btn: r.querySelector(".act").textContent }; });
  check("test finishes with all four numbers", /^Done · Cloudflare server YYZ/.test(res.state) && res.vals.every((v) => /^\d/.test(v)) && res.btn === "Run again", JSON.stringify(res));
  check("pings, downloads and uploads made", pings >= 8 && down >= 3 && up >= 3, "pings " + pings + ", downloads " + down + ", uploads " + up);
  await p.waitForTimeout(500);
  const g = await p.evaluate(() => { const r = document.getElementById("sp-quick-widget").shadowRoot; return { shown: getComputedStyle(r.querySelector(".gauge")).display !== "none", needle: r.querySelector(".needle").style.transform, read: r.querySelector(".gread").textContent }; });
  check("speedometer shown with the result", g.shown && /rotate\(/.test(g.needle) && /Done/.test(g.read), JSON.stringify(g));
  await p.locator("#sp-quick-widget .gear").click();
  await p.locator('#sp-quick-widget input[data-opt="gauge"]').click(); await p.waitForTimeout(300);
  const off = await p.evaluate(() => { const r = document.getElementById("sp-quick-widget").shadowRoot; return { gauge: getComputedStyle(r.querySelector(".gauge")).display, still: /Done/.test(r.querySelector(".state").textContent), saved: JSON.parse(localStorage.getItem("__gm_quick:settings")).gauge }; });
  check("⚙ switch hides the speedometer and keeps the result", off.gauge === "none" && off.still && off.saved === false, JSON.stringify(off));
  await p.locator('#sp-quick-widget input[data-opt="gauge"]').click(); await p.locator("#sp-quick-widget .gear").click(); await p.waitForTimeout(200);
  await p.locator("#sp-quick-widget .act").click(); await p.waitForTimeout(600);
  await p.locator("#sp-quick-widget .act").click(); await p.waitForTimeout(1500);
  const stopped = await p.evaluate(() => { const r = document.getElementById("sp-quick-widget").shadowRoot; return { state: r.querySelector(".state").textContent, btn: r.querySelector(".act").textContent }; });
  check("Stop stops it", /you stopped it/.test(stopped.state) && stopped.btn === "Run again", JSON.stringify(stopped));
  check("no page errors", !errors.length, errors.join(" | "));
  await browser.close(); done();
})().catch((e) => { console.error(e); done(); process.exitCode = 1; });
