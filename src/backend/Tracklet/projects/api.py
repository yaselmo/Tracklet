"""API endpoints for project tracking."""
import logging
from collections import OrderedDict
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.utils import IntegrityError
from django.db.models import (
    Count,
    DecimalField,
    Exists,
    ExpressionWrapper,
    F,
    OuterRef,
    Q,
    Subquery,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce, Greatest
from django.core.files.base import ContentFile
from django.shortcuts import get_object_or_404
from django.urls import include, path
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

import django_filters.rest_framework.filters as rest_filters
from django_filters.rest_framework.filterset import FilterSet

import Tracklet.permissions
from Tracklet.api import ListCreateDestroyAPIView
from Tracklet.filters import SEARCH_ORDER_FILTER
from Tracklet.mixins import CreateAPI, ListCreateAPI, RetrieveAPI, RetrieveUpdateDestroyAPI
from rest_framework import serializers
from rest_framework import status
from rest_framework.response import Response

import build.models
import common.models
from common.settings import get_global_setting
import order.models
from Tracklet.status_codes import StockStatus
from stock.models import StockItem, TrackletStockStatus
from stock.serializers import StockItemSerializer
from .models import (
    Project,
    ProjectInstrument,
    ProjectInstrumentReleaseStatus,
    ProjectReport,
    ProjectReportItem,
    ProjectStatus,
    ProjectStockAllocation,
    overlapping_project_reservation_filter,
)
from .serializers import (
    ProjectInstrumentAutoAssignSerializer,
    ProjectInstrumentReleaseSerializer,
    ProjectDashboardSerializer,
    ProjectInstrumentSerializer,
    ProjectReportItemSerializer,
    ProjectReportSerializer,
    ProjectSerializer,
    ProjectStockAllocationSerializer,
)

DEFAULT_LOW_STOCK_THRESHOLD = 2
DASHBOARD_UPCOMING_PROJECT_DAYS = 30
DASHBOARD_RESERVED_SOON_DAYS = 7
DASHBOARD_CALIBRATION_WARNING_DAYS = 14
DASHBOARD_LIST_LIMIT = 8

logger = logging.getLogger(__name__)


def dashboard_stock_item_name(item) -> str:
    """Return a dashboard-friendly stock item label."""
    if getattr(item, 'name', None):
        return item.name

    part = getattr(item, 'part', None)
    if part is not None and getattr(part, 'full_name', None):
        return part.full_name

    serial = getattr(item, 'serial', None)
    if serial:
        return serial

    return str(item)


def get_dashboard_threshold(key: str, default: int) -> int:
    """Return a non-negative dashboard threshold value with a safe fallback."""
    value = get_global_setting(key, backup_value=default, create=False)

    if value in [None, '']:
        return default

    try:
        return max(int(value), 0)
    except (TypeError, ValueError):
        logger.warning(
            'Invalid dashboard threshold setting encountered',
            extra={'setting': key, 'value': value, 'default': default},
        )
        return default

from .pdf_templates import build_broken_report_pdf


class ProjectFilter(FilterSet):
    """Filtering for projects list endpoint."""

    status = rest_filters.CharFilter(label=_('Status'), method='filter_status')

    class Meta:
        model = Project
        fields = ['status', 'created_by']

    def filter_status(self, queryset, name, value):
        """Filter by concrete status or status group."""
        value = str(value or '').upper()

        if value in ['', 'ALL']:
            return queryset

        if value == 'PAST':
            return queryset.filter(status__in=ProjectStatus.past_values())

        if value in ProjectStatus.values:
            return queryset.filter(status=value)

        return queryset


class ProjectList(ListCreateAPI):
    """List and create endpoint for projects."""

    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    permission_classes = [Tracklet.permissions.RolePermission]
    filter_backends = SEARCH_ORDER_FILTER
    filterset_class = ProjectFilter
    ordering_fields = ['name', 'status', 'start_date', 'end_date', 'created', 'updated']
    search_fields = ['name', 'description']
    ordering = ['-created']

    def get_queryset(self):
        queryset = super().get_queryset()
        return ProjectSerializer.annotate_queryset(queryset)

    def perform_create(self, serializer):
        """Set creator user when creating project."""
        serializer.save(created_by=self.request.user)


class ProjectDetail(RetrieveUpdateDestroyAPI):
    """Detail endpoint for projects."""

    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    permission_classes = [Tracklet.permissions.RolePermission]

    def get_queryset(self):
        queryset = super().get_queryset()
        return ProjectSerializer.annotate_queryset(queryset)


class ProjectDashboard(RetrieveAPI):
    """Aggregated project and stock operations dashboard."""

    serializer_class = ProjectDashboardSerializer
    permission_classes = [Tracklet.permissions.RolePermission]
    role_required = 'project.view'
    pagination_class = None

    def get(self, request, *args, **kwargs):
        """Return a combined dashboard payload."""
        try:
            today = timezone.localdate()
            reserved_soon_days = get_dashboard_threshold(
                'DASHBOARD_RESERVED_SOON_DAYS', DASHBOARD_RESERVED_SOON_DAYS
            )
            calibration_warning_days = get_dashboard_threshold(
                'DASHBOARD_CALIBRATION_DUE_DAYS',
                DASHBOARD_CALIBRATION_WARNING_DAYS,
            )
            low_stock_threshold = get_dashboard_threshold(
                'DASHBOARD_LOW_STOCK_THRESHOLD', DEFAULT_LOW_STOCK_THRESHOLD
            )
            upcoming_cutoff = today + timedelta(days=DASHBOARD_UPCOMING_PROJECT_DAYS)
            reserved_cutoff = today + timedelta(days=reserved_soon_days)
            calibration_cutoff = today + timedelta(days=calibration_warning_days)

            active_project_filter = Q(status__in=ProjectStatus.active_values())
            primary_out_of_service_statuses = [
                TrackletStockStatus.BROKEN,
                TrackletStockStatus.MISSING,
                TrackletStockStatus.CALIBRATION,
                TrackletStockStatus.REPAIR,
            ]
            quantity_field = DecimalField(max_digits=20, decimal_places=6)
            issue_totals = StockItem.objects.aggregate(
                broken_items=Coalesce(
                    Sum('broken_quantity'),
                    Value(Decimal('0.0'), output_field=quantity_field),
                    output_field=quantity_field,
                ),
                missing_items=Coalesce(
                    Sum('missing_quantity'),
                    Value(Decimal('0.0'), output_field=quantity_field),
                    output_field=quantity_field,
                ),
            )

            summary = {
                'total_stock_items': StockItem.objects.count(),
                'available_equipment': StockItem.objects.filter(
                    tracklet_status=TrackletStockStatus.IN_STOCK,
                    quantity__gt=0,
                ).count(),
                'reserved_equipment': StockItem.objects.filter(
                    tracklet_status=TrackletStockStatus.IN_USE,
                    quantity__gt=0,
                ).count(),
                'broken_items': int(issue_totals['broken_items'] or 0),
                'missing_items': int(issue_totals['missing_items'] or 0),
                'out_of_service': StockItem.objects.filter(
                    tracklet_status__in=primary_out_of_service_statuses
                ).count(),
            }
            upcoming_projects = list(
                Project.objects.filter(
                    active_project_filter,
                    start_date__isnull=False,
                    start_date__gte=today,
                    start_date__lte=upcoming_cutoff,
                )
                .order_by('start_date', 'end_date', 'name')
                .values('pk', 'name', 'status', 'start_date', 'end_date')[
                    :DASHBOARD_LIST_LIMIT
                ]
            )

            reservation_rows: OrderedDict[tuple[int, int], dict] = OrderedDict()

            upcoming_instruments = (
                ProjectInstrument.objects.select_related(
                    'project', 'stock_item', 'stock_item__part'
                )
                .filter(
                    project__status__in=ProjectStatus.active_values(),
                    project__start_date__isnull=False,
                    project__start_date__gte=today,
                    project__start_date__lte=reserved_cutoff,
                )
                .order_by('project__start_date', 'project__name', 'stock_item_id')[
                    : DASHBOARD_LIST_LIMIT * 2
                ]
            )

            for instrument in upcoming_instruments:
                key = (instrument.project_id, instrument.stock_item_id)
                reservation_rows[key] = {
                    'stock_item': instrument.stock_item_id,
                    'item_name': dashboard_stock_item_name(instrument.stock_item),
                    'project': instrument.project_id,
                    'project_name': instrument.project.name,
                    'reservation_type': 'instrument',
                    'start_date': instrument.project.start_date,
                    'end_date': instrument.project.end_date,
                }

            upcoming_allocations = (
                ProjectStockAllocation.objects.select_related(
                    'project', 'stock_item', 'stock_item__part'
                )
                .filter(
                    project__status__in=ProjectStatus.active_values(),
                    project__start_date__isnull=False,
                    project__start_date__gte=today,
                    project__start_date__lte=reserved_cutoff,
                )
                .order_by('project__start_date', 'project__name', 'stock_item_id')[
                    : DASHBOARD_LIST_LIMIT * 2
                ]
            )

            for allocation in upcoming_allocations:
                key = (allocation.project_id, allocation.stock_item_id)
                reservation_rows.setdefault(
                    key,
                    {
                        'stock_item': allocation.stock_item_id,
                        'item_name': dashboard_stock_item_name(allocation.stock_item),
                        'project': allocation.project_id,
                        'project_name': allocation.project.name,
                        'reservation_type': 'stock',
                        'start_date': allocation.project.start_date,
                        'end_date': allocation.project.end_date,
                    },
                )

            reserved_equipment_soon = list(reservation_rows.values())[
                :DASHBOARD_LIST_LIMIT
            ]

            calibration_candidates = (
                StockItem.objects.select_related('part', 'part__category')
                .filter(
                    part__category__requires_calibration=True,
                    part__category__calibration_interval_days__isnull=False,
                    last_calibration_date__isnull=False,
                )
                .order_by('pk')
            )

            calibration_due = []
            for item in calibration_candidates:
                interval_days = getattr(
                    getattr(item.part, 'category', None),
                    'calibration_interval_days',
                    None,
                )

                if not interval_days:
                    continue

                next_due_date = item.last_calibration_date + timedelta(days=interval_days)

                if next_due_date > calibration_cutoff:
                    continue

                days_until_due = (next_due_date - today).days
                calibration_due.append(
                    {
                        'stock_item': item.pk,
                        'item_name': dashboard_stock_item_name(item),
                        'last_calibration': item.last_calibration_date,
                        'next_due_date': next_due_date,
                        'status': 'overdue'
                        if next_due_date < today
                        else 'due_soon',
                        'days_until_due': days_until_due,
                    }
                )

            calibration_due.sort(
                key=lambda row: (
                    row['next_due_date'] is None,
                    row['next_due_date'] or today,
                    row['item_name'],
                )
            )
            calibration_due = calibration_due[:DASHBOARD_LIST_LIMIT]

            stock_by_location = list(
                StockItem.objects.annotate(
                    dashboard_label=Coalesce(
                        F('location__name'), Value(str(_('Unassigned')))
                    )
                )
                .values('location', 'dashboard_label')
                .annotate(value=Count('pk'))
                .order_by('-value', 'dashboard_label')[:DASHBOARD_LIST_LIMIT]
            )
            stock_by_location = [
                {
                    'pk': row['location'],
                    'label': row['dashboard_label'],
                    'value': row['value'],
                }
                for row in stock_by_location
            ]

            category_distribution = list(
                StockItem.objects.annotate(
                    dashboard_label=Coalesce(
                        F('part__category__name'), Value(str(_('Uncategorized')))
                    )
                )
                .values('dashboard_label')
                .annotate(value=Count('pk'))
                .order_by('-value', 'dashboard_label')[:DASHBOARD_LIST_LIMIT]
            )
            category_distribution = [
                {'label': row['dashboard_label'], 'value': row['value']}
                for row in category_distribution
            ]

            recently_added_equipment = [
                {
                    'stock_item': item.pk,
                    'name': dashboard_stock_item_name(item),
                    'category': item.part.category.name
                    if item.part and item.part.category
                    else '',
                    'location': item.location.pathstring if item.location else '',
                    'created': getattr(item, 'created', None) or item.updated,
                }
                for item in StockItem.objects.select_related(
                    'part__category', 'location'
                )
                .order_by('-updated', '-pk')[:DASHBOARD_LIST_LIMIT]
            ]

            annotated_available = StockItemSerializer.annotate_queryset(
                StockItem.objects.select_related('part', 'location')
            )

            low_stock_warning = [
                {
                    'stock_item': item.pk,
                    'item_name': dashboard_stock_item_name(item),
                    'available_quantity': item.available,
                    'location': item.location.pathstring if item.location else '',
                }
                for item in annotated_available.filter(
                    available__gt=0,
                    available__lte=Decimal(low_stock_threshold),
                )
                .order_by('available', '-updated', 'pk')[:DASHBOARD_LIST_LIMIT]
            ]

            usage_queryset = (
                StockItem.objects.select_related('part')
                .annotate(
                    project_allocation_events=Count(
                        'project_allocations', distinct=True
                    ),
                    project_instrument_events=Count(
                        'project_instruments', distinct=True
                    ),
                    project_allocation_quantity=Coalesce(
                        Sum('project_allocations__quantity'),
                        Value(Decimal('0.0')),
                    ),
                    project_instrument_quantity=Coalesce(
                        Sum('project_instruments__quantity'),
                        Value(Decimal('0.0')),
                    ),
                )
                .annotate(
                    usage_count=F('project_allocation_events')
                    + F('project_instrument_events'),
                    total_reserved_quantity=ExpressionWrapper(
                        F('project_allocation_quantity')
                        + F('project_instrument_quantity'),
                        output_field=DecimalField(max_digits=20, decimal_places=6),
                    ),
                )
                .filter(usage_count__gt=0)
                .order_by('-usage_count', '-total_reserved_quantity', 'pk')[
                    :DASHBOARD_LIST_LIMIT
                ]
            )

            most_used_equipment = [
                {
                    'stock_item': item.pk,
                    'item_name': dashboard_stock_item_name(item),
                    'usage_count': item.usage_count,
                    'total_reserved_quantity': item.total_reserved_quantity,
                }
                for item in usage_queryset
            ]

            payload = {
                'summary': summary,
                'thresholds': {
                    'low_stock': low_stock_threshold,
                    'project_window_days': DASHBOARD_UPCOMING_PROJECT_DAYS,
                    'reservation_window_days': reserved_soon_days,
                    'calibration_warning_days': calibration_warning_days,
                },
                'upcoming_projects': upcoming_projects,
                'reserved_equipment_soon': reserved_equipment_soon,
                'calibration_due': calibration_due,
                'stock_by_location': stock_by_location,
                'category_distribution': category_distribution,
                'recently_added_equipment': recently_added_equipment,
                'low_stock_warning': low_stock_warning,
                'most_used_equipment': most_used_equipment,
            }

            serializer = self.get_serializer(payload)
            return Response(serializer.data)
        except Exception:
            logger.exception(
                'Failed to build project dashboard',
                extra={
                    'user_id': getattr(request.user, 'pk', None),
                    'username': getattr(request.user, 'username', None),
                },
            )
            raise


class ProjectAllocationFilter(FilterSet):
    """Filtering for project stock allocation list endpoint."""

    class Meta:
        model = ProjectStockAllocation
        fields = ['project', 'stock_item']


class ProjectAllocationList(ListCreateDestroyAPIView):
    """List/create/delete endpoint for project allocations."""

    queryset = ProjectStockAllocation.objects.all()
    serializer_class = ProjectStockAllocationSerializer
    permission_classes = [Tracklet.permissions.RolePermission]
    filter_backends = SEARCH_ORDER_FILTER
    filterset_class = ProjectAllocationFilter
    ordering_fields = ['created', 'updated', 'quantity']
    search_fields = ['stock_item__serial', 'stock_item__batch', 'notes']
    ordering = ['-created']

    def get_queryset(self):
        queryset = super().get_queryset().select_related(
            'project', 'stock_item', 'stock_item__part', 'stock_item__location'
        )
        if project_pk := self.kwargs.get('pk', None):
            queryset = queryset.filter(project_id=project_pk)
        return queryset

    def create(self, request, *args, **kwargs):
        """Bind allocation creation to project from URL when provided."""
        data = request.data.copy()

        if project_pk := self.kwargs.get('pk', None):
            data['project'] = project_pk

        serializer = self.get_serializer(data=self.clean_data(data))
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)

        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class ProjectAllocationDetail(RetrieveUpdateDestroyAPI):
    """Detail endpoint for project allocations."""

    queryset = ProjectStockAllocation.objects.select_related(
        'project', 'stock_item', 'stock_item__part', 'stock_item__location'
    )
    serializer_class = ProjectStockAllocationSerializer
    permission_classes = [Tracklet.permissions.RolePermission]


