"""Serializers for operations API."""

from django.db import IntegrityError, transaction
from django.db.models import Count
from django.utils.translation import gettext_lazy as _

from rest_framework import serializers

from Tracklet.serializers import InvenTreeModelSerializer
from company.serializers import CompanySerializer
from part.models import Part
from users.serializers import OwnerSerializer

from . import models
from .status_codes import EventStatus, FurnitureAssignmentStatus, RentalOrderStatus


class EventTypeSerializer(InvenTreeModelSerializer):
    class Meta:
        model = models.EventType
        fields = ['pk', 'name', 'description', 'active']


class VenueSerializer(InvenTreeModelSerializer):
    class Meta:
        model = models.Venue
        fields = [
            'pk',
            'name',
            'address',
            'contact_name',
            'contact_email',
            'active',
            'notes',
        ]


class PlannerSerializer(InvenTreeModelSerializer):
    class Meta:
        model = models.Planner
        fields = ['pk', 'name', 'email', 'phone', 'active', 'notes']


class EventSerializer(InvenTreeModelSerializer):
    event_type_detail = EventTypeSerializer(source='event_type', read_only=True)
    venue_detail = VenueSerializer(source='venue', read_only=True)
    planner_detail = PlannerSerializer(source='planner', read_only=True)

    notes_preview = serializers.SerializerMethodField()
    status_name = serializers.SerializerMethodField()

    class Meta:
        model = models.Event
        fields = [
            'pk',
            'reference',
            'reference_int',
            'title',
            'event_type',
            'event_type_detail',
            'venue',
            'venue_detail',
            'planner',
            'planner_detail',
            'start_datetime',
            'end_datetime',
            'late_night_takedown',
            'status',
            'status_name',
            'notes',
            'notes_preview',
            'creation_date',
            'last_updated',
        ]
        read_only_fields = ['reference', 'reference_int', 'creation_date', 'last_updated']

    def get_notes_preview(self, obj):
        text = (obj.notes or '').strip()

        if len(text) <= 64:
            return text

        return text[:64] + '...'

    def get_status_name(self, obj):
        return EventStatus.text(obj.status)


class FurnitureItemSerializer(InvenTreeModelSerializer):
    class Meta:
        model = models.FurnitureItem
        fields = [
            'pk',
            'name',
            'description',
            'category',
            'asset_tag',
            'active',
            'notes',
        ]


class EventFurniturePartSerializer(serializers.ModelSerializer):
    category_path = serializers.CharField(source='category.pathstring', read_only=True)

    class Meta:
        model = Part
        fields = ['pk', 'name', 'full_name', 'IPN', 'category_path']


class EventFurnitureEventSerializer(serializers.ModelSerializer):
    status_name = serializers.SerializerMethodField()
    venue_name = serializers.CharField(source='venue.name', read_only=True)
    planner_name = serializers.CharField(source='planner.name', read_only=True)

    class Meta:
        model = models.Event
        fields = [
            'pk',
            'reference',
            'title',
            'status',
            'status_name',
            'start_datetime',
            'end_datetime',
            'venue_name',
            'planner_name',
        ]

    def get_status_name(self, obj):
        return EventStatus.text(obj.status)


class EventFurnitureAssignmentSerializer(InvenTreeModelSerializer):
    event_detail = EventFurnitureEventSerializer(source='event', read_only=True)
    item_detail = FurnitureItemSerializer(source='item', read_only=True)
    part_detail = EventFurniturePartSerializer(source='part', read_only=True)
    updated_existing = serializers.SerializerMethodField(read_only=True)
    status_name = serializers.SerializerMethodField()
    notes_preview = serializers.SerializerMethodField()

    class Meta:
        model = models.EventFurnitureAssignment
        fields = [
            'pk',
            'event',
            'event_detail',
            'item',
            'item_detail',
            'part',
            'part_detail',
            'updated_existing',
            'quantity',
            'status',
            'status_name',
            'checked_out_at',
            'checked_in_at',
            'notes',
            'notes_preview',
        ]

    def get_status_name(self, obj):
        return FurnitureAssignmentStatus.text(obj.status)

    def get_notes_preview(self, obj):
        text = (obj.notes or '').strip()

        if len(text) <= 64:
            return text

        return text[:64] + '...'

    def get_updated_existing(self, obj):
        return bool(getattr(obj, '_updated_existing', False))

    def create(self, validated_data):
        event = validated_data.get('event')
        part = validated_data.get('part')

        if not event or not part:
            instance = super().create(validated_data)
            setattr(instance, '_updated_existing', False)
            return instance

        try:
            with transaction.atomic():
                instance, created = models.EventFurnitureAssignment.objects.get_or_create(
                    event=event,
                    part=part,
                    defaults=validated_data,
                )
        except IntegrityError:
            instance = models.EventFurnitureAssignment.objects.get(event=event, part=part)
            created = False

        if created:
            setattr(instance, '_updated_existing', False)
            return instance

        submitted_quantity = validated_data.get('quantity')

        if submitted_quantity is not None:
            instance.quantity = (instance.quantity or 0) + submitted_quantity

        if 'status' in validated_data:
            instance.status = validated_data['status']

        if 'checked_out_at' in validated_data:
            instance.checked_out_at = validated_data.get('checked_out_at')

        if 'checked_in_at' in validated_data:
            instance.checked_in_at = validated_data.get('checked_in_at')

        submitted_notes = (validated_data.get('notes') or '').strip()

        if submitted_notes:
            existing_notes = (instance.notes or '').strip()
            instance.notes = (
                f'{existing_notes}\n{submitted_notes}'
                if existing_notes
                else submitted_notes
            )

        instance.item = None
        instance.save()
        setattr(instance, '_updated_existing', True)

        return instance

    def validate(self, attrs):
        part = attrs.get('part', getattr(self.instance, 'part', None))
        item = attrs.get('item', getattr(self.instance, 'item', None))

        if not part and not item:
            raise serializers.ValidationError(
                _('Either a part or furniture item must be selected')
            )

        if part and 'item' not in attrs:
            attrs['item'] = None

        return attrs


