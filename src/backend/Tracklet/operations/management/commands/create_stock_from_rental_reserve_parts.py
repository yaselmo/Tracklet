"""Create stock items for parts imported by the Rental Reserve catalog importer."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from part.models import Part
from stock.models import StockItem, StockLocation

METADATA_KEY = 'rental_reserve_import'


class Command(BaseCommand):
    help = (
        'Create StockItem records for Rental Reserve imported parts '
        '(identified by Part.metadata.rental_reserve_import)'
    )

    def add_arguments(self, parser):
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would be created without writing data',
        )
        mode.add_argument(
            '--confirm',
            action='store_true',
            help='Create stock items',
        )
        parser.add_argument(
            '--location',
            type=str,
            default='Warehouse',
            help='Stock location name (default: Warehouse)',
        )
        parser.add_argument(
            '--quantity',
            type=str,
            default='1',
            help='Stock quantity per created item (default: 1)',
        )
        parser.add_argument(
            '--only-missing',
            action='store_true',
            help='Skip parts that already have at least one stock item',
        )

    @staticmethod
    def _parse_quantity(quantity_raw: str) -> Decimal:
        try:
            quantity = Decimal(str(quantity_raw).strip())
        except (InvalidOperation, ValueError) as exc:
            raise CommandError(f'Invalid quantity: {quantity_raw}') from exc

        if quantity <= 0:
            raise CommandError('Quantity must be greater than zero')

        return quantity

    @staticmethod
    def _is_rental_reserve_part(part: Part) -> bool:
        payload = (part.metadata or {}).get(METADATA_KEY, {})
        if not isinstance(payload, dict):
            return False

        source_vendor = str(payload.get('source_vendor') or '').strip().casefold()

        # Keep selection safe and specific for this import flow:
        # - vendor is "rental reserve", or
        # - importer metadata at least contains source_url / local_image_path
        if source_vendor == 'rental reserve':
            return True

        return bool(payload.get('source_url') or payload.get('local_image_path'))

    def handle(self, *args, **options):
        dry_run = bool(options['dry_run'])
        location_name = str(options['location']).strip()
        only_missing = bool(options['only_missing'])
        quantity = self._parse_quantity(options['quantity'])

        if not location_name:
            raise CommandError('Location name cannot be empty')

        location = StockLocation.objects.filter(name__iexact=location_name).first()
        if location is None:
            raise CommandError(
                f"Stock location '{location_name}' does not exist. Create it first."
            )

        imported_candidates = Part.objects.filter(metadata__has_key=METADATA_KEY)
        parts = [p for p in imported_candidates.iterator() if self._is_rental_reserve_part(p)]

        parts_found = len(parts)
        stock_created = 0
        skipped = 0
        errors = 0

        for part in parts:
            try:
                if only_missing and StockItem.objects.filter(part=part).exists():
                    skipped += 1
                    continue

                if dry_run:
                    stock_created += 1
                    continue

                with transaction.atomic():
                    StockItem.objects.create(
                        part=part,
                        location=location,
                        quantity=quantity,
                    )
                stock_created += 1
            except Exception as exc:
                errors += 1
                self.stdout.write(
                    self.style.WARNING(
                        f'Part {part.pk} ({part.name}) failed: {exc.__class__.__name__}: {exc}'
                    )
                )

        self.stdout.write('')
        self.stdout.write('Create stock from Rental Reserve parts summary')
        self.stdout.write(f'- parts found: {parts_found}')
        self.stdout.write(f'- stock items created: {stock_created}')
        self.stdout.write(f'- skipped: {skipped}')
        self.stdout.write(f'- errors: {errors}')
        self.stdout.write(f"- mode: {'dry-run' if dry_run else 'confirm'}")
        self.stdout.write(f'- location used: {location.name} (id={location.pk})')
        self.stdout.write(f'- quantity used: {quantity}')