class ProjectInstrumentFilter(FilterSet):
    """Filtering for project instruments list endpoint."""

    class Meta:
        model = ProjectInstrument
        fields = ['project', 'stock_item']


class ProjectInstrumentList(ListCreateDestroyAPIView):
    """List/create/delete endpoint for project instruments."""

    queryset = ProjectInstrument.objects.all()
    serializer_class = ProjectInstrumentSerializer
    permission_classes = [Tracklet.permissions.RolePermission]
    filter_backends = SEARCH_ORDER_FILTER
    filterset_class = ProjectInstrumentFilter
    ordering_fields = ['created', 'updated', 'quantity']
    search_fields = [
        'stock_item__serial',
        'stock_item__batch',
        'stock_item__part__name',
        'notes',
    ]
    ordering = ['-created']

    def get_queryset(self):
        queryset = super().get_queryset().select_related(
            'project', 'stock_item', 'stock_item__part', 'stock_item__location'
        )
        if project_pk := self.kwargs.get('pk', None):
            queryset = queryset.filter(project_id=project_pk)
        return queryset

    def create(self, request, *args, **kwargs):
        """Bind instrument creation to project from URL when provided."""
        data = request.data.copy()

        if project_pk := self.kwargs.get('pk', None):
            data['project'] = project_pk

        serializer = self.get_serializer(data=self.clean_data(data))
        serializer.is_valid(raise_exception=True)
        try:
            self.perform_create(serializer)
        except (IntegrityError, DjangoValidationError) as exc:
            detail = (
                exc.message_dict
                if isinstance(exc, DjangoValidationError) and hasattr(exc, 'message_dict')
                else {
                    'non_field_errors': [
                        _(
                            'Unable to create the project instrument with the provided data.'
                        )
                    ]
                }
            )
            raise serializers.ValidationError(detail) from exc
        headers = self.get_success_headers(serializer.data)

        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        """Explicitly set release status during API creates."""
        serializer.save(release_status=ProjectInstrumentReleaseStatus.PENDING)


