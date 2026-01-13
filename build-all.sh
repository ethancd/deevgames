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

# Prepare deployment directory
echo "📦 Preparing deployment directory..."
rm -rf _site
mkdir -p _site
cp index.html _site/
cp CNAME _site/
touch _site/.nojekyll
cp -r muju/dist _site/muju
cp -r forge/dist _site/forge
cp -r oracle/dist _site/oracle
echo "✓ Deployment directory ready"
echo ""

echo "✅ All games built successfully!"
echo "Deployment files are in the _site directory"
