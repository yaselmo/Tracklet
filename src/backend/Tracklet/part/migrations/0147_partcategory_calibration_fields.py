from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('part', '0146_auto_20251203_1241'),
    ]

    operations = [
        migrations.AddField(
            model_name='partcategory',
            name='calibration_interval_days',
            field=models.PositiveIntegerField(
                blank=True,
                help_text='Default calibration interval for parts in this category',
                null=True,
                verbose_name='Calibration Interval (Days)',
            ),
        ),
        migrations.AddField(
            model_name='partcategory',
            name='requires_calibration',
            field=models.BooleanField(
                default=False,
                help_text='Parts in this category require periodic calibration',
                verbose_name='Requires Calibration',
            ),
        ),
    ]
