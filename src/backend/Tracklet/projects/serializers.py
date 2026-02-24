"""DRF serializers for project tracking."""

from django.db.models import Count, DecimalField, Sum, Value
from django.db.models.functions import Coalesce
from django.utils.translation import gettext_lazy as _

from rest_framework import serializers
from rest_framework.serializers import ValidationError

import part.models as part_models
import stock.models
import stock.serializers
from part.serializers import PartBriefSerializer
from Tracklet.serializers import InvenTreeModelSerializer, enable_filter

from .models import (
    Project,
    ProjectInstrument,
    ProjectReport,
    ProjectReportItem,
    ProjectStockAllocation,
)


class ProjectSerializer(InvenTreeModelSerializer):
    """Serializer for the Project model."""

    class Meta:
        model = Project
        fields = [
            'pk',
            'name',
            'description',
            'location',
            'location_detail',
            'notes',
            'status',
            'start_date',
            'end_date',
            'created_by',
            'created',
            'updated',
            'allocations_count',
            'allocated_quantity',
        ]
        read_only_fields = ['created_by', 'created', 'updated', 'location_detail']

    location = serializers.PrimaryKeyRelatedField(
        queryset=stock.models.StockLocation.objects.all(),
        many=False,
        required=False,
        allow_null=True,
        label=_('Location'),
    )
    allocations_count = serializers.IntegerField(read_only=True)
    allocated_quantity = serializers.DecimalField(
        max_digits=15, decimal_places=5, read_only=True
    )
    location_detail = enable_filter(
        stock.serializers.LocationBriefSerializer(
            source='location',
            many=False,
            read_only=True,
            allow_null=True,
        ),
        True,
        filter_name='location_detail',
    )

    @staticmethod
    def annotate_queryset(queryset):
        """Add computed allocation fields to queryset."""
        return queryset.annotate(
            allocations_count=Count('allocations', distinct=True),
            allocated_quantity=Coalesce(
                Sum('allocations__quantity'),
                Value(0, output_field=DecimalField(max_digits=15, decimal_places=5)),
            ),
        ).select_related('created_by', 'location')

    def validate(self, attrs):
        """Cross-field validation."""
        attrs = super().validate(attrs)
        start_date = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end_date = attrs.get('end_date', getattr(self.instance, 'end_date', None))

        if start_date and end_date and end_date < start_date:
            raise ValidationError({
                'end_date': _('End date cannot be before start date'),
            })

        return attrs


class ProjectStockAllocationSerializer(InvenTreeModelSerializer):
    """Serializer for stock allocations assigned to projects."""

    class Meta:
        model = ProjectStockAllocation
        fields = [
            'pk',
            'project',
            'stock_item',
            'quantity',
            'notes',
            'created',
            'updated',
            'project_is_past',
            'stock_item_detail',
            'part_detail',
            'location_detail',
        ]
        read_only_fields = [
            'created',
            'updated',
            'project_is_past',
            'stock_item_detail',
            'part_detail',
            'location_detail',
        ]

    project_is_past = serializers.BooleanField(read_only=True)

    stock_item = serializers.PrimaryKeyRelatedField(
        queryset=stock.models.StockItem.objects.all(),
        many=False,
        allow_null=False,
        required=True,
        label=_('Stock Item'),
    )

    quantity = serializers.DecimalField(
        max_digits=15,
        decimal_places=5,
        required=True,
        allow_null=False,
        label=_('Quantity'),
    )

    stock_item_detail = enable_filter(
        stock.serializers.StockItemSerializer(
            source='stock_item',
            many=False,
            read_only=True,
            allow_null=True,
        ),
        True,
        prefetch_fields=['stock_item', 'stock_item__location', 'stock_item__part'],
    )

    part_detail = enable_filter(
        PartBriefSerializer(
            source='stock_item.part',
            many=False,
            read_only=True,
            allow_null=True,
        ),
        True,
        filter_name='part_detail',
    )

    location_detail = enable_filter(
        stock.serializers.LocationBriefSerializer(
            source='stock_item.location',
            many=False,
            read_only=True,
            allow_null=True,
        ),
        True,
        filter_name='location_detail',
    )

    def validate_quantity(self, value):
        """Per-field quantity validation."""
        if value <= 0:
            raise ValidationError(_('Allocation quantity must be greater than zero'))
        return value


