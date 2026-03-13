from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from catalog_import.settings import DEFAULT_TRACKLET_CATALOG_IMPORT


class Command(BaseCommand):
    help = "Import scraped catalog CSV into Tracklet stock items"

    def add_arguments(self, parser):
        parser.add_argument("csv_path", type=str, help="Path to exported CSV")
        parser.add_argument("--dry-run", action="store_true", help="Validate without writing")
        parser.add_argument("--limit", type=int, default=None, help="Limit imported rows")

    def handle(self, *args, **options):
        csv_path = Path(options["csv_path"]).expanduser().resolve()
        dry_run = bool(options["dry_run"])
        limit = options["limit"]

        if not csv_path.exists():
            raise CommandError(f"CSV file not found: {csv_path}")

        import_config = self._load_config()
        model = self._load_model(import_config["MODEL"])
        field_map = import_config["FIELD_MAP"]

        summary = {
            "created": 0,
            "skipped": 0,
            "duplicates": 0,
            "errors": 0,
        }

        rows = self._read_rows(csv_path, limit=limit)
        if not rows:
            self.stdout.write(self.style.WARNING("No rows found in CSV."))
            return

        self.stdout.write(f"Using model: {model._meta.label}")
        self.stdout.write(f"Dry run: {dry_run}")
        self.stdout.write(f"Rows loaded: {len(rows)}")

        with transaction.atomic():
            for row in rows:
                try:
                    outcome = self._import_row(model, field_map, row, dry_run=dry_run)
                    summary[outcome] += 1
                except Exception as exc:  # noqa: BLE001
                    summary["errors"] += 1
                    self.stderr.write(self.style.ERROR(f"Row error for '{row.get('name', '')}': {exc}"))

            if dry_run:
                transaction.set_rollback(True)

        self.stdout.write("Import summary:")
        self.stdout.write(f"  created: {summary['created']}")
        self.stdout.write(f"  skipped: {summary['skipped']}")
        self.stdout.write(f"  duplicates: {summary['duplicates']}")
        self.stdout.write(f"  errors: {summary['errors']}")

    def _read_rows(self, csv_path: Path, limit: int | None) -> list[dict[str, str]]:
        rows: list[dict[str, str]] = []
        with csv_path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            fieldnames = set(reader.fieldnames or [])
            required_common = {
                "name",
                "source_url",
                "image_url",
                "source_vendor",
                "external_id",
            }
            missing = required_common - fieldnames
            if missing:
                raise CommandError(f"Missing required CSV columns: {', '.join(sorted(missing))}")
            if "category" not in fieldnames and "subcategory" not in fieldnames:
                raise CommandError("CSV must include either 'category' (legacy) or 'subcategory' (full catalog).")

            for index, row in enumerate(reader):
                clean_row = {k: (v or "").strip() for k, v in row.items()}
                if not clean_row.get("category") and clean_row.get("subcategory"):
                    clean_row["category"] = clean_row["subcategory"]
                if not clean_row.get("name") or not clean_row.get("source_url"):
                    continue
                rows.append(clean_row)
                if limit is not None and len(rows) >= limit:
                    break

        return rows

    def _import_row(
        self,
        model,
        field_map: dict[str, str],
        row: dict[str, str],
        dry_run: bool,
    ) -> str:
        source_url_field = field_map.get("source_url", "source_url")
        name_field = field_map.get("name", "name")
        vendor_field = field_map.get("source_vendor", "source_vendor")

        source_url_value = row.get("source_url", "")
        name_value = row.get("name", "")
        vendor_value = row.get("source_vendor", "")

        if source_url_value and self._field_exists(model, source_url_field):
            if model.objects.filter(**{source_url_field: source_url_value}).exists():
                return "duplicates"

        if (
            name_value
            and vendor_value
            and self._field_exists(model, name_field)
            and self._field_exists(model, vendor_field)
        ):
            if model.objects.filter(**{name_field: name_value, vendor_field: vendor_value}).exists():
                return "duplicates"

        payload: dict[str, Any] = {}
        for source_key, model_field in field_map.items():
            if not self._field_exists(model, model_field):
                continue
            value = (row.get(source_key) or "").strip()
            if source_key in {"category", "subcategory"}:
                value = self._resolve_category_value(model, model_field, value)
                if value is None:
                    continue
            payload[model_field] = value

        if not payload:
            return "skipped"

        if dry_run:
            return "created"

        model.objects.create(**payload)
        return "created"

    def _resolve_category_value(self, model, field_name: str, value: str):
        if not value:
            return ""

        field = model._meta.get_field(field_name)
        if not field.is_relation:
            return value

        related_model = field.remote_field.model
        name_field = "name" if any(f.name == "name" for f in related_model._meta.fields) else None
        if not name_field:
            raise CommandError(
                f"Category relation '{field_name}' on {model._meta.label} has no 'name' field; "
                "set TRACKLET_CATALOG_IMPORT['FIELD_MAP']['category'] to a direct text field instead."
            )

        instance, _ = related_model.objects.get_or_create(**{name_field: value})
        return instance

    def _field_exists(self, model, field_name: str) -> bool:
        try:
            model._meta.get_field(field_name)
            return True
        except Exception:  # noqa: BLE001
            return False

    def _load_config(self) -> dict[str, Any]:
        configured = getattr(settings, "TRACKLET_CATALOG_IMPORT", {})
        model_label = configured.get("MODEL") or DEFAULT_TRACKLET_CATALOG_IMPORT["MODEL"]
        field_map = DEFAULT_TRACKLET_CATALOG_IMPORT["FIELD_MAP"].copy()
        field_map.update(configured.get("FIELD_MAP", {}))
        return {
            "MODEL": model_label,
            "FIELD_MAP": field_map,
        }

    def _load_model(self, model_label: str):
        if "." not in model_label:
            raise CommandError("TRACKLET_CATALOG_IMPORT['MODEL'] must be in 'app_label.ModelName' format")

        app_label, model_name = model_label.split(".", 1)
        model = apps.get_model(app_label, model_name)
        if model is None:
            raise CommandError(f"Unable to resolve model {model_label}")
        return model
