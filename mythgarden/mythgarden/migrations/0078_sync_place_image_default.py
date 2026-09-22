from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('mythgarden', '0077_fix_place_image_paths'),
    ]

    operations = [
        migrations.AlterField(
            model_name='place',
            name='image_path',
            field=models.CharField(default='farm-kz.jpeg', max_length=255),
        ),
    ]
