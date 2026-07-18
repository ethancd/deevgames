#!/bin/bash
set -e

echo "Running migrations..."
python manage.py migrate --noinput

# Only load fixtures if database is empty (loaddata does INSERT, not upsert)
ITEM_COUNT=$(python manage.py shell -c "from mythgarden.models import Item; print(Item.objects.count())")
if [ "$ITEM_COUNT" = "0" ]; then
    echo "Loading initial data from fixtures..."
    python manage.py loaddata initial_data.json
else
    echo "Data already exists ($ITEM_COUNT items), skipping fixtures."
fi

echo "Starting gunicorn..."
exec gunicorn --bind :8000 --workers 2 mythsite.wsgi
