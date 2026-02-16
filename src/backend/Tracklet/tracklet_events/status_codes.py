"""Status codes for events."""

from django.utils.translation import gettext_lazy as _

from generic.states import ColorEnum, StatusCode


class EventStatus(StatusCode):
    """Defines a set of status codes for an Event."""

    PLANNED = 10, _('Planned'), ColorEnum.secondary
    IN_PROGRESS = 20, _('In Progress'), ColorEnum.primary
    COMPLETE = 30, _('Complete'), ColorEnum.success
    CANCELLED = 40, _('Cancelled'), ColorEnum.danger

