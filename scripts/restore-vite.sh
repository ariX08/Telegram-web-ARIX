#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Restore vite from last good commit and fix description
git show ac7958c709915e964ab1de5bf85362300f808b9e:vite.config.ts > vite.config.ts
sed -i "s/a custom Telegram Web client/a custom messaging client/g" vite.config.ts
echo "Restored vite.config.ts"
