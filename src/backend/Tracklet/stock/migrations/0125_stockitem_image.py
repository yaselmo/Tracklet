from django.db import migrations
import stdimage.models

import stock.models


class Migration(migrations.Migration):
    dependencies = [
        ('stock', '0124_stockitem_broken_and_missing_quantities'),
    ]

    operations = [
        migrations.AddField(
            model_name='stockitem',
            name='image',
            field=stdimage.models.StdImageField(
                blank=True,
                delete_orphans=False,
                force_min_size=False,
                null=True,
                upload_to=stock.models.rename_stock_item_image,
                variations={'preview': (256, 256), 'thumbnail': (128, 128)},
                verbose_name='Image',
            ),
        ),
    ]
