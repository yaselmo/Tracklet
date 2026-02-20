"""API endpoints for events and rentals modules."""

from django.db import OperationalError, ProgrammingError
from django.db.models import Case, Count, F, IntegerField, Q, Value, When
from django.urls import include, path
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

import django_filters.rest_framework.filters as rest_filters
from django_filters.rest_framework.filterset import FilterSet
from rest_framework import status
from rest_framework.response import Response

from Tracklet.filters import SEARCH_ORDER_FILTER
from Tracklet.mixins import ListCreateAPI, RetrieveUpdateDestroyAPI

from . import models, serializers
from .status_codes import FurnitureAssignmentStatus, RentalOrderStatus


class EventFilter(FilterSet):
    class Meta:
        model = models.Event
        fields = ['status', 'planner', 'venue', 'event_type']

    start_after = rest_filters.DateTimeFilter(
        field_name='start_datetime', lookup_expr='gte', label=_('Start After')
    )
    start_before = rest_filters.DateTimeFilter(
        field_name='start_datetime', lookup_expr='lte', label=_('Start Before')
    )
    end_after = rest_filters.DateTimeFilter(
        field_name='end_datetime', lookup_expr='gte', label=_('End After')
    )
    end_before = rest_filters.DateTimeFilter(
        field_name='end_datetime', lookup_expr='lte', label=_('End Before')
    )


class EventFurnitureAssignmentFilter(FilterSet):
    class Meta:
        model = models.EventFurnitureAssignment
        fields = ['event', 'item', 'part', 'status']

    active = rest_filters.BooleanFilter(label=_('Active'), method='filter_active')
    in_use = rest_filters.BooleanFilter(label=_('In Use'), method='filter_in_use')

    def filter_active(self, queryset, name, value):
        active_filter = Q(checked_in_at__isnull=True) | Q(
            status__in=[
                FurnitureAssignmentStatus.RESERVED.value,
                FurnitureAssignmentStatus.IN_USE.value,
            ]
        )

        if value:
            return queryset.filter(active_filter)

        return queryset

    def filter_in_use(self, queryset, name, value):
        if value:
            return self.filter_active(queryset, name, value)

        return queryset


class RentalOrderFilter(FilterSet):
    class Meta:
        model = models.RentalOrder
        fields = ['status', 'customer', 'responsible']

    rental_start_after = rest_filters.DateTimeFilter(
        field_name='rental_start', lookup_expr='gte', label=_('Rental Start After')
    )
    rental_start_before = rest_filters.DateTimeFilter(
        field_name='rental_start', lookup_expr='lte', label=_('Rental Start Before')
    )
    rental_end_after = rest_filters.DateTimeFilter(
        field_name='rental_end', lookup_expr='gte', label=_('Rental End After')
    )
    rental_end_before = rest_filters.DateTimeFilter(
        field_name='rental_end', lookup_expr='lte', label=_('Rental End Before')
    )

    overdue = rest_filters.BooleanFilter(label=_('Overdue'), method='filter_overdue')

    def filter_overdue(self, queryset, name, value):
        now = timezone.now()

        criteria = (
            Q(returned_date__isnull=True)
            & Q(rental_end__lt=now)
            & Q(
                status__in=[
                    RentalOrderStatus.ACTIVE.value,
                    RentalOrderStatus.OVERDUE.value,
                ]
            )
        )

        if value:
            return queryset.filter(criteria)

        return queryset.exclude(criteria)


class EventTypeList(ListCreateAPI):
    queryset = models.EventType.objects.all()
    serializer_class = serializers.EventTypeSerializer

    filter_backends = SEARCH_ORDER_FILTER
    filterset_fields = ['active']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'active']
    ordering = ['name']


class EventTypeDetail(RetrieveUpdateDestroyAPI):
    queryset = models.EventType.objects.all()
    serializer_class = serializers.EventTypeSerializer


class VenueList(ListCreateAPI):
    queryset = models.Venue.objects.all()
    serializer_class = serializers.VenueSerializer

    filter_backends = SEARCH_ORDER_FILTER
    filterset_fields = ['active']
    search_fields = ['name', 'address', 'contact_name', 'contact_email', 'notes']
    ordering_fields = ['name', 'active']
    ordering = ['name']


class VenueDetail(RetrieveUpdateDestroyAPI):
    queryset = models.Venue.objects.all()
    serializer_class = serializers.VenueSerializer


