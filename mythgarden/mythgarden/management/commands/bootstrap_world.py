from django.apps import apps
from django.core.management import BaseCommand, CommandError, call_command
from django.db import connection, transaction


class Command(BaseCommand):
    help = 'Seed a fresh world once; never reload fixtures over existing players or content.'

    def handle(self, *args, **options):
        with transaction.atomic():
            # Serialize overlapping deploys against one PostgreSQL database.
            if connection.vendor == 'postgresql':
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_advisory_xact_lock(%s)', [71420260912])
            Item = apps.get_model('mythgarden', 'Item')
            Place = apps.get_model('mythgarden', 'Place')
            Villager = apps.get_model('mythgarden', 'Villager')
            if Item.objects.exists() and Place.objects.exists() and Villager.objects.exists():
                self.stdout.write('World already initialized; existing saves and content preserved.')
                return
            # Historical schema migrations create the default farmer portrait.
            # That one seed record is expected even in a fresh database.
            from mythgarden.models._constants import DEFAULT_PORTRAIT
            partial = False
            for model in apps.get_app_config('mythgarden').get_models():
                rows = model.objects.all()
                if model._meta.model_name == 'farmerportrait':
                    rows = rows.exclude(image_path=DEFAULT_PORTRAIT)
                partial = partial or rows.exists()
            if partial:
                raise CommandError('World is partially initialized. Refusing to overwrite existing data.')
            call_command('loaddata', 'initial_data.json', stdout=self.stdout)
            self.stdout.write(self.style.SUCCESS('Fresh Mythgarden world initialized.'))
