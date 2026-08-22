"""Management command tests for operations app."""

import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from operations.models import (
    Event,
    EventFurnitureAssignment,
    RentalLineItem,
    RentalOrder,
)
from part.models import Part, PartCategory
from stock.models import StockCategory, StockItem, StockLocation
from users.models import RuleSet


class ImportRentalPdfCommandTests(TestCase):
    def test_import_creates_hierarchy_and_parts(self):
        with TemporaryDirectory() as tmpdir:
            pdf_path = Path(tmpdir) / 'inventory.pdf'
            pdf_path.write_text('dummy', encoding='utf-8')

            rows = [
                {
                    'product_id': 1001,
                    'product_name': 'COCO CHAIR - Clear',
                    'product_type': 'Chairs',
                },
                {
                    'product_id': 1002,
                    'product_name': 'Ivory Tablecloth 120"',
                    'product_type': 'Tablecloths',
                },
            ]

            with mock.patch(
                'operations.management.commands.import_rental_pdf.Command._extract_rows_from_pdf',
                return_value=rows,
            ):
                call_command(
                    'import_rental_pdf', pdf=str(pdf_path), no_stock=True, verbosity=0
                )

        rentals = PartCategory.objects.get(parent=None, name='Rentals')
        tabletop = PartCategory.objects.get(parent=rentals, name='Tabletop')
        furniture = PartCategory.objects.get(parent=rentals, name='Furniture')
        linens = PartCategory.objects.get(parent=rentals, name='Linens')
        decor = PartCategory.objects.get(parent=rentals, name='Decor')

        PartCategory.objects.get(parent=tabletop, name='Chargers')
        PartCategory.objects.get(parent=tabletop, name='Flatware')
        PartCategory.objects.get(parent=tabletop, name='Glassware')

        chairs = PartCategory.objects.get(parent=furniture, name='Chairs')
        PartCategory.objects.get(parent=furniture, name='Lounge Furniture')
        PartCategory.objects.get(parent=furniture, name='Tables')
        PartCategory.objects.get(parent=furniture, name='Bars')

        PartCategory.objects.get(parent=linens, name='Tablecloths')
        PartCategory.objects.get(parent=linens, name='Napkins')
        PartCategory.objects.get(parent=linens, name='Runner')

        PartCategory.objects.get(parent=decor, name='Decor')

        coco_model = PartCategory.objects.get(parent=chairs, name='Coco Chair')
        part = Part.objects.get(IPN='RENTAL-1001')
        self.assertEqual(part.name, 'COCO CHAIR - Clear')
        self.assertTrue(part.active)
        self.assertEqual(part.category_id, coco_model.pk)
        self.assertEqual(part.category.parent.name, 'Chairs')

        tablecloth_part = Part.objects.get(IPN='RENTAL-1002')
        self.assertEqual(tablecloth_part.category.name, 'Tablecloths')
        self.assertEqual(tablecloth_part.category.parent.name, 'Linens')
        self.assertEqual(
            PartCategory.objects.filter(parent=tablecloth_part.category).count(), 0
        )
        self.assertEqual(StockItem.objects.count(), 0)

    def test_import_is_idempotent_and_stock_creation_is_safe(self):
        with TemporaryDirectory() as tmpdir:
            pdf_path = Path(tmpdir) / 'inventory.pdf'
            pdf_path.write_text('dummy', encoding='utf-8')

            rows = [
                {
                    'product_id': 2001,
                    'product_name': 'Velvet Lounge Chair - Blue',
                    'product_type': 'Lounge furniture',
                }
            ]

            with mock.patch(
                'operations.management.commands.import_rental_pdf.Command._extract_rows_from_pdf',
                return_value=rows,
            ):
                call_command(
                    'import_rental_pdf',
                    pdf=str(pdf_path),
                    create_stock=True,
                    verbosity=0,
                )
                call_command(
                    'import_rental_pdf',
                    pdf=str(pdf_path),
                    create_stock=True,
                    verbosity=0,
                )

        self.assertEqual(Part.objects.filter(IPN='RENTAL-2001').count(), 1)
        part = Part.objects.get(IPN='RENTAL-2001')
        self.assertEqual(part.category.name, 'Velvet Lounge Chair')
        self.assertEqual(part.category.parent.name, 'Lounge Furniture')
        self.assertEqual(StockItem.objects.filter(part=part).count(), 1)

    def test_model_level_none_disables_level_three_categories(self):
        with TemporaryDirectory() as tmpdir:
            pdf_path = Path(tmpdir) / 'inventory.pdf'
            pdf_path.write_text('dummy', encoding='utf-8')

            rows = [
                {
                    'product_id': 2101,
                    'product_name': 'COCO CHAIR - Clear',
                    'product_type': 'Chairs',
                }
            ]

            with mock.patch(
                'operations.management.commands.import_rental_pdf.Command._extract_rows_from_pdf',
                return_value=rows,
            ):
                call_command(
                    'import_rental_pdf',
                    pdf=str(pdf_path),
                    no_stock=True,
                    model_level='none',
                    verbosity=0,
                )

        part = Part.objects.get(IPN='RENTAL-2101')
        self.assertEqual(part.category.name, 'Chairs')
        self.assertEqual(part.category.parent.name, 'Furniture')

    def test_import_with_purge_non_rental(self):
        location = StockLocation.objects.create(name='Temp')
        non_rental_part = Part.objects.create(name='Legacy Chair', IPN='LEGACY-1')
        StockItem.objects.create(part=non_rental_part, location=location, quantity=1)
        Part.objects.create(name='No IPN Part', IPN=None)

        with TemporaryDirectory() as tmpdir:
            pdf_path = Path(tmpdir) / 'inventory.pdf'
            pdf_path.write_text('dummy', encoding='utf-8')

            rows = [
                {
                    'product_id': 3001,
                    'product_name': 'Velvet Chair',
                    'product_type': 'Chairs',
                }
            ]

            with mock.patch(
                'operations.management.commands.import_rental_pdf.Command._extract_rows_from_pdf',
                return_value=rows,
            ):
                call_command(
                    'import_rental_pdf',
                    pdf=str(pdf_path),
                    purge_non_rental=True,
                    no_stock=True,
                    verbosity=0,
                )

        self.assertEqual(Part.objects.filter(IPN='LEGACY-1').count(), 0)
        self.assertEqual(Part.objects.filter(IPN__isnull=True).count(), 0)
        self.assertEqual(Part.objects.filter(IPN='RENTAL-3001').count(), 1)