class PlannerList(ListCreateAPI):
    queryset = models.Planner.objects.all()
    serializer_class = serializers.PlannerSerializer

    filter_backends = SEARCH_ORDER_FILTER
    filterset_fields = ['active']
    search_fields = ['name', 'email', 'phone', 'notes']
    ordering_fields = ['name', 'active']
    ordering = ['name']


class PlannerDetail(RetrieveUpdateDestroyAPI):
    queryset = models.Planner.objects.all()
    serializer_class = serializers.PlannerSerializer


class EventList(ListCreateAPI):
    queryset = (
        models.Event.objects
        .select_related('event_type', 'venue', 'planner')
        .all()
        .order_by('-last_updated')
    )
    serializer_class = serializers.EventSerializer

    filter_backends = SEARCH_ORDER_FILTER
    filterset_class = EventFilter
    search_fields = ['reference', 'title', 'notes']
    ordering_fields = [
        'reference',
        'title',
        'start_datetime',
        'end_datetime',
        'status',
        'last_updated',
    ]
    ordering = ['-last_updated']


class EventDetail(RetrieveUpdateDestroyAPI):
    queryset = models.Event.objects.select_related(
        'event_type', 'venue', 'planner'
    ).all()
    serializer_class = serializers.EventSerializer


class FurnitureItemList(ListCreateAPI):
    queryset = models.FurnitureItem.objects.all()
    serializer_class = serializers.FurnitureItemSerializer

    filter_backends = SEARCH_ORDER_FILTER
    filterset_fields = ['active']
    search_fields = ['name', 'category', 'description', 'asset_tag', 'notes']
    ordering_fields = ['name', 'category', 'asset_tag', 'active']
    ordering = ['name']

    def list(self, request, *args, **kwargs):
        try:
            return super().list(request, *args, **kwargs)
        except (ProgrammingError, OperationalError):
            return Response({'count': 0, 'next': None, 'previous': None, 'results': []})


class FurnitureItemDetail(RetrieveUpdateDestroyAPI):
    queryset = models.FurnitureItem.objects.all()
    serializer_class = serializers.FurnitureItemSerializer


class EventFurnitureAssignmentList(ListCreateAPI):
    queryset = models.EventFurnitureAssignment.objects.select_related(
        'event', 'item', 'part', 'part__category'
    ).all()
    serializer_class = serializers.EventFurnitureAssignmentSerializer

    filter_backends = SEARCH_ORDER_FILTER
    filterset_class = EventFurnitureAssignmentFilter
    search_fields = [
        'event__reference',
        'part__name',
        'part__IPN',
        'part__category__pathstring',
        'item__name',
        'item__category',
        'notes',
    ]
    ordering_fields = [
        'part__name',
        'part__category__pathstring',
        'item__name',
        'item__category',
        'quantity',
        'status',
        'pk',
    ]
    ordering = ['-checked_out_at', '-pk']

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=self.clean_data(request.data))
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)

        response_status = (
            status.HTTP_200_OK
            if serializer.data.get('updated_existing')
            else status.HTTP_201_CREATED
        )

        return Response(serializer.data, status=response_status, headers=headers)

    def list(self, request, *args, **kwargs):
        try:
            return super().list(request, *args, **kwargs)
        except (ProgrammingError, OperationalError):
            return Response({'count': 0, 'next': None, 'previous': None, 'results': []})


class EventFurnitureAssignmentDetail(RetrieveUpdateDestroyAPI):
    queryset = models.EventFurnitureAssignment.objects.select_related(
        'event', 'item', 'part', 'part__category'
    ).all()
    serializer_class = serializers.EventFurnitureAssignmentSerializer


class RentalAssetList(ListCreateAPI):
    queryset = models.RentalAsset.objects.all()
    serializer_class = serializers.RentalAssetSerializer

    filter_backends = SEARCH_ORDER_FILTER
    filterset_fields = ['active']
    search_fields = ['name', 'asset_tag', 'serial', 'notes']
    ordering_fields = ['name', 'asset_tag', 'serial', 'active']
    ordering = ['name']


class RentalAssetDetail(RetrieveUpdateDestroyAPI):
    queryset = models.RentalAsset.objects.all()
    serializer_class = serializers.RentalAssetSerializer


