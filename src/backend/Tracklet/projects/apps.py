from django.apps import AppConfig
from django.utils.translation import gettext_lazy as _


class ProjectsConfig(AppConfig):
    """App configuration for project tracking."""

    default_auto_field = 'django.db.models.AutoField'
    name = 'projects'
    verbose_name = _('Projects')