class SeedDemoCommandTests(TestCase):
    """Verify that the fictional portfolio seed is safe and repeatable."""

    def run_seed(self, *, reset=False):
        """Run the demo command with a disposable test password."""
        with mock.patch.dict(
            os.environ, {'TRACKLET_DEMO_PASSWORD': 'not-a-real-password'}
        ):
            call_command('seed_demo', reset=reset, verbosity=0)

    def assert_demo_counts(self):
        """Assert the stable public-demo object counts."""
        self.assertEqual(
            StockItem.objects.filter(serial__startswith='DEMO-').count(), 32
        )
        self.assertEqual(
            StockCategory.objects.filter(metadata__tracklet_demo=True).count(), 10
        )
        self.assertEqual(
            StockLocation.objects.filter(metadata__tracklet_demo=True).count(), 10
        )
        self.assertEqual(
            Event.objects.filter(reference__startswith='DEMO-EV-').count(), 8
        )
        self.assertEqual(
            EventFurnitureAssignment.objects.filter(
                event__reference__startswith='DEMO-EV-'
            ).count(),
            12,
        )
        self.assertEqual(
            RentalOrder.objects.filter(reference__startswith='DEMO-RN-').count(), 4
        )
        self.assertEqual(
            RentalLineItem.objects.filter(
                order__reference__startswith='DEMO-RN-'
            ).count(),
            8,
        )

    def test_seed_is_idempotent_and_resettable(self):
        """Repeated and reset runs preserve exact demo object counts."""
        self.run_seed()
        self.run_seed()
        self.assert_demo_counts()

        self.run_seed(reset=True)
        self.assert_demo_counts()

        user = User.objects.get(username='demo')
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(user.groups.count(), 1)

        for ruleset in RuleSet.objects.filter(group=user.groups.get()):
            self.assertFalse(ruleset.can_add)
            self.assertFalse(ruleset.can_change)
            self.assertFalse(ruleset.can_delete)

    def test_seed_requires_password_environment_variable(self):
        """The demo password must never be embedded in source."""
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(CommandError):
                call_command('seed_demo', verbosity=0)
