"""Database models for events and rentals."""

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.urls import reverse
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

import Tracklet.models
from company.models import Company
from users.models import Owner

from .status_codes import EventStatus, FurnitureAssignmentStatus, RentalOrderStatus


class ReferenceTrackedModel(Tracklet.models.ReferenceIndexingMixin, Tracklet.models.InvenTreeModel):
    """Abstract model with generated reference, create/update timestamps."""

    REFERENCE_PREFIX = ''

    class Meta:
        abstract = True

    reference = models.CharField(
        max_length=32,
        unique=True,
        blank=True,
        verbose_name=_('Reference'),
        help_text=_('Unique reference code'),
    )

    creation_date = models.DateTimeField(auto_now_add=True, verbose_name=_('Created'))

    last_updated = models.DateTimeField(auto_now=True, verbose_name=_('Last Updated'))

    @classmethod
    def generate_reference(cls):
        """Generate a reference with a numeric suffix."""
        latest = (
            cls.objects.filter(reference__startswith=cls.REFERENCE_PREFIX)
            .order_by('-reference_int', '-pk')
            .first()
        )

        next_ref = 1 if not latest else max(latest.reference_int + 1, 1)
        return f'{cls.REFERENCE_PREFIX}{next_ref:04d}'

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = self.generate_reference()

        self.reference_int = self.rebuild_reference_field(self.reference)

        super().save(*args, **kwargs)


class EventType(Tracklet.models.InvenTreeModel):
    class Meta:
        verbose_name = _('Event Type')
        verbose_name_plural = _('Event Types')

    name = models.CharField(max_length=100, unique=True, verbose_name=_('Name'))
    description = models.TextField(blank=True, verbose_name=_('Description'))
    active = models.BooleanField(default=True, verbose_name=_('Active'))

    def __str__(self):
        return self.name

    @staticmethod
    def get_api_url():
        return reverse('api-tracklet-event-type-list')


class Venue(Tracklet.models.InvenTreeNotesMixin, Tracklet.models.InvenTreeModel):
    class Meta:
        verbose_name = _('Venue')
        verbose_name_plural = _('Venues')

    name = models.CharField(max_length=150, unique=True, verbose_name=_('Name'))
    address = models.CharField(max_length=250, blank=True, verbose_name=_('Address'))
    contact_name = models.CharField(
        max_length=100, blank=True, verbose_name=_('Contact Name')
    )
    contact_email = models.EmailField(blank=True, verbose_name=_('Contact Email'))
    active = models.BooleanField(default=True, verbose_name=_('Active'))

    def __str__(self):
        return self.name

    @staticmethod
    def get_api_url():
        return reverse('api-tracklet-venue-list')


class Planner(Tracklet.models.InvenTreeNotesMixin, Tracklet.models.InvenTreeModel):
    class Meta:
        verbose_name = _('Planner')
        verbose_name_plural = _('Planners')

    name = models.CharField(max_length=100, unique=True, verbose_name=_('Name'))
    email = models.EmailField(blank=True, verbose_name=_('Email'))
    phone = models.CharField(max_length=40, blank=True, verbose_name=_('Phone'))
    active = models.BooleanField(default=True, verbose_name=_('Active'))

    def __str__(self):
        return self.name

    @staticmethod
    def get_api_url():
        return reverse('api-tracklet-planner-list')


