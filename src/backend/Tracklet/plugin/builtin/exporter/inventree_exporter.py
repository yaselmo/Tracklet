"""Generic data export plugin for Tracklet."""

from django.utils.translation import gettext_lazy as _

from plugin import InvenTreePlugin
from plugin.mixins import DataExportMixin


class InvenTreeExporter(DataExportMixin, InvenTreePlugin):
    """Generic exporter plugin for Tracklet."""

    NAME = 'InvenTree Exporter'
    SLUG = 'inventree-exporter'
    TITLE = _('InvenTree Generic Exporter')
    DESCRIPTION = _('Provides support for exporting data from Tracklet')
    VERSION = '1.0.0'
    AUTHOR = _('InvenTree contributors')

    def supports_export(self, model_class: type, user, *args, **kwargs) -> bool:
        """This exporter supports all model classes."""
        return True
