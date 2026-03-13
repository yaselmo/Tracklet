"""Utility helpers for scraping, export, and downloads."""

from __future__ import annotations

import csv
import json
import logging
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

LOGGER = logging.getLogger(__name__)


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.split()).strip()


def derive_external_id(source_url: str, category_slug: str = "") -> str:
    parsed = urlparse(source_url)
    query = parse_qs(parsed.query)
    for key in ("product_id", "id", "sku"):
        if key in query and query[key]:
            return clean_text(query[key][0])

    path_parts = [part for part in parsed.path.split("/") if part]
    if not path_parts:
        return ""

    candidate = path_parts[-1].strip()
    if not candidate:
        return ""
    if category_slug and candidate.lower() == category_slug.lower():
        return ""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{2,120}", candidate):
        return ""
    return candidate


def dedupe_rows(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    deduped: list[dict[str, str]] = []
    seen_source_urls: set[str] = set()
    seen_name_vendor: set[tuple[str, str]] = set()

    for row in rows:
        name = clean_text(row.get("name"))
        source_url = clean_text(row.get("source_url"))
        source_vendor = clean_text(row.get("source_vendor"))
        category = clean_text(row.get("category"))

        if not name or not source_url:
            continue

        if source_url in seen_source_urls:
            continue

        name_vendor_key = (name.lower(), source_vendor.lower())
        if name_vendor_key in seen_name_vendor:
            continue

        seen_source_urls.add(source_url)
        seen_name_vendor.add(name_vendor_key)

        deduped.append(
            {
                "name": name,
                "category": category,
                "source_url": source_url,
                "image_url": clean_text(row.get("image_url")),
                "source_vendor": source_vendor,
                "external_id": clean_text(row.get("external_id")),
            }
        )

    return deduped


def dedupe_catalog_rows(rows: list[dict[str, str]]) -> tuple[list[dict[str, str]], int]:
    deduped: list[dict[str, str]] = []
    seen_source_urls: set[str] = set()
    seen_name_subcategory: set[tuple[str, str]] = set()
    skipped_duplicates = 0

    for row in rows:
        name = clean_text(row.get("name"))
        source_url = clean_text(row.get("source_url"))
        source_vendor = clean_text(row.get("source_vendor"))
        main_category = clean_text(row.get("main_category"))
        subcategory = clean_text(row.get("subcategory"))

        if not name or not source_url:
            continue

        if source_url in seen_source_urls:
            skipped_duplicates += 1
            continue

        name_subcategory_key = (name.lower(), subcategory.lower())
        if name_subcategory_key in seen_name_subcategory:
            skipped_duplicates += 1
            continue

        seen_source_urls.add(source_url)
        seen_name_subcategory.add(name_subcategory_key)

        deduped.append(
            {
                "name": name,
                "main_category": main_category,
                "subcategory": subcategory,
                "source_url": source_url,
                "image_url": clean_text(row.get("image_url")),
                "source_vendor": source_vendor,
                "external_id": clean_text(row.get("external_id")),
                "local_image_path": clean_text(row.get("local_image_path")),
            }
        )

    return deduped, skipped_duplicates


def write_csv(rows: list[dict[str, str]], output_path: Path, fieldnames: list[str] | None = None) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = fieldnames or [
        "name",
        "category",
        "source_url",
        "image_url",
        "source_vendor",
        "external_id",
    ]
    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fieldnames})


def write_json(rows: list[dict[str, str]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)


def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", clean_text(name))
    cleaned = cleaned.strip("._")
    return cleaned[:120] or "image"


def get_extension_from_url(url: str, default: str = ".jpg") -> str:
    parsed = urlparse(url)
    path = parsed.path or ""
    if "." in path:
        ext = "." + path.rsplit(".", 1)[-1].lower()
        if re.fullmatch(r"\.[a-z0-9]{2,5}", ext):
            return ext
    return default


def configure_logging(verbose: bool = False) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
