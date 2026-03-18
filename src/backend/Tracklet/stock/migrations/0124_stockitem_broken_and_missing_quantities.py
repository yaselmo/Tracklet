from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('stock', '0123_stockitem_owned_name_and_category'),
    ]

    operations = [
        migrations.AddField(
            model_name='stockitem',
            name='broken_quantity',
            field=models.DecimalField(
                decimal_places=5,
                default=0,
                help_text='Quantity that is damaged and unusable',
                max_digits=15,
                verbose_name='Broken Quantity',
            ),
        ),
        migrations.AddField(
            model_name='stockitem',
            name='missing_quantity',
            field=models.DecimalField(
                decimal_places=5,
                default=0,
                help_text='Quantity that is missing or unavailable',
                max_digits=15,
                verbose_name='Missing Quantity',
            ),
        ),
    ]
