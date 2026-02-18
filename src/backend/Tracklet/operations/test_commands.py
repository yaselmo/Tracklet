"""Management command tests for operations app."""

from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from part.models import Part, PartCategory
from stock.models import StockItem, StockLocation


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
                    'import_rental_pdf',
                    pdf=str(pdf_path),
                    no_stock=True,
                    verbosity=0,
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
        self.assertEqual(PartCategory.objects.filter(parent=tablecloth_part.category).count(), 0)
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
