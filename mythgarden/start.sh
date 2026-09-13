#!/usr/bin/env bash
set -euo pipefail
exec gunicorn mythsite.wsgi:application --bind "0.0.0.0:${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}" --access-logfile - --error-logfile -
