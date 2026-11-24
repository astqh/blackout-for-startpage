// Image results on SearXNG (Tweaks): rows, sharp previews, duplicates, order, the detail view, the switches.
// Local SearXNG with the image test engine (tests/searxng-test-images.py); add "live" for priv.au as well.
const { initScript, launch, ai, reporter } = require("./lib");
const { check, done } = reporter();
const BASE = "http://127.0.0.1:8888";
const state = (p) => p.evaluate(() => {
  const box = document.querySelector("#urls"), arts = Array.from(box.querySelectorAll("article.result-images"));
  const shown = arts.filter((a) => getComputedStyle(a).display !== "none");
  return { grid: box.classList.contains("spt-img"), total: arts.length, shown: shown.length,
    order: shown.map((a) => a.querySelector(".title").textContent + " @" + a.querySelector(".source").textContent),
    heights: shown.map((a) => Math.round(a.querySelector("img.image_thumbnail").getBoundingClientRect().height)),
    widths: shown.map((a) => Math.round(a.querySelector("img.image_thumbnail").getBoundingClientRect().width)),
    srcs: shown.map((a) => a.querySelector("img.image_thumbnail").getAttribute("src")),
    note: (box.querySelector(".spt-img-note") || {}).textContent || "", overflow: document.documentElement.scrollWidth > innerWidth + 1 };
});
(async () => {
  const browser = await launch();
  const page = async (w, settings) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: 1000 } });
    await ctx.addInitScript(initScript("searxng", ["tweaks"]));
    const p = await ctx.newPage(); p.errors = []; p.on("pageerror", (e) => p.errors.push(e.message));
    await p.goto(BASE + "/"); await p.evaluate((s) => { localStorage.clear(); if (s) localStorage.setItem("__gm_tweaks:settings", JSON.stringify(s)); }, settings || null);
    return p;
  };
  let p = await page(1600);
  await ai.reset();
  await p.goto(BASE + "/search?q=husky&categories=images"); await p.waitForTimeout(2500);
  let st = await state(p);
  const imgs = (await ai.log()).filter((e) => e.path === "img");
  check("rows: pictures 190 px tall, side by side", st.grid && st.heights.every((h) => h === 190), st.heights.join(","));
  const cap = await p.evaluate(() => Array.from(document.querySelectorAll("#urls article.result-images:not([data-spt-dup])")).map((a) => {
    const i = a.querySelector("img.image_thumbnail").getBoundingClientRect(), t = a.querySelector(".title").getBoundingClientRect(), s = a.querySelector(".source").getBoundingClientRect(), r = a.getBoundingClientRect();
    return t.top >= i.bottom - 1 && s.top >= t.bottom - 1 && s.bottom <= r.bottom + 1; }));
  check("rows: title, then site, under each picture, inside its tile (nothing overlaps)", cap.every(Boolean), cap.join(","));
  check("rows: each picture keeps its shape (portrait narrower than landscape)", (() => { const i = st.order.findIndex((o) => /portrait/.test(o)), j = st.order.findIndex((o) => /close-up/.test(o)); return i >= 0 && j >= 0 && st.widths[i] < st.widths[j]; })(), st.widths.join(","));
  check("duplicates: 3 copies of one picture → 1 shown, the largest", st.order.filter((o) => /in the snow/.test(o)).length === 1 && st.srcs[st.order.findIndex((o) => /in the snow/.test(o))].includes("i=10"), st.order.filter((o) => /snow/.test(o)).join(" | "));
  check("duplicates: a line says how many were left out", /2 copies of pictures already shown were left out/.test(st.note), st.note);
  const pos = (re) => st.order.findIndex((o) => re.test(o));
  check("order: pictures titled with the search words come first", st.order.slice(0, 5).every((o) => /husky/i.test(o)), st.order.slice(0, 5).join(" | "));
  check("order: tiny picture, thin banner and Instagram crawler link go last", ["Tiny icon", "Header banner", "Our team"].every((t) => pos(new RegExp(t)) >= st.shown - 3), st.order.join(" | "));
  check("sharp previews: nothing fetched from the sites when the instance doesn't pass pictures through itself", imgs.every((e) => !/^(1600x1200|2000x1333|1200x1800|3000x2000|1500x1000|1280x853)$/.test(e.w + "x" + e.h)) && st.srcs.every((s) => /\/img\/\d+x\d+\.svg/.test(s)), imgs.map((e) => e.w + "x" + e.h).join(","));
  // SearXNG's own detail view still works
  await p.locator("#urls article.result-images:not([data-spt-dup]) img.image_thumbnail").first().click(); await p.waitForTimeout(800);
  const det = await p.evaluate(() => ({ open: !!document.querySelector(".image-detail-open"), big: (() => { const d = document.querySelector("article.result-images[data-vim-selected] .detail img") || document.querySelector(".image-detail-open article .detail img[src]:not([src=''])"); return d ? Math.round(d.getBoundingClientRect().width) : 0; })() }));
  check("detail view: clicking a picture still opens SearXNG's large view", det.open && det.big > 200, JSON.stringify(det));
  await p.screenshot({ path: "shots/images-detail-1600.png" });
  await p.keyboard.press("Escape"); await p.goto(BASE + "/search?q=husky&categories=images"); await p.waitForTimeout(2000);
  await p.screenshot({ path: "shots/images-1600-blackout.png" });
  check("no page errors", !p.errors.length, p.errors.join(" | "));
  await p.context().close();
  // phone width
  p = await page(400);
  await p.goto(BASE + "/search?q=husky&categories=images"); await p.waitForTimeout(2200);
  st = await state(p);
  check("phone: pictures 128 px tall, nothing wider than the screen", st.heights.every((h) => h === 128) && !st.overflow, st.heights.join(",") + " overflow " + st.overflow);
  const gaps = await p.evaluate(() => { const box = document.querySelector("#urls").getBoundingClientRect(); const arts = Array.from(document.querySelectorAll("#urls article.result-images:not([data-spt-dup])")); const rows = new Map();
    for (const a of arts) { const r = a.getBoundingClientRect(); const k = Math.round(r.top); rows.set(k, Math.max(rows.get(k) || 0, r.right)); }
    return Array.from(rows.values()).slice(0, -1).map((right) => Math.round(box.right - right)); });
  check("phone: every row but the last reaches the right edge", gaps.every((g) => g <= 2), gaps.join(","));
  await p.screenshot({ path: "shots/images-400-blackout.png" });
  await p.context().close();
  // sharper previews straight from the sites, when switched on
  p = await page(1600, { images: true, imgDirect: true });
  await ai.reset();
  await p.goto(BASE + "/search?q=husky&categories=images"); await p.waitForTimeout(3500);
  st = await state(p);
  const fetched = (await ai.log()).filter((e) => e.path === "img" && e.w >= 1000).map((e) => e.w + "x" + e.h + "#" + e.i);
  const small = st.order.map((o, i) => ({ o, s: st.srcs[i] })).filter((x) => /close-up|wallpaper/.test(x.o));
  check("sharp previews (switched on): small thumbnails replaced by the full picture", st.srcs.filter((s) => /\/img\/(1600x1200|1500x1000|1280x853|1200x1800|3000x2000)\.svg/.test(s)).length >= 4, st.srcs.join(" "));
  check("sharp previews: thumbnails that are sharp enough are kept (no extra download)", small.every((x) => /474x/.test(x.s)) && !fetched.some((f) => /^(1920x1080|1920x1200)/.test(f)), JSON.stringify({ small, fetched }));
  check("sharp previews: nothing downloaded for tiny pictures, banners or Instagram crawler links", !fetched.some((f) => /^(120x90|1600x180|1080x1350)/.test(f)), fetched.join(","));
  await p.context().close();
  // switched off: SearXNG's own layout
  p = await page(1600, { images: false });
  await p.goto(BASE + "/search?q=husky&categories=images"); await p.waitForTimeout(2000);
  st = await state(p);
  check("switched off: SearXNG's own image layout, all results, original order", !st.grid && st.shown === 12 && /Holiday snapshot/.test(st.order[0]));
  await p.context().close();
  if (process.argv.includes("live")) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "en-US", userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36", deviceScaleFactor: 2 });
    await ctx.addInitScript(initScript("searxng", ["tweaks"]));
    const q = await ctx.newPage(); const errs = []; q.on("pageerror", (e) => errs.push(e.message));
    await q.goto("https://priv.au/"); await q.waitForTimeout(2000);
    await q.fill("#q", "golden retriever puppy"); await Promise.all([q.waitForNavigation(), q.press("#q", "Enter")]); await q.waitForTimeout(2500);
    await q.click("#categories button[name='category_images'], #categories label[for='checkbox_images']").catch(() => {});
    await q.waitForTimeout(7000);
    const lv = await q.evaluate(() => {
      const arts = Array.from(document.querySelectorAll("#urls article.result-images")), shown = arts.filter((a) => getComputedStyle(a).display !== "none");
      const top = shown.slice(0, 12);
      const sharp = top.filter((a) => { const t = a.querySelector("img.image_thumbnail"); return t.naturalHeight >= t.getBoundingClientRect().height * 2 * 0.9; }).length;
      return { grid: !!document.querySelector(".spt-img"), total: arts.length, shown: shown.length, hidden: arts.length - shown.length, sharpTop12: sharp,
        upgraded: arts.filter((a) => a.querySelector("img.image_thumbnail").dataset.sptSharp).length, h: Math.round(top[0].querySelector("img.image_thumbnail").getBoundingClientRect().height),
        sameOrigin: arts.filter((a) => a.querySelector("img.image_thumbnail").dataset.sptSharp).every((a) => new URL(a.querySelector("img.image_thumbnail").src, location.href).origin === location.origin) };
    });
    check("priv.au: rows 190 px, duplicates left out", lv.grid && lv.h === 190 && lv.hidden > 0, JSON.stringify(lv));
    check("priv.au: the first 12 pictures are sharp on a high-resolution screen", lv.sharpTop12 >= 11, JSON.stringify(lv));
    check("priv.au: sharper pictures come through priv.au's own proxy only", lv.upgraded > 0 && lv.sameOrigin, JSON.stringify(lv));
    await q.screenshot({ path: "shots/images-privau.png" });
    check("priv.au: no page errors", !errs.length, errs.join(" | "));
    await ctx.close();
  }
  await browser.close(); done();
})().catch((e) => { console.error(e); done(); process.exitCode = 1; });
