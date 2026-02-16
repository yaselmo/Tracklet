"""App config for the Events app.

The python module name is prefixed to avoid collisions with third-party packages.
"""

from django.apps import AppConfig


class EventsConfig(AppConfig):
    """Config class for the 'events' app."""

    name = 'tracklet_events'
    label = 'events'

    def ready(self):
        """This function is called whenever the Events app is loaded."""
