from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0010_merge_20260218_1841'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='project',
            name='location',
        ),
        migrations.RenameField(
            model_name='project',
            old_name='location_ref',
            new_name='location',
        ),
        migrations.AlterField(
            model_name='project',
            name='location',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name='projects',
                to='stock.stocklocation',
                verbose_name='Location',
            ),
        ),
    ]