class ProjectInstrumentDetail(RetrieveUpdateDestroyAPI):
    """Detail endpoint for project instruments."""

    queryset = ProjectInstrument.objects.select_related(
        'project', 'stock_item', 'stock_item__part', 'stock_item__location'
    )
    serializer_class = ProjectInstrumentSerializer
    permission_classes = [Tracklet.permissions.RolePermission]


class ProjectInstrumentAutoAssign(CreateAPI):
    """Auto-assign available stock items as project instruments."""

    queryset = Project.objects.all()
    serializer_class = ProjectInstrumentAutoAssignSerializer
    permission_classes = [Tracklet.permissions.RolePermission]

    def create(self, request, *args, **kwargs):
        """Auto-select stock items for the given part and create instrument rows."""
        project = self.get_object()

        serializer = self.get_serializer(data=self.clean_data(request.data))
        serializer.is_valid(raise_exception=True)

        part = serializer.validated_data['part']
        quantity = serializer.validated_data['quantity']
        location = serializer.validated_data.get('location', None)

        if project.status == ProjectStatus.PAST:
            raise serializers.ValidationError({
                'project': _('Instruments cannot be edited for past projects')
            })

        with transaction.atomic():
            quantity_field = DecimalField(max_digits=20, decimal_places=6)
            ZERO = Value(Decimal('0.0'), output_field=quantity_field)
            requested_quantity = Decimal(quantity)

            sales_allocated_sq = (
                order.models.SalesOrderAllocation.objects.filter(item=OuterRef('pk'))
                .values('item')
                .annotate(total=Coalesce(Sum('quantity'), ZERO))
                .values('total')[:1]
            )

            build_allocated_sq = (
                build.models.BuildItem.objects.filter(stock_item=OuterRef('pk'))
                .values('stock_item')
                .annotate(total=Coalesce(Sum('quantity'), ZERO))
                .values('total')[:1]
            )

            project_allocated_sq = (
                ProjectInstrument.objects.filter(stock_item=OuterRef('pk'))
                .filter(overlapping_project_reservation_filter(project, prefix='project__'))
                .values('stock_item')
                .annotate(total=Coalesce(Sum('quantity'), ZERO))
                .values('total')[:1]
            )

            existing_project_instrument_sq = ProjectInstrument.objects.filter(
                project=project, stock_item=OuterRef('pk')
            )

            candidate_items = (
                StockItem.objects
                .filter(StockItem.IN_STOCK_FILTER)
                .filter(
                    part=part,
                    status=StockStatus.OK.value,
                )
                .exclude(
                    tracklet_status__in=['BROKEN', 'MISSING', 'UNAVAILABLE', 'CALIBRATION', 'REPAIR']
                )
                .annotate(
                    sales_allocated=Coalesce(
                        Subquery(sales_allocated_sq, output_field=quantity_field),
                        ZERO,
                        output_field=quantity_field,
                    ),
                    build_allocated=Coalesce(
                        Subquery(build_allocated_sq, output_field=quantity_field),
                        ZERO,
                        output_field=quantity_field,
                    ),
                    project_allocated=Coalesce(
                        Subquery(project_allocated_sq, output_field=quantity_field),
                        ZERO,
                        output_field=quantity_field,
                    ),
                )
                .annotate(
                    allocated=ExpressionWrapper(
                        F('sales_allocated')
                        + F('build_allocated')
                        + F('project_allocated'),
                        output_field=quantity_field,
                    ),
                    available_quantity=ExpressionWrapper(
                        F('quantity') - F('allocated'),
                        output_field=quantity_field,
                    ),
                    already_in_project=Exists(existing_project_instrument_sq),
                )
                .filter(
                    quantity__gt=F('allocated'),
                    already_in_project=False,
                )
                .order_by('?')
            )

            total_available_quantity = (
                candidate_items.aggregate(
                    total=Coalesce(Sum('available_quantity'), ZERO)
                )['total']
                or Decimal('0')
            )

            if location is not None:
                candidate_items = candidate_items.filter(location=location)

            scoped_available_quantity = (
                candidate_items.aggregate(
                    total=Coalesce(Sum('available_quantity'), ZERO)
                )['total']
                or Decimal('0')
            )

            if scoped_available_quantity < requested_quantity:
                if location is not None:
                    location_name = location.pathstring or location.name
                    message = _(
                        f'Not enough available stock for part "{part.full_name}" at '
                        f'location "{location_name}". Requested {quantity}, '
                        f'available quantity {scoped_available_quantity} at location '
                        f'({total_available_quantity} total available).'
                    )
                else:
                    message = _(
                        f'Not enough available stock for part "{part.full_name}". '
                        f'Requested {quantity}, available quantity {scoped_available_quantity}.'
                    )

                raise serializers.ValidationError({
                    'quantity': message
                })

            selected_items = list(
                candidate_items.select_for_update(skip_locked=True)
            )

            if len(selected_items) <= 0:
                raise serializers.ValidationError({
                    'quantity': _(
                        f'Not enough available stock for part "{part.full_name}". '
                        f'Requested {quantity}, available quantity 0.'
                    )
                })

            stock_item_ids = []
            instrument_ids = []
            remaining_quantity = requested_quantity

            for item in selected_items:
                item_available = max(
                    Decimal(item.quantity) - Decimal(item.allocated),
                    Decimal('0'),
                )

                if item_available <= 0:
                    continue

                assign_quantity = min(item_available, remaining_quantity)

                if assign_quantity <= 0:
                    break

                instrument = ProjectInstrument(
                    project=project,
                    stock_item=item,
                    quantity=assign_quantity,
                )
                instrument.full_clean()
                instrument.save()

                allocation, created = ProjectStockAllocation.objects.get_or_create(
                    project=project,
                    stock_item=item,
                    defaults={'quantity': assign_quantity},
                )
                if not created:
                    allocation.quantity += assign_quantity
                    allocation.full_clean()
                    allocation.save(update_fields=['quantity'])

                stock_item_ids.append(item.pk)
                instrument_ids.append(instrument.pk)
                remaining_quantity -= assign_quantity

                if hasattr(StockStatus, 'ALLOCATED'):
                    item.status = StockStatus.ALLOCATED.value
                if hasattr(StockStatus, 'ALLOCATED'):
                    item.save(update_fields=['status'])
                item.sync_tracklet_status(save=True, update_fields=['tracklet_status'])

                if remaining_quantity <= 0:
                    break

            if remaining_quantity > 0:
                assigned_quantity = requested_quantity - remaining_quantity
                raise serializers.ValidationError({
                    'quantity': _(
                        f'Not enough available stock for part "{part.full_name}". '
                        f'Requested {quantity}, available quantity {assigned_quantity}.'
                    )
                })

        return Response(
            {
                'project': project.pk,
                'part': part.pk,
                'quantity': quantity,
                'stock_item_ids': stock_item_ids,
                'instrument_ids': instrument_ids,
            },
            status=status.HTTP_201_CREATED,
        )


