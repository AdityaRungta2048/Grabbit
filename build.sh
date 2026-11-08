#!/usr/bin/env bash
# Package the extension for the Chrome Web Store.
set -euo pipefail
cd "$(dirname "$0")"
version=$(node -p "require('./manifest.json').version")
mkdir -p dist
rm -f "dist/grabbit-$version.zip"
zip -qr "dist/grabbit-$version.zip" manifest.json background.js content.js export.js scrape.js panel.html panel.css panel.js welcome.html icons _locales
echo "dist/grabbit-$version.zip"