class Event(Tracklet.models.InvenTreeNotesMixin, ReferenceTrackedModel):
    """Event planning record."""

    REFERENCE_PREFIX = 'EV'

    class Meta:
        verbose_name = _('Event')
        verbose_name_plural = _('Events')

    title = models.CharField(max_length=150, verbose_name=_('Title'))

    event_type = models.ForeignKey(
        EventType,
        on_delete=models.PROTECT,
        related_name='events',
        verbose_name=_('Event Type'),
    )

    venue = models.ForeignKey(
        Venue,
        on_delete=models.PROTECT,
        related_name='events',
        verbose_name=_('Venue'),
    )

    planner = models.ForeignKey(
        Planner,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='events',
        verbose_name=_('Planner'),
    )

    start_datetime = models.DateTimeField(verbose_name=_('Start DateTime'))
    end_datetime = models.DateTimeField(verbose_name=_('End DateTime'))

    late_night_takedown = models.BooleanField(
        default=False,
        verbose_name=_('Late Night Takedown'),
    )

    status = models.IntegerField(
        choices=EventStatus.items(),
        default=EventStatus.DRAFT.value,
        verbose_name=_('Status'),
    )

    def clean(self):
        super().clean()

        if self.end_datetime and self.start_datetime:
            if self.end_datetime <= self.start_datetime:
                raise ValidationError({
                    'end_datetime': _('End date/time must be after start date/time')
                })

    def __str__(self):
        return f'{self.reference}: {self.title}'


class FurnitureItem(Tracklet.models.InvenTreeNotesMixin, Tracklet.models.InvenTreeModel):
    class Meta:
        verbose_name = _('Furniture Item')
        verbose_name_plural = _('Furniture Items')

    name = models.CharField(max_length=120, verbose_name=_('Name'))
    description = models.TextField(blank=True, verbose_name=_('Description'))
    category = models.CharField(max_length=80, blank=True, verbose_name=_('Category'))
    asset_tag = models.CharField(max_length=80, blank=True, verbose_name=_('Asset Tag'))
    active = models.BooleanField(default=True, verbose_name=_('Active'))

    def __str__(self):
        return self.asset_tag or self.name

    @staticmethod
    def get_api_url():
        return reverse('api-tracklet-furniture-item-list')


class EventFurnitureAssignment(
    Tracklet.models.InvenTreeNotesMixin, Tracklet.models.InvenTreeModel
):
    class Meta:
        verbose_name = _('Event Furniture Assignment')
        verbose_name_plural = _('Event Furniture Assignments')
        constraints = [
            models.UniqueConstraint(
                fields=['event', 'item'],
                condition=Q(item__isnull=False),
                name='event_furniture_item_unique',
            ),
            models.UniqueConstraint(
                fields=['event', 'part'],
                condition=Q(part__isnull=False),
                name='event_furniture_part_unique',
            ),
        ]

    event = models.ForeignKey(
        Event,
        on_delete=models.CASCADE,
        related_name='furniture_assignments',
        verbose_name=_('Event'),
    )

    item = models.ForeignKey(
        FurnitureItem,
        on_delete=models.PROTECT,
        related_name='event_assignments',
        verbose_name=_('Furniture Item'),
        null=True,
        blank=True,
    )

    part = models.ForeignKey(
        'part.Part',
        on_delete=models.PROTECT,
        related_name='event_furniture_assignments',
        verbose_name=_('Part'),
        null=True,
        blank=True,
    )

    quantity = models.PositiveIntegerField(default=1, verbose_name=_('Quantity'))

    status = models.IntegerField(
        choices=FurnitureAssignmentStatus.items(),
        default=FurnitureAssignmentStatus.RESERVED.value,
        verbose_name=_('Status'),
    )

    checked_out_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_('Checked Out At'),
    )

    checked_in_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_('Checked In At'),
    )

    def clean(self):
        super().clean()

        if self.quantity <= 0:
            raise ValidationError({'quantity': _('Quantity must be greater than zero')})

        if not self.part_id and not self.item_id:
            raise ValidationError({'part': _('Either part or furniture item is required')})

        if self.checked_in_at and self.checked_out_at:
            if self.checked_in_at < self.checked_out_at:
                raise ValidationError({
                    'checked_in_at': _(
                        'Checked in timestamp cannot be earlier than checked out'
                    )
                })

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        assigned = self.part.full_name if self.part_id else self.item
        return f'{self.event.reference} - {assigned}'


class RentalAsset(Tracklet.models.InvenTreeNotesMixin, Tracklet.models.InvenTreeModel):
    class Meta:
        verbose_name = _('Rental Asset')
        verbose_name_plural = _('Rental Assets')

    name = models.CharField(max_length=120, verbose_name=_('Name'))
    asset_tag = models.CharField(
        max_length=80,
        unique=True,
        blank=True,
        verbose_name=_('Asset Tag'),
    )
    serial = models.CharField(max_length=80, blank=True, verbose_name=_('Serial'))
    active = models.BooleanField(default=True, verbose_name=_('Active'))

    def __str__(self):
        return self.asset_tag or self.name