class ProjectInstrumentRelease(CreateAPI):
    """Bulk release project instruments back to stock."""

    queryset = Project.objects.all()
    serializer_class = ProjectInstrumentReleaseSerializer
    permission_classes = [Tracklet.permissions.RolePermission]

    def create(self, request, *args, **kwargs):
        """Release instrument rows and adjust corresponding stock quantities."""
        project = self.get_object()
        serializer = self.get_serializer(data=self.clean_data(request.data))
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        instrument_ids = data['instrument_ids']
        release_items = data.get('release_items') or [
            {'instrument_id': instrument_id}
            for instrument_id in instrument_ids
        ]
        release_status = data['release_status']

        if project.status == ProjectStatus.PAST:
            raise serializers.ValidationError({
                'project': _('Instruments cannot be edited for past projects')
            })

        with transaction.atomic():
            instruments = {
                instrument.pk: instrument
                for instrument in ProjectInstrument.objects.select_for_update()
                .filter(project=project, pk__in=instrument_ids)
                .select_related('stock_item')
            }

            if len(instruments) != len(instrument_ids):
                raise serializers.ValidationError({
                    'instrument_ids': _(
                        'One or more instruments do not belong to this project.'
                    )
                })

            release_rows = []
            stock_item_ids = set()

            for release_item in release_items:
                instrument_id = release_item['instrument_id']
                instrument = instruments[instrument_id]
                quantity_to_release = Decimal(
                    release_item.get('quantity', instrument.quantity)
                )

                if quantity_to_release <= 0:
                    raise serializers.ValidationError({
                        'release_items': _(
                            'Release quantity must be greater than zero.'
                        )
                    })

                if quantity_to_release > instrument.quantity:
                    raise serializers.ValidationError({
                        'release_items': _(
                            f'Release quantity for instrument {instrument_id} exceeds '
                            f'allocated quantity ({instrument.quantity}).'
                        )
                    })

                release_rows.append((instrument, quantity_to_release))
                stock_item_ids.add(instrument.stock_item_id)

            stock_items = {
                item.pk: item
                for item in StockItem.objects.select_for_update().filter(
                    pk__in=stock_item_ids
                )
            }

            allocations = {
                allocation.stock_item_id: allocation
                for allocation in ProjectStockAllocation.objects.select_for_update().filter(
                    project=project,
                    stock_item_id__in=stock_item_ids,
                )
            }
            project_instrument_totals = {
                entry['stock_item_id']: entry['total'] or Decimal('0')
                for entry in ProjectInstrument.objects.select_for_update()
                .filter(project=project, stock_item_id__in=stock_item_ids)
                .values('stock_item_id')
                .annotate(total=Coalesce(Sum('quantity'), Decimal('0')))
            }
            allocation_states = {
                stock_item_id: {
                    'allocation': allocation,
                    'remaining_quantity': Decimal(
                        allocation.quantity
                        if allocation is not None
                        else project_instrument_totals.get(stock_item_id, Decimal('0'))
                    ),
                }
                for stock_item_id, allocation in {
                    stock_item_id: allocations.get(stock_item_id)
                    for stock_item_id in stock_item_ids
                }.items()
            }

            released_instrument_ids = []
            released_stock_item_ids = []
            released_quantity = Decimal('0')

            has_ok_status = hasattr(StockStatus, 'OK') and any(
                choice[0] == StockStatus.OK.value
                for choice in StockItem._meta.get_field('status').choices
            )
            has_damaged_status = hasattr(StockStatus, 'DAMAGED') and any(
                choice[0] == StockStatus.DAMAGED.value
                for choice in StockItem._meta.get_field('status').choices
            )
            has_lost_status = hasattr(StockStatus, 'LOST') and any(
                choice[0] == StockStatus.LOST.value
                for choice in StockItem._meta.get_field('status').choices
            )

            for instrument, quantity_to_release in release_rows:
                item = stock_items[instrument.stock_item_id]
                allocation_state = allocation_states[instrument.stock_item_id]
                allocation = allocation_state['allocation']
                remaining_allocation_quantity = allocation_state['remaining_quantity']

                if quantity_to_release > remaining_allocation_quantity:
                    raise serializers.ValidationError({
                        'release_items': _(
                            f'Release quantity for instrument {instrument.pk} exceeds '
                            f'project allocation quantity ({remaining_allocation_quantity}).'
                        )
                    })

                if release_status == 'BROKEN':
                    item.broken_quantity = Decimal(item.broken_quantity) + quantity_to_release
                elif release_status == 'MISSING':
                    item.missing_quantity = Decimal(item.missing_quantity) + quantity_to_release

                item.full_clean()

                if quantity_to_release == instrument.quantity:
                    instrument.delete()
                else:
                    instrument.quantity = Decimal(instrument.quantity) - quantity_to_release
                    instrument.full_clean()
                    instrument.save(update_fields=['quantity'])

                allocation_state['remaining_quantity'] = (
                    Decimal(remaining_allocation_quantity) - quantity_to_release
                )

                if allocation is not None:
                    if allocation_state['remaining_quantity'] <= 0:
                        allocation.delete()
                        allocations.pop(instrument.stock_item_id, None)
                        allocation_state['allocation'] = None
                    else:
                        allocation.quantity = allocation_state['remaining_quantity']
                        allocation.full_clean()
                        allocation.save(update_fields=['quantity'])

                remaining_project_quantity = (
                    ProjectInstrument.objects.filter(stock_item=item).aggregate(
                        total=Coalesce(Sum('quantity'), Decimal('0'))
                    )['total']
                    or Decimal('0')
                )
                fully_unusable = (
                    Decimal(item.broken_quantity) + Decimal(item.missing_quantity)
                ) >= Decimal(item.quantity)

                update_fields = []

                if release_status == 'RETURNED':
                    if (
                        remaining_project_quantity <= 0
                        and has_ok_status
                        and item.status != StockStatus.OK.value
                    ):
                        item.status = StockStatus.OK.value
                        update_fields.append('status')
                elif (
                    release_status == 'BROKEN'
                    and fully_unusable
                    and has_damaged_status
                    and item.status != StockStatus.DAMAGED.value
                ):
                    item.status = StockStatus.DAMAGED.value
                    update_fields.append('status')
                elif (
                    release_status == 'MISSING'
                    and fully_unusable
                    and has_lost_status
                    and item.status != StockStatus.LOST.value
                ):
                    item.status = StockStatus.LOST.value
                    update_fields.append('status')

                if release_status == 'BROKEN':
                    update_fields.append('broken_quantity')
                elif release_status == 'MISSING':
                    update_fields.append('missing_quantity')

                if fully_unusable and release_status in {'BROKEN', 'MISSING'}:
                    target_tracklet_status = (
                        TrackletStockStatus.BROKEN
                        if release_status == 'BROKEN'
                        else TrackletStockStatus.MISSING
                    )
                    if item.tracklet_status != target_tracklet_status:
                        item.tracklet_status = target_tracklet_status
                        update_fields.append('tracklet_status')

                if update_fields:
                    item.save(update_fields=list(dict.fromkeys(update_fields)))
                item.sync_tracklet_status(save=True, update_fields=['tracklet_status'])

                released_instrument_ids.append(instrument.pk)
                released_stock_item_ids.append(item.pk)
                released_quantity += quantity_to_release

        response_tracklet_status = {
            'RETURNED': 'AUTO',
            'BROKEN': TrackletStockStatus.BROKEN,
            'MISSING': TrackletStockStatus.MISSING,
        }[release_status]

        return Response(
            {
                'released_count': len(released_instrument_ids),
                'released_quantity': released_quantity,
                'stock_item_ids': released_stock_item_ids,
                'instrument_ids': released_instrument_ids,
                'release_status': release_status,
                'new_tracklet_status': response_tracklet_status,
            },
            status=status.HTTP_200_OK,
        )


