"""Admin registrations for operations app."""

from django.contrib import admin

from . import models


@admin.register(models.EventType)
class EventTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'active']
    search_fields = ['name', 'description']


@admin.register(models.Venue)
class VenueAdmin(admin.ModelAdmin):
    list_display = ['name', 'contact_name', 'contact_email', 'active']
    search_fields = ['name', 'address', 'contact_name', 'contact_email']


@admin.register(models.Planner)
class PlannerAdmin(admin.ModelAdmin):
    list_display = ['name', 'email', 'phone', 'active']
    search_fields = ['name', 'email', 'phone']


@admin.register(models.Event)
class EventAdmin(admin.ModelAdmin):
    list_display = [
        'reference',
        'title',
        'event_type',
        'venue',
        'planner',
        'start_datetime',
        'end_datetime',
        'status',
    ]
    search_fields = ['reference', 'title', 'notes']
    list_filter = ['status', 'event_type', 'venue', 'planner']


@admin.register(models.FurnitureItem)
class FurnitureItemAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'asset_tag', 'active']
    search_fields = ['name', 'category', 'description', 'asset_tag', 'notes']
    list_filter = ['active', 'category']


@admin.register(models.EventFurnitureAssignment)
class EventFurnitureAssignmentAdmin(admin.ModelAdmin):
    list_display = [
        'event',
        'part',
        'item',
        'quantity',
        'status',
        'checked_out_at',
        'checked_in_at',
    ]
    search_fields = [
        'event__reference',
        'part__name',
        'part__IPN',
        'item__name',
        'item__category',
        'notes',
    ]
    list_filter = ['status', 'event', 'part__category', 'item__category']


@admin.register(models.RentalAsset)
class RentalAssetAdmin(admin.ModelAdmin):
    list_display = ['name', 'asset_tag', 'serial', 'active']
    search_fields = ['name', 'asset_tag', 'serial']


class RentalLineItemInline(admin.TabularInline):
    model = models.RentalLineItem
    extra = 0


@admin.register(models.RentalOrder)
class RentalOrderAdmin(admin.ModelAdmin):
    list_display = [
        'reference',
        'customer',
        'rental_start',
        'rental_end',
        'returned_date',
        'status',
        'responsible',
    ]
    search_fields = ['reference', 'customer__name', 'notes']
    list_filter = ['status', 'customer']
    inlines = [RentalLineItemInline]


@admin.register(models.RentalLineItem)
class RentalLineItemAdmin(admin.ModelAdmin):
    list_display = ['order', 'asset', 'quantity']
    search_fields = ['order__reference', 'asset__name', 'asset__asset_tag']
    list_filter = ['order', 'asset']
