#!/usr/bin/env bash
# Real-browser checks (WebKitGTK). Needs: apt install webkit2gtk-driver xvfb; pip install selenium
set -euo pipefail
cd "$(dirname "$0")/../.."
T="$(mktemp -d)"
npx tsx tests/browser/make-data.ts "$T/data.json"
npx tsx tests/browser/build-harness.ts "$T/dist"
xvfb-run -a -s "-screen 0 1280x1800x24" python3 tests/browser/browser_checks.py "$T/dist" "$T/data.json" "${SHOTS:-$T/shots}"
