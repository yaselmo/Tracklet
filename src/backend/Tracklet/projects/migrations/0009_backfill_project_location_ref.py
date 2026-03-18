from django.db import migrations
from django.db.models import Q


def backfill_project_location_ref(apps, schema_editor):
    Project = apps.get_model('projects', 'Project')
    StockLocation = apps.get_model('stock', 'StockLocation')

    for project in Project.objects.filter(location_ref__isnull=True).iterator():
        raw_location = (project.location or '').strip()

        if not raw_location:
            continue

        location = (
            StockLocation.objects.filter(
                Q(pathstring__iexact=raw_location) | Q(name__iexact=raw_location)
            )
            .order_by('pk')
            .first()
        )

        if location is not None:
            project.location_ref_id = location.pk
            project.save(update_fields=['location_ref'])


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0008_project_location_ref'),
    ]

    operations = [
        migrations.RunPython(
            backfill_project_location_ref,
            reverse_code=migrations.RunPython.noop,
        )
    ]

