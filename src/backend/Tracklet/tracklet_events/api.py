"""JSON API for the 'events' app."""

from django.contrib.auth.models import User
from django.db.models import Q
from django.urls import include, path
from django.utils.translation import gettext_lazy as _

import django_filters.rest_framework.filters as rest_filters
from django_filters.rest_framework.filterset import FilterSet

from data_exporter.mixins import DataExportViewMixin
from rest_framework import status
from rest_framework.response import Response
from Tracklet.api import meta_path
from Tracklet.filters import InvenTreeDateFilter, SEARCH_ORDER_FILTER_ALIAS
from Tracklet.helpers import str2bool
from Tracklet.mixins import ListCreateAPI, RetrieveUpdateDestroyAPI, SerializerContextMixin
from users.models import Owner

from . import models, serializers


class EventCreateMixin:
    """Mixin which handles Event creation via API."""

    def create(self, request, *args, **kwargs):
        """Save user information on event creation."""
        serializer = self.get_serializer(data=self.clean_data(request.data))
        serializer.is_valid(raise_exception=True)

        serializer.save(created_by=request.user)

        headers = self.get_success_headers(serializer.data)
        return Response(
            serializer.data, status=status.HTTP_201_CREATED, headers=headers
        )


class EventFilter(FilterSet):
    """Custom filters for the EventList endpoint."""

    class Meta:
        """Metaclass options."""

        model = models.Event
        fields = []

    status = rest_filters.NumberFilter(label=_('Status'), method='filter_status')

    def filter_status(self, queryset, name, value):
        """Filter by integer status code (accounting for custom status code)."""
        q1 = Q(status=value, status_custom_key__isnull=True)
        q2 = Q(status_custom_key=value)
        return queryset.filter(q1 | q2).distinct()

    assigned_to = rest_filters.ModelChoiceFilter(
        queryset=Owner.objects.all(), field_name='responsible', label=_('Responsible')
    )

    created_by = rest_filters.ModelChoiceFilter(
        queryset=User.objects.all(), field_name='created_by', label=_('Created By')
    )

    planner = rest_filters.ModelChoiceFilter(
        queryset=User.objects.all(), field_name='planner', label=_('Planner')
    )

    late_night_takedown = rest_filters.BooleanFilter(
        label=_('Late-night takedown'), field_name='late_night_takedown'
    )

    venue = rest_filters.CharFilter(
        label=_('Venue'), field_name='venue', lookup_expr='icontains'
    )

    event_type = rest_filters.CharFilter(
        label=_('Event Type'), field_name='event_type', lookup_expr='iexact'
    )

    created_before = InvenTreeDateFilter(
        label=_('Created Before'), field_name='creation_date', lookup_expr='lt'
    )

    created_after = InvenTreeDateFilter(
        label=_('Created After'), field_name='creation_date', lookup_expr='gt'
    )

    start_date_before = InvenTreeDateFilter(
        label=_('Start Date Before'), field_name='start_date', lookup_expr='lt'
    )

    start_date_after = InvenTreeDateFilter(
        label=_('Start Date After'), field_name='start_date', lookup_expr='gt'
    )

    end_date_before = InvenTreeDateFilter(
        label=_('End Date Before'), field_name='end_date', lookup_expr='lt'
    )

    end_date_after = InvenTreeDateFilter(
        label=_('End Date After'), field_name='end_date', lookup_expr='gt'
    )

    has_end_date = rest_filters.BooleanFilter(
        label=_('Has End Date'), method='filter_has_end_date'
    )

    def filter_has_end_date(self, queryset, name, value):
        """Filter by whether or not an event has an end date."""
        return queryset.filter(end_date__isnull=not str2bool(value))


class EventMixin(SerializerContextMixin):
    """Mixin for Event API endpoints."""

    queryset = models.Event.objects.all().select_related(
        'responsible', 'created_by', 'planner'
    )
    serializer_class = serializers.EventSerializer


class EventList(EventCreateMixin, EventMixin, DataExportViewMixin, ListCreateAPI):
    """API endpoint for accessing a list of Event objects.

    - GET: Return list of Event objects (with filters)
    - POST: Create a new Event
    """

    filterset_class = EventFilter
    filter_backends = SEARCH_ORDER_FILTER_ALIAS

    ordering_fields = [
        'creation_date',
        'created_by',
        'title',
        'status',
        'start_date',
        'end_date',
        'late_night_takedown',
        'planner',
        'venue',
        'event_type',
        'responsible',
    ]

    search_fields = ['title', 'description', 'venue', 'event_type']

    ordering = '-creation_date'


class EventDetail(EventMixin, RetrieveUpdateDestroyAPI):
    """Detail API endpoint for a single Event object."""


event_api_urls = [
    path(
        '<int:pk>/',
        include([
            meta_path(models.Event),
            path('', EventDetail.as_view(), name='api-event-detail'),
        ]),
    ),
    path('', EventList.as_view(), name='api-event-list'),
]
