"""Default settings for catalog import; override in Django settings.py."""

DEFAULT_TRACKLET_CATALOG_IMPORT = {
    "MODEL": "inventory.StockItem",
    "FIELD_MAP": {
        "name": "name",
        "subcategory": "category",
        "category": "category",
        "main_category": "main_category",
        "source_url": "source_url",
        "source_vendor": "source_vendor",
        "image_url": "image_url",
        "external_id": "external_id",
    },
}
