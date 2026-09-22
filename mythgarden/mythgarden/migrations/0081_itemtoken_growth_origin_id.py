from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('mythgarden', '0080_session_state_version')]
    operations = [migrations.AddField(
        model_name='itemtoken', name='growth_origin_id',
        field=models.PositiveBigIntegerField(blank=True, null=True),
    )]