class RentalOrderList(ListCreateAPI):
    serializer_class = serializers.RentalOrderListSerializer

    filter_backends = SEARCH_ORDER_FILTER
    filterset_class = RentalOrderFilter
    search_fields = ['reference', 'notes', 'customer__name']
    ordering_fields = [
        'reference',
        'rental_start',
        'rental_end',
        'returned_date',
        'status',
        'last_updated',
    ]
    ordering = ['-last_updated']

    def get_queryset(self):
        queryset = models.RentalOrder.objects.select_related(
            'customer', 'responsible'
        ).all()

        queryset = queryset.annotate(line_items=Count('lines', distinct=True))

        queryset = queryset.annotate(
            returned_lines=Case(
                When(status=RentalOrderStatus.RETURNED.value, then=F('line_items')),
                default=Value(0),
                output_field=IntegerField(),
            )
        )

        return queryset


class RentalOrderDetail(RetrieveUpdateDestroyAPI):
    queryset = models.RentalOrder.objects.select_related(
        'customer', 'responsible'
    ).all()
    serializer_class = serializers.RentalOrderSerializer


class RentalLineItemList(ListCreateAPI):
    queryset = models.RentalLineItem.objects.select_related('order', 'asset').all()
    serializer_class = serializers.RentalLineItemSerializer

    filter_backends = SEARCH_ORDER_FILTER
    filterset_fields = ['order', 'asset']
    search_fields = ['order__reference', 'asset__name', 'asset__asset_tag', 'notes']
    ordering_fields = ['order__reference', 'asset__name', 'quantity']
    ordering = ['order', 'pk']


class RentalLineItemDetail(RetrieveUpdateDestroyAPI):
    queryset = models.RentalLineItem.objects.select_related('order', 'asset').all()
    serializer_class = serializers.RentalLineItemSerializer


tracklet_api_urls = [
    path(
        'events/',
        include([
            path('<int:pk>/', EventDetail.as_view(), name='api-tracklet-event-detail'),
            path('', EventList.as_view(), name='api-tracklet-event-list'),
        ]),
    ),
    path(
        'venues/',
        include([
            path('<int:pk>/', VenueDetail.as_view(), name='api-tracklet-venue-detail'),
            path('', VenueList.as_view(), name='api-tracklet-venue-list'),
        ]),
    ),
    path(
        'planners/',
        include([
            path(
                '<int:pk>/', PlannerDetail.as_view(), name='api-tracklet-planner-detail'
            ),
            path('', PlannerList.as_view(), name='api-tracklet-planner-list'),
        ]),
    ),
    path(
        'event-types/',
        include([
            path(
                '<int:pk>/',
                EventTypeDetail.as_view(),
                name='api-tracklet-event-type-detail',
            ),
            path('', EventTypeList.as_view(), name='api-tracklet-event-type-list'),
        ]),
    ),
    path(
        'furniture-items/',
        include([
            path(
                '<int:pk>/',
                FurnitureItemDetail.as_view(),
                name='api-tracklet-furniture-item-detail',
            ),
            path(
                '', FurnitureItemList.as_view(), name='api-tracklet-furniture-item-list'
            ),
        ]),
    ),
    path(
        'event-furniture/',
        include([
            path(
                '<int:pk>/',
                EventFurnitureAssignmentDetail.as_view(),
                name='api-tracklet-event-furniture-detail',
            ),
            path(
                '',
                EventFurnitureAssignmentList.as_view(),
                name='api-tracklet-event-furniture-list',
            ),
        ]),
    ),
    path(
        'furniture-assignments/',
        include([
            path(
                '<int:pk>/',
                EventFurnitureAssignmentDetail.as_view(),
                name='api-tracklet-furniture-assignment-detail',
            ),
            path(
                '',
                EventFurnitureAssignmentList.as_view(),
                name='api-tracklet-furniture-assignment-list',
            ),
        ]),
    ),
    path(
        'rental-assets/',
        include([
            path(
                '<int:pk>/',
                RentalAssetDetail.as_view(),
                name='api-tracklet-rental-asset-detail',
            ),
            path('', RentalAssetList.as_view(), name='api-tracklet-rental-asset-list'),
        ]),
    ),
    path(
        'rental-orders/',
        include([
            path(
                '<int:pk>/',
                RentalOrderDetail.as_view(),
                name='api-tracklet-rental-order-detail',
            ),
            path('', RentalOrderList.as_view(), name='api-tracklet-rental-order-list'),
        ]),
    ),
    path(
        'rental-lines/',
        include([
            path(
                '<int:pk>/',
                RentalLineItemDetail.as_view(),
                name='api-tracklet-rental-line-detail',
            ),
            path(
                '', RentalLineItemList.as_view(), name='api-tracklet-rental-line-list'
            ),
        ]),
    ),
]
