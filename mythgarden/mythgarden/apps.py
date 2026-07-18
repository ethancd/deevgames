from django.apps import AppConfig


class MythgardenConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'mythgarden'

    def ready(self):
        import mythgarden.signals #noqa