"""Database models for the 'events' app."""

from django.contrib.auth.models import User
from django.db import models
from django.urls import reverse
from django.utils.translation import gettext_lazy as _

import Tracklet.models
from generic.states.fields import InvenTreeCustomStatusModelField
from users.models import Owner

from .status_codes import EventStatus


class EventType(models.TextChoices):
    """Defines a set of type codes for an Event."""

    UNSPECIFIED = '', _('Unspecified')
    CONFERENCE = 'conference', _('Conference')
    PARTY = 'party', _('Party')
    MEETING = 'meeting', _('Meeting')
    WEDDING = 'wedding', _('Wedding')
    OTHER = 'other', _('Other')


class Event(Tracklet.models.InvenTreeMetadataModel):
    """An Event is a scheduled activity with optional ownership and status."""

    class Meta:
        """Model meta options."""

        verbose_name = _('Event')
        verbose_name_plural = _('Events')

    @staticmethod
    def get_api_url() -> str:
        """Return the API URL associated with this model."""
        return reverse('api-event-list')

    def __str__(self) -> str:
        """String representation of an Event."""
        return f'{self.pk} - {self.title}'

    title = models.CharField(
        max_length=255,
        verbose_name=_('Title'),
        help_text=_('Event title'),
    )

    description = models.TextField(
        blank=True,
        verbose_name=_('Description'),
        help_text=_('Event description'),
    )

    status = InvenTreeCustomStatusModelField(
        default=EventStatus.PLANNED.value,
        choices=EventStatus.items(),
        status_class=EventStatus,
        verbose_name=_('Status'),
        help_text=_('Event status'),
    )

    start_date = models.DateField(
        verbose_name=_('Start Date'),
        help_text=_('Event start date'),
    )

    end_date = models.DateField(
        blank=True,
        null=True,
        verbose_name=_('End Date'),
        help_text=_('Event end date'),
    )

    late_night_takedown = models.BooleanField(
        default=False,
        verbose_name=_('Late-night takedown'),
        help_text=_('Late-night takedown required'),
    )

    planner = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='+',
        verbose_name=_('Planner'),
        help_text=_('User who planned this event'),
    )

    venue = models.CharField(
        max_length=255,
        blank=True,
        default='',
        verbose_name=_('Venue'),
        help_text=_('Event venue'),
    )

    event_type = models.CharField(
        max_length=32,
        blank=True,
        default=EventType.UNSPECIFIED,
        choices=EventType.choices,
        verbose_name=_('Event Type'),
        help_text=_('Type of event'),
    )

    responsible = models.ForeignKey(
        Owner,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        help_text=_('User or group responsible for this event'),
        verbose_name=_('Responsible'),
        related_name='+',
    )

    creation_date = models.DateField(
        auto_now_add=True,
        verbose_name=_('Creation Date'),
        help_text=_('Date the event was created'),
    )

    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='+',
        verbose_name=_('Created By'),
        help_text=_('User who created this event'),
    )
