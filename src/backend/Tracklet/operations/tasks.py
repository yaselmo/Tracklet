"""Background tasks for the operations app."""

from django.utils import timezone

import structlog
from opentelemetry import trace

from Tracklet.tasks import ScheduledTask, scheduled_task

from .availability import annotate_assignment_reservation_window
from .status_codes import FurnitureAssignmentStatus

tracer = trace.get_tracer(__name__)
logger = structlog.get_logger('inventree')


@tracer.start_as_current_span('transition_event_furniture_assignments_to_in_use')
@scheduled_task(ScheduledTask.MINUTES, 5)
def transition_event_furniture_assignments_to_in_use():
    """Promote reserved event assignments to in-use once their start time is reached."""
    from .models import EventFurnitureAssignment

    now = timezone.now()

    assignments = annotate_assignment_reservation_window(
        EventFurnitureAssignment.objects.filter(
            status=FurnitureAssignmentStatus.RESERVED.value
        )
    ).filter(reservation_start__lte=now, reservation_end__gt=now)

    updated = assignments.update(status=FurnitureAssignmentStatus.IN_USE.value)

    if updated:
        logger.info(
            'Transitioned reserved event furniture assignments to in use',
            count=updated,
        )
