from __future__ import annotations

import hashlib
from decimal import Decimal
from typing import Optional

from django.core.management.base import BaseCommand
from django.db import transaction

from company.models import Company, Contact, SupplierPart
from part.models import PartCategory
from stock.models import StockItem, StockLocation


SEED_DATA = {
    'Wave Probes': [
        'WP_15cm',
        'WP_10cm',
        'WP_30cm',
        'WP_45cm',
        'WP_65cm',
        'WP_100cm',
    ],
    'Wave Gauge Heads': {
        'AWP24-3': 5,
        'AWP24-2': 8,
        'AWP24': 13,
    },
    'Cameras': [
        'Nikon D90',
        'Nikon D5300',
        'Nikon D7500',
        'Canon Rebel',
    ],
    'Cables': [
        'Pressure sensor cable',
        'BNC cable',
        '6 pin cable',
        'AC power cable',
        'Ethernet cable',
    ],
    'Devices': [
        'WiFi switch',
        'Transmitter receiver',
    ],
    'Displacement Sensors': [
        'DP 1m',
        'DP 0.5m',
        'DP 3m',
    ],
}

SEED_LOCATIONS = ['LWB', 'CWB', 'LWF', 'SWL', 'MWF']

SUPPLIER_DATA = {
    'Akamina': {
        'contact_name': 'Sales Team',
        'email': 'sales@akamina.example',
        'phone': '+1-555-0101',
        'website': 'https://akamina.example',
        'description': 'Supplier for wave probes and wave gauge heads',
        'notes': 'Supplier for wave probes and wave gauge heads',
    },
    'Canon': {
        'contact_name': 'Equipment Sales',
        'email': 'sales@canon.example',
        'phone': '+1-555-0102',
        'website': 'https://canon.example',
        'description': 'Camera supplier',
        'notes': 'Camera supplier',
    },
    'Nikon': {
        'contact_name': 'Imaging Sales',
        'email': 'sales@nikon.example',
        'phone': '+1-555-0103',
        'website': 'https://nikon.example',
        'description': 'Camera supplier',
        'notes': 'Camera supplier',
    },
}

ITEM_SUPPLIER_MAP = {
    'Nikon D90': 'Nikon',
    'Nikon D5300': 'Nikon',
    'Nikon D7500': 'Nikon',
    'Canon Rebel': 'Canon',
    'WP_15cm': 'Akamina',
    'WP_10cm': 'Akamina',
    'WP_30cm': 'Akamina',
    'WP_45cm': 'Akamina',
    'WP_65cm': 'Akamina',
    'WP_100cm': 'Akamina',
    'AWP24-3': 'Akamina',
    'AWP24-2': 'Akamina',
    'AWP24': 'Akamina',
}


def deterministic_quantity(name: str, minimum: int, maximum: int) -> int:
    """Return a stable pseudo-random quantity for the provided name."""
    span = maximum - minimum + 1
    digest = hashlib.sha256(name.encode('utf-8')).digest()
    return minimum + (digest[0] % span)


def deterministic_location_name(item_name: str) -> str:
    """Assign a stock location using stable round-robin ordering by item name."""
    ordered_names = []

    for category_name, items in SEED_DATA.items():
        normalized_items = items.keys() if isinstance(items, dict) else items
        ordered_names.extend((category_name, item_name) for item_name in normalized_items)

    ordered_names.sort(key=lambda value: (value[0], value[1]))
    item_names = [value[1] for value in ordered_names]

    index = item_names.index(item_name)
    return SEED_LOCATIONS[index % len(SEED_LOCATIONS)]


