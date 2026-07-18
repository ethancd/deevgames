from django.core.management.base import CommandError


def str_to_class(module, classname: str):
    try:
        return getattr(module, classname)
    except AttributeError:
        raise CommandError(f'Could not find class {classname}')


def snakecase_to_titlecase(snakecase_str: str):
    return ''.join([s.capitalize() for s in snakecase_str.split('_')])