class ProjectInstrumentSerializer(InvenTreeModelSerializer):
    """Serializer for instrument stock items linked to projects."""

    class Meta:
        model = ProjectInstrument
        fields = [
            'pk',
            'project',
            'stock_item',
            'display_name',
            'label',
            'instrument_display_name',
            'quantity',
            'notes',
            'created',
            'updated',
            'project_is_past',
            'stock_item_detail',
            'part_detail',
            'location_detail',
        ]
        read_only_fields = [
            'created',
            'updated',
            'project_is_past',
            'display_name',
            'label',
            'instrument_display_name',
            'stock_item_detail',
            'part_detail',
            'location_detail',
        ]

    project_is_past = serializers.BooleanField(read_only=True)
    display_name = serializers.SerializerMethodField()
    label = serializers.SerializerMethodField()
    instrument_display_name = serializers.SerializerMethodField()

    stock_item = serializers.PrimaryKeyRelatedField(
        queryset=stock.models.StockItem.objects.all(),
        many=False,
        allow_null=False,
        required=True,
        label=_('Stock Item'),
    )

    quantity = serializers.DecimalField(
        max_digits=15,
        decimal_places=5,
        required=False,
        allow_null=True,
        default=1,
        label=_('Quantity'),
    )

    stock_item_detail = enable_filter(
        stock.serializers.StockItemSerializer(
            source='stock_item',
            many=False,
            read_only=True,
            allow_null=True,
        ),
        True,
        prefetch_fields=['stock_item', 'stock_item__location', 'stock_item__part'],
    )

    part_detail = enable_filter(
        PartBriefSerializer(
            source='stock_item.part',
            many=False,
            read_only=True,
            allow_null=True,
        ),
        True,
        filter_name='part_detail',
    )

    location_detail = enable_filter(
        stock.serializers.LocationBriefSerializer(
            source='stock_item.location',
            many=False,
            read_only=True,
            allow_null=True,
        ),
        True,
        filter_name='location_detail',
    )

    def get_instrument_display_name(self, obj):
        """Human-friendly display name for instrument selection."""
        part_name = ''
        if obj.stock_item_id and obj.stock_item.part_id:
            part_name = obj.stock_item.part.full_name

        serial = ''
        if obj.stock_item_id:
            serial = str(obj.stock_item.serial or '').strip()

        if serial:
            return f'{part_name} #{serial}' if part_name else f'#{serial}'

        return part_name or f'Instrument {obj.pk}'

    def get_display_name(self, obj):
        """Alias display field for generic related dropdowns."""
        return self.get_instrument_display_name(obj)

    def get_label(self, obj):
        """Alias label field for generic related dropdowns."""
        return self.get_instrument_display_name(obj)

    def validate_quantity(self, value):
        """Per-field quantity validation."""
        if value <= 0:
            raise ValidationError(_('Instrument quantity must be greater than zero'))
        return value

    def validate(self, attrs):
        """Cross-field validation."""
        attrs = super().validate(attrs)

        project = attrs.get('project', getattr(self.instance, 'project', None))
        stock_item = attrs.get('stock_item', getattr(self.instance, 'stock_item', None))

        if project and stock_item:
            query = ProjectInstrument.objects.filter(project=project, stock_item=stock_item)

            if self.instance:
                query = query.exclude(pk=self.instance.pk)

            if query.exists():
                raise ValidationError({
                    'stock_item': _('This stock item is already an instrument for this project')
                })

        return attrs


class ProjectInstrumentAutoAssignSerializer(serializers.Serializer):
    """Serializer for auto-assigning project instrumentation from stock."""

    part = serializers.PrimaryKeyRelatedField(
        queryset=part_models.Part.objects.all(),
        required=True,
        allow_null=False,
        label=_('Part'),
    )

    quantity = serializers.IntegerField(
        required=True,
        allow_null=False,
        min_value=1,
        label=_('Quantity'),
    )

    location = serializers.PrimaryKeyRelatedField(
        queryset=stock.models.StockLocation.objects.all(),
        required=False,
        allow_null=True,
        label=_('Location'),
    )


