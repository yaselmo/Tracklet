"""Import and normalize a scraped Rental Reserve catalog into PartCategory / Part records."""

from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass
from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from part.models import Part, PartCategory

METADATA_KEY = 'rental_reserve_import'

CANONICAL_TREE: dict[str, list[str]] = {
    'Tabletop': ['Chargers', 'Flatware', 'Glassware'],
    'Furniture': ['Lounge Furniture', 'Chairs', 'Tables', 'Bars'],
    'Linens': ['Tablecloths', 'Napkins', 'Runner'],
    'Decor': ['Vases', 'Candles', 'Centerpieces', 'Decor & More'],
}

CHILD_TO_PARENT = {
    child.casefold(): parent
    for parent, children in CANONICAL_TREE.items()
    for child in children
}

CATEGORY_ALIASES = {
    'charger': 'Chargers',
    'chargers': 'Chargers',
    'flatware': 'Flatware',
    'glassware': 'Glassware',
    'lounge furniture': 'Lounge Furniture',
    'lounge': 'Lounge Furniture',
    'chairs': 'Chairs',
    'chair': 'Chairs',
    'tables': 'Tables',
    'table': 'Tables',
    'bars': 'Bars',
    'bar': 'Bars',
    'tablecloths': 'Tablecloths',
    'tablecloth': 'Tablecloths',
    'napkins': 'Napkins',
    'napkin': 'Napkins',
    'runner': 'Runner',
    'runners': 'Runner',
    'vases': 'Vases',
    'vase': 'Vases',
    'candles': 'Candles',
    'candle': 'Candles',
    'centerpieces': 'Centerpieces',
    'centerpiece': 'Centerpieces',
    'decor more': 'Decor & More',
    'decor-more': 'Decor & More',
    'decor and more': 'Decor & More',
    'decor & more': 'Decor & More',
}


@dataclass
class PreparedRow:
    name: str
    main_category: str
    subcategory: str
    source_url: str
    image_url: str
    source_vendor: str
    external_id: str
    local_image_path: str


