#!/usr/bin/env bash
# Install dependencies with npm ci in each game before running this script.
set -euo pipefail
cd "$(dirname "$0")"

for game in muju forge oracle; do
  echo "Building $game..."
  (cd "$game" && npm run build)
done

# Assemble only public files. Never publish the repository root or server code.
stage=$(mktemp -d "${TMPDIR:-/tmp}/deevgames-build.XXXXXX")
trap 'rm -rf "$stage"' EXIT
cp index.html 404.html "$stage/"
mkdir -p "$stage/portfolio" "$stage/docs"
cp portfolio/index.html "$stage/portfolio/"
cp docs/game-design-dossier.md "$stage/docs/"
for game in muju forge oracle; do
  cp -R "$game/dist" "$stage/$game"
done
python3 tools/verify_site.py "$stage"

# _site is generated exclusively by this script, and ignored by Git.
rm -rf _site
mv "$stage" _site
echo "Ready to publish: _site/"
