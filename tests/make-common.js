// Fills the COMMON list in the scripts that fix misspelt keywords (quick, F1, Instant Answer): the everyday English
// words that are close enough to one of the script's keywords that they would otherwise be "corrected" into it
// ("time" → "timer", "rest" → "test"). Run it after changing a keyword list:
//   node tests/make-common.js path/to/common-english-words.txt
// The word list (one word per line, e.g. google-10000-english) is only read here, never shipped.
const fs = require("fs"), path = require("path");
const REPO = path.resolve(__dirname, "..");
const words = fs.readFileSync(process.argv[2], "utf8").split(/\s+/).filter((w) => /^[a-z]{4,}$/.test(w));
const between = (s, a, b) => { const i = s.indexOf(a); return i < 0 ? "" : s.slice(i + a.length, s.indexOf(b, i)); };
const literal = (s, name) => { const t = between(s, "const " + name + " = ", "};\n"); return t ? new Function("return " + t + "}")() : {}; };
const vocabOf = (src) => {
  let text = between(src, '/*VOCAB*/"', '"/*/VOCAB*/');
  for (const name of ["CUR_WORDS", "LANGS", "EXTRA"]) { const o = literal(src, name); text += " " + Object.keys(o).join(" ").replace(/_/g, " ") + " " + Object.values(o).flat().join(" "); }
  return new Set(text.toLowerCase().split(/\s+/).filter((w) => /^[a-z]{3,}$/.test(w)));
};
// the same distance and reach as the scripts
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let low = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v); if (v < low) low = v;
    }
    if (low > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}
const reach = (w) => (w.length >= 7 ? 2 : 1);
for (const f of ["scripts/quick.user.js", "scripts/f1.user.js", "scripts/instant-answer.user.js"]) {
  const file = path.join(REPO, f), src = fs.readFileSync(file, "utf8");
  if (!src.includes("/*COMMON*/")) continue;
  const vocab = vocabOf(src);
  const common = words.filter((w) => !vocab.has(w) && [...vocab].some((v) => v.length >= 3 && editDistance(w, v, reach(w)) <= reach(w)));
  const out = src.replace(/\/\*COMMON\*\/"[^"]*"\/\*\/COMMON\*\//, '/*COMMON*/"' + common.join(" ") + '"/*/COMMON*/');
  fs.writeFileSync(file, out);
  console.log(f + ": " + vocab.size + " keywords, " + common.length + " everyday words kept as they are");
}
