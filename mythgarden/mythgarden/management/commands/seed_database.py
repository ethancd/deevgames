from django.core.management.base import BaseCommand, CommandError
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django import db
import sys
import csv
import re

# noinspection PyUnresolvedReferences
from mythgarden.models import *
from ._command_helpers import str_to_class, snakecase_to_titlecase


class Command(BaseCommand):
    SKIP_VALUES = ['default', 'none', 'null', 'skip']

    help = 'Seeds the database with initial data read in from a csv file.'

    def add_arguments(self, parser):
        parser.add_argument('path', type=str, help='Path to csv file containing initial data')
        parser.add_argument('--flush-table', type=str, nargs='*', help='Flush the specified table(s) before seeding')

    def handle(self, *args, **options):
        if options['flush_table']:
            try:
                call_command('flush_table', table=options['flush_table'])
            except CommandError as e:
                self.stdout.write(self.style.ERROR(f'Could not flush table(s): {e}. Halting execution.'))
                return

        with open(options['path']) as f:
            reader = csv.reader(f)

            cls = None
            field_names = []
            expecting_header = True

            self.created_count = 0
            self.found_count = 0
            self.verbosity = options['verbosity']

            per_model_created_count = 0
            per_model_found_count = 0

            for row in reader:
                # sheet will be organized like this:
                # Model_A, field_1, field_2, field_3, ...
                # Model_A, value, value, value
                # Model_A, value, value, value
                # [blank row]
                # Model_B, field_1, field_2, field_3, ...
                # Model_B, value, value, value
                # etc.

                if self.verbosity == 3:
                    self.stdout.write(f'row {reader.line_num}: {row}')

                # so we'll take blank rows as the signal that the next row is a header for the next model
                if all(v == '' for v in row):
                    self.stdout.write(f'reading row {reader.line_num} as blank row')

                    if cls is not None:
                        self.stdout.write(self.style.SUCCESS(f'{cls.__name__} complete: '
                                          f'created {per_model_created_count} and found {per_model_found_count}'))
                        per_model_created_count = 0
                        per_model_found_count = 0
                        cls = None

                    expecting_header = True
                    continue

                # when we're expecting a header, we get the model with the first column,
                # then the field_names (to be used as the keys in constructing kwargs) as the rest of the columns
                # ... although strip out any blank columns
                if expecting_header:
                    self.stdout.write(f'reading row {reader.line_num} as header: classname {row[0]}, field_names {row[1:]}')
                    cls = str_to_class(sys.modules[__name__], row[0])
                    field_names = [v for v in row[1:] if v != '']
                    expecting_header = False
                    continue

                # otherwise, we're expecting data
                # let's ensure the model matches, why not right?
                if cls.__name__ != row[0]:
                    raise CommandError(f'Expected {cls.__name__} in row {reader.line_num} but got {row[0]}')

                # row values with any blank columns stripped out
                field_values = [v for v in row[1:] if v != '']

                # ensure field_names and row[1:] are the same length...
                if len(field_names) != len(field_values):
                    raise CommandError(f'Expected {len(field_names)} fields in row {reader.line_num} but got {len(field_values)}')

                # if any field name starts with fk__ or m2m__, e.g. fk__place__surround:
                # the current field_value is the natural key(s) of the referenced class, and
                # we need to get the cleaned field name (e.g. surround) and the instance(s) of the referenced model
                cleaned_field_names = field_names.copy()
                cleaned_field_values = field_values.copy()
                m2m_lists = []

                for i, field_name in enumerate(field_names):
                    if field_values[i] in self.SKIP_VALUES:
                        continue

                    is_fk = field_name.startswith('fk__')
                    is_m2m = field_name.startswith('m2m__')
                    is_goc_m2m = field_name.startswith('goc_m2m__')

                    if is_fk:
                        cleaned_field_name, foreign_instance = self.parse_fk_cell(field_name, field_values[i])

                        cleaned_field_names[i] = cleaned_field_name
                        cleaned_field_values[i] = foreign_instance

                    # for m2m, we need to wait till the instance is created and then .set() the instances
                    # so we'll take the original name&value out of the list,
                    # and accumulate the m2m fields to be set later

                    if is_m2m:
                        cleaned_field_name, foreign_instances = self.parse_m2m_cell(field_name, field_values[i])

                    if is_goc_m2m:
                        cleaned_field_name, foreign_instances = self.parse_goc_m2m_cell(field_name, field_values[i])

                    if is_m2m or is_goc_m2m:
                        m2m_lists.append((cleaned_field_name, foreign_instances))
                        cleaned_field_names.pop(i)
                        cleaned_field_values.pop(i)

                # we zip the field names & values into a dict of kwargs,
                # but we'll skip any fields that have the value 'default', 'none', (or any other value in SKIP_VALUES)
                kwargs = {k: v for k, v in zip(cleaned_field_names, cleaned_field_values) if v not in self.SKIP_VALUES}

                instance, created = cls.objects.get_or_create(**kwargs)

                # make sure we didn't e.g. input invalid choices for a field
                try:
                    instance.full_clean()
                except ValidationError as e:
                    raise CommandError(f'full_clean failed on {instance} in row {reader.line_num} with kwargs {kwargs}'
                                       f'see validation messages: {e.messages}')

                # now we can set the m2m fields
                if len(m2m_lists) > 0:
                    for m2m_field_name, m2m_instances in m2m_lists:
                        try:
                            getattr(instance, m2m_field_name).set(m2m_instances)
                        except AttributeError:
                            raise CommandError(f'Could not set m2m field {m2m_field_name} on {cls.__name__} '
                                               f'with instances {m2m_instances}')

                if self.verbosity == 3:
                    self.stdout.write(f'row {reader.line_num}: {cls.__name__} with kwargs {kwargs}'
                                      f'gives {instance}, and created? {created}')

                if created:
                    self.created_count += 1
                    per_model_created_count += 1
                    if options['verbosity'] >= 2:
                        self.stdout.write(self.style.SUCCESS(f'Used {cls.__name__} with kwargs {kwargs} to create {instance}'))
                else:
                    self.found_count += 1
                    per_model_found_count += 1
                    if self.verbosity >= 2:
                        self.stdout.write(self.style.WARNING(f'Found {cls.__name__} with kwargs {kwargs}'))

        self.stdout.write(self.style.SUCCESS(
            f'Successfully seeded database by creating {self.created_count} and finding {self.found_count} instances')
        )

        db.connections.close_all()

    def parse_fk_cell(self, field_name, field_value):
        """
        1. get the class name of ref'd model from field_name (e.g. fk__place__surround -> Place)
        2. get the ref'd instance using natural key lookup of field_value
        3. get the cleaned field name (e.g. fk__place__surround -> surround)
        4. return the cleaned field name as the key and the instance as the value

        throw errors if the class or instance don't exist,
        or if the field_name doesn't conform to expected format
        """

        self.guard_format(r'fk__\w+__\w+', field_name)

        foreign_cls, cleaned_field_name = self.parse_field_name(field_name)
        foreign_instance = self.get_foreign_instance(foreign_cls, field_value)

        return cleaned_field_name, foreign_instance

    def parse_m2m_cell(self, field_name, field_value):
        """
        1. get the class name of ref'd model from field_name (e.g. m2m__place__contents -> Place)
        2a. parse the field_value into a list of natural keys
        2b. get all the ref'd instances using natural key lookup
        3. get the cleaned field name (e.g. m2m__place__contents -> contents)
        4. return the cleaned field name as the key and the instances as the value

        throw errors if the class or any instances don't exist,
        or if the field_name doesn't conform to expected format
        """

        self.guard_format(r'm2m__\w+__\w+', field_name)

        foreign_cls, cleaned_field_name = self.parse_field_name(field_name)
        foreign_instance_natural_keys = map(lambda s: s.strip(), field_value.split(', '))
        foreign_instances = [self.get_foreign_instance(foreign_cls, key) for key in foreign_instance_natural_keys]

        return cleaned_field_name, foreign_instances

    def parse_goc_m2m_cell(self, field_name, field_value):
        """
        1. get the class name of ref'd model from field_name (e.g. goc_m2m__item__belongings -> Item)
        2a. parse the field_value into a list of custom creation strings
        2b. create all the ref'd instances by assuming they have custom overrides to create from a string
        3. get the cleaned field name (e.g. goc_m2m__item__belongings -> belongings)
        4. return the cleaned field name as the key and the instances as the value

        throw errors if the class doesn't exist or it doesn't have a get_or_create_from_string method,
        or if the field_name doesn't conform to expected format
        """

        self.guard_format(r'goc_m2m__\w+__\w+', field_name)

        foreign_cls, cleaned_field_name = self.parse_field_name(field_name)
        if not hasattr(foreign_cls, 'get_or_create_from_string'):
            raise CommandError(f'Class {foreign_cls} does not have a get_or_create_from_string method.')

        foreign_creation_strings = map(lambda s: s.strip(), field_value.split(', '))
        foreign_instances = []

        for string in foreign_creation_strings:
            foreign_instance, created = foreign_cls.get_or_create_from_string(string)

            if created:
                self.created_count += 1
                if self.verbosity >= 2:
                    self.stdout.write(
                        self.style.SUCCESS(f'Used {foreign_cls.__name__} with creation string {string} to create {foreign_instance}'))
            else:
                self.found_count += 1
                if self.verbosity >= 2:
                    self.stdout.write(self.style.WARNING(f'Found {foreign_cls.__name__} with creation string {string}'))

            foreign_instances.append(foreign_instance)

        return cleaned_field_name, foreign_instances

    def guard_format(self, expected_format, field_name):
        """helper for checking that field_name matches expected_format"""
        if re.fullmatch(expected_format, field_name) is None:
            raise CommandError(f'Field name {field_name} does not conform to expected format: {expected_format}')

    def parse_field_name(self, field_name):
        """helper for parsing field_names like fk__place__surround and m2m__place__contents
        into the class and cleaned field name"""
        foreign_classname_snakecase, cleaned_field_name = re.match(r'^\w+__(\w+)__(\w+)', field_name).group(1, 2)
        foreign_classname = snakecase_to_titlecase(foreign_classname_snakecase)
        foreign_cls = str_to_class(sys.modules[__name__], foreign_classname)

        return foreign_cls, cleaned_field_name

    def get_foreign_instance(self, foreign_cls, field_value):
        """helper for getting a foreign instance using natural key lookup"""

        foreign_instance = foreign_cls.objects.get_by_natural_key(field_value)

        if foreign_instance is None:
            raise CommandError(f'Could not find instance of {foreign_cls} with natural key {field_value}')

        return foreign_instance
