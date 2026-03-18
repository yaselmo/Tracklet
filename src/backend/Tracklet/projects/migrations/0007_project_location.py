from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0006_projectreportitem_instrument_fk'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='location',
            field=models.CharField(
                blank=True, default='', max_length=255, verbose_name='Location'
            ),
        ),
    ]