class ProjectReportSingleton(CreateAPI):
    """Retrieve/create the singleton report for a project."""

    queryset = Project.objects.all()
    serializer_class = ProjectReportSerializer
    permission_classes = [Tracklet.permissions.RolePermission]

    def _load_report(self, report_pk):
        """Load report with related data and item counts."""
        return (
            ProjectReport.objects.select_related('attachment', 'created_by')
            .annotate(item_count=Count('items'))
            .get(pk=report_pk)
        )

    def _get_or_create_report(self, project, user=None):
        """Get existing singleton report or create it."""
        report, created = ProjectReport.objects.get_or_create(
            project=project,
            defaults={
                'report_type': 'BROKEN_INVENTORY',
                'created_by': user,
            },
        )
        return report, created

    def get(self, request, *args, **kwargs):
        """Return singleton report for the selected project (auto-create if missing)."""
        project = self.get_object()
        report, _created = self._get_or_create_report(project, request.user)
        report = self._load_report(report.pk)
        serializer = self.get_serializer(report)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """Create singleton report if missing (idempotent)."""
        project = self.get_object()
        report, created = self._get_or_create_report(project, request.user)
        report = self._load_report(report.pk)
        serializer = self.get_serializer(report)
        return Response(
            serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ProjectReportListCompatibility(RetrieveAPI):
    """Backward-compatible list endpoint for singleton report."""

    queryset = Project.objects.all()
    serializer_class = ProjectReportSerializer
    permission_classes = [Tracklet.permissions.RolePermission]

    def get(self, request, *args, **kwargs):
        """Return singleton report as a one-item list."""
        project = self.get_object()
        report = (
            ProjectReport.objects.filter(project_id=project.pk)
            .select_related('attachment', 'created_by')
            .annotate(item_count=Count('items'))
            .first()
        )

        if report is None:
            return Response([])

        serializer = self.get_serializer(report)
        return Response([serializer.data])


class ProjectReportItemFilter(FilterSet):
    """Filtering for project report items."""

    class Meta:
        model = ProjectReportItem
        fields = ['report']


class ProjectReportItemList(ListCreateAPI):
    """List/create report items for singleton project report."""

    queryset = ProjectReportItem.objects.all()
    serializer_class = ProjectReportItemSerializer
    permission_classes = [Tracklet.permissions.RolePermission]
    filter_backends = SEARCH_ORDER_FILTER
    filterset_class = ProjectReportItemFilter
    ordering_fields = ['pk', 'model', 'sn', 'type']
    ordering = ['pk']

    def get_queryset(self):
        queryset = super().get_queryset().select_related(
            'report',
            'instrument',
            'instrument__stock_item',
            'instrument__stock_item__part',
            'instrument__stock_item__part__category',
            'instrument__stock_item__location',
            'instrument__stock_item__supplier_part__manufacturer_part__manufacturer',
        )
        if project_pk := self.kwargs.get('pk', None):
            queryset = queryset.filter(report__project_id=project_pk)
        return queryset

    def get_serializer_context(self):
        """Inject project instance for serializer scope validation."""
        context = super().get_serializer_context()
        project_pk = self.kwargs.get('pk', None)
        if project_pk:
            context['project'] = get_object_or_404(Project, pk=project_pk)
        return context

    def create(self, request, *args, **kwargs):
        """Create report item against singleton project report."""
        project = get_object_or_404(Project, pk=self.kwargs.get('pk', None))

        if project.status == ProjectStatus.PAST:
            raise serializers.ValidationError({
                'project': _('Reports cannot be edited for past projects')
            })

        report, _ = ProjectReport.objects.get_or_create(
            project=project,
            defaults={
                'report_type': 'BROKEN_INVENTORY',
                'created_by': request.user,
            },
        )

        serializer = self.get_serializer(data=self.clean_data(request.data))
        serializer.is_valid(raise_exception=True)
        serializer.save(report=report)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)


