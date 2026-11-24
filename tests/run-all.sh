#!/usr/bin/env bash
# Runs every suite in this folder and prints one line per suite. Needs Node, Playwright and Chromium, the stand-in
# AI (started here if it isn't running) and, for the SearXNG suites, a SearXNG on 127.0.0.1:8888 (see README.md).
cd "$(dirname "$0")"
curl -s -o /dev/null http://127.0.0.1:9999/log || { node fakeai.js > fakeai.log 2>&1 & sleep 1; }
fail=0
run() { out=$(node "$@" 2>&1 | grep '^== '); echo "$* ${out:-== did not finish}"; case "$out" in "== "*/*" passed") n=${out#== }; [ "${n%%/*}" = "$(echo "$n" | sed 's|.*/||; s| .*||')" ] || fail=1;; *) fail=1;; esac; }
run diction.js
run ia-unit.js
run sp.js
run speed.js
run ia.js
run ia-bench.js --check
if curl -s -o /dev/null http://127.0.0.1:8888/ && [ -f harness.js ]; then
  run harness.js
  run sx-align.js
  run images.js
  run "speed.js" searxng
fi
[ -f privau.js ] && [ "$LIVE_SITES" = 1 ] && run privau.js && run images.js live
exit $fail