class RentalOrder(Tracklet.models.InvenTreeNotesMixin, ReferenceTrackedModel):
    """Rental order record."""

    REFERENCE_PREFIX = 'RN'

    class Meta:
        verbose_name = _('Rental Order')
        verbose_name_plural = _('Rental Orders')

    customer = models.ForeignKey(
        Company,
        on_delete=models.PROTECT,
        related_name='rental_orders',
        verbose_name=_('Customer'),
    )

    rental_start = models.DateTimeField(verbose_name=_('Rental Start'))
    rental_end = models.DateTimeField(verbose_name=_('Rental End'))

    returned_date = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name=_('Returned Date'),
    )

    status = models.IntegerField(
        choices=RentalOrderStatus.items(),
        default=RentalOrderStatus.DRAFT.value,
        verbose_name=_('Status'),
    )

    responsible = models.ForeignKey(
        Owner,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='rental_orders',
        verbose_name=_('Responsible'),
    )

    def clean(self):
        super().clean()

        if self.rental_end and self.rental_start and self.rental_end <= self.rental_start:
            raise ValidationError({'rental_end': _('Rental end must be after rental start')})

        if self.returned_date and self.returned_date < self.rental_start:
            raise ValidationError({
                'returned_date': _('Returned date cannot be before rental start')
            })

    @property
    def is_overdue(self):
        if self.returned_date:
            return False

        now = timezone.now()

        return (
            self.rental_end < now
            and self.status
            in [RentalOrderStatus.ACTIVE.value, RentalOrderStatus.OVERDUE.value]
        )

    def save(self, *args, **kwargs):
        if self.status == RentalOrderStatus.RETURNED.value and not self.returned_date:
            self.returned_date = timezone.now()

        if self.status in [RentalOrderStatus.ACTIVE.value, RentalOrderStatus.OVERDUE.value]:
            if self.rental_end and self.rental_end < timezone.now() and not self.returned_date:
                self.status = RentalOrderStatus.OVERDUE.value

        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.reference}: {self.customer}'


class RentalLineItem(Tracklet.models.InvenTreeNotesMixin, Tracklet.models.InvenTreeModel):
    """Line items assigned to a rental order."""

    class Meta:
        verbose_name = _('Rental Line Item')
        verbose_name_plural = _('Rental Line Items')

    order = models.ForeignKey(
        RentalOrder,
        on_delete=models.CASCADE,
        related_name='lines',
        verbose_name=_('Order'),
    )

    asset = models.ForeignKey(
        RentalAsset,
        on_delete=models.PROTECT,
        related_name='rental_lines',
        verbose_name=_('Asset'),
    )

    quantity = models.PositiveIntegerField(default=1, verbose_name=_('Quantity'))

    def clean(self):
        super().clean()

        if self.quantity <= 0:
            raise ValidationError({'quantity': _('Quantity must be greater than zero')})

        if not self.order_id or not self.asset_id:
            return

        start_dt = self.order.rental_start
        end_dt = self.order.rental_end

        if not start_dt or not end_dt:
            return

        active_statuses = [
            RentalOrderStatus.DRAFT.value,
            RentalOrderStatus.ACTIVE.value,
            RentalOrderStatus.OVERDUE.value,
        ]

        overlapping = (
            RentalLineItem.objects.filter(asset=self.asset, order__status__in=active_statuses)
            .exclude(pk=self.pk)
            .filter(Q(order__rental_start__lt=end_dt) & Q(order__rental_end__gt=start_dt))
        )

        if overlapping.exists():
            conflict = overlapping.first()
            raise ValidationError({
                'asset': _(
                    'Asset is already booked for an overlapping period '
                    f'({conflict.order.reference})'
                )
            })

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.order.reference} - {self.asset}'
