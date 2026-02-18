"""Status codes for operations models."""

from django.utils.translation import gettext_lazy as _

from generic.states import ColorEnum, StatusCode


class EventStatus(StatusCode):
    DRAFT = 10, _('Draft'), ColorEnum.secondary
    SCHEDULED = 20, _('Scheduled'), ColorEnum.primary
    IN_PROGRESS = 30, _('In Progress'), ColorEnum.info
    COMPLETED = 40, _('Completed'), ColorEnum.success
    CANCELLED = 50, _('Cancelled'), ColorEnum.danger


class RentalOrderStatus(StatusCode):
    DRAFT = 10, _('Draft'), ColorEnum.secondary
    ACTIVE = 20, _('Active'), ColorEnum.primary
    OVERDUE = 30, _('Overdue'), ColorEnum.warning
    RETURNED = 40, _('Returned'), ColorEnum.success
    CANCELLED = 50, _('Cancelled'), ColorEnum.danger


class FurnitureAssignmentStatus(StatusCode):
    RESERVED = 10, _('Reserved'), ColorEnum.secondary
    IN_USE = 20, _('In Use'), ColorEnum.primary
    RETURNED = 30, _('Returned'), ColorEnum.success
    MISSING = 40, _('Missing'), ColorEnum.warning
    DAMAGED = 50, _('Damaged'), ColorEnum.danger