class ProjectReportItemDetail(RetrieveUpdateDestroyAPI):
    """Retrieve/update/delete a report item for singleton project report."""

    queryset = ProjectReportItem.objects.select_related(
        'report',
        'instrument',
        'instrument__stock_item',
        'instrument__stock_item__part',
        'instrument__stock_item__part__category',
        'instrument__stock_item__location',
        'instrument__stock_item__supplier_part__manufacturer_part__manufacturer',
    )
    serializer_class = ProjectReportItemSerializer
    permission_classes = [Tracklet.permissions.RolePermission]
    lookup_url_kwarg = 'item_pk'

    def get_queryset(self):
        queryset = super().get_queryset()
        if project_pk := self.kwargs.get('pk', None):
            queryset = queryset.filter(report__project_id=project_pk)
        return queryset

    def get_serializer_context(self):
        """Inject project instance for serializer scope validation."""
        context = super().get_serializer_context()
        project_pk = self.kwargs.get('pk', None)
        if project_pk:
            context['project'] = get_object_or_404(Project, pk=project_pk)
        return context


class ProjectBrokenReportCreate(CreateAPI):
    """Create and attach a broken inventory PDF report for a project."""

    queryset = Project.objects.all()
    permission_classes = [Tracklet.permissions.RolePermission]

    def _get_report_items_queryset(self, report):
        """Return the canonical queryset for broken report rows."""
        return (
            ProjectReportItem.objects.select_related(
                'instrument',
                'instrument__stock_item',
                'instrument__stock_item__part',
                'instrument__stock_item__part__category',
                'instrument__stock_item__location',
                'instrument__stock_item__supplier_part__manufacturer_part__manufacturer',
            )
            .filter(report=report)
            .order_by('pk')
        )

    def create(self, request, *args, **kwargs):
        """Create report rows, generate PDF and attach to project."""
        project = self.get_object()
        data = self.clean_data(request.data)

        if project.status == ProjectStatus.PAST:
            raise serializers.ValidationError({
                'project': _('Reports cannot be edited for past projects')
            })

        items = data.get('items', None)
        report_type_value = str(data.get('report_type', '') or '').strip().upper()
        part_name = str(data.get('part_name', '') or '').strip()
        manual_notes = str(data.get('notes', '') or '').strip()
        title = (
            str(data.get('report_title', '') or '').strip()
            or str(data.get('title', '') or '').strip()
            or 'Broken Items Inventory Report'
        )
        report_date = str(data.get('report_date', '')).strip()

        if items is not None and not isinstance(items, list):
            raise serializers.ValidationError({
                'items': _('Expected "items" to be a list')
            })

        if isinstance(items, list):
            if len(items) <= 0:
                raise serializers.ValidationError({
                    'items': _('At least one report item is required')
                })
            for idx, item in enumerate(items):
                if not isinstance(item, dict):
                    raise serializers.ValidationError({
                        'items': _(f'Invalid row at index {idx}')
                    })

        with transaction.atomic():
            report, _ = ProjectReport.objects.get_or_create(
                project=project,
                defaults={
                    'report_type': 'BROKEN_INVENTORY',
                    'created_by': request.user,
                },
            )

            normalized_items = None

            if isinstance(items, list):
                normalized_items = items
            elif part_name:
                normalized_items = [{
                    'part_name': part_name,
                    'quantity': data.get('quantity', 1),
                    'notes': manual_notes,
                }]

            if normalized_items is not None:
                report.items.all().delete()

                for item in normalized_items:
                    instrument_id = item.get('instrument_id', None)
                    raw_quantity = item.get('quantity', 1)

                    try:
                        quantity = int(raw_quantity)
                    except (TypeError, ValueError):
                        quantity = 1

                    if quantity <= 0:
                        raise serializers.ValidationError({
                            'items': _('Quantity must be greater than zero')
                        })

                    if instrument_id not in [None, '']:
                        instrument = ProjectInstrument.objects.select_related(
                            'project',
                            'stock_item',
                            'stock_item__part',
                            'stock_item__part__category',
                            'stock_item__location',
                            'stock_item__supplier_part__manufacturer_part__manufacturer',
                        ).filter(pk=instrument_id).first()

                        if instrument is None or instrument.project_id != project.pk:
                            raise serializers.ValidationError({
                                'items': _(f'Invalid instrument_id: {instrument_id}')
                            })

                        stock_item = instrument.stock_item
                        part = stock_item.part if stock_item else None

                        manufacture = ''
                        if (
                            stock_item is not None
                            and stock_item.supplier_part is not None
                            and stock_item.supplier_part.manufacturer_part is not None
                            and stock_item.supplier_part.manufacturer_part.manufacturer is not None
                        ):
                            manufacture = (
                                stock_item.supplier_part.manufacturer_part.manufacturer.name
                                or ''
                            )

                        model = part.full_name if part else ''
                        sn = stock_item.serial if stock_item and stock_item.serial else ''
                        item_type = part.category.name if part and part.category else ''
                        specification = part.description if part and part.description else ''
                        located = (
                            stock_item.location.pathstring
                            if stock_item and stock_item.location
                            else ''
                        )

                        report.items.create(
                            instrument=instrument,
                            quantity=quantity,
                            manufacture=manufacture,
                            model=model,
                            sn=sn,
                            type=item_type,
                            specification=specification,
                            note=str(item.get('notes', item.get('note', '')) or ''),
                            located=located,
                        )
                        continue

                    row_part_name = str(item.get('part_name', '') or '').strip()
                    if not row_part_name:
                        raise serializers.ValidationError({
                            'items': _('Each report row requires part_name')
                        })

                    located = (
                        project.location.pathstring
                        if getattr(project, 'location', None) is not None
                        else ''
                    )

                    report.items.create(
                        instrument=None,
                        quantity=quantity,
                        manufacture='',
                        model=row_part_name,
                        sn='',
                        type=report_type_value or 'BROKEN',
                        specification='',
                        note=str(item.get('notes', item.get('note', '')) or ''),
                        located=located,
                    )

            report_items = list(self._get_report_items_queryset(report))

            if len(report_items) <= 0:
                raise serializers.ValidationError({
                    'items': _('Please provide at least one report item')
                })

            pdf_content = self._build_broken_report_pdf(
                project=project,
                report=report,
                title=title,
                report_date=report_date,
                items=report_items,
            )

            filename_date = report.created.strftime('%Y%m%d_%H%M%S')
            file_name = f'project_{project.pk}_broken_report_{filename_date}.pdf'
            attachment = common.models.Attachment.objects.create(
                model_type='project',
                model_id=project.pk,
                attachment=ContentFile(pdf_content, name=file_name),
                comment=title,
                upload_user=request.user,
            )

            report.attachment = attachment
            report.save(update_fields=['attachment'])

        report = (
            ProjectReport.objects.select_related('attachment', 'created_by')
            .annotate(item_count=Count('items'))
            .get(pk=report.pk)
        )
        serializer = ProjectReportSerializer(report, context=self.get_serializer_context())
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _build_broken_report_pdf(self, project, report, title, report_date, items):
        """Generate Broken Report PDF using the standard Projects template."""
        try:
            return build_broken_report_pdf(
                project=project,
                report=report,
                title=title,
                report_date=report_date,
                items=items,
            )
        except ImportError as exc:
            raise serializers.ValidationError({
                'detail': _('reportlab is required to generate automatic reports')
            }) from exc


