from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('projects', '0012_projectreportitem_quantity'),
    ]

    operations = [
        migrations.AddField(
            model_name='projectinstrument',
            name='calibration_interval_days',
            field=models.PositiveIntegerField(
                blank=True,
                null=True,
                verbose_name='Calibration Interval (Days)',
            ),
        ),
        migrations.AddField(
            model_name='projectinstrument',
            name='last_calibration_date',
            field=models.DateField(
                blank=True,
                null=True,
                verbose_name='Last Calibration Date',
            ),
        ),
        migrations.AddField(
            model_name='projectinstrument',
            name='requires_calibration',
            field=models.BooleanField(
                default=False,
                verbose_name='Requires Calibration',
            ),
        ),
    ]
