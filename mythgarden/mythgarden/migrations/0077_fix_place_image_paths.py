# Generated manually to fix image paths

from django.db import migrations


def fix_image_paths(apps, schema_editor):
    """Update Place image paths from old unsplash names to new kz names."""
    Place = apps.get_model('mythgarden', 'Place')

    # Map old filenames to new filenames
    path_updates = {
        'farm-unsplash.jpeg': 'farm-kz.jpeg',
        'places/farm-unsplash.jpeg': 'farm-kz.jpeg',
    }

    for old_path, new_path in path_updates.items():
        Place.objects.filter(image_path=old_path).update(image_path=new_path)


def reverse_fix(apps, schema_editor):
    """Reverse the image path updates."""
    Place = apps.get_model('mythgarden', 'Place')
    Place.objects.filter(image_path='farm-kz.jpeg').update(image_path='farm-unsplash.jpeg')


class Migration(migrations.Migration):

    dependencies = [
        ('mythgarden', '0076_add_basic_seeds'),
    ]

    operations = [
        migrations.RunPython(fix_image_paths, reverse_fix),
    ]
