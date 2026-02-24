from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0011_finalize_project_location_fk'),
    ]

    operations = [
        migrations.AddField(
            model_name='projectreportitem',
            name='quantity',
            field=models.PositiveIntegerField(default=1, verbose_name='Quantity'),
        ),
    ]
