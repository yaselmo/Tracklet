"""Import rental inventory rows from a PDF table into category/part hierarchy."""

from __future__ import annotations

import re
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q

from part.models import Part, PartCategory
from stock.models import StockItem, StockLocation

KNOWN_PRODUCT_TYPES = [
    'Charger plates',
    'Glassware',
    'Napkins',
    'Runner',
    'Chairs',
    'Lounge furniture',
    'Tables',
    'Bars',
    'Chargers',
    'Flatware',
    'Tablecloths',
    'Decor',
]

MENU_HIERARCHY = {
    'Tabletop': ['Chargers', 'Flatware', 'Glassware'],
    'Furniture': ['Lounge Furniture', 'Chairs', 'Tables', 'Bars'],
    'Linens': ['Tablecloths', 'Napkins', 'Runner'],
    'Decor': ['Decor'],
}

MODEL_LEVEL_ENABLED = {
    ('Furniture', 'Chairs'),
    ('Furniture', 'Tables'),
    ('Furniture', 'Bars'),
    ('Furniture', 'Lounge Furniture'),
}


class Command(BaseCommand):
    """Import product rows from rental PDF."""

    help = (
        'Import rentals from PDF rows (Product ID, Product Name, Product Type) '
        'into PartCategory / Part records'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--pdf',
            type=str,
            default='Inventory_Rental_System.pdf',
            help='Path to source PDF file',
        )

        stock_group = parser.add_mutually_exclusive_group()
        stock_group.add_argument(
            '--create-stock',
            action='store_true',
            help='Create 1 stock item per imported part (if missing)',
        )
        stock_group.add_argument(
            '--no-stock',
            action='store_true',
            help='Do not create stock items (default)',
        )
        parser.add_argument(
            '--purge-non-rental',
            action='store_true',
            help='Delete parts with non-RENTAL IPN before import',
        )
        parser.add_argument(
            '--model-level',
            choices=['none', 'furniture', 'all'],
            default='furniture',
            help='Level-3 model family subcategory mode (default: furniture)',
        )

    @staticmethod
    def _normalize_spaces(value: str) -> str:
        return re.sub(r'\s+', ' ', (value or '').strip())

    @staticmethod
    def _map_product_type(product_type: str) -> tuple[str, str]:
        ptype = Command._normalize_spaces(product_type).casefold()

        if ptype == 'charger plates' or 'charger' in ptype:
            return ('Tabletop', 'Chargers')
        if ptype == 'flatware':
            return ('Tabletop', 'Flatware')
        if ptype == 'glassware':
            return ('Tabletop', 'Glassware')

        if ptype == 'lounge furniture' or 'lounge' in ptype:
            return ('Furniture', 'Lounge Furniture')
        if ptype == 'chairs':
            return ('Furniture', 'Chairs')
        if ptype == 'tables':
            return ('Furniture', 'Tables')
        if ptype == 'bars':
            return ('Furniture', 'Bars')

        if ptype == 'tablecloths':
            return ('Linens', 'Tablecloths')
        if ptype == 'napkins':
            return ('Linens', 'Napkins')
        if ptype == 'runner':
            return ('Linens', 'Runner')

        if ptype == 'decor':
            return ('Decor', 'Decor')

        return ('Decor', 'Decor')

    @staticmethod
    def _is_known_product_type(product_type: str) -> bool:
        ptype = Command._normalize_spaces(product_type).casefold()

        if ptype in {
            'chairs',
            'tables',
            'bars',
            'lounge furniture',
            'charger plates',
            'flatware',
            'glassware',
            'tablecloths',
            'napkins',
            'runner',
            'decor',
        }:
            return True

        if 'charger' in ptype:
            return True

        return 'lounge' in ptype

    @staticmethod
    def _extract_model_family(product_name: str) -> str:
        name = Command._normalize_spaces(product_name)

        if ' - ' in name:
            family = Command._normalize_spaces(name.split(' - ', 1)[0])
        else:
            family = name

        return family.title()

    @staticmethod
    def _should_use_model_level(*, level_one: str, level_two: str, mode: str) -> bool:
        if mode == 'all':
            return True
        if mode == 'none':
            return False
        return (level_one, level_two) in MODEL_LEVEL_ENABLED

    def _resolve_pdf_path(self, pdf_arg: str) -> Path:
        candidate = Path(pdf_arg)

        if candidate.is_absolute():
            if candidate.exists():
                return candidate
            raise CommandError(f'PDF file not found: {candidate}')

        search_roots = [Path.cwd(), *Path.cwd().parents]

        for root in search_roots:
            path = (root / candidate).resolve()
            if path.exists():
                return path

        raise CommandError(
            f'PDF file not found: {pdf_arg}. '
            'Pass --pdf with absolute path or place file in repo root.'
        )

    def _compile_row_regex(self) -> re.Pattern[str]:
        type_expr = '|'.join(
            re.escape(t) for t in sorted(KNOWN_PRODUCT_TYPES, key=len, reverse=True)
        )
        return re.compile(
            rf'^\s*(\d+)\s+(.+?)\s+({type_expr})\s*$', flags=re.IGNORECASE
        )

    def _extract_rows_from_lines(self, lines: list[str]) -> list[dict]:
        regex = self._compile_row_regex()
        rows: list[dict] = []
        buffer = ''

        for raw_line in lines:
            line = self._normalize_spaces(raw_line)

            if not line:
                continue

            low = line.lower()
            if 'product id' in low and 'product name' in low and 'product type' in low:
                continue

            if re.match(r'^\d+\s+', line):
                if buffer:
                    match = regex.match(buffer)
                    if match:
                        rows.append({
                            'product_id': int(match.group(1)),
                            'product_name': self._normalize_spaces(match.group(2)),
                            'product_type': self._normalize_spaces(match.group(3)),
                        })
                buffer = line
            elif buffer:
                buffer = f'{buffer} {line}'
            else:
                continue

            match = regex.match(buffer)
            if match:
                rows.append({
                    'product_id': int(match.group(1)),
                    'product_name': self._normalize_spaces(match.group(2)),
                    'product_type': self._normalize_spaces(match.group(3)),
                })
                buffer = ''

        if buffer:
            match = regex.match(buffer)
            if match:
                rows.append({
                    'product_id': int(match.group(1)),
                    'product_name': self._normalize_spaces(match.group(2)),
                    'product_type': self._normalize_spaces(match.group(3)),
                })

        unique_rows: dict[int, dict] = {}
        for row in rows:
            unique_rows[row['product_id']] = row

        return list(unique_rows.values())

    def _extract_rows_from_pdf(self, pdf_path: Path) -> list[dict]:
        try:
            import pdfplumber  # type: ignore
        except ImportError as exc:
            raise CommandError(
                "Missing dependency 'pdfplumber'. Install it in backend env to use this command."
            ) from exc

        lines: list[str] = []

        with pdfplumber.open(str(pdf_path)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ''
                if text:
                    lines.extend(text.splitlines())

        return self._extract_rows_from_lines(lines)

    @staticmethod
    def _get_or_create_category(
        *,
        name: str,
        parent: PartCategory | None,
        default_location: StockLocation | None,
    ) -> tuple[PartCategory, bool, bool]:
        category = PartCategory.objects.filter(parent=parent, name__iexact=name).first()

        if category is None:
            category = PartCategory.objects.create(
                name=name, parent=parent, default_location=default_location
            )
            return category, True, False

        changed = False
        if default_location and category.default_location_id is None:
            category.default_location = default_location
            changed = True

        if changed:
            category.save()

        return category, False, changed

    @staticmethod
    def _get_or_create_warehouse() -> StockLocation:
        location = StockLocation.objects.filter(name__iexact='Warehouse').first()
        if location:
            return location

        location = StockLocation.objects.filter(name__iexact='Main Storage').first()
        if location:
            return location

        return StockLocation.objects.create(name='Warehouse')

    @staticmethod
    def _is_category_in_subtree(
        category: PartCategory, root: PartCategory | None
    ) -> bool:
        if root is None:
            return False
        return (
            category.tree_id == root.tree_id
            and category.lft >= root.lft
            and category.rght <= root.rght
        )

    def _purge_non_rental_parts(self) -> tuple[int, int, int]:
        purged_parts = 0
        skipped_parts = 0
        purged_stock = 0

        queryset = Part.objects.filter(
            Q(IPN__isnull=True) | ~Q(IPN__startswith='RENTAL-')
        )

        for part in queryset.iterator():
            stock_qs = StockItem.objects.filter(part=part)
            purged_stock += stock_qs.count()

            if part.active:
                part.active = False
                part.save(update_fields=['active'])

            try:
                part.delete()
                purged_parts += 1
            except Exception as exc:
                skipped_parts += 1
                self.stdout.write(
                    self.style.WARNING(
                        f'Could not purge part {part.pk} ({part.name}): {exc}'
                    )
                )

        return purged_parts, skipped_parts, purged_stock

    def _cleanup_empty_non_rentals_categories(self, rentals_root: PartCategory) -> int:
        deleted_count = 0

        while True:
            deleted_this_pass = 0

            for category in PartCategory.objects.order_by('-level'):
                if self._is_category_in_subtree(category, rentals_root):
                    continue

                if category.parts.exists():
                    continue

                if category.get_children().exists():
                    continue

                try:
                    category.delete()
                    deleted_this_pass += 1
                except Exception:
                    continue

            deleted_count += deleted_this_pass

            if deleted_this_pass == 0:
                break

        return deleted_count

    def handle(self, *args, **options):
        pdf_path = self._resolve_pdf_path(options['pdf'])
        create_stock = bool(options.get('create_stock'))
        purge_non_rental = bool(options.get('purge_non_rental'))
        model_level_mode = options.get('model_level', 'furniture')

        rows = self._extract_rows_from_pdf(pdf_path)

        if not rows:
            self.stdout.write(
                self.style.WARNING('No matching product rows found in PDF')
            )
            return

        warehouse = self._get_or_create_warehouse()

        category_created = 0
        category_updated = 0
        parts_created = 0
        parts_updated = 0
        stock_created = 0
        non_rental_parts_purged = 0
        non_rental_parts_skipped = 0
        non_rental_stock_purged = 0
        categories_cleaned = 0
        unknown_type_fallbacks = 0

        with transaction.atomic():
            root, created, updated = self._get_or_create_category(
                name='Rentals', parent=None, default_location=warehouse
            )
            category_created += int(created)
            category_updated += int(updated)

            if purge_non_rental:
                (
                    non_rental_parts_purged,
                    non_rental_parts_skipped,
                    non_rental_stock_purged,
                ) = self._purge_non_rental_parts()
                categories_cleaned = self._cleanup_empty_non_rentals_categories(root)

            subcategory_map: dict[tuple[str, str], PartCategory] = {}

            for level_one, subcategories in MENU_HIERARCHY.items():
                level_one_category, created, updated = self._get_or_create_category(
                    name=level_one, parent=root, default_location=warehouse
                )
                category_created += int(created)
                category_updated += int(updated)

                for level_two in subcategories:
                    leaf_category, created, updated = self._get_or_create_category(
                        name=level_two,
                        parent=level_one_category,
                        default_location=warehouse,
                    )
                    category_created += int(created)
                    category_updated += int(updated)
                    subcategory_map[level_one, level_two] = leaf_category

            for row in rows:
                product_id = int(row['product_id'])
                product_name = self._normalize_spaces(row['product_name'])
                product_type = self._normalize_spaces(row['product_type'])

                level_one, level_two = self._map_product_type(product_type)
                if (level_one, level_two) == (
                    'Decor',
                    'Decor',
                ) and not self._is_known_product_type(product_type):
                    unknown_type_fallbacks += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f"Unknown product type '{product_type}' for "
                            f'Product ID {product_id}; mapped to Rentals/Decor/Decor'
                        )
                    )

                level_two_category = subcategory_map[level_one, level_two]
                target_category = level_two_category

                if self._should_use_model_level(
                    level_one=level_one, level_two=level_two, mode=model_level_mode
                ):
                    model_family = self._extract_model_family(product_name)
                    model_category, created, updated = self._get_or_create_category(
                        name=model_family,
                        parent=level_two_category,
                        default_location=warehouse,
                    )
                    category_created += int(created)
                    category_updated += int(updated)
                    target_category = model_category

                ipn = f'RENTAL-{product_id}'
                description = f'Imported from Inventory_Rental_System.pdf (Product ID: {product_id})'

                part = Part.objects.filter(IPN=ipn).first()
                if part is None:
                    part = Part.objects.filter(
                        name=product_name, category=target_category
                    ).first()

                if part is None:
                    Part.objects.create(
                        name=product_name,
                        description=description,
                        category=target_category,
                        active=True,
                        IPN=ipn,
                        default_location=warehouse,
                    )
                    parts_created += 1
                    part = Part.objects.filter(IPN=ipn).first()
                else:
                    changed = False

                    if part.name != product_name:
                        part.name = product_name
                        changed = True

                    if part.description != description:
                        part.description = description
                        changed = True

                    if part.category_id != target_category.pk:
                        part.category = target_category
                        changed = True

                    if not part.IPN:
                        part.IPN = ipn
                        changed = True

                    if not part.active:
                        part.active = True
                        changed = True

                    if part.default_location_id is None:
                        part.default_location = warehouse
                        changed = True

                    if changed:
                        part.save()
                        parts_updated += 1

                if (
                    create_stock
                    and part
                    and not StockItem.objects.filter(part=part).exists()
                ):
                    StockItem.objects.create(
                        part=part,
                        location=warehouse,
                        quantity=1,
                        notes='Quantity unknown; update later',
                    )
                    stock_created += 1

        self.stdout.write(self.style.SUCCESS('Rental PDF import complete'))
        self.stdout.write(f'PDF: {pdf_path}')
        self.stdout.write(f'Parsed rows: {len(rows)}')
        self.stdout.write(f'Categories created: {category_created}')
        self.stdout.write(f'Categories updated: {category_updated}')
        self.stdout.write(f'Parts created: {parts_created}')
        self.stdout.write(f'Parts updated: {parts_updated}')
        self.stdout.write(f'Stock items created: {stock_created}')
        self.stdout.write(f'Unknown type fallbacks: {unknown_type_fallbacks}')
        self.stdout.write(f'Model level mode: {model_level_mode}')

        if purge_non_rental:
            self.stdout.write(f'Purged non-rental parts: {non_rental_parts_purged}')
            self.stdout.write(f'Skipped non-rental parts: {non_rental_parts_skipped}')
            self.stdout.write(
                f'Purged non-rental stock items: {non_rental_stock_purged}'
            )
            self.stdout.write(
                f'Cleaned empty non-rentals categories: {categories_cleaned}'
            )