class RentalAssetSerializer(InvenTreeModelSerializer):
    class Meta:
        model = models.RentalAsset
        fields = ['pk', 'name', 'asset_tag', 'serial', 'active', 'notes']


class RentalOrderSerializer(InvenTreeModelSerializer):
    customer_detail = CompanySerializer(source='customer', read_only=True)
    responsible_detail = OwnerSerializer(source='responsible', read_only=True)

    line_items = serializers.IntegerField(read_only=True, default=0)
    returned_lines = serializers.IntegerField(read_only=True, default=0)
    overdue = serializers.SerializerMethodField()
    status_name = serializers.SerializerMethodField()
    notes_preview = serializers.SerializerMethodField()

    class Meta:
        model = models.RentalOrder
        fields = [
            'pk',
            'reference',
            'reference_int',
            'customer',
            'customer_detail',
            'rental_start',
            'rental_end',
            'returned_date',
            'status',
            'status_name',
            'line_items',
            'returned_lines',
            'overdue',
            'responsible',
            'responsible_detail',
            'notes',
            'notes_preview',
            'creation_date',
            'last_updated',
        ]
        read_only_fields = ['reference', 'reference_int', 'creation_date', 'last_updated']

    def get_overdue(self, obj):
        return obj.is_overdue

    def get_status_name(self, obj):
        return RentalOrderStatus.text(obj.status)

    def get_notes_preview(self, obj):
        text = (obj.notes or '').strip()

        if len(text) <= 64:
            return text

        return text[:64] + '...'


class RentalLineItemSerializer(InvenTreeModelSerializer):
    order_detail = RentalOrderSerializer(source='order', read_only=True)
    asset_detail = RentalAssetSerializer(source='asset', read_only=True)

    class Meta:
        model = models.RentalLineItem
        fields = [
            'pk',
            'order',
            'order_detail',
            'asset',
            'asset_detail',
            'quantity',
            'notes',
        ]

    def validate(self, attrs):
        order = attrs.get('order') or getattr(self.instance, 'order', None)
        asset = attrs.get('asset') or getattr(self.instance, 'asset', None)

        if not order or not asset:
            return attrs

        if order.rental_end <= order.rental_start:
            raise serializers.ValidationError({
                'order': _('Rental order has an invalid date range')
            })

        active_statuses = [
            RentalOrderStatus.DRAFT.value,
            RentalOrderStatus.ACTIVE.value,
            RentalOrderStatus.OVERDUE.value,
        ]

        overlaps = models.RentalLineItem.objects.filter(
            asset=asset,
            order__status__in=active_statuses,
            order__rental_start__lt=order.rental_end,
            order__rental_end__gt=order.rental_start,
        )

        if self.instance:
            overlaps = overlaps.exclude(pk=self.instance.pk)

        if overlaps.exists():
            raise serializers.ValidationError({
                'asset': _(
                    'Asset is already booked for an overlapping rental period'
                )
            })

        return attrs


class RentalOrderListSerializer(RentalOrderSerializer):
    """Serializer with count annotation defaults for list endpoint."""

    line_items = serializers.IntegerField(read_only=True, default=0)
    returned_lines = serializers.IntegerField(read_only=True, default=0)

    class Meta(RentalOrderSerializer.Meta):
        fields = RentalOrderSerializer.Meta.fields

    @staticmethod
    def annotate_queryset(queryset):
        return queryset.annotate(line_items=Count('lines', distinct=True))
