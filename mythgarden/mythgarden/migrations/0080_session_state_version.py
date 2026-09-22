from django.db import migrations, models
import mythgarden.static_helpers


class Migration(migrations.Migration):
    dependencies = [('mythgarden', '0079_session_has_taken_action')]
    operations = [migrations.AddField(
        model_name='session', name='state_version',
        field=models.CharField(default=mythgarden.static_helpers.generate_uuid, max_length=32),
    )]
