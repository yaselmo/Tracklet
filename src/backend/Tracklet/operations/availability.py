"""Shared availability helpers for event furniture reservations."""

from django.db.models import DateTimeField, Q
from django.db.models.functions import Coalesce
from django.utils import timezone

from .status_codes import FurnitureAssignmentStatus, RentalOrderStatus


def get_assignment_reservation_window(assignment):
    """Return reservation datetime window for an event assignment.

    Falls back to event window when explicit checked-out / checked-in timestamps
    are not set.
    """
    if assignment is None:
        return (None, None)

    event = getattr(assignment, 'event', None)

    start = getattr(assignment, 'checked_out_at', None)
    end = getattr(assignment, 'checked_in_at', None)

    if start is None and event is not None:
        start = getattr(event, 'start_datetime', None)

    if end is None and event is not None:
        end = getattr(event, 'end_datetime', None)

    return (start, end)


def annotate_assignment_reservation_window(queryset):
    """Annotate queryset with reservation window for overlap checks."""
    return queryset.annotate(
        reservation_start=Coalesce(
            'checked_out_at',
            'event__start_datetime',
            output_field=DateTimeField(),
        ),
        reservation_end=Coalesce(
            'checked_in_at',
            'event__end_datetime',
            output_field=DateTimeField(),
        ),
    )


def reservation_overlap_filter(start, end):
    """Return overlap filter using strict datetime overlap boundaries."""
    return Q(reservation_start__lt=end) & Q(reservation_end__gt=start)


def normalize_overlap_datetime(value):
    """Normalize datetimes for overlap comparison with timezone awareness."""
    if value is None:
        return None

    if timezone.is_naive(value):
        return timezone.make_aware(value, timezone.get_current_timezone())

    return value


def active_event_reservation_filter(at=None):
    """Return a queryset filter for active event reservations at a given datetime."""
    if at is None:
        at = timezone.now()

    return (
        Q(status__in=[
            FurnitureAssignmentStatus.RESERVED.value,
            FurnitureAssignmentStatus.IN_USE.value,
        ])
        & (Q(checked_out_at__isnull=True) | Q(checked_out_at__lte=at))
        & (Q(checked_in_at__isnull=True) | Q(checked_in_at__gt=at))
    )


def get_event_reservation_availability_for_part(part, at=None):
    """Return stock availability override for an actively reserved part.

    Returns one of:
    - ``'IN_USE'`` if any active assignment for ``part`` is in use
    - ``'RESERVED'`` if any active assignment for ``part`` is reserved
    - ``None`` if there are no active assignments for ``part``
    """
    if not getattr(part, 'pk', None):
        return None

    from .models import EventFurnitureAssignment

    active = EventFurnitureAssignment.objects.filter(
        part=part
    ).filter(active_event_reservation_filter(at=at))

    if active.filter(status=FurnitureAssignmentStatus.IN_USE.value).exists():
        return 'IN_USE'

    if active.exists():
        return 'RESERVED'

    return None


def get_rental_reservation_availability_for_stock(stock_item, at=None):
    """Return stock availability override for an actively rented stock item."""
    if not getattr(stock_item, 'pk', None):
        return None

    if at is None:
        at = timezone.now()

    from .models import RentalLineItem

    active = RentalLineItem.objects.filter(
        asset=stock_item,
        order__status__in=[
            RentalOrderStatus.DRAFT.value,
            RentalOrderStatus.ACTIVE.value,
            RentalOrderStatus.OVERDUE.value,
        ],
        order__rental_start__lte=at,
        order__rental_end__gt=at,
    )

    if active.filter(
        order__status__in=[RentalOrderStatus.ACTIVE.value, RentalOrderStatus.OVERDUE.value]
    ).exists():
        return 'IN_USE'

    if active.exists():
        return 'RESERVED'

    return None
