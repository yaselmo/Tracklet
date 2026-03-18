from django.db import migrations, models


def backfill_stockitem_name_category(apps, schema_editor):
    StockItem = apps.get_model('stock', 'StockItem')

    for item in StockItem.objects.select_related('part', 'part__category').all():
        if not item.name:
            if item.part_id and getattr(item.part, 'full_name', None):
                item.name = item.part.full_name
            elif item.serial:
                item.name = f'Stock Item #{item.serial}'
            elif item.batch:
                item.name = f'Stock Item ({item.batch})'
            else:
                item.name = 'Stock Item'

        if not item.category and item.part_id and getattr(item.part, 'category_id', None):
            item.category = getattr(item.part.category, 'pathstring', '') or ''

        item.save(update_fields=['name', 'category'])


class Migration(migrations.Migration):
    dependencies = [
        ('stock', '0122_make_stockitem_part_optional'),
    ]

    operations = [
        migrations.AddField(
            model_name='stockitem',
            name='name',
            field=models.CharField(
                default='',
                help_text='Name for this stock item',
                max_length=200,
                verbose_name='Name',
            ),
        ),
        migrations.AddField(
            model_name='stockitem',
            name='category',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Category for this stock item',
                max_length=200,
                verbose_name='Category',
            ),
        ),
        migrations.RunPython(
            backfill_stockitem_name_category,
            migrations.RunPython.noop,
        ),
    ]
