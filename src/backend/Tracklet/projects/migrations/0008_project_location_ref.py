from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('stock', '0120_add_in_use_tracklet_status'),
        ('projects', '0007_project_location'),
    ]

    operations = [
        migrations.AddField(
            model_name='project',
            name='location_ref',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name='projects',
                to='stock.stocklocation',
                verbose_name='Location Reference',
            ),
        ),
    ]

