# Tracklet Model and Migration Guide

Use this only if your `StockItem` model does not already store source catalog metadata.

## Recommended fields on `StockItem`

Add the minimum fields needed for import traceability:

```python
# example: inventory/models.py
source_url = models.URLField(blank=True, default="", db_index=True)
source_vendor = models.CharField(max_length=120, blank=True, default="", db_index=True)
image_url = models.URLField(blank=True, default="")
external_id = models.CharField(max_length=120, blank=True, default="", db_index=True)
main_category = models.CharField(max_length=120, blank=True, default="")
```

## Migration steps inside Tracklet project

```bash
python manage.py makemigrations
python manage.py migrate
```

## Notes

- Keep field additions non-breaking (`blank=True`, sensible defaults).
- Add indexes on `source_url`, `source_vendor`, and `external_id` for faster duplicate checks.
- If your model already has equivalent fields, map them via `TRACKLET_CATALOG_IMPORT['FIELD_MAP']` instead of adding duplicates.