class ProjectReportItemSerializer(InvenTreeModelSerializer):
    """Serializer for ProjectReportItem."""

    class Meta:
        model = ProjectReportItem
        fields = [
            'pk',
            'report',
            'instrument_id',
            'instrument_detail',
            'instrument_display_name',
            'quantity',
            'manufacture',
            'model',
            'sn',
            'type',
            'specification',
            'note',
            'located',
        ]
        read_only_fields = [
            'manufacture',
            'model',
            'sn',
            'type',
            'specification',
            'located',
        ]

    report = serializers.PrimaryKeyRelatedField(
        queryset=ProjectReport.objects.select_related('project'),
        many=False,
        allow_null=True,
        required=False,
    )
    instrument_id = serializers.PrimaryKeyRelatedField(
        source='instrument',
        queryset=ProjectInstrument.objects.select_related('project'),
        many=False,
        allow_null=False,
        required=True,
        label=_('Instrument'),
    )
    instrument_detail = serializers.SerializerMethodField()
    instrument_display_name = serializers.SerializerMethodField()
    quantity = serializers.IntegerField(required=False, min_value=1, default=1)

    def get_instrument_detail(self, obj):
        """Return compact details for the linked instrument."""
        if not obj.instrument_id:
            return None

        stock_item = obj.instrument.stock_item
        part = stock_item.part if stock_item else None

        return {
            'id': obj.instrument.pk,
            'stock_item_id': stock_item.pk if stock_item else None,
            'manufacturer': obj.manufacture,
            'model': obj.model,
            'serial': obj.sn,
            'type': obj.type,
            'specification': obj.specification,
            'located': obj.located,
            'display_name': f'{part.full_name} #{stock_item.serial}'
            if part and stock_item and stock_item.serial
            else (part.full_name if part else f'Instrument {obj.instrument.pk}'),
        }

    def get_instrument_display_name(self, obj):
        """Return display label for selected instrument."""
        if not obj.instrument_id:
            return ''

        stock_item = obj.instrument.stock_item
        part = stock_item.part if stock_item else None
        part_name = part.full_name if part else f'Instrument {obj.instrument.pk}'
        serial = stock_item.serial if stock_item and stock_item.serial else ''
        return f'{part_name} #{serial}' if serial else part_name

    def validate(self, attrs):
        """Ensure selected instrument belongs to report project and derive display fields."""
        attrs = super().validate(attrs)

        instrument = attrs.get('instrument', getattr(self.instance, 'instrument', None))
        project = self.context.get('project', None)
        report = attrs.get('report', getattr(self.instance, 'report', None))

        if instrument is None:
            raise ValidationError({
                'instrument_id': _('Instrument selection is required')
            })

        if report is not None and project is not None and report.project_id != project.pk:
            raise ValidationError({
                'report': _('Selected report does not belong to this project')
            })

        if project is not None and instrument.project_id != project.pk:
            raise ValidationError({
                'instrument_id': _('Selected instrument does not belong to this project')
            })

        stock_item = instrument.stock_item
        part = stock_item.part if stock_item else None

        manufacturer = ''
        if (
            stock_item is not None
            and stock_item.supplier_part is not None
            and stock_item.supplier_part.manufacturer_part is not None
            and stock_item.supplier_part.manufacturer_part.manufacturer is not None
        ):
            manufacturer = (
                stock_item.supplier_part.manufacturer_part.manufacturer.name or ''
            )

        attrs['manufacture'] = manufacturer
        attrs['model'] = part.full_name if part else ''
        attrs['sn'] = stock_item.serial if stock_item and stock_item.serial else ''
        attrs['type'] = part.category.name if part and part.category else ''
        attrs['specification'] = part.description if part and part.description else ''
        attrs['located'] = (
            stock_item.location.pathstring
            if stock_item and stock_item.location
            else ''
        )

        return attrs


class ProjectReportSerializer(InvenTreeModelSerializer):
    """Serializer for automatic project reports."""

    class Meta:
        model = ProjectReport
        fields = [
            'pk',
            'project',
            'report_type',
            'created',
            'created_by',
            'attachment',
            'attachment_url',
            'attachment_filename',
            'item_count',
            'items',
        ]
        read_only_fields = [
            'created',
            'created_by',
            'attachment_url',
            'attachment_filename',
            'item_count',
            'items',
        ]

    attachment_url = serializers.SerializerMethodField()
    attachment_filename = serializers.SerializerMethodField()
    item_count = serializers.IntegerField(read_only=True)
    items = ProjectReportItemSerializer(many=True, read_only=True)

    def get_attachment_url(self, obj):
        """Return attachment URL when available."""
        if obj.attachment and obj.attachment.attachment:
            return obj.attachment.attachment.url
        return None

    def get_attachment_filename(self, obj):
        """Return attachment filename when available."""
        if obj.attachment:
            return obj.attachment.basename
        return None