class Command(BaseCommand):
    help = (
        'Seed Tracklet stock categories and stock items without depending on Part. '
        'Local run: python manage.py seed_tracklet_inventory'
    )

    def handle(self, *args, **options):
        categories_created = 0
        categories_existing = 0
        locations_created = 0
        locations_existing = 0
        suppliers_created = 0
        suppliers_updated = 0
        suppliers_unchanged = 0
        contacts_created = 0
        contacts_updated = 0
        contacts_unchanged = 0
        items_created = 0
        items_updated = 0
        items_unchanged = 0
        supplier_links_created = 0
        supplier_links_updated = 0
        supplier_links_unchanged = 0
        supplier_links_skipped = []
        duplicate_matches = []
        created_locations = {}
        supplier_actions = []
        linked_items = []

        self.stdout.write('Seeding stock categories and items...')

        with transaction.atomic():
            for supplier_name, supplier_data in SUPPLIER_DATA.items():
                (
                    supplier,
                    supplier_action,
                    contact_action,
                ) = self.ensure_supplier(supplier_name, supplier_data)

                if supplier_action == 'created':
                    suppliers_created += 1
                elif supplier_action == 'updated':
                    suppliers_updated += 1
                else:
                    suppliers_unchanged += 1

                if contact_action == 'created':
                    contacts_created += 1
                elif contact_action == 'updated':
                    contacts_updated += 1
                else:
                    contacts_unchanged += 1

                supplier_actions.append((supplier.name, supplier_action, contact_action))
                self.stdout.write(
                    f'  [{supplier_action} supplier] {supplier.name} ({contact_action} contact)'
                )

            for location_name in SEED_LOCATIONS:
                location, created = self.ensure_location(location_name)
                created_locations[location_name] = location

                if created:
                    locations_created += 1
                    self.stdout.write(f'  [created location] {location.name}')
                else:
                    locations_existing += 1
                    self.stdout.write(f'  [existing location] {location.name}')

            for category_name, items in SEED_DATA.items():
                category, created = self.ensure_category(category_name)
                category_path = category.pathstring or category.name

                if created:
                    categories_created += 1
                    self.stdout.write(f'  [created category] {category_path}')
                else:
                    categories_existing += 1
                    self.stdout.write(f'  [existing category] {category_path}')

                normalized_items = self.normalize_items(category_name, items)

                for item_name, quantity in normalized_items.items():
                    location_name = deterministic_location_name(item_name)
                    location = created_locations[location_name]
                    stock_items = StockItem.objects.filter(name=item_name).order_by('pk')
                    stock_item = stock_items.first()

                    if stock_items.count() > 1:
                        duplicate_matches.append(item_name)

                    if stock_item is None:
                        StockItem.objects.create(
                            name=item_name,
                            category=category_path,
                            quantity=Decimal(quantity),
                            location=location,
                        )
                        items_created += 1
                        self.stdout.write(
                            f'  [created item] {item_name} -> {category_path} @ {location.name} (qty={quantity})'
                        )
                        continue

                    changed_fields = []

                    if stock_item.category != category_path:
                        stock_item.category = category_path
                        changed_fields.append('category')

                    new_quantity = Decimal(quantity)
                    if stock_item.quantity != new_quantity:
                        stock_item.quantity = new_quantity
                        changed_fields.append('quantity')

                    if stock_item.location_id != location.pk:
                        stock_item.location = location
                        changed_fields.append('location')

                    if changed_fields:
                        stock_item.save(update_fields=changed_fields)
                        items_updated += 1
                        self.stdout.write(
                            f'  [updated item] {item_name} -> {category_path} @ {location.name} (qty={quantity})'
                        )
                    else:
                        items_unchanged += 1
                        self.stdout.write(
                            f'  [unchanged item] {item_name} -> {category_path} @ {location.name} (qty={quantity})'
                        )

            for item_name, supplier_name in ITEM_SUPPLIER_MAP.items():
                stock_items = StockItem.objects.filter(name=item_name).order_by('pk')

                for stock_item in stock_items:
                    supplier = Company.objects.filter(name=supplier_name, is_supplier=True).first()

                    if supplier is None:
                        supplier_links_skipped.append(
                            f'{item_name}: supplier "{supplier_name}" missing'
                        )
                        continue

                    if stock_item.part is None:
                        supplier_links_skipped.append(
                            f'{item_name}: no linked part on stock item'
                        )
                        continue

                    supplier_part, action = self.ensure_supplier_part_link(stock_item, supplier)

                    if action == 'created':
                        supplier_links_created += 1
                    elif action == 'updated':
                        supplier_links_updated += 1
                    elif action == 'unchanged':
                        supplier_links_unchanged += 1
                    else:
                        supplier_links_skipped.append(f'{item_name}: {action}')
                        continue

                    linked_items.append(
                        f'{stock_item.name} -> {supplier.name} ({supplier_part.SKU})'
                    )
                    self.stdout.write(
                        f'  [{action} supplier link] {stock_item.name} -> {supplier.name} ({supplier_part.SKU})'
                    )

        self.stdout.write('')
        self.stdout.write('Summary:')
        self.stdout.write(
            f'  Suppliers created={suppliers_created}, updated={suppliers_updated}, unchanged={suppliers_unchanged}'
        )
        self.stdout.write(
            f'  Contacts created={contacts_created}, updated={contacts_updated}, unchanged={contacts_unchanged}'
        )
        self.stdout.write(
            f'  Categories created={categories_created}, existing={categories_existing}'
        )
        self.stdout.write(
            f'  Locations created={locations_created}, existing={locations_existing}'
        )
        self.stdout.write(
            f'  Items created={items_created}, updated={items_updated}, unchanged={items_unchanged}'
        )
        self.stdout.write(
            f'  Supplier links created={supplier_links_created}, updated={supplier_links_updated}, unchanged={supplier_links_unchanged}'
        )

        if duplicate_matches:
            duplicates = ', '.join(sorted(set(duplicate_matches)))
            self.stdout.write(
                self.style.WARNING(
                    f'  Duplicate existing item names detected; only the first match was updated: {duplicates}'
                )
            )

        if supplier_actions:
            self.stdout.write('  Suppliers processed:')
            for supplier_name, supplier_action, contact_action in supplier_actions:
                self.stdout.write(
                    f'    - {supplier_name}: supplier={supplier_action}, contact={contact_action}'
                )

        if linked_items:
            self.stdout.write('  Linked stock items:')
            for linked_item in linked_items:
                self.stdout.write(f'    - {linked_item}')

        if supplier_links_skipped:
            self.stdout.write('  Skipped supplier links:')
            for reason in supplier_links_skipped:
                self.stdout.write(f'    - {reason}')

        self.stdout.write('')
        self.stdout.write(
            self.style.SUCCESS(
                'Done. Local run: python manage.py seed_tracklet_inventory'
            )
        )

    def ensure_category(self, name: str) -> tuple[PartCategory, bool]:
        """Create a top-level category if it does not already exist."""
        category = PartCategory.objects.filter(name=name, parent=None).first()

        if category is not None:
            return category, False

        category = PartCategory.objects.create(name=name, parent=None)
        return category, True

    def ensure_location(self, name: str) -> tuple[StockLocation, bool]:
        """Create a top-level stock location if it does not already exist."""
        location = StockLocation.objects.filter(name=name, parent=None).first()

        if location is not None:
            return location, False

        location = StockLocation.objects.create(name=name, parent=None)
        return location, True

    def ensure_supplier(
        self, supplier_name: str, supplier_data: dict[str, str]
    ) -> tuple[Company, str, str]:
        """Create or update a supplier and primary contact."""
        supplier = Company.objects.filter(name=supplier_name).order_by('pk').first()
        supplier_action = 'unchanged'

        company_values = {
            'description': supplier_data['description'],
            'website': supplier_data['website'],
            'phone': supplier_data['phone'],
            'email': supplier_data['email'],
            'contact': supplier_data['contact_name'],
            'notes': supplier_data['notes'],
            'is_supplier': True,
            'active': True,
        }

        if supplier is None:
            supplier = Company.objects.create(name=supplier_name, **company_values)
            supplier_action = 'created'
        else:
            changed_fields = []
            for field_name, field_value in company_values.items():
                if getattr(supplier, field_name) != field_value:
                    setattr(supplier, field_name, field_value)
                    changed_fields.append(field_name)

            if changed_fields:
                supplier.save(update_fields=changed_fields)
                supplier_action = 'updated'

        contact_action = self.ensure_supplier_contact(supplier, supplier_data)

        return supplier, supplier_action, contact_action

    def ensure_supplier_contact(
        self, supplier: Company, supplier_data: dict[str, str]
    ) -> str:
        """Create or update a single primary contact row for the supplier."""
        contact = supplier.contacts.order_by('pk').first()

        contact_values = {
            'name': supplier_data['contact_name'],
            'email': supplier_data['email'],
            'phone': supplier_data['phone'],
            'role': 'Primary Contact',
        }

        if contact is None:
            Contact.objects.create(company=supplier, **contact_values)
            return 'created'

        changed_fields = []
        for field_name, field_value in contact_values.items():
            if getattr(contact, field_name) != field_value:
                setattr(contact, field_name, field_value)
                changed_fields.append(field_name)

        if changed_fields:
            contact.save(update_fields=changed_fields)
            return 'updated'

        return 'unchanged'

    def ensure_supplier_part_link(
        self, stock_item: StockItem, supplier: Company
    ) -> tuple[Optional[SupplierPart], str]:
        """Create or update supplier link for a stock item with a matching part."""
        if stock_item.part is None:
            return None, 'no linked part on stock item'

        if not stock_item.part.purchaseable:
            return None, 'linked part is not purchaseable'

        sku = self.supplier_sku(stock_item.name)

        supplier_part = SupplierPart.objects.filter(
            part=stock_item.part,
            supplier=supplier,
            SKU=sku,
        ).first()

        action = 'unchanged'

        if supplier_part is None:
            supplier_part = SupplierPart.objects.create(
                part=stock_item.part,
                supplier=supplier,
                SKU=sku,
                description=f'Seeded supplier record for {stock_item.name}',
                note='Created by seed_tracklet_inventory',
                pack_quantity='1',
            )
            action = 'created'

        if stock_item.supplier_part_id != supplier_part.pk:
            stock_item.supplier_part = supplier_part
            stock_item.save(update_fields=['supplier_part'])
            if action != 'created':
                action = 'updated'

        return supplier_part, action

    def supplier_sku(self, item_name: str) -> str:
        """Generate a clean deterministic supplier SKU for seeded items."""
        return item_name.upper().replace(' ', '-')

    def normalize_items(self, category_name: str, items) -> dict[str, int]:
        """Return item quantities for a given category."""
        if category_name == 'Wave Probes':
            return {
                item_name: deterministic_quantity(item_name, 7, 18)
                for item_name in items
            }

        if category_name == 'Wave Gauge Heads':
            return dict(items)

        if category_name == 'Cameras':
            return {
                item_name: deterministic_quantity(item_name, 1, 4)
                for item_name in items
            }

        if category_name == 'Cables':
            return {
                item_name: deterministic_quantity(item_name, 2, 8)
                for item_name in items
            }

        if category_name == 'Devices':
            return {
                item_name: deterministic_quantity(item_name, 1, 3)
                for item_name in items
            }

        if category_name == 'Displacement Sensors':
            return {
                item_name: deterministic_quantity(item_name, 1, 4)
                for item_name in items
            }

        return {}
