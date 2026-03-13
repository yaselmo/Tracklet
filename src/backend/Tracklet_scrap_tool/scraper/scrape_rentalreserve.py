"""CLI scraper for Rental Reserve catalog categories and full catalog discovery."""

from __future__ import annotations

import argparse
import logging
import re
import sys
from collections import defaultdict
from pathlib import Path

import requests

if __package__ is None or __package__ == "":
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from scraper.config import BASE_URL, CATEGORY_URLS
from scraper.sources.rentalreserve import RentalReserveScraper, SubcategoryLink
from scraper.utils import (
    clean_text,
    configure_logging,
    dedupe_catalog_rows,
    dedupe_rows,
    get_extension_from_url,
    sanitize_filename,
    write_csv,
    write_json,
)

LOGGER = logging.getLogger(__name__)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Scrape Rental Reserve catalog data")

    mode_group = parser.add_mutually_exclusive_group(required=True)
    mode_group.add_argument("--all", action="store_true", help="Scrape all discovered subcategories")
    mode_group.add_argument("--main-category", help="Scrape one discovered main category (e.g. tabletop)")
    mode_group.add_argument("--subcategory", help="Scrape one discovered subcategory (e.g. chargers)")
    mode_group.add_argument(
        "--category",
        choices=sorted(CATEGORY_URLS.keys()),
        help="Legacy single-category mode (keeps old output schema)",
    )

    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional max number of products to process",
    )
    parser.add_argument(
        "--download-images",
        action="store_true",
        help="Download product images to images/<subcategory>/",
    )
    parser.add_argument(
        "--per-subcategory-exports",
        action="store_true",
        help="Also save per-subcategory CSV/JSON files",
    )
    parser.add_argument(
        "--output-dir",
        default="output",
        help="Output directory for CSV and JSON exports",
    )
    parser.add_argument(
        "--images-dir",
        default="images",
        help="Base directory for image downloads",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug logging",
    )
    return parser


def download_images(rows: list[dict[str, str]], images_root: Path) -> tuple[int, dict[str, int]]:
    session = requests.Session()
    downloaded_by_url: dict[str, Path] = {}
    downloaded_count = 0
    per_subcategory_downloaded: dict[str, int] = defaultdict(int)

    for row in rows:
        image_url = clean_text(row.get("image_url"))
        row.setdefault("local_image_path", "")
        if not image_url:
            continue

        if image_url in downloaded_by_url:
            row["local_image_path"] = str(downloaded_by_url[image_url])
            continue

        folder_key = row.get("subcategory") or row.get("category") or "misc"
        folder_slug = slugify(folder_key)
        target_dir = images_root / folder_slug
        target_dir.mkdir(parents=True, exist_ok=True)

        base_name = sanitize_filename(row.get("external_id") or row.get("name") or "image")
        ext = get_extension_from_url(image_url)
        file_path = _get_unique_file_path(target_dir, f"{base_name}{ext}")

        try:
            response = session.get(image_url, timeout=30)
            response.raise_for_status()
            file_path.write_bytes(response.content)
            downloaded_by_url[image_url] = file_path
            row["local_image_path"] = str(file_path)
            downloaded_count += 1
            per_subcategory_downloaded[folder_slug] += 1
            LOGGER.info("Downloaded image: %s", file_path)
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Failed image download for %s: %s", image_url, exc)
            row["local_image_path"] = ""

    return downloaded_count, dict(per_subcategory_downloaded)


def _get_unique_file_path(directory: Path, candidate_name: str) -> Path:
    candidate = directory / candidate_name
    if not candidate.exists():
        return candidate

    stem = candidate.stem
    suffix = candidate.suffix
    counter = 2

    while True:
        retry = directory / f"{stem}_{counter}{suffix}"
        if not retry.exists():
            return retry
        counter += 1


def category_label_from_slug(slug: str) -> str:
    return slug.replace("-", " ").title()


def slugify(value: str) -> str:
    cleaned = clean_text(value).lower()
    cleaned = re.sub(r"[^a-z0-9]+", "-", cleaned)
    cleaned = cleaned.strip("-")
    return cleaned or "unknown"


def normalize_compare(value: str) -> str:
    return slugify(value)


def select_subcategories(
    discovered: list[SubcategoryLink],
    all_mode: bool,
    main_category: str | None,
    subcategory: str | None,
) -> list[SubcategoryLink]:
    if all_mode:
        return discovered

    if main_category:
        target = normalize_compare(main_category)
        return [
            item
            for item in discovered
            if normalize_compare(item.main_category) == target
        ]

    if subcategory:
        target = normalize_compare(subcategory)
        return [
            item
            for item in discovered
            if normalize_compare(item.subcategory) == target
            or normalize_compare(item.subcategory_slug) == target
        ]

    return []


