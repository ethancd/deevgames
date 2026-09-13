#!/usr/bin/env bash
set -euo pipefail
python manage.py migrate --noinput
python manage.py bootstrap_world
