from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('stock', '0121_add_empty_tracklet_status'),
    ]

    operations = [
        migrations.AlterField(
            model_name='stockitem',
            name='part',
            field=models.ForeignKey(
                blank=True,
                null=True,
                help_text='Base part',
                limit_choices_to={'virtual': False},
                on_delete=django.db.models.deletion.CASCADE,
                related_name='stock_items',
                to='part.part',
                verbose_name='Base Part',
            ),
        ),
    ]
