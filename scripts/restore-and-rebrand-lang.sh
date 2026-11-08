#!/usr/bin/env bash
# Restore full lang.ts from upstream tweb and replace every "Telegram" with "KuchuGRAM"
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Downloading upstream lang.ts..."
curl -fsSL "https://raw.githubusercontent.com/morethanwords/tweb/master/src/lang.ts" \
  | sed "s/Telegram's/KuchuGRAM's/g; s/Telegram/KuchuGRAM/g" \
  > src/lang.ts

echo "KuchuGRAM count: $(grep -o KuchuGRAM src/lang.ts | wc -l)"
echo "Telegram remaining: $(grep -o Telegram src/lang.ts | wc -l || echo 0)"
echo "Done. Run: git add src/lang.ts && git commit -m 'KuchuGRAM everywhere in lang.ts' && git push"
