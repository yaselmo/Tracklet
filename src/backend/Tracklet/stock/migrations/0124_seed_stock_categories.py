from django.db import migrations


DEFAULT_STOCK_CATEGORIES = [
    'Table',
    'Chair',
    'Charger',
    'Plate',
    'Glass',
    'Cutlery',
    'Linen',
    'Decor',
    'Furniture',
    'Other',
]


def seed_stock_categories(apps, schema_editor):
    StockCategory = apps.get_model('stock', 'StockCategory')
    StockItem = apps.get_model('stock', 'StockItem')

    other_category = None
    for name in DEFAULT_STOCK_CATEGORIES:
        category, _ = StockCategory.objects.get_or_create(name=name)

        if name == 'Other':
            other_category = category

    if other_category is not None:
        StockItem.objects.filter(category__isnull=True).update(category=other_category)


def unseed_stock_categories(apps, schema_editor):
    StockCategory = apps.get_model('stock', 'StockCategory')

    StockCategory.objects.filter(
        name__in=DEFAULT_STOCK_CATEGORIES,
        stock_items__isnull=True,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('stock', '0123_alter_stockcategory_id_alter_stockcategory_metadata'),
    ]

    operations = [
        migrations.RunPython(seed_stock_categories, unseed_stock_categories),
    ]
