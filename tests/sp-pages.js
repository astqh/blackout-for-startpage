// Startpage-shaped sample pages served at www.startpage.com (routed), for both branches.
const res = (i, host) => '<div class="result"><div class="upper"><span class="favicon"><img alt="" width="28" height="28" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></span><div class="wgl-title-link-container"><span class="site">' + host +
  '</span><a class="wgl-display-url" href="https://' + host + '/p">' + host + '</a></div></div><a class="result-title result-link" href="https://' + host + '/p' + i + '"><h2 class="wgl-title">Why the sky is blue, part ' + i + ' on ' + host +
  '</h2></a><p class="description">Rayleigh scattering explained, ' + i + '.</p><div class="anonymous-view-link"><a href="https://www.startpage.com/av/proxy?u=' + host + '">Visit in Anonymous View</a></div></div>';
const HOSTS = ["en.wikipedia.org", "www.bbc.co.uk", "github.com", "example.org", "spaceplace.nasa.gov", "www.britannica.com", "math.ucr.edu", "www.reddit.com"];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const RESULTS = (q, light) => '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font:16px system-ui;background:' + (light ? "#fff;color:#202124" : "#000;color:#e6e6e9") + '} header{padding:12px} main{max-width:760px;padding:0 16px} .result{margin:18px 0}</style></head><body><header><form id="search"><input type="hidden" name="cat" value="web"><input id="q" class="search-form-input" name="query" value="' + esc(q) + '"></form></header>' +
  '<main id="main"><div id="ee-mainline-top"></div><div class="w-gl">' + HOSTS.map((h, i) => res(i + 1, h)).join("") +
  '<div class="result h"><a class="result-title" href="https://www.startpage.com/clev">trap</a></div></div></main></body></html>';
const HOME = '<!doctype html><html><head></head><body><section class="hero"><div class="search-home"><div class="search-home-inner"><form id="search"><div class="search-form-relative-container"><input id="q" name="query"></div></form></div></div></section></body></html>';
// Startpage's "Verifying your request" page, as a search answer
const VERIFY = '<!doctype html><html><body><h1>Verifying your request</h1><p>Please complete the check to continue. We noticed unusual activity.</p></body></html>';
async function routeStartpage(ctx, opts = {}) {
  await ctx.route("https://www.startpage.com/**", (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === "/sp/search" && r.request().method() === "POST") {          // Instant Answer's own searches
      if (opts.verify) return r.fulfill({ contentType: "text/html", body: VERIFY });
      const q = new URLSearchParams(r.request().postData() || "").get("query") || "";
      return r.fulfill({ contentType: "text/html", body: RESULTS(q).replace(/Why the sky is blue/g, q) });
    }
    if (u.pathname === "/suggestions") return r.fulfill({ contentType: "application/json", body: JSON.stringify(opts.suggest ? opts.suggest(u.searchParams.get("q") || "") : []) });
    if (u.pathname === "/sp/search") {
      const q = u.searchParams.get("query") || "";
      const page = RESULTS(q, opts.light);
      // opts.empty(q): this search finds nothing (a misspelt search)
      return r.fulfill({ contentType: "text/html", body: opts.empty && opts.empty(q) ? page.replace(/<div class="w-gl">[\s\S]*<\/div><\/main>/, '<div class="w-gl"></div></main>') : page });
    }
    return r.fulfill({ contentType: "text/html", body: HOME });
  });
  // the result sites themselves, for summaries and page reads
  await ctx.route(/^https:\/\/(en\.wikipedia\.org|www\.bbc\.co\.uk|github\.com|example\.org|spaceplace\.nasa\.gov|www\.britannica\.com|math\.ucr\.edu|www\.reddit\.com)\//, (r) =>
    r.fulfill({ contentType: "text/html", body: "<html><head><title>Sky</title></head><body><article><h1>Why is the sky blue?</h1>" + "<p>Sunlight is scattered by the molecules of the air. Blue light has a shorter wavelength and is scattered more than red light, which is why the sky looks blue on a clear day.</p>".repeat(8) + "</article></body></html>" }));
}
module.exports = { routeStartpage, HOSTS };
