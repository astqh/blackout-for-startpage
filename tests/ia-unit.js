// Unit checks for Instant Answer's pure helpers, taken straight from the script's source.
const { src, reporter } = require("./lib");
const { check, done } = reporter();
const s = src("scripts/instant-answer.user.js");
const line = (start) => s.slice(s.indexOf(start), s.indexOf("\n", s.indexOf(start)));
const block = (start, end) => s.slice(s.indexOf(start), s.indexOf(end, s.indexOf(start)));
const code = [line("const STOP ="), line("const termsOf ="), line("const REFERS ="), block("function covered(", "\n  }\n") + "\n  }",
  line("const NAV ="), line('"wikipedia spotify'), line('"chatgpt claude'), line('"classroom drive'), line("const Q_START ="), line("const Q_ANY ="), line("const NO_AI ="), line("const MATH ="),
  block("function classify(", "\n  }\n") + "\n  }", block("function classifyAsTyped(", "\n  }\n") + "\n  }",
  block("  const COMMON = new Set(", "  // The question words classify() listens for"), line("const Q_VOCAB =")].join("\n");
const T = new Function(code + "\nreturn { covered, classify };")();
const sources = [{ title: "Why the sky is blue on bbc", snippet: "Rayleigh scattering explained" }, { title: "Blue sky - Wikipedia", snippet: "Diffuse sky radiation, sunlight scattered by molecules" }];
for (const [q, w] of [["why does rayleigh scattering make the sky blue", true], ["what is rayleigh scattering", true], ["and what about sunsets?", false], ["why is it blue", false],
  ["how do sunsets get red", false], ["what about mars", false], ["blue sky radiation", true]]) check("covered(" + q + ")", T.covered(q, sources) === w);
for (const [q, w] of [["why is the sky blue", "auto"], ["how to boil an egg", "auto"], ["firefox vs brave", "auto"], ["youtube", "none"], ["gmail login", "none"], ["12*7", "none"],
  ["github.com", "none"], ["site:reddit.com rust", "none"], ["best laptop 2026", "offer"], ["\"exact phrase\"", "offer"], ["toronto weather", "offer"],
  ["what's the capital of australia", "auto"], ["rust borrow checker lifetimes explained simply", "auto"], ["taylor swift lyrics", "none"],
  ["waht is a heat pump", "auto"], ["diffrence between tcp and udp", "auto"], ["heat pump", "offer"], ["youtub", "offer"]])
  check("classify(" + q + ") = " + w, T.classify(q) === w, T.classify(q));
done();
