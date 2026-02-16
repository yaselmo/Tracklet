"""DRF serializers for the 'events' app."""

from rest_framework import serializers

from Tracklet.mixins import DataImportExportSerializerMixin
from Tracklet.serializers import (
    FilterableSerializerMixin,
    InvenTreeModelSerializer,
    enable_filter,
)
from generic.states.fields import InvenTreeCustomStatusSerializerMixin
from users.serializers import OwnerSerializer, UserSerializer

from .models import Event


class EventSerializer(
    FilterableSerializerMixin,
    DataImportExportSerializerMixin,
    InvenTreeCustomStatusSerializerMixin,
    InvenTreeModelSerializer,
):
    """Serializer for the Event model."""

    status_text = serializers.CharField(source='get_status_display', read_only=True)
    event_type_text = serializers.CharField(
        source='get_event_type_display', read_only=True
    )

    responsible_detail = enable_filter(
        OwnerSerializer(source='responsible', read_only=True, allow_null=True),
        True,
        prefetch_fields=['responsible'],
    )

    planner_detail = enable_filter(
        UserSerializer(source='planner', read_only=True, allow_null=True),
        True,
        prefetch_fields=['planner'],
    )

    created_by_detail = enable_filter(
        UserSerializer(source='created_by', read_only=True, allow_null=True),
        False,
        prefetch_fields=['created_by'],
    )

    class Meta:
        """Metaclass options."""

        model = Event
        fields = [
            'pk',
            'title',
            'description',
            'status',
            'status_text',
            'status_custom_key',
            'start_date',
            'end_date',
            'late_night_takedown',
            'planner',
            'planner_detail',
            'venue',
            'event_type',
            'event_type_text',
            'responsible',
            'responsible_detail',
            'creation_date',
            'created_by',
            'created_by_detail',
        ]
        extra_kwargs = {
            'title': {'required': True},
            'start_date': {'required': True},
        }
        read_only_fields = [
            'pk',
            'creation_date',
            'created_by',
        ]