def run_legacy_single_category(
    scraper: RentalReserveScraper,
    category_slug: str,
    args: argparse.Namespace,
) -> None:
    category_url = CATEGORY_URLS[category_slug]
    category_label = category_label_from_slug(category_slug)
    rows = scraper.scrape_category(category_label, category_slug, category_url)

    if args.limit is not None:
        rows = rows[: args.limit]

    rows = dedupe_rows(rows)

    if args.download_images:
        downloaded_total, _ = download_images(rows, Path(args.images_dir))
        LOGGER.info("Downloaded %d images", downloaded_total)

    output_dir = Path(args.output_dir)
    csv_path = output_dir / f"{category_slug}.csv"
    json_path = output_dir / f"{category_slug}.json"

    write_csv(rows, csv_path)
    write_json(rows, json_path)

    LOGGER.info("Export complete")
    LOGGER.info("Saved %s", csv_path)
    LOGGER.info("Saved %s", json_path)
    LOGGER.info("Rows: %d", len(rows))


def run_discovery_catalog(scraper: RentalReserveScraper, args: argparse.Namespace) -> None:
    discovered = scraper.discover_navigation(BASE_URL)
    if not discovered:
        LOGGER.error("No subcategories discovered from navigation.")
        return

    selected = select_subcategories(
        discovered,
        all_mode=args.all,
        main_category=args.main_category,
        subcategory=args.subcategory,
    )

    if not selected:
        LOGGER.error("No matching subcategories found for the provided filters.")
        return

    all_rows: list[dict[str, str]] = []
    by_subcategory: dict[str, list[dict[str, str]]] = defaultdict(list)
    remaining = args.limit

    for sub in selected:
        if remaining is not None and remaining <= 0:
            break

        rows = scraper.scrape_subcategory(
            main_category=sub.main_category,
            subcategory=sub.subcategory,
            subcategory_slug=sub.subcategory_slug,
            subcategory_url=sub.source_url,
            limit=remaining,
        )

        all_rows.extend(rows)
        by_subcategory[sub.subcategory_slug].extend(rows)

        if remaining is not None:
            remaining -= len(rows)

    deduped_rows, duplicates_skipped = dedupe_catalog_rows(all_rows)
    if duplicates_skipped:
        LOGGER.info("Duplicates skipped: %d", duplicates_skipped)

    for row in deduped_rows:
        row.setdefault("local_image_path", "")

    if args.download_images:
        downloaded_total, per_sub_downloads = download_images(deduped_rows, Path(args.images_dir))
        for sub_slug, count in sorted(per_sub_downloads.items()):
            LOGGER.info("Downloaded %d images to images/%s/", count, sub_slug)
        LOGGER.info("Total images downloaded: %d", downloaded_total)

    output_dir = Path(args.output_dir)
    full_csv_path = output_dir / "full_catalog.csv"
    full_json_path = output_dir / "full_catalog.json"
    catalog_fields = [
        "name",
        "main_category",
        "subcategory",
        "source_url",
        "image_url",
        "source_vendor",
        "external_id",
        "local_image_path",
    ]

    write_csv(deduped_rows, full_csv_path, fieldnames=catalog_fields)
    write_json(deduped_rows, full_json_path)
    LOGGER.info("Saved %s", full_csv_path)
    LOGGER.info("Saved %s", full_json_path)

    if args.per_subcategory_exports:
        for sub_slug, sub_rows in by_subcategory.items():
            filtered, _ = dedupe_catalog_rows(sub_rows)
            sub_csv_path = output_dir / f"{sub_slug}.csv"
            sub_json_path = output_dir / f"{sub_slug}.json"
            write_csv(filtered, sub_csv_path, fieldnames=catalog_fields)
            write_json(filtered, sub_json_path)
            LOGGER.info("Saved %s", sub_csv_path)
            LOGGER.info("Saved %s", sub_json_path)

    LOGGER.info("Total rows exported: %d", len(deduped_rows))


def main() -> None:
    parser = build_arg_parser()
    args = parser.parse_args()

    configure_logging(verbose=args.verbose)
    scraper = RentalReserveScraper()

    if args.category:
        run_legacy_single_category(scraper, args.category.lower(), args)
        return

    run_discovery_catalog(scraper, args)


if __name__ == "__main__":
    main()
