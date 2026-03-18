import django.db.models.deletion
from django.db import migrations, models


def merge_duplicate_project_reports(apps, schema_editor):
    """Merge duplicate reports so each project has at most one report."""
    ProjectReport = apps.get_model('projects', 'ProjectReport')
    ProjectReportItem = apps.get_model('projects', 'ProjectReportItem')

    project_ids = (
        ProjectReport.objects.values_list('project_id', flat=True).distinct()
    )

    for project_id in project_ids:
        reports = list(
            ProjectReport.objects.filter(project_id=project_id).order_by('created', 'pk')
        )

        if len(reports) <= 1:
            continue

        keep = reports[0]
        duplicates = reports[1:]

        for duplicate in duplicates:
            ProjectReportItem.objects.filter(report_id=duplicate.pk).update(report_id=keep.pk)

            if keep.attachment_id is None and duplicate.attachment_id is not None:
                keep.attachment_id = duplicate.attachment_id

            if keep.created_by_id is None and duplicate.created_by_id is not None:
                keep.created_by_id = duplicate.created_by_id

        keep.save()
        ProjectReport.objects.filter(pk__in=[d.pk for d in duplicates]).delete()


def noop_reverse(apps, schema_editor):
    """No-op reverse."""
    return


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0004_projectreport_and_items'),
    ]

    operations = [
        migrations.RunPython(
            merge_duplicate_project_reports,
            reverse_code=noop_reverse,
        ),
        migrations.AlterField(
            model_name='projectreport',
            name='project',
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='report',
                to='projects.project',
                verbose_name='Project',
            ),
        ),
    ]
