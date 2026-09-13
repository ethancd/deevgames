from django.db import migrations, models


def keep_existing_weeks_locked(apps, schema_editor):
    # An old save has no action history. Never reconfigure a potentially
    # progressed week; its next weekly reset will use the new default.
    apps.get_model('mythgarden', 'Session').objects.all().update(has_taken_action=True)


class Migration(migrations.Migration):
    dependencies = [('mythgarden', '0078_sync_place_image_default')]
    operations = [
        migrations.AddField('session', 'has_taken_action', models.BooleanField(default=False)),
        migrations.RunPython(keep_existing_weeks_locked, migrations.RunPython.noop),
    ]
