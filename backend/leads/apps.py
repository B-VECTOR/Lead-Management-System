from django.apps import AppConfig


class LeadsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'leads'

    def ready(self):
        # Register the workflow-start signal handlers (Tech Req §4.3.1).
        from . import signals  # noqa: F401
