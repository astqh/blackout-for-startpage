// Stand-in OpenAI-compatible server for tests. Streams replies (SSE) so time-to-first-words is real, logs every request
// (path, time, size, model, first words of the system prompt), and can be switched into failure modes:
//   GET /ctl?mode=normal|401|429|slow|drip|hang|offline|empty|skip   (drip: 350 ms per word)   GET /log   GET /reset
const http = require("http");
let mode = "normal", log = [];
const REWRITE = "sky colour physics";
http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Expose-Headers", "Retry-After");
  if (req.method === "OPTIONS") return res.end();
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/ctl") { mode = u.searchParams.get("mode") || "normal"; return res.end(mode); }
  if (u.pathname === "/log") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify(log)); }
  if (u.pathname === "/reset") { log = []; mode = "normal"; return res.end("ok"); }
  // /img/<w>x<h>.svg: a picture of that size, for the image tests (counted in /log as "img")
  const im = /^\/img\/(\d+)x(\d+)\.svg$/.exec(u.pathname);
  if (im) {
    log.push({ t: Date.now(), path: "img", w: +im[1], h: +im[2], i: u.searchParams.get("i") });
    res.setHeader("Content-Type", "image/svg+xml"); res.setHeader("Cache-Control", "no-store");
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="' + im[1] + '" height="' + im[2] + '" viewBox="0 0 ' + im[1] + " " + im[2] + '"><rect width="100%" height="100%" fill="hsl(' + ((+u.searchParams.get("i") || 1) * 47 % 360) + ',55%,45%)"/><text x="50%" y="50%" fill="#fff" font-size="' + Math.max(8, Math.round(Math.min(+im[1], +im[2]) / 6)) + '" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">' + im[1] + "×" + im[2] + "</text></svg>");
  }
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    let j = {}; try { j = JSON.parse(body); } catch (e) {}
    const sys = ((j.messages || [])[0] || {}).content || "";
    const entry = { t: Date.now(), path: u.pathname, bytes: body.length, model: j.model, stream: !!j.stream, sys: sys.slice(0, 60), auth: !!req.headers.authorization, cookie: !!req.headers.cookie, messages: j.messages };
    log.push(entry);
    if (mode === "offline") return req.socket.destroy();
    if (mode === "hang") return;
    if (mode === "401") { res.statusCode = 401; return res.end('{"error":{"message":"Invalid API key"}}'); }
    if (mode === "429") { res.statusCode = 429; res.setHeader("Retry-After", "2"); return res.end('{"error":{"message":"Rate limit reached"}}'); }
    if (u.pathname.endsWith("/models")) { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ data: [{ id: "test-model", status: "loaded" }, { id: "other-model" }] })); }
    const text = mode === "empty" ? "" : mode === "skip" ? "SKIP"
      : /turn the last message/.test(sys) ? REWRITE
      : /summarize one web page/.test(sys) ? "- **Test page** about the sky [1].\n- Rayleigh scattering makes it blue."
      : "The sky looks **blue** because of Rayleigh scattering [1]. Shorter blue wavelengths scatter more in the air [2].";
    const go = () => {
      if (!j.stream) { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: text } }] })); }
      res.setHeader("Content-Type", "text/event-stream");
      const parts = text.match(/\S+\s*/g) || [];
      let i = 0;
      const tick = () => {
        if (i < parts.length) { if (res.destroyed) return; res.write("data: " + JSON.stringify({ choices: [{ delta: { content: parts[i++] } }] }) + "\n\n"); setTimeout(tick, mode === "drip" ? 350 : 15); }
        else { res.write("data: [DONE]\n\n"); res.end(); }
      };
      setTimeout(tick, 60);                                   // 60 ms to first token
    };
    if (mode === "slow") setTimeout(go, 3000); else go();
  });
}).listen(9999, "127.0.0.1");
