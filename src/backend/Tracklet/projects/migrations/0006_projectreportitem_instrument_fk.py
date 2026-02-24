from django.db import migrations, models
import django.db.models.deletion


def backfill_project_report_item_instrument(apps, schema_editor):
    ProjectInstrument = apps.get_model('projects', 'ProjectInstrument')
    ProjectReportItem = apps.get_model('projects', 'ProjectReportItem')

    for item in ProjectReportItem.objects.filter(instrument__isnull=True).iterator():
        project_id = item.report.project_id
        selected = None

        serial = (item.sn or '').strip()
        if serial:
            selected = (
                ProjectInstrument.objects.filter(
                    project_id=project_id,
                    stock_item__serial=serial,
                )
                .order_by('-pk')
                .first()
            )

        if selected is None:
            manufacturer = (item.manufacture or '').strip()
            model = (item.model or '').strip()

            query = ProjectInstrument.objects.filter(project_id=project_id)
            if model:
                query = query.filter(stock_item__part__name__iexact=model)
            if manufacturer:
                query = query.filter(
                    stock_item__supplier_part__manufacturer_part__manufacturer__name__iexact=manufacturer
                )

            if manufacturer or model:
                selected = query.order_by('-pk').first()

        if selected is not None:
            item.instrument_id = selected.pk
            item.save(update_fields=['instrument'])


class Migration(migrations.Migration):
    dependencies = [
        ('projects', '0005_projectreport_singleton'),
    ]

    operations = [
        migrations.AddField(
            model_name='projectreportitem',
            name='instrument',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='report_items',
                to='projects.projectinstrument',
                verbose_name='Instrument',
            ),
        ),
        migrations.RunPython(
            backfill_project_report_item_instrument,
            migrations.RunPython.noop,
        ),
    ]
