from django.core.management.base import BaseCommand, CommandError
from django import db
import sys

# noinspection PyUnresolvedReferences
from mythgarden.models import *
from ._command_helpers import str_to_class, snakecase_to_titlecase


class Command(BaseCommand):
    help = 'Deletes all rows from the mythgarden table(s) specified by the table argument.'

    def add_arguments(self, parser):
        parser.add_argument('--table', type=str, nargs='+', help='Table(s) to flush')

    def handle(self, *args, **options):
        for table in options['table']:
            table_cls = str_to_class(sys.modules[__name__], snakecase_to_titlecase(table))
            table_cls.objects.all().delete()
            self.stdout.write(self.style.SUCCESS(f'Flushed table {table}'))

        db.connections.close_all()