class Command(BaseCommand):
    help = (
        'Import Rental Reserve catalog rows from JSON or CSV into PartCategory / Part, '
        'attach local images, and optionally normalize existing Rental Reserve categories.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            'input_file',
            nargs='?',
            type=str,
            help='Path to full_catalog.json or .csv',
        )
        parser.add_argument(
            '--base-image-dir',
            type=str,
            help='Base directory used to resolve local_image_path values',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would be changed without writing to the database',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Only process the first N import rows',
        )
        parser.add_argument(
            '--update-existing',
            action='store_true',
            help='Update metadata/image/category for existing matches during import',
        )
        parser.add_argument(
            '--normalize-categories',
            action='store_true',
            help='Re-map already imported Rental Reserve parts into canonical parent/child categories',
        )
        parser.add_argument(
            '--rebuild-category-tree',
            action='store_true',
            help='Alias for --normalize-categories',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Print row-level actions',
        )

    @staticmethod
    def _normalize_spaces(value: str) -> str:
        return re.sub(r'\s+', ' ', (value or '').strip())

    @classmethod
    def _normalize_name(cls, value: str) -> str:
        return cls._normalize_spaces(value)

    @classmethod
    def _normalize_category_name(cls, value: str) -> str:
        cleaned = cls._normalize_spaces(value).replace('_', ' ')
        if not cleaned:
            return ''
        tokens = []
        for chunk in cleaned.split('-'):
            chunk = cls._normalize_spaces(chunk)
            tokens.append(chunk.title() if chunk else '')
        return '-'.join(tokens)

    @classmethod
    def _category_key(cls, value: str) -> str:
        key = cls._normalize_category_name(value).casefold()
        key = key.replace('&', ' and ')
        key = key.replace('-', ' ')
        return cls._normalize_spaces(key)

    @classmethod
    def _is_uncategorized(cls, value: str) -> bool:
        return cls._normalize_spaces(value).casefold() in {'', 'uncategorized', 'none', 'n/a'}

    def _resolve_path(self, path_arg: str, description: str) -> Path:
        candidate = Path(path_arg)
        if candidate.is_absolute():
            if candidate.exists():
                return candidate
            raise CommandError(f'{description} not found: {candidate}')
        path = (Path.cwd() / candidate).resolve()
        if path.exists():
            return path
        raise CommandError(f'{description} not found: {path_arg}')

    def _load_rows(self, input_file: Path) -> list[dict]:
        suffix = input_file.suffix.lower()
        if suffix == '.json':
            data = json.loads(input_file.read_text(encoding='utf-8'))
            if isinstance(data, dict):
                if 'rows' in data and isinstance(data['rows'], list):
                    return data['rows']
                raise CommandError('JSON root object must contain a list field named "rows"')
            if isinstance(data, list):
                return data
            raise CommandError('JSON input must be a list of objects or {"rows": [...]}')
        if suffix == '.csv':
            with input_file.open('r', encoding='utf-8', newline='') as f:
                return list(csv.DictReader(f))
        raise CommandError('Unsupported input format. Use .json or .csv')

    def _prepare_rows(self, raw_rows: list[dict]) -> list[PreparedRow]:
        prepared: list[PreparedRow] = []
        for row in raw_rows:
            prepared.append(
                PreparedRow(
                    name=self._normalize_name(str(row.get('name', ''))),
                    main_category=self._normalize_category_name(str(row.get('main_category', ''))),
                    subcategory=self._normalize_category_name(str(row.get('subcategory', ''))),
                    source_url=self._normalize_spaces(str(row.get('source_url', ''))),
                    image_url=self._normalize_spaces(str(row.get('image_url', ''))),
                    source_vendor=self._normalize_spaces(str(row.get('source_vendor', ''))),
                    external_id=self._normalize_spaces(str(row.get('external_id', ''))),
                    local_image_path=self._normalize_spaces(str(row.get('local_image_path', ''))),
                )
            )
        return prepared

    def _metadata_payload(self, row: PreparedRow) -> dict:
        return {
            'source_url': row.source_url or None,
            'source_vendor': row.source_vendor or None,
            'external_id': row.external_id or None,
            'image_url': row.image_url or None,
            'local_image_path': row.local_image_path or None,
            'main_category': row.main_category or None,
            'subcategory': row.subcategory or None,
        }

    def _resolve_image_file(self, row: PreparedRow, base_image_dir: Path) -> Path | None:
        if not row.local_image_path:
            return None
        image_path = Path(row.local_image_path)
        if image_path.is_absolute():
            return image_path
        return (base_image_dir / image_path).resolve()

    def _log(self, verbose: bool, message: str):
        if verbose:
            self.stdout.write(message)

    def _find_existing_by_external_id(self, external_id: str) -> Part | None:
        if not external_id:
            return None
        try:
            return Part.objects.filter(
                metadata__contains={METADATA_KEY: {'external_id': external_id}}
            ).first()
        except Exception:
            for part in Part.objects.exclude(metadata=None).iterator():
                payload = (part.metadata or {}).get(METADATA_KEY, {})
                if isinstance(payload, dict) and str(payload.get('external_id', '')).strip() == external_id:
                    return part
        return None

    def _canonical_child(self, value: str) -> str | None:
        if not value:
            return None
        key = self._category_key(value)
        if key in CATEGORY_ALIASES:
            return CATEGORY_ALIASES[key]
        if key in CHILD_TO_PARENT:
            return self._normalize_category_name(value)
        return None

    def _resolve_canonical_categories(self, *, main_category: str, subcategory: str) -> tuple[str, str]:
        child = self._canonical_child(subcategory)
        if child is None:
            child = self._canonical_child(main_category)
        if child is None and not self._is_uncategorized(subcategory):
            child = 'Decor & More'
        if child is None:
            child = 'Decor & More'
        return CHILD_TO_PARENT[child.casefold()], child

    def _get_or_create_category(
        self,
        *,
        name: str,
        parent: PartCategory | None,
        dry_run: bool,
        virtual_categories: dict[tuple[int | None, str], bool],
    ) -> tuple[PartCategory | None, bool]:
        key = (parent.pk if parent else None, name.casefold())
        if key in virtual_categories:
            return None, False
        existing = PartCategory.objects.filter(parent=parent, name__iexact=name).first()
        if existing is not None:
            return existing, False
        if dry_run:
            virtual_categories[key] = True
            return None, True
        return PartCategory.objects.create(name=name, parent=parent), True

    def _ensure_canonical_tree(
        self, *, dry_run: bool, virtual_categories: dict[tuple[int | None, str], bool]
    ) -> tuple[dict[str, PartCategory | None], int]:
        created = 0
        child_categories: dict[str, PartCategory | None] = {}
        for parent_name, children in CANONICAL_TREE.items():
            parent, parent_created = self._get_or_create_category(
                name=parent_name,
                parent=None,
                dry_run=dry_run,
                virtual_categories=virtual_categories,
            )
            created += int(parent_created)
            for child_name in children:
                child, child_created = self._get_or_create_category(
                    name=child_name,
                    parent=parent,
                    dry_run=dry_run,
                    virtual_categories=virtual_categories,
                )
                created += int(child_created)
                child_categories[child_name] = child
        return child_categories, created

    def _import_rows(
        self,
        *,
        rows: list[PreparedRow],
        base_image_dir: Path,
        dry_run: bool,
        update_existing: bool,
        verbose: bool,
    ) -> dict[str, int]:
        stats = {
            'total_rows': len(rows),
            'categories_created': 0,
            'items_created': 0,
            'items_updated': 0,
            'duplicates_skipped': 0,
            'missing_images': 0,
            'errors': 0,
        }

        virtual_categories: dict[tuple[int | None, str], bool] = {}
        canonical_categories, created = self._ensure_canonical_tree(
            dry_run=dry_run, virtual_categories=virtual_categories
        )
        stats['categories_created'] += created

        for index, row in enumerate(rows, start=1):
            try:
                name = self._normalize_name(row.name)
                if not name:
                    stats['errors'] += 1
                    self._log(verbose, f'[{index}] skipped: empty name')
                    continue

                parent_name, child_name = self._resolve_canonical_categories(
                    main_category=row.main_category,
                    subcategory=row.subcategory,
                )
                target_category = canonical_categories.get(child_name)

                existing = None
                if row.source_url:
                    existing = Part.objects.filter(link=row.source_url).first()
                if existing is None and row.external_id:
                    existing = self._find_existing_by_external_id(row.external_id)
                if existing is None and target_category is not None:
                    existing = Part.objects.filter(
                        name__iexact=name, category=target_category
                    ).first()

                if existing is not None and not update_existing:
                    stats['duplicates_skipped'] += 1
                    self._log(verbose, f'[{index}] duplicate skipped: part={existing.pk} name={existing.name}')
                    continue

                image_path = self._resolve_image_file(row, base_image_dir)
                image_exists = bool(image_path and image_path.exists() and image_path.is_file())
                if image_path and not image_exists:
                    stats['missing_images'] += 1
                    self._log(verbose, f'[{index}] image missing: {image_path}')

                if dry_run:
                    if existing is None:
                        stats['items_created'] += 1
                        self._log(
                            verbose,
                            f'[{index}] would create: {name} -> {parent_name}/{child_name}',
                        )
                    else:
                        stats['items_updated'] += 1
                        self._log(
                            verbose,
                            f'[{index}] would update: {existing.pk} -> {parent_name}/{child_name}',
                        )
                    continue

                with transaction.atomic():
                    if existing is None:
                        description = (
                            f'Imported from {row.source_vendor}'
                            if row.source_vendor
                            else 'Imported catalog item'
                        )
                        part = Part.objects.create(
                            name=name,
                            description=description[:250],
                            category=target_category,
                            link=row.source_url or None,
                            active=True,
                        )
                        stats['items_created'] += 1
                        self._log(verbose, f'[{index}] created part {part.pk}: {name}')
                    else:
                        part = existing
                        changed = False
                        if part.name != name:
                            part.name = name
                            changed = True
                        if target_category is not None and part.category_id != target_category.pk:
                            part.category = target_category
                            changed = True
                        if row.source_url and part.link != row.source_url:
                            part.link = row.source_url
                            changed = True
                        if changed:
                            part.save()
                            stats['items_updated'] += 1
                            self._log(verbose, f'[{index}] updated part {part.pk}: {part.name}')
                        elif update_existing:
                            stats['items_updated'] += 1

                    metadata = dict(part.metadata or {})
                    metadata[METADATA_KEY] = self._metadata_payload(row)
                    part.metadata = metadata
                    part.save(update_fields=['metadata'])

                    if image_exists and image_path is not None:
                        with image_path.open('rb') as img_f:
                            part.image.save(image_path.name, File(img_f), save=False)
                        part.save()
                        self._log(verbose, f'[{index}] image attached for part {part.pk}')
            except Exception as exc:
                stats['errors'] += 1
                self.stdout.write(self.style.WARNING(f'[{index}] error: {exc.__class__.__name__}: {exc}'))

        return stats

    def _normalize_existing_parts(self, *, dry_run: bool, verbose: bool) -> dict[str, int]:
        stats = {
            'total_rows': 0,
            'categories_created': 0,
            'items_created': 0,
            'items_updated': 0,
            'duplicates_skipped': 0,
            'missing_images': 0,
            'errors': 0,
        }

        virtual_categories: dict[tuple[int | None, str], bool] = {}
        canonical_categories, created = self._ensure_canonical_tree(
            dry_run=dry_run, virtual_categories=virtual_categories
        )
        stats['categories_created'] += created

        parts = Part.objects.filter(metadata__has_key=METADATA_KEY).select_related('category')
        stats['total_rows'] = parts.count()

        for part in parts.iterator():
            try:
                payload = (part.metadata or {}).get(METADATA_KEY, {})
                if not isinstance(payload, dict):
                    payload = {}

                main_category = str(payload.get('main_category') or '')
                subcategory = str(payload.get('subcategory') or '')

                if not subcategory and part.category:
                    subcategory = part.category.name

                _parent_name, child_name = self._resolve_canonical_categories(
                    main_category=main_category,
                    subcategory=subcategory,
                )
                target_category = canonical_categories.get(child_name)

                if target_category is None:
                    if dry_run:
                        stats['items_updated'] += 1
                        self._log(
                            verbose,
                            f'[normalize] would move part {part.pk} "{part.name}" to {child_name}',
                        )
                    continue

                if part.category_id == target_category.pk:
                    continue

                if dry_run:
                    stats['items_updated'] += 1
                    self._log(
                        verbose,
                        f'[normalize] would move part {part.pk} "{part.name}" to {child_name}',
                    )
                    continue

                part.category = target_category
                part.save(update_fields=['category'])
                stats['items_updated'] += 1
                self._log(
                    verbose,
                    f'[normalize] moved part {part.pk} "{part.name}" to {child_name}',
                )
            except Exception as exc:
                stats['errors'] += 1
                self.stdout.write(
                    self.style.WARNING(
                        f'[normalize] part {part.pk} error: {exc.__class__.__name__}: {exc}'
                    )
                )

        return stats

    def handle(self, *args, **options):
        dry_run = bool(options['dry_run'])
        limit = options['limit']
        update_existing = bool(options['update_existing'])
        normalize_categories = bool(
            options['normalize_categories'] or options['rebuild_category_tree']
        )
        verbose = bool(options['verbose'])

        if limit is not None and limit <= 0:
            raise CommandError('--limit must be a positive integer')

        run_import = bool(options.get('input_file'))
        if not run_import and not normalize_categories:
            raise CommandError(
                'Provide input_file for import, or use --normalize-categories / --rebuild-category-tree'
            )

        combined_stats = {
            'total_rows': 0,
            'categories_created': 0,
            'items_created': 0,
            'items_updated': 0,
            'duplicates_skipped': 0,
            'missing_images': 0,
            'errors': 0,
        }

        if run_import:
            if not options.get('base_image_dir'):
                raise CommandError('--base-image-dir is required for import')

            input_file = self._resolve_path(options['input_file'], 'Input file')
            base_image_dir = self._resolve_path(options['base_image_dir'], 'Base image directory')
            raw_rows = self._load_rows(input_file)
            rows = self._prepare_rows(raw_rows)
            if limit is not None:
                rows = rows[:limit]

            import_stats = self._import_rows(
                rows=rows,
                base_image_dir=base_image_dir,
                dry_run=dry_run,
                update_existing=update_existing,
                verbose=verbose,
            )
            for key in combined_stats:
                combined_stats[key] += import_stats[key]

        if normalize_categories:
            normalize_stats = self._normalize_existing_parts(dry_run=dry_run, verbose=verbose)
            for key in combined_stats:
                combined_stats[key] += normalize_stats[key]

        self.stdout.write('')
        self.stdout.write('Rental Reserve import summary')
        self.stdout.write(f"- total rows read: {combined_stats['total_rows']}")
        self.stdout.write(f"- categories created: {combined_stats['categories_created']}")
        self.stdout.write(f"- items created: {combined_stats['items_created']}")
        self.stdout.write(f"- items updated: {combined_stats['items_updated']}")
        self.stdout.write(f"- duplicates skipped: {combined_stats['duplicates_skipped']}")
        self.stdout.write(f"- missing images: {combined_stats['missing_images']}")
        self.stdout.write(f"- errors: {combined_stats['errors']}")
        self.stdout.write(f"- mode: {'dry-run' if dry_run else 'write'}")
