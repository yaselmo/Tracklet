from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from company.models import Company, SupplierPart
from part.models import Part, PartCategory
from stock.management.commands.seed_tracklet_inventory import (
    SEED_LOCATIONS,
    deterministic_location_name,
    deterministic_quantity,
)
from stock.models import StockItem, StockLocation


class SeedTrackletInventoryCommandTests(TestCase):
    fixtures = ['location']

    def test_seed_command_creates_categories_and_items(self):
        stdout = StringIO()

        call_command('seed_tracklet_inventory', stdout=stdout)

        for category_name in [
            'Wave Probes',
            'Wave Gauge Heads',
            'Cameras',
            'Cables',
            'Devices',
            'Displacement Sensors',
        ]:
            self.assertTrue(
                PartCategory.objects.filter(name=category_name, parent=None).exists()
            )

        for location_name in SEED_LOCATIONS:
            self.assertTrue(
                StockLocation.objects.filter(name=location_name, parent=None).exists()
            )

        self.assertEqual(
            StockItem.objects.get(name='AWP24-3').quantity,
            5,
        )
        self.assertEqual(
            StockItem.objects.get(name='AWP24-2').quantity,
            8,
        )
        self.assertEqual(
            StockItem.objects.get(name='AWP24').quantity,
            13,
        )

        probe = StockItem.objects.get(name='WP_15cm')
        self.assertEqual(probe.category, 'Wave Probes')
        self.assertGreaterEqual(probe.quantity, 7)
        self.assertLessEqual(probe.quantity, 18)
        self.assertEqual(
            probe.location.name,
            deterministic_location_name('WP_15cm'),
        )

        camera = StockItem.objects.get(name='Canon Rebel')
        self.assertEqual(camera.category, 'Cameras')
        self.assertEqual(camera.quantity, deterministic_quantity('Canon Rebel', 1, 4))
        self.assertEqual(
            camera.location.name,
            deterministic_location_name('Canon Rebel'),
        )

        cable = StockItem.objects.get(name='Ethernet cable')
        self.assertEqual(cable.category, 'Cables')
        self.assertEqual(
            cable.quantity,
            deterministic_quantity('Ethernet cable', 2, 8),
        )
        self.assertEqual(
            cable.location.name,
            deterministic_location_name('Ethernet cable'),
        )

        device = StockItem.objects.get(name='WiFi switch')
        self.assertEqual(device.category, 'Devices')
        self.assertEqual(
            device.quantity,
            deterministic_quantity('WiFi switch', 1, 3),
        )

        sensor = StockItem.objects.get(name='DP 0.5m')
        self.assertEqual(sensor.category, 'Displacement Sensors')
        self.assertEqual(
            sensor.quantity,
            deterministic_quantity('DP 0.5m', 1, 4),
        )

        self.assertIn('Summary:', stdout.getvalue())

    def test_seed_command_updates_existing_item_without_duplicates(self):
        location = StockLocation.objects.filter(structural=False).first()
        self.assertIsNotNone(location)

        StockItem.objects.create(
            name='Nikon D90',
            category='Old Category',
            quantity=99,
            location=location,
        )

        call_command('seed_tracklet_inventory')

        item = StockItem.objects.get(name='Nikon D90')
        expected_quantity = deterministic_quantity('Nikon D90', 1, 4)
        expected_location = deterministic_location_name('Nikon D90')

        self.assertEqual(item.category, 'Cameras')
        self.assertEqual(item.quantity, expected_quantity)
        self.assertEqual(item.location.name, expected_location)
        self.assertEqual(StockItem.objects.filter(name='Nikon D90').count(), 1)

    def test_seed_command_adds_requested_tracklet_stock_items_without_duplicates(self):
        call_command('seed_tracklet_inventory')
        call_command('seed_tracklet_inventory')

        expected_items = {
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

        for category_name, item_names in expected_items.items():
            self.assertTrue(
                PartCategory.objects.filter(name=category_name, parent=None).exists()
            )

            for item_name in item_names:
                self.assertEqual(StockItem.objects.filter(name=item_name).count(), 1)
                stock_item = StockItem.objects.get(name=item_name)
                self.assertEqual(stock_item.category, category_name)

    def test_seed_command_creates_and_updates_suppliers(self):
        stdout = StringIO()

        call_command('seed_tracklet_inventory', stdout=stdout)

        akamina = Company.objects.get(name='Akamina')
        canon = Company.objects.get(name='Canon')
        nikon = Company.objects.get(name='Nikon')

        self.assertTrue(akamina.is_supplier)
        self.assertEqual(akamina.contact, 'Sales Team')
        self.assertEqual(akamina.email, 'sales@akamina.example')
        self.assertEqual(canon.phone, '+1-555-0102')
        self.assertEqual(nikon.website, 'https://nikon.example')
        self.assertEqual(nikon.notes, 'Camera supplier')
        self.assertEqual(akamina.contacts.count(), 1)
        self.assertEqual(akamina.contacts.first().name, 'Sales Team')

        canon.email = 'old@canon.example'
        canon.contact = 'Old Contact'
        canon.save(update_fields=['email', 'contact'])

        call_command('seed_tracklet_inventory')

        canon.refresh_from_db()
        self.assertEqual(canon.email, 'sales@canon.example')
        self.assertEqual(canon.contact, 'Equipment Sales')
        self.assertEqual(Company.objects.filter(name='Canon').count(), 1)
        self.assertIn('Suppliers created=', stdout.getvalue())

    def test_seed_command_links_stock_items_to_suppliers_when_part_exists(self):
        location = StockLocation.objects.filter(structural=False).first()
        self.assertIsNotNone(location)

        category = PartCategory.objects.create(name='Seeded Cameras')
        part = Part.objects.create(
            name='Nikon D90',
            category=category,
            purchaseable=True,
        )
        stock_item = StockItem.objects.create(
            name='Nikon D90',
            category='Cameras',
            quantity=1,
            location=location,
            part=part,
        )

        call_command('seed_tracklet_inventory')

        stock_item.refresh_from_db()
        self.assertIsNotNone(stock_item.supplier_part)
        self.assertEqual(stock_item.supplier_part.supplier.name, 'Nikon')
        self.assertEqual(stock_item.supplier_part.SKU, 'NIKON-D90')
        self.assertEqual(
            SupplierPart.objects.filter(
                part=part,
                supplier__name='Nikon',
                SKU='NIKON-D90',
            ).count(),
            1,
        )

        call_command('seed_tracklet_inventory')
        stock_item.refresh_from_db()
        self.assertEqual(stock_item.supplier_part.supplier.name, 'Nikon')
