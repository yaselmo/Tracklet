# Tracklet Scrap Tool

Separate scraping/import workflow for Rental Reserve catalog data.

This repository intentionally keeps scraping outside Tracklet runtime pages and startup logic.

## Project Structure

- `scraper/` - modular scraping code and CLI
- `output/` - generated CSV/JSON exports
- `images/` - optional downloaded images (organized by subcategory)
- `tracklet_importer/` - Tracklet-side Django import command package
- `requirements.txt` - Python dependencies

## Setup

1. Create and activate a virtualenv.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Optional JS fallback support (for navigation/product pages rendered via JS):

```bash
playwright install chromium
```

## Scraper Usage

### Scrape full catalog (all discovered categories/subcategories)

```bash
python scraper/scrape_rentalreserve.py --all
```

### Scrape full catalog with images

```bash
python scraper/scrape_rentalreserve.py --all --download-images
```

### Scrape one main category

```bash
python scraper/scrape_rentalreserve.py --main-category tabletop
```

### Scrape one subcategory

```bash
python scraper/scrape_rentalreserve.py --subcategory chargers
```

### Limit total products for quick testing

```bash
python scraper/scrape_rentalreserve.py --all --limit 10
```

### Download images locally

```bash
python scraper/scrape_rentalreserve.py --all --download-images
```

Images are saved under subcategory folders, for example:
- `images/chargers/`
- `images/flatware/`
- `images/chairs/`

### Save per-subcategory exports in addition to full catalog

```bash
python scraper/scrape_rentalreserve.py --all --per-subcategory-exports
```

### Verbose logging

```bash
python scraper/scrape_rentalreserve.py --all --download-images --verbose
```

### Legacy single-category mode (kept for compatibility)

```bash
python scraper/scrape_rentalreserve.py --category chargers
```

## Output Files

### Full catalog outputs (combined)

- `output/full_catalog.csv`
- `output/full_catalog.json`

Combined CSV columns:
- `name,main_category,subcategory,source_url,image_url,source_vendor,external_id,local_image_path`

### Optional per-subcategory outputs

When `--per-subcategory-exports` is used:
- `output/chargers.csv`
- `output/flatware.csv`
- `output/glassware.csv`
- etc.

`local_image_path` is blank unless `--download-images` is used.

## Discovery and Scraping Behavior

- Navigation discovery is automatic from site menu/navigation structure.
- Subcategories are discovered dynamically from nav links (no hardcoded full list).
- Product extraction is grid/card-based and filters out nav/home/social/menu links.
- Requests + BeautifulSoup is used first.
- Playwright fallback is used when static HTML is insufficient.
- Deduplication order:
  1. `source_url`
  2. normalized `name + subcategory`

## Tracklet Import Command

A Tracklet-side Django management command is provided at:
- `tracklet_importer/catalog_import/management/commands/import_catalog.py`

### Install into Tracklet project

1. Copy `tracklet_importer/catalog_import/` into your Tracklet codebase (for example as app `catalog_import`).
2. Add `catalog_import` to `INSTALLED_APPS`.
3. Configure model mapping in `settings.py`:

```python
TRACKLET_CATALOG_IMPORT = {
    "MODEL": "inventory.StockItem",  # app_label.ModelName
    "FIELD_MAP": {
        "name": "name",
        "subcategory": "category",      # full catalog CSV
        "main_category": "main_category",  # optional if your model supports it
        "source_url": "source_url",
        "source_vendor": "source_vendor",
        "image_url": "image_url",
        "external_id": "external_id",
    },
}
```

The importer accepts both:
- legacy schema: `category`
- full catalog schema: `main_category` + `subcategory`

### Dry run

```bash
python manage.py import_catalog /path/to/output/full_catalog.csv --dry-run
```

### Real import

```bash
python manage.py import_catalog /path/to/output/full_catalog.csv
```

### Import testing limit

```bash
python manage.py import_catalog /path/to/output/full_catalog.csv --limit 10 --dry-run
```

The command:
- reads CSV rows
- creates stock items
- duplicate checks:
  1. `source_url`
  2. `name + source_vendor`
- supports dry-run mode
- prints summary: `created`, `skipped`, `duplicates`, `errors`

## Tracklet Model Field Support

If Tracklet stock items do not yet have source metadata fields, see:
- `tracklet_importer/MODEL_AND_MIGRATION_GUIDE.md`

## Known Limitations

- Website structure changes can require selector updates.
- Some pages may require JS rendering for complete product coverage.
- This repository does not embed Tracklet runtime code; Tracklet migrations/management commands run inside your Tracklet project.
