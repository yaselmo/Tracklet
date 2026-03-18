from django.db import migrations, models


def map_empty_from_quantity(apps, schema_editor):
    """Set EMPTY lifecycle status for depleted stock."""
    StockItem = apps.get_model('stock', 'StockItem')

    StockItem.objects.filter(
        quantity__lte=0,
        tracklet_status='IN_STOCK',
    ).update(tracklet_status='EMPTY')


def reverse_map_empty_from_quantity(apps, schema_editor):
    """No-op reverse migration."""
    return


class Migration(migrations.Migration):

    dependencies = [
        ('stock', '0120_add_in_use_tracklet_status'),
    ]

    operations = [
        migrations.AlterField(
            model_name='stockitem',
            name='tracklet_status',
            field=models.CharField(
                choices=[
                    ('IN_STOCK', 'In Stock'),
                    ('EMPTY', 'Empty'),
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
            map_empty_from_quantity,
            reverse_code=reverse_map_empty_from_quantity,
        ),
    ]