project_api_urls = [
    path(
        '',
        include([
            path(
                '<int:pk>/',
                include([
                    path(
                        'allocations/',
                        ProjectAllocationList.as_view(),
                        name='api-project-allocation-list-by-project',
                    ),
                    path(
                        'instruments/',
                        ProjectInstrumentList.as_view(),
                        name='api-project-instrument-list-by-project',
                    ),
                    path(
                        'instrumentation/auto_assign/',
                        ProjectInstrumentAutoAssign.as_view(),
                        name='api-project-instrument-auto-assign',
                    ),
                    path(
                        'instrumentation/release/',
                        ProjectInstrumentRelease.as_view(),
                        name='api-project-instrument-release',
                    ),
                    path(
                        'report/',
                        ProjectReportSingleton.as_view(),
                        name='api-project-report-singleton',
                    ),
                    path(
                        'report/items/',
                        ProjectReportItemList.as_view(),
                        name='api-project-report-item-list',
                    ),
                    path(
                        'report/items/<int:item_pk>/',
                        ProjectReportItemDetail.as_view(),
                        name='api-project-report-item-detail',
                    ),
                    path(
                        'reports/',
                        ProjectReportListCompatibility.as_view(),
                        name='api-project-report-list',
                    ),
                    # Backward compatibility alias
                    path(
                        'reports/singleton/',
                        ProjectReportSingleton.as_view(),
                        name='api-project-report-singleton-compat',
                    ),
                    path(
                        'reports/broken/',
                        ProjectBrokenReportCreate.as_view(),
                        name='api-project-report-broken-create',
                    ),
                    path('', ProjectDetail.as_view(), name='api-project-detail'),
                ]),
            ),
            path('dashboard/', ProjectDashboard.as_view(), name='api-project-dashboard'),
            path('', ProjectList.as_view(), name='api-project-list'),
        ]),
    )
]

project_allocation_api_urls = [
    path(
        '',
        include([
            path(
                '<int:pk>/',
                ProjectAllocationDetail.as_view(),
                name='api-project-allocation-detail',
            ),
            path('', ProjectAllocationList.as_view(), name='api-project-allocation-list'),
        ]),
    )
]

project_instrument_api_urls = [
    path(
        '',
        include([
            path(
                '<int:pk>/',
                ProjectInstrumentDetail.as_view(),
                name='api-project-instrument-detail',
            ),
            path('', ProjectInstrumentList.as_view(), name='api-project-instrument-list'),
        ]),
    )
]
