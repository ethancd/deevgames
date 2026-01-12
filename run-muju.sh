#!/bin/bash
cd "$(dirname "$0")/muju" && git pull && npm run dev
