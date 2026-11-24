// Misspelt keywords and searches that find nothing: the keyword fixer on its own (node), then the cards in the
// browser on Startpage sample pages.
const { src, initScript, launch, ai, reporter, IAsettings } = require("./lib");
const { routeStartpage } = require("./sp-pages");
const { check, done } = reporter();
// the fixer and keyword list of one script, taken from its source
function fixerOf(file, extraWords) {
  const s = src(file);
  const block = s.slice(s.indexOf("  const COMMON = new Set("), s.indexOf("    return changed ? out.join(\" \") : null;\n  }") + 46);
  const lit = (name) => { const i = s.indexOf("const " + name + " = "); return i < 0 ? "{}" : s.slice(i + name.length + 9, s.indexOf("};\n", i) + 1); };
  const voc = s.slice(s.indexOf('/*VOCAB*/"') + 10, s.indexOf('"/*/VOCAB*/'));
  return new Function(block + "\nconst CUR_WORDS = " + lit("CUR_WORDS") + ", LANGS = " + lit("LANGS") + ";\n" +
    "const V = new Set((" + JSON.stringify(voc + " " + (extraWords || "")) + " + ' ' + Object.keys(CUR_WORDS).join(' ') + ' ' + Object.keys(LANGS).join(' ')).split(/\\s+/).filter((w) => /^[a-z]{3,}$/.test(w)));\n" +
    "return (t) => fixWords(t, V);")();
}
const quick = fixerOf("scripts/quick.user.js"), f1 = fixerOf("scripts/f1.user.js", "silverstone monza monaco interlagos suzuka"), ia = fixerOf("scripts/instant-answer.user.js");
for (const [fix, q, want] of [
  [quick, "5 minut timer", "5 minute timer"], [quick, "spead test", "speed test"], [quick, "internet sped test", "internet speed test"],
  [quick, "flip a coinn", "flip a coin"], [quick, "roll a dcie", "roll a dice"], [quick, "100 eruos", "100 euros"],
  [quick, "50 dolars in yen", "50 dollars in yen"], [quick, "good morning in frnech", "good morning in french"], [quick, "thank you in spansih", "thank you in spanish"],
  [quick, "trakcing number 1z999aa10123456784", "tracking number 1z999aa10123456784"], [quick, "colour pickr", "colour picker"], [quick, "random numbr", "random number"],
  [quick, "5 minute time", null], [quick, "test drive", null], [quick, "rolling stones", null], [quick, "best french restaurants", null],
  [quick, "time in paris", null], [quick, "coins for sale", null], [quick, "speed of light", null], [quick, "nice weather", null], [quick, "rest timer", null],
  [f1, "monza qualifiyng", "monza qualifying"], [f1, "f1 standigns", "f1 standings"], [f1, "constuctors standings", "constructors standings"],
  [f1, "silverstne results", "silverstone results"], [f1, "next race", null], [f1, "race condition", null], [f1, "points of interest", null],
  [ia, "waht is rust", "what is rust"], [ia, "diffrence between tcp and udp", "difference between tcp and udp"], [ia, "expain recursion", "explain recursion"],
  [ia, "rust programming language", null], [ia, "whats new", null]]) {
  const got = fix(q);
  check("fix “" + q + "” → " + (want === null ? "unchanged" : "“" + want + "”"), got === want, String(got));
}
(async () => {
  const browser = await launch();
  const ctx = await browser.newContext();
  await ctx.addInitScript(initScript(false, ["quick", "instant-answer"]));
  let asked = [];
  await routeStartpage(ctx, {
    empty: (q) => /javscript|qqq/.test(q),
    suggest: (q) => { asked.push(q); return /javscript/.test(q) ? [q, ["javascript closures", "javascript closures explained", "java script"]] : [q, []]; },
  });
  await ctx.route("https://api.frankfurter.dev/**", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ date: "2026-11-23", rates: { USD: 1.05, JPY: 160, GBP: 0.85, CAD: 1.47 } }) }));
  const p = await ctx.newPage(); const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  const card = () => p.evaluate(() => { const h = document.getElementById("sp-quick-widget"); return h && h.isConnected ? { title: h.shadowRoot.querySelector("h2")?.textContent || "", text: h.shadowRoot.textContent } : null; });
  const go = async (q) => { await p.goto("https://www.startpage.com/sp/search?query=" + encodeURIComponent(q)); await p.waitForTimeout(1300); return card(); };
  for (const [q, title, fixed] of [["5 minut timer", "Timer", "5 minute timer"], ["spead test", "Internet speed", "speed test"], ["flip a coinn", "Coin flip", "flip a coin"],
    ["100 eruos", "Currency", "100 euros"], ["good morning in frnech", "Translate", "good morning in french"], ["5 minute timer", "Timer", null], ["5 minute time", null, null]]) {
    const c = await go(q);
    if (title === null) check("card: “" + q + "” shows no card", !c, c && c.title);
    else check("card: “" + q + "” → " + title + (fixed ? " · for “" + fixed + "”" : ""), c && c.title.startsWith(title) && (fixed ? c.title.includes("for “" + fixed + "”") : !/ for “/.test(c.title)), c && c.title);
  }
  await p.goto("https://www.startpage.com/sp/search?query=" + encodeURIComponent("good morning in frnech")); await p.waitForTimeout(1500);
  check("translate: a guessed spelling shows a button and never jumps to the translator", /frnech/.test(await p.evaluate(() => document.querySelector("#q").value)) && /Translate/.test((await card() || {}).text || ""));
  // a search that finds nothing: "Did you mean"
  asked = [];
  let c = await go("javscript closures");
  check("did you mean: shown for a search that finds nothing", c && c.title === "Did you mean" && /Did you mean javascript closures\?/.test(c.text), c && c.text.slice(0, 120));
  check("did you mean: asked Startpage once, for this search", asked.length === 1 && asked[0] === "javscript closures", JSON.stringify(asked));
  await p.evaluate(() => document.getElementById("sp-quick-widget").shadowRoot.querySelector(".b.pri").click()); await p.waitForTimeout(1200);
  check("did you mean: the button searches the suggestion", (await p.evaluate(() => document.querySelector("#q").value)) === "javascript closures");
  asked = []; c = await go("why is the sky blue");
  check("did you mean: nothing asked when the search has results", !c && asked.length === 0);
  asked = []; c = await go("qqq zzzz");
  check("did you mean: no card when there's no close suggestion", !c && asked.length === 1);
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("__gm_quick:settings") || "{}"); s.suggest = false; localStorage.setItem("__gm_quick:settings", JSON.stringify(s)); });
  asked = []; c = await go("javscript closures");
  check("did you mean: switched off under ⚙ → nothing asked, no card", !c && asked.length === 0);
  await p.screenshot({ path: "shots/diction-light.png" });
  // Instant Answer: a question with a misspelt question word answers by itself
  await p.evaluate((s) => { localStorage.setItem("__gm_instant-answer:settings", s); localStorage.removeItem("__gm_instant-answer:cache"); }, IAsettings({ mode: "smart" }));
  await ai.reset(); await p.goto("https://www.startpage.com/sp/search?query=" + encodeURIComponent("waht is a heat pump")); await p.waitForTimeout(2500);
  check("instant answer: “waht is a heat pump” answers by itself", (await ai.log()).length === 1);
  await ai.reset(); await p.goto("https://www.startpage.com/sp/search?query=" + encodeURIComponent("heat pump")); await p.waitForTimeout(2500);
  check("instant answer: “heat pump” still only offers Ask AI", (await ai.log()).length === 0);
  check("no page errors", !errors.length, errors.join(" | "));
  await browser.close(); done();
})().catch((e) => { console.error(e); done(); process.exitCode = 1; });
