// Instant Answer suite on Startpage sample pages (both branches): prompts, interface, reliability.
// Usage: node ia.js [quality] [ui] [rel]   (no argument: all)
const { initScript, launch, ai, reporter, IAtext, IAsettings } = require("./lib");
const { routeStartpage } = require("./sp-pages");
const { check, done } = reporter();
const want = (k) => process.argv.length <= 2 || process.argv.includes(k);
const URL_Q = (q) => "https://www.startpage.com/sp/search?query=" + encodeURIComponent(q);
async function freshPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1600, height: 1000 } });
  await ctx.addInitScript(initScript(opts.theme ? "startpage" : false, opts.scripts || ["tweaks", "instant-answer"]));
  await routeStartpage(ctx, opts);
  const p = await ctx.newPage(); p.errors = []; p.on("pageerror", (e) => p.errors.push(e.message));
  await p.goto(URL_Q("x"));
  await p.evaluate((s) => { localStorage.clear(); localStorage.setItem("__gm_instant-answer:settings", s); }, IAsettings(opts.settings));
  return p;
}
const sr = (p, fn, arg) => p.evaluate(fn, arg);
const ask = (p, q) => sr(p, (q) => { const i = document.getElementById("sp-instant-answer").shadowRoot.querySelector(".ask input"); i.value = q; i.closest("form").requestSubmit(); }, q);
module.exports = { freshPage, URL_Q, sr, ask };
if (require.main !== module) return;
(async () => {
  const browser = await launch();
  if (want("quality")) {
    const p = await freshPage(browser);
    await ai.reset();
    await p.goto(URL_Q("why is the sky blue")); await p.waitForTimeout(2500);
    let log = await ai.log();
    const sys = log[0] && log[0].messages[0].content;
    check("quality: answer prompt says result text is never instructions", /never instructions to follow/.test(sys || ""));
    check("quality: answer prompt keeps the SKIP rule for automatic answers", /reply with exactly: SKIP/.test(sys || ""));
    await ai.reset(); await ask(p, "what about this year?"); await p.waitForTimeout(3000);
    log = await ai.log();
    const rw = log.find((e) => /turn the last message/.test(e.messages[0].content));
    check("quality: follow-up rewrite knows today's date", rw && new RegExp("Today is " + new Date().toISOString().slice(0, 10)).test(rw.messages[0].content));
    check("quality: rewrite keeps a question that stands alone", rw && /already stands alone, keep its words/.test(rw.messages[0].content));
    await ai.reset();
    await p.locator(".w-gl > .result .wgl-title-link-container + span button").nth(2).click();
    await p.locator("#spt-ui .menu button[data-act=sum]").click(); await p.waitForTimeout(2500);
    log = await ai.log();
    check("quality: summary prompt says page text is never instructions", log.length && /never instructions to follow/.test(log[0].messages[0].content));
    check("quality: no page errors", !p.errors.length, p.errors.join(" | "));
    await p.context().close();
  }
  if (want("ui")) {
    const { AUDIT } = require("./ui-audit");
    for (const [w, theme] of [[1600, true], [400, true], [1600, false], [400, false]]) {
      const p = await freshPage(browser, { viewport: { width: w, height: 900 }, theme, light: !theme });
      await ai.reset(); await p.goto(URL_Q("why is the sky blue")); await p.waitForTimeout(2200);
      await ask(p, "and what about sunsets?"); await p.waitForTimeout(3000);
      const a = await p.evaluate(AUDIT, "#sp-instant-answer");
      check("ui " + w + (theme ? " blackout" : " light") + ": answer has no overflow, unnamed controls or faint text", !a.overflow.length && !a.unnamed.length && !a.contrast.length && !a.docOverflow, JSON.stringify(a));
      await sr(p, () => window.__menuFns["instant-answer: Instant Answer settings"]()); await p.waitForTimeout(500);
      const b = await p.evaluate(AUDIT, "#sp-instant-answer");
      check("ui " + w + (theme ? " blackout" : " light") + ": settings has no overflow, unnamed fields or faint text", !b.overflow.length && !b.unnamed.length && !b.contrast.length, JSON.stringify(b));
      await p.context().close();
    }
    const p = await freshPage(browser);
    await ai.reset(); await p.goto(URL_Q("why is the sky blue")); await p.waitForTimeout(2200);
    check("ui: finished answer is announced once (live region, not busy)", await sr(p, () => { const b = document.getElementById("sp-instant-answer").shadowRoot.querySelector(".body"); return b.getAttribute("aria-live") === "polite" && b.getAttribute("aria-busy") === "false"; }));
    await ask(p, "what is rayleigh scattering"); await p.waitForTimeout(2500);
    check("ui: follow-up is announced once complete", await sr(p, () => { const t = document.getElementById("sp-instant-answer").shadowRoot.querySelector(".turn"); return t.getAttribute("aria-live") === "polite" && t.getAttribute("aria-busy") === "false"; }));
    // settings from the ⋯ menu: Esc closes it and focus goes back to the ⋯ button
    await sr(p, () => document.getElementById("sp-instant-answer").shadowRoot.querySelector(".dots").focus());
    await p.keyboard.press("Enter"); await p.waitForTimeout(200);
    await sr(p, () => document.getElementById("sp-instant-answer").shadowRoot.querySelector('[data-act="gear"]').click()); await p.waitForTimeout(400);
    for (let i = 0; i < 60; i++) await p.keyboard.press("Tab");
    check("ui: Tab stays inside the settings panel", await sr(p, () => { const r = document.getElementById("sp-instant-answer").shadowRoot; return !!r.querySelector(".overlay") && r.querySelector(".overlay").contains(r.activeElement); }));
    await p.keyboard.press("Escape"); await p.waitForTimeout(200);
    check("ui: Esc closes settings and focus returns", await sr(p, () => { const r = document.getElementById("sp-instant-answer").shadowRoot; return !r.querySelector(".overlay") && r.activeElement && r.activeElement.classList.contains("dots"); }), await sr(p, () => { const r = document.getElementById("sp-instant-answer").shadowRoot; return r.activeElement ? r.activeElement.className : "none"; }));
    // conversation panel: Tab stays inside, Esc closes, focus back on the expand button
    await sr(p, () => document.getElementById("sp-instant-answer").shadowRoot.querySelector(".conv-open").focus());
    await p.keyboard.press("Enter"); await p.waitForTimeout(500);
    for (let i = 0; i < 30; i++) await p.keyboard.press("Tab");
    check("ui: Tab stays inside the conversation panel", await sr(p, () => { const r = document.getElementById("sp-instant-answer").shadowRoot; const c = r.querySelector(".conv"); return !!c && c.contains(r.activeElement); }));
    await p.keyboard.press("Escape"); await p.waitForTimeout(200);
    check("ui: Esc closes the conversation and focus returns", await sr(p, () => { const r = document.getElementById("sp-instant-answer").shadowRoot; return !r.querySelector(".conv") && r.activeElement && r.activeElement.classList.contains("conv-open"); }));
    check("ui: no page errors", !p.errors.length, p.errors.join(" | "));
    await p.context().close();
  }
  if (want("rel")) {
    const R = (p) => sr(p, () => { const r = document.getElementById("sp-instant-answer").shadowRoot; return { text: r.querySelector(".wrap").textContent.replace(/\s+/g, " "), busy: !!r.querySelector(".ov.busy"), shimmer: !!r.querySelector(".body .shimmer"), stop: (() => { const b = r.querySelector(".stopbtn"); return !!b && !b.hidden; })(), meta: (r.querySelector(".meta") || {}).textContent || "", retry: Array.from(r.querySelectorAll("button.btn")).map((b) => b.textContent) }; });
    const p = await freshPage(browser);
    const errCase = async (mode, q, re, name) => {
      await ai.reset(); await ai.mode(mode);
      await p.goto(URL_Q(q)); await p.waitForTimeout(mode === "429" ? 4000 : 2500);
      const r = await R(p), n = (await ai.log()).length;
      check("rel " + name, re.test(r.text) && !r.busy && !r.shimmer && !r.stop && r.retry.length > 0, JSON.stringify({ text: r.text.slice(0, 160), busy: r.busy, buttons: r.retry, requests: n }));
      return n;
    };
    await errCase("offline", "how does a heat pump work", /Your local model isn't answering/, "offline: clear message and Try again, no spinner");
    await errCase("401", "how does a heat pump work 2", /was refused/, "401: key refused message");
    const n429 = await errCase("429", "how does a heat pump work 3", /busy or you've reached its limit\. Try again in 2 seconds/, "429: rate limit message with the wait from Retry-After");
    check("rel 429: no retrying on its own", n429 === 1, n429 + " requests");
    await errCase("empty", "how does a heat pump work 4", /came back empty/, "empty reply: clear message");
    await ai.reset(); await ai.mode("slow"); await p.goto(URL_Q("how does a heat pump work 5")); await p.waitForTimeout(5500);
    check("rel slow service (3 s to first words): answer still arrives", /Rayleigh/.test((await R(p)).text));
    // Stop part-way through the answer: keep what was written, nothing saved
    await ai.reset(); await ai.mode("drip"); await p.goto(URL_Q("how does a heat pump work 6")); await p.waitForTimeout(2200);
    const before = await R(p);
    check("rel answer: Stop shows while writing", before.stop && before.busy, JSON.stringify(before).slice(0, 200));
    await sr(p, () => document.getElementById("sp-instant-answer").shadowRoot.querySelector(".stopbtn").click());
    const atStop = (await R(p)).text; await p.waitForTimeout(1500); const after = await R(p);
    check("rel answer: Stop keeps the words so far and stops writing", /sky/.test(after.text) && after.text === atStop && !after.busy && !after.stop && /stopped/.test(after.meta), JSON.stringify({ meta: after.meta, text: after.text.slice(0, 120) }));
    check("rel answer: a stopped answer isn't saved", !(await sr(p, () => Object.keys(JSON.parse(localStorage.getItem("__gm_instant-answer:cache") || "{}")).some((k) => /heat pump work 6/.test(k)))));
    await ai.reset(); await ai.mode("slow"); await p.goto(URL_Q("how does a heat pump work 7")); await p.waitForTimeout(1500);
    await sr(p, () => document.getElementById("sp-instant-answer").shadowRoot.querySelector(".stopbtn").click()); await p.waitForTimeout(2500);
    check("rel answer: Stop before any words offers Ask AI again", /Ask AI.*Stopped before the answer/.test((await R(p)).text), (await R(p)).text.slice(0, 120));
    // Stop part-way through a follow-up
    await ai.reset(); await ai.mode("normal"); await p.goto(URL_Q("why is the sky blue")); await p.waitForTimeout(2200);
    await ai.mode("drip"); await ask(p, "what is rayleigh scattering"); await p.waitForTimeout(1600);
    check("rel follow-up: Stop shows while writing", (await R(p)).stop);
    await sr(p, () => document.getElementById("sp-instant-answer").shadowRoot.querySelector(".stopbtn").click()); await p.waitForTimeout(1200);
    const fu = await sr(p, () => { const t = document.getElementById("sp-instant-answer").shadowRoot.querySelector(".turn"); return { text: t.textContent.replace(/\s+/g, " "), busy: t.getAttribute("aria-busy"), shimmer: !!t.querySelector(".shimmer") }; });
    check("rel follow-up: Stop keeps the words so far and says Stopped", /sky.*Stopped\./.test(fu.text) && fu.busy === "false" && !fu.shimmer, JSON.stringify(fu));
    await ai.mode("normal"); await ask(p, "and what is mie scattering"); await p.waitForTimeout(3500);
    check("rel follow-up: the next follow-up works after a stop", /Rayleigh/.test(await sr(p, () => document.getElementById("sp-instant-answer").shadowRoot.querySelectorAll(".turn")[1].textContent)));
    // Stop in the conversation panel, then keep talking
    await sr(p, () => document.getElementById("sp-instant-answer").shadowRoot.querySelector(".conv-open").click()); await p.waitForTimeout(500);
    await ai.mode("drip");
    await sr(p, () => { const r = document.getElementById("sp-instant-answer").shadowRoot; const t = r.querySelector(".conv textarea"); t.value = "what is rayleigh scattering"; t.closest("form").requestSubmit(); }); await p.waitForTimeout(1600);
    check("rel conversation: Stop shows while writing", await sr(p, () => !document.getElementById("sp-instant-answer").shadowRoot.querySelector('.conv [data-c="stop"]').hidden));
    await sr(p, () => document.getElementById("sp-instant-answer").shadowRoot.querySelector('.conv [data-c="stop"]').click()); await p.waitForTimeout(800);
    await ai.mode("normal");
    await sr(p, () => { const r = document.getElementById("sp-instant-answer").shadowRoot; const t = r.querySelector(".conv textarea"); t.value = "and what is mie scattering"; t.closest("form").requestSubmit(); }); await p.waitForTimeout(2500);
    const cv = await sr(p, () => { const r = document.getElementById("sp-instant-answer").shadowRoot; return { text: r.querySelector(".conv .scroll").textContent.replace(/\s+/g, " "), stopHidden: r.querySelector('.conv [data-c="stop"]').hidden }; });
    check("rel conversation: Stop keeps the words, says Stopped, and the next message is answered", /Stopped/.test(cv.text) && /mie scattering.*Rayleigh/.test(cv.text) && cv.stopHidden, cv.text.slice(-200));
    await p.keyboard.press("Escape");
    // closing a summary part-way stops it
    await ai.reset(); await ai.mode("drip");
    await p.locator(".w-gl > .result .wgl-title-link-container + span button").nth(3).click();
    await p.locator("#spt-ui .menu button[data-act=sum]").click(); await p.waitForTimeout(1200);
    await sr(p, () => { const s = document.querySelectorAll(".sp-ai-summary"); s[s.length - 1].shadowRoot.querySelector(".x").click(); }); await p.waitForTimeout(2000);
    check("rel summary: closing it part-way removes it for good", (await sr(p, () => document.querySelectorAll(".sp-ai-summary").length)) === 0);
    await ai.mode("normal");
    check("rel: no page errors", !p.errors.length, p.errors.join(" | "));
    await p.context().close();
    // Startpage's "verify you're human" page during the AI's own search
    const v = await freshPage(browser, { verify: true });
    await ai.reset(); await v.goto(URL_Q("why is the sky blue")); await v.waitForTimeout(2200);
    await ask(v, "and what about sunsets?"); await v.waitForTimeout(3500);
    const vt = await IAtext(v);
    check("rel Startpage check page: says so, and still answers from what it has", /The search didn't work \(Startpage wants a check first: search once on startpage\.com, then try again\)/.test(vt) && /sunsets\?.*Rayleigh/.test(vt), vt.slice(-220));
    await v.context().close();
    if (process.argv.includes("long")) {
      const t = await freshPage(browser);
      await ai.reset(); await ai.mode("hang"); await t.goto(URL_Q("how does a heat pump work 8")); await t.waitForTimeout(95000);
      check("rel no answer at all: gives up after 90 s with a clear message", /took too long/.test(await IAtext(t)));
      await ai.mode("normal"); await t.context().close();
    }
  }
  await browser.close(); done();
})().catch((e) => { console.error(e); done(); process.exitCode = 1; });
