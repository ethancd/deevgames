#!/bin/bash

set -e

echo "🎮 Building all DeevGames..."
echo ""

# Build Muju
echo "⚔️  Building Muju Hono Tanka..."
cd muju
npm run build
cd ..
echo "✓ Muju built successfully"
echo ""

# Build Forge
echo "🃏 Building FORGE..."
cd forge
npm run build
cd ..
echo "✓ Forge built successfully"
echo ""

# Build Oracle
echo "🗡️  Building Oracle of Delve..."
cd oracle
npm run build
cd ..
echo "✓ Oracle built successfully"
echo ""

# Build Ember
echo "🔥 Building EMBER..."
cd ember
npm run build
cd ..
echo "✓ Ember built successfully"
echo ""

# Prepare deployment directory
echo "📦 Preparing deployment directory..."
rm -rf _site
mkdir -p _site
cp index.html _site/
# CNAME is optional (custom-domain deploys only; not tracked in this repo as
# of the "Delete CNAME" commit) — copy it if present, skip otherwise rather
# than failing the whole build.
if [ -f CNAME ]; then
  cp CNAME _site/
fi
touch _site/.nojekyll
cp -r muju/dist _site/muju
cp -r forge/dist _site/forge
cp -r oracle/dist _site/oracle
cp -r ember/dist _site/ember
echo "✓ Deployment directory ready"
echo ""

echo "✅ All games built successfully!"
echo "Deployment files are in the _site directory"
