from django.db import migrations, models


def map_in_use_from_project_instruments(apps, schema_editor):
    """Mark instrumented stock items as IN_USE."""
    StockItem = apps.get_model('stock', 'StockItem')
    ProjectInstrument = apps.get_model('projects', 'ProjectInstrument')

    instrument_stock_ids = ProjectInstrument.objects.values_list(
        'stock_item_id', flat=True
    )

    StockItem.objects.filter(
        pk__in=instrument_stock_ids,
        tracklet_status='IN_STOCK',
    ).update(tracklet_status='IN_USE')


def reverse_map_in_use_from_project_instruments(apps, schema_editor):
    """No-op reverse migration."""
    return


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0003_projectinstrument'),
        ('stock', '0119_stockitem_tracklet_status_and_calibration_dates'),
    ]

    operations = [
        migrations.AlterField(
            model_name='stockitem',
            name='tracklet_status',
            field=models.CharField(
                choices=[
                    ('IN_STOCK', 'In Stock'),
                    ('IN_USE', 'In Use'),
                    ('MISSING', 'Missing'),
                    ('BROKEN', 'Broken'),
                    ('CALIBRATION', 'Calibration'),
                    ('REPAIR', 'Repair'),
                ],
                default='IN_STOCK',
                help_text='Tracklet-specific stock status',
                max_length=32,
                verbose_name='Tracklet Status',
            ),
        ),
        migrations.RunPython(
            map_in_use_from_project_instruments,
            reverse_code=reverse_map_in_use_from_project_instruments,
        ),
    ]
