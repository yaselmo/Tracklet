"""Admin integration for the 'events' app."""

from django.contrib import admin

from .models import Event


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    """Admin configuration for Event."""

    list_display = (
        'pk',
        'title',
        'status',
        'event_type',
        'venue',
        'planner',
        'late_night_takedown',
        'start_date',
        'end_date',
        'creation_date',
    )
    list_filter = ('status', 'event_type', 'late_night_takedown')
    search_fields = ('title', 'description', 'venue')
