from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('stock', '0122_stockitem_tracklet_status_compat'),
        ('operations', '0004_allow_overlapping_event_furniture_assignments'),
    ]

    operations = [
        migrations.AlterField(
            model_name='rentallineitem',
            name='asset',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='rental_lines',
                to='stock.stockitem',
                verbose_name='Asset',
            ),
        ),
    ]
