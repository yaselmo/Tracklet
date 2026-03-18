from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('projects', '0013_projectinstrument_calibration_fields'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='projectinstrument',
            name='calibration_interval_days',
        ),
        migrations.RemoveField(
            model_name='projectinstrument',
            name='last_calibration_date',
        ),
        migrations.RemoveField(
            model_name='projectinstrument',
            name='requires_calibration',
        ),
    ]
