"""Tests for the projects API."""

from datetime import date, timedelta
from decimal import Decimal
from importlib import import_module

from django.apps import apps as django_apps
from django.urls import reverse

from Tracklet.unit_test import InvenTreeAPITestCase
from common.models import Attachment
from part.models import Part, PartCategory
from stock.models import StockItem, StockLocation
from stock.status_codes import StockStatus

from .models import (
    Project,
    ProjectInstrument,
    ProjectReport,
    ProjectStatus,
    ProjectStockAllocation,
)


class ProjectApiTests(InvenTreeAPITestCase):
    """Basic API tests for projects."""

    fixtures = ['category', 'part', 'location', 'stock']
    roles = ['project.view']

    def _make_stock_item(self, quantity=10):
        """Create a stock item for allocation tests."""
        part = Part.objects.filter(virtual=False).first()
        location = StockLocation.objects.first()
        assert part
        assert location
        return StockItem.objects.create(part=part, location=location, quantity=quantity)

    def _make_part(self, name='Project Instrument Part'):
        """Create a dedicated part for project instrumentation tests."""
        category = PartCategory.objects.first()
        assert category
        return Part.objects.create(name=name, category=category)

    def test_create_project(self):
        """Create a project through the API."""
        url = reverse('api-project-list')
        location = StockLocation.objects.first()
        assert location

        self.post(url, {'name': 'Project A'}, expected_code=403)

        self.assignRole('project.add')

        response = self.post(
            url,
            {
                'name': 'Project A',
                'description': 'Alpha',
                'location': location.pk,
                'status': ProjectStatus.FUTURE,
            },
            expected_code=201,
        )

        project = Project.objects.get(pk=response.data['pk'])
        self.assertEqual(project.name, 'Project A')
        self.assertEqual(project.location_id, location.pk)
        self.assertEqual(project.created_by, self.user)

    def test_add_allocation(self):
        """Add stock allocation to active project."""
        self.assignRole('project.add')

        project = Project.objects.create(name='Build Alpha')
        item = self._make_stock_item(quantity=6)

        url = reverse('api-project-allocation-list-by-project', kwargs={'pk': project.pk})

        response = self.post(
            url,
            {'stock_item': item.pk, 'quantity': '2.0', 'notes': 'Initial allocation'},
            expected_code=201,
        )

        alloc = ProjectStockAllocation.objects.get(pk=response.data['pk'])
        self.assertEqual(alloc.project, project)
        self.assertEqual(alloc.stock_item, item)

    def test_prevent_over_allocation(self):
        """Allocation cannot exceed available quantity."""
        self.assignRole('project.add')

        project = Project.objects.create(name='Build Beta')
        item = self._make_stock_item(quantity=3)

        url = reverse('api-project-allocation-list-by-project', kwargs={'pk': project.pk})

        self.post(
            url,
            {'stock_item': item.pk, 'quantity': '5.0'},
            expected_code=400,
        )

    def test_filter_active_vs_past(self):
        """Projects endpoint supports active/past filtering."""
        self.assignRole('project.add')

        Project.objects.create(name='P1', status=ProjectStatus.FUTURE)
        Project.objects.create(name='P2', status=ProjectStatus.ONGOING)
        Project.objects.create(name='P3', status=ProjectStatus.PAST)

        url = reverse('api-project-list')

        active = self.get(url, {'status': 'FUTURE'}, expected_code=200).data
        ongoing = self.get(url, {'status': 'ONGOING'}, expected_code=200).data
        past = self.get(url, {'status': 'PAST'}, expected_code=200).data

        self.assertEqual(len(active), 1)
        self.assertEqual(len(ongoing), 1)
        self.assertEqual(len(past), 1)

    def test_add_instrument(self):
        """Add instrument stock item to project."""
        self.assignRole('project.add')

        project = Project.objects.create(name='Instrument Project')
        item = self._make_stock_item(quantity=4)

        url = reverse('api-project-instrument-list-by-project', kwargs={'pk': project.pk})

        response = self.post(
            url,
            {'stock_item': item.pk, 'quantity': '1.0', 'notes': 'Scope meter'},
            expected_code=201,
        )

        instrument = ProjectInstrument.objects.get(pk=response.data['pk'])
        self.assertEqual(instrument.project, project)
        self.assertEqual(instrument.stock_item, item)

    def test_prevent_duplicate_instrument(self):
        """Prevent duplicate stock item instrument rows for same project."""
        self.assignRole('project.add')

        project = Project.objects.create(name='Instrument Project')
        item = self._make_stock_item(quantity=4)

        url = reverse('api-project-instrument-list-by-project', kwargs={'pk': project.pk})

        self.post(url, {'stock_item': item.pk, 'quantity': '1.0'}, expected_code=201)
        self.post(url, {'stock_item': item.pk, 'quantity': '1.0'}, expected_code=400)

    def test_instrument_reservation_lifecycle(self):
        """Add/edit/delete instrument adjusts stock available quantity."""
        self.assignRole('project.add')
        self.assignRole('project.change')
        self.assignRole('project.delete')

        project = Project.objects.create(name='Instrument Reservation')
        item = self._make_stock_item(quantity=10)

        list_url = reverse(
            'api-project-instrument-list-by-project', kwargs={'pk': project.pk}
        )

        response = self.post(
            list_url,
            {'stock_item': item.pk, 'quantity': '3.0'},
            expected_code=201,
        )

        item.refresh_from_db()
        self.assertEqual(item.unallocated_quantity(), 7)

        instrument_pk = response.data['pk']
        detail_url = reverse('api-project-instrument-detail', kwargs={'pk': instrument_pk})

        self.patch(detail_url, {'quantity': '5.0'}, expected_code=200)

        item.refresh_from_db()
        self.assertEqual(item.unallocated_quantity(), 5)

        self.delete(detail_url, expected_code=204)

        item.refresh_from_db()
        self.assertEqual(item.unallocated_quantity(), 10)

    def test_instrument_cannot_exceed_available(self):
        """Instrument quantity must not exceed available stock."""
        self.assignRole('project.add')

        project = Project.objects.create(name='Instrument Available Check')
        item = self._make_stock_item(quantity=4)

        list_url = reverse('api-project-instrument-list-by-project', kwargs={'pk': project.pk})

        self.post(
            list_url,
            {'stock_item': item.pk, 'quantity': '5.0'},
            expected_code=400,
        )

    def test_stock_picker_shows_remaining_quantity_for_overlapping_projects(self):
        """Available stock picker should include items with partial quantity still free."""
        self.assignRole('project.add')
        self.assignRole('stock.view')

        part = self._make_part(name='Shared Instrument Part')
        location = StockLocation.objects.first()
        assert location

        item = StockItem.objects.create(part=part, location=location, quantity=5)

        project_1 = Project.objects.create(
            name='Overlap Source Project',
            start_date=date(2026, 2, 24),
            end_date=date(2026, 2, 26),
        )
        project_2 = Project.objects.create(
            name='Overlap Target Project',
            start_date=date(2026, 2, 25),
            end_date=date(2026, 2, 27),
        )

        ProjectInstrument.objects.create(
            project=project_1,
            stock_item=item,
            quantity=3,
        )

        item.refresh_from_db()
        self.assertEqual(item.tracklet_status, 'IN_USE')

        response = self.get(
            reverse('api-stock-list'),
            {
                'available': True,
                'in_stock': True,
                'project': project_2.pk,
            },
            expected_code=200,
        )

        results = response.data.get('results', response.data)
        result_ids = [entry['pk'] for entry in results]

        self.assertIn(item.pk, result_ids)

    def test_auto_assign_instruments(self):
        """Auto-assign endpoint allocates stock items and reduces availability."""
        self.assignRole('project.add')

        project = Project.objects.create(name='Auto Assign Instrumentation')
        part = self._make_part(name='Auto Assign Part')
        location = StockLocation.objects.first()
        assert location

        item_1 = StockItem.objects.create(part=part, location=location, quantity=1)
        item_2 = StockItem.objects.create(part=part, location=location, quantity=1)
        item_3 = StockItem.objects.create(part=part, location=location, quantity=1)

        url = reverse(
            'api-project-instrument-auto-assign', kwargs={'pk': project.pk}
        )

        response = self.post(
            url,
            {'part': part.pk, 'quantity': 2},
            expected_code=201,
        )

        self.assertIn('stock_item_ids', response.data)
        self.assertEqual(len(response.data['stock_item_ids']), 2)
        self.assertEqual(len(set(response.data['stock_item_ids'])), 2)

        instruments = ProjectInstrument.objects.filter(
            project=project, stock_item__part=part
        )
        self.assertEqual(instruments.count(), 2)
        allocations = ProjectStockAllocation.objects.filter(
            project=project, stock_item__part=part
        )
        self.assertEqual(allocations.count(), 2)

        item_1.refresh_from_db()
        item_2.refresh_from_db()
        item_3.refresh_from_db()
        part.refresh_from_db()

        allocated_items = set(response.data['stock_item_ids'])
        self.assertEqual(
            item_1.unallocated_quantity(), 0 if item_1.pk in allocated_items else 1
        )
        self.assertEqual(
            item_2.unallocated_quantity(), 0 if item_2.pk in allocated_items else 1
        )
        self.assertEqual(
            item_3.unallocated_quantity(), 0 if item_3.pk in allocated_items else 1
        )
        if item_1.pk in allocated_items:
            self.assertEqual(item_1.tracklet_status, 'IN_USE')
        if item_2.pk in allocated_items:
            self.assertEqual(item_2.tracklet_status, 'IN_USE')
        if item_3.pk in allocated_items:
            self.assertEqual(item_3.tracklet_status, 'IN_USE')
        self.assertEqual(part.available_stock, 1)

    def test_auto_assign_instruments_not_enough_stock(self):
        """Auto-assign returns helpful error when available stock is insufficient."""
        self.assignRole('project.add')

        project = Project.objects.create(name='Auto Assign Insufficient')
        part = self._make_part(name='Auto Assign Limited')
        location = StockLocation.objects.first()
        assert location

        StockItem.objects.create(part=part, location=location, quantity=1)

        url = reverse(
            'api-project-instrument-auto-assign', kwargs={'pk': project.pk}
        )

        response = self.post(
            url,
            {'part': part.pk, 'quantity': 2},
            expected_code=400,
        )

        self.assertIn('quantity', response.data)
        self.assertIn('Not enough available stock', str(response.data['quantity']))

    def test_auto_assign_instruments_uses_item_quantity(self):
        """Auto-assign can fulfill quantity from a single stock item with enough units."""
        self.assignRole('project.add')

        project = Project.objects.create(name='Auto Assign Quantity Units')
        part = self._make_part(name='Auto Assign Qty Part')
        location = StockLocation.objects.first()
        assert location

        item = StockItem.objects.create(part=part, location=location, quantity=5)

        url = reverse(
            'api-project-instrument-auto-assign', kwargs={'pk': project.pk}
        )

        response = self.post(
            url,
            {'part': part.pk, 'quantity': 5},
            expected_code=201,
        )

        self.assertIn('stock_item_ids', response.data)
        self.assertEqual(len(response.data['stock_item_ids']), 1)
        self.assertEqual(response.data['stock_item_ids'][0], item.pk)

        instrument = ProjectInstrument.objects.get(
            project=project,
            stock_item=item,
        )
        allocation = ProjectStockAllocation.objects.get(
            project=project,
            stock_item=item,
        )

        self.assertEqual(instrument.quantity, 5)
        self.assertEqual(allocation.quantity, 5)

    def test_auto_assign_instruments_not_enough_stock_in_location(self):
        """Auto-assign error reports scoped and total availability when location is set."""
        self.assignRole('project.add')

        project = Project.objects.create(name='Auto Assign Location Limited')
        part = self._make_part(name='Auto Assign Location Part')

        location_a = StockLocation.objects.first()
        assert location_a

        location_b = StockLocation.objects.exclude(pk=location_a.pk).first()
        if location_b is None:
            location_b = StockLocation.objects.create(name='Secondary Location')

        StockItem.objects.create(part=part, location=location_a, quantity=1)

        url = reverse(
            'api-project-instrument-auto-assign', kwargs={'pk': project.pk}
        )

        response = self.post(
            url,
            {'part': part.pk, 'quantity': 1, 'location': location_b.pk},
            expected_code=400,
        )

        self.assertIn('quantity', response.data)
        quantity_error = str(response.data['quantity'])
        self.assertIn('at location', quantity_error)
        self.assertIn('total available', quantity_error)

    def test_auto_assign_instruments_allows_non_overlapping_projects(self):
        """Same instrument can be assigned to non-overlapping project date windows."""
        self.assignRole('project.add')

        part = self._make_part(name='Auto Assign Date Window Part')
        location = StockLocation.objects.first()
        assert location
        item = StockItem.objects.create(part=part, location=location, quantity=1)

        project_1 = Project.objects.create(
            name='Project Window A',
            start_date=date(2026, 2, 24),
            end_date=date(2026, 2, 26),
        )
        project_2 = Project.objects.create(
            name='Project Window B',
            start_date=date(2026, 2, 27),
            end_date=date(2026, 2, 28),
        )

        ProjectInstrument.objects.create(
            project=project_1,
            stock_item=item,
            quantity=1,
        )

        url = reverse('api-project-instrument-auto-assign', kwargs={'pk': project_2.pk})
        response = self.post(
            url,
            {'part': part.pk, 'quantity': 1},
            expected_code=201,
        )

        self.assertEqual(len(response.data['stock_item_ids']), 1)
        self.assertEqual(response.data['stock_item_ids'][0], item.pk)
        self.assertTrue(
            ProjectInstrument.objects.filter(
                project=project_2,
                stock_item=item,
                quantity=1,
            ).exists()
        )

    def test_auto_assign_instruments_blocks_overlapping_projects(self):
        """Same instrument cannot be assigned to overlapping project date windows."""
        self.assignRole('project.add')

        part = self._make_part(name='Auto Assign Date Overlap Part')
        location = StockLocation.objects.first()
        assert location
        item = StockItem.objects.create(part=part, location=location, quantity=1)

        project_1 = Project.objects.create(
            name='Overlap Project A',
            start_date=date(2026, 2, 24),
            end_date=date(2026, 2, 26),
        )
        project_2 = Project.objects.create(
            name='Overlap Project B',
            start_date=date(2026, 2, 25),
            end_date=date(2026, 2, 27),
        )

        ProjectInstrument.objects.create(
            project=project_1,
            stock_item=item,
            quantity=1,
        )

        url = reverse('api-project-instrument-auto-assign', kwargs={'pk': project_2.pk})
        response = self.post(
            url,
            {'part': part.pk, 'quantity': 1},
            expected_code=400,
        )

        self.assertIn('quantity', response.data)
        self.assertIn('Not enough available stock', str(response.data['quantity']))

    def test_project_instrument_selector_allows_non_overlapping_projects(self):
        """Stock selector keeps an item available when project windows do not overlap."""
        self.assignRole('project.view')
        self.assignRole('project.add')

        part = self._make_part(name='Selector Gap Part')
        location = StockLocation.objects.first()
        assert location
        item = StockItem.objects.create(part=part, location=location, quantity=1)

        project_a = Project.objects.create(
            name='Project A',
            start_date=date(2026, 3, 17),
            end_date=date(2026, 3, 18),
        )
        project_b = Project.objects.create(
            name='Project B',
            start_date=date(2026, 3, 19),
            end_date=date(2026, 3, 20),
        )

        ProjectInstrument.objects.create(project=project_a, stock_item=item, quantity=1)

        response = self.get(
            reverse('api-stock-list'),
            {'available': True, 'in_stock': True, 'project': project_b.pk},
            expected_code=200,
        )

        returned_ids = {row['pk'] for row in response.data}
        self.assertIn(item.pk, returned_ids)

    def test_project_instrument_selector_blocks_boundary_overlap(self):
        """Stock selector blocks an item when project windows overlap on the boundary."""
        self.assignRole('project.view')
        self.assignRole('project.add')

        part = self._make_part(name='Selector Boundary Part')
        location = StockLocation.objects.first()
        assert location
        item = StockItem.objects.create(part=part, location=location, quantity=1)

        project_a = Project.objects.create(
            name='Project A',
            start_date=date(2026, 3, 17),
            end_date=date(2026, 3, 18),
        )
        project_b = Project.objects.create(
            name='Project B',
            start_date=date(2026, 3, 18),
            end_date=date(2026, 3, 20),
        )

        ProjectInstrument.objects.create(project=project_a, stock_item=item, quantity=1)

        response = self.get(
            reverse('api-stock-list'),
            {'available': True, 'in_stock': True, 'project': project_b.pk},
            expected_code=200,
        )

        returned_ids = {row['pk'] for row in response.data}
        self.assertNotIn(item.pk, returned_ids)

    def test_project_instrument_selector_blocks_overlap_even_with_remaining_quantity(self):
        """Overlapping instrument assignment blocks the whole stock item, not just reserved quantity."""
        self.assignRole('project.view')
        self.assignRole('project.add')

        part = self._make_part(name='Selector Overlap Whole Item Part')
        location = StockLocation.objects.first()
        assert location
        item = StockItem.objects.create(part=part, location=location, quantity=5)

        project_a = Project.objects.create(
            name='Project A',
            start_date=date(2026, 3, 17),
            end_date=date(2026, 3, 18),
        )
        project_b = Project.objects.create(
            name='Project B',
            start_date=date(2026, 3, 18),
            end_date=date(2026, 3, 20),
        )

        ProjectInstrument.objects.create(project=project_a, stock_item=item, quantity=1)

        response = self.get(
            reverse('api-stock-list'),
            {'available': True, 'in_stock': True, 'project': project_b.pk},
            expected_code=200,
        )

        returned_ids = {row['pk'] for row in response.data}
        self.assertNotIn(item.pk, returned_ids)

    def test_project_instrument_selector_keeps_current_project_item_visible(self):
        """Editing a project still shows its own assigned instrument in the selector."""
        self.assignRole('project.view')
        self.assignRole('project.add')

        part = self._make_part(name='Selector Current Project Part')
        location = StockLocation.objects.first()
        assert location
        item = StockItem.objects.create(part=part, location=location, quantity=1)

        project = Project.objects.create(
            name='Editable Project',
            start_date=date(2026, 3, 19),
            end_date=date(2026, 3, 20),
        )

        ProjectInstrument.objects.create(project=project, stock_item=item, quantity=1)

        response = self.get(
            reverse('api-stock-list'),
            {'available': True, 'in_stock': True, 'project': project.pk},
            expected_code=200,
        )

        returned_ids = {row['pk'] for row in response.data}
        self.assertIn(item.pk, returned_ids)

    def _build_release_fixture(self):
        """Create project, stock and instrument rows for release tests."""
        project = Project.objects.create(name='Release Instrumentation')
        part = self._make_part(name='Release Part')
        location = StockLocation.objects.first()
        assert location

        item_1 = StockItem.objects.create(
            part=part,
            location=location,
            quantity=5,
            tracklet_status='IN_USE',
            status=StockStatus.ATTENTION.value,
        )
        item_2 = StockItem.objects.create(
            part=part,
            location=location,
            quantity=5,
            tracklet_status='IN_USE',
            status=StockStatus.DAMAGED.value,
        )
        item_3 = StockItem.objects.create(
            part=part,
            location=location,
            quantity=5,
            tracklet_status='IN_USE',
            status=StockStatus.OK.value,
        )

        instrument_1 = ProjectInstrument.objects.create(
            project=project,
            stock_item=item_1,
            quantity=5,
        )
        instrument_2 = ProjectInstrument.objects.create(
            project=project,
            stock_item=item_2,
            quantity=5,
        )
        instrument_3 = ProjectInstrument.objects.create(
            project=project,
            stock_item=item_3,
            quantity=5,
        )

        ProjectStockAllocation.objects.create(
            project=project,
            stock_item=item_1,
            quantity=5,
        )
        ProjectStockAllocation.objects.create(
            project=project,
            stock_item=item_2,
            quantity=5,
        )

        return project, part, (item_1, item_2, item_3), (
            instrument_1,
            instrument_2,
            instrument_3,
        )

    def test_release_instruments_in_stock_reason(self):
        """Release with IN_STOCK reason resets tracklet status to IN_STOCK."""
        self.assignRole('project.add')
        self.assignRole('project.delete')

        project, part, items, instruments = self._build_release_fixture()
        item_1, item_2, item_3 = items
        instrument_1, instrument_2, _ = instruments

        part.refresh_from_db()
        self.assertEqual(part.available_stock, 0)

        url = reverse('api-project-instrument-release', kwargs={'pk': project.pk})

        response = self.post(
            url,
            {
                'instrument_ids': [instrument_1.pk, instrument_2.pk],
                'release_status': 'RETURNED',
            },
            expected_code=200,
        )

        self.assertEqual(response.data['released_count'], 2)
        self.assertEqual(response.data['release_status'], 'RETURNED')
        self.assertEqual(response.data['new_tracklet_status'], 'IN_STOCK')
        self.assertEqual(
            set(response.data['instrument_ids']),
            {instrument_1.pk, instrument_2.pk},
        )
        self.assertEqual(
            set(response.data['stock_item_ids']),
            {item_1.pk, item_2.pk},
        )

        self.assertFalse(ProjectInstrument.objects.filter(pk=instrument_1.pk).exists())
        self.assertFalse(ProjectInstrument.objects.filter(pk=instrument_2.pk).exists())
        self.assertTrue(ProjectInstrument.objects.filter(project=project, stock_item=item_3).exists())

        self.assertFalse(
            ProjectStockAllocation.objects.filter(project=project, stock_item=item_1).exists()
        )
        self.assertFalse(
            ProjectStockAllocation.objects.filter(project=project, stock_item=item_2).exists()
        )

        item_1.refresh_from_db()
        item_2.refresh_from_db()
        item_3.refresh_from_db()

        self.assertEqual(item_1.tracklet_status, 'IN_STOCK')
        self.assertEqual(item_2.tracklet_status, 'IN_STOCK')
        self.assertEqual(item_1.status, StockStatus.OK.value)
        self.assertEqual(item_2.status, StockStatus.OK.value)
        self.assertEqual(item_3.tracklet_status, 'IN_USE')
        self.assertEqual(item_1.broken_quantity, 0)
        self.assertEqual(item_2.missing_quantity, 0)

        part.refresh_from_db()
        self.assertEqual(part.available_stock, 10)

    def test_release_instruments_broken_reason(self):
        """Release with BROKEN reason sets tracklet status to BROKEN."""
        self.assignRole('project.add')
        self.assignRole('project.delete')

        project, part, items, instruments = self._build_release_fixture()
        item_1, _, _ = items
        instrument_1, _, _ = instruments

        url = reverse('api-project-instrument-release', kwargs={'pk': project.pk})
        response = self.post(
            url,
            {'instrument_ids': [instrument_1.pk], 'release_status': 'BROKEN'},
            expected_code=200,
        )

        self.assertEqual(response.data['released_count'], 1)
        self.assertEqual(response.data['release_status'], 'BROKEN')
        self.assertEqual(response.data['new_tracklet_status'], 'BROKEN')

        self.assertFalse(ProjectInstrument.objects.filter(pk=instrument_1.pk).exists())
        self.assertFalse(
            ProjectStockAllocation.objects.filter(project=project, stock_item=item_1).exists()
        )

        item_1.refresh_from_db()
        self.assertEqual(item_1.tracklet_status, 'BROKEN')
        self.assertEqual(item_1.status, StockStatus.DAMAGED.value)
        self.assertEqual(item_1.broken_quantity, Decimal('5'))
        part.refresh_from_db()
        self.assertEqual(part.available_stock, 0)

    def test_release_instruments_missing_reason(self):
        """Release with MISSING reason sets tracklet status to MISSING."""
        self.assignRole('project.add')
        self.assignRole('project.delete')

        project, part, items, instruments = self._build_release_fixture()
        _, item_2, _ = items
        _, instrument_2, _ = instruments

        url = reverse('api-project-instrument-release', kwargs={'pk': project.pk})
        response = self.post(
            url,
            {'instrument_ids': [instrument_2.pk], 'release_status': 'MISSING'},
            expected_code=200,
        )

        self.assertEqual(response.data['released_count'], 1)
        self.assertEqual(response.data['release_status'], 'MISSING')
        self.assertEqual(response.data['new_tracklet_status'], 'MISSING')

        self.assertFalse(ProjectInstrument.objects.filter(pk=instrument_2.pk).exists())
        self.assertFalse(
            ProjectStockAllocation.objects.filter(project=project, stock_item=item_2).exists()
        )

        item_2.refresh_from_db()
        self.assertEqual(item_2.tracklet_status, 'MISSING')
        self.assertEqual(item_2.status, StockStatus.LOST.value)
        self.assertEqual(item_2.missing_quantity, Decimal('5'))
        part.refresh_from_db()
        self.assertEqual(part.available_stock, 0)

    def test_partial_release_instruments_returned_keeps_remaining_allocation(self):
        """Partial returned release only decrements the released quantity."""
        self.assignRole('project.add')
        self.assignRole('project.delete')

        project, _part, items, instruments = self._build_release_fixture()
        item_1, _, _ = items
        instrument_1, _, _ = instruments

        url = reverse('api-project-instrument-release', kwargs={'pk': project.pk})
        response = self.post(
            url,
            {
                'release_items': [
                    {'instrument_id': instrument_1.pk, 'quantity': 1},
                ],
                'release_status': 'RETURNED',
            },
            expected_code=200,
        )

        self.assertEqual(response.data['released_count'], 1)
        self.assertEqual(Decimal(str(response.data['released_quantity'])), Decimal('1'))

        instrument_1.refresh_from_db()
        self.assertEqual(instrument_1.quantity, Decimal('4'))

        allocation = ProjectStockAllocation.objects.get(
            project=project,
            stock_item=item_1,
        )
        self.assertEqual(allocation.quantity, Decimal('4'))

        item_1.refresh_from_db()
        self.assertEqual(item_1.tracklet_status, 'IN_USE')
        self.assertEqual(item_1.broken_quantity, 0)
        self.assertEqual(item_1.missing_quantity, 0)

    def test_partial_release_instruments_missing_only_marks_released_quantity(self):
        """Partial missing release increments missing quantity without consuming all stock."""
        self.assignRole('project.add')
        self.assignRole('project.delete')

        project, _part, items, instruments = self._build_release_fixture()
        _, item_2, _ = items
        _, instrument_2, _ = instruments

        url = reverse('api-project-instrument-release', kwargs={'pk': project.pk})
        self.post(
            url,
            {
                'release_items': [
                    {'instrument_id': instrument_2.pk, 'quantity': 1},
                ],
                'release_status': 'MISSING',
            },
            expected_code=200,
        )

        instrument_2.refresh_from_db()
        self.assertEqual(instrument_2.quantity, Decimal('4'))

        allocation = ProjectStockAllocation.objects.get(
            project=project,
            stock_item=item_2,
        )
        self.assertEqual(allocation.quantity, Decimal('4'))

        item_2.refresh_from_db()
        self.assertEqual(item_2.missing_quantity, Decimal('1'))
        self.assertEqual(item_2.broken_quantity, 0)
        self.assertEqual(item_2.tracklet_status, 'IN_USE')
        self.assertNotEqual(item_2.status, StockStatus.LOST.value)

    def test_partial_release_instruments_broken_only_marks_released_quantity(self):
        """Partial broken release increments broken quantity without consuming all stock."""
        self.assignRole('project.add')
        self.assignRole('project.delete')

        project, _part, items, instruments = self._build_release_fixture()
        item_1, _, _ = items
        instrument_1, _, _ = instruments

        url = reverse('api-project-instrument-release', kwargs={'pk': project.pk})
        self.post(
            url,
            {
                'release_items': [
                    {'instrument_id': instrument_1.pk, 'quantity': 2},
                ],
                'release_status': 'BROKEN',
            },
            expected_code=200,
        )

        instrument_1.refresh_from_db()
        self.assertEqual(instrument_1.quantity, Decimal('3'))

        allocation = ProjectStockAllocation.objects.get(
            project=project,
            stock_item=item_1,
        )
        self.assertEqual(allocation.quantity, Decimal('3'))

        item_1.refresh_from_db()
        self.assertEqual(item_1.broken_quantity, Decimal('2'))
        self.assertEqual(item_1.missing_quantity, 0)
        self.assertEqual(item_1.tracklet_status, 'IN_USE')
        self.assertNotEqual(item_1.status, StockStatus.DAMAGED.value)

    def test_release_instruments_without_allocation_uses_instrument_quantity(self):
        """Release succeeds for legacy instrument rows that have no allocation record."""
        self.assignRole('project.add')
        self.assignRole('project.delete')

        project, _part, items, instruments = self._build_release_fixture()
        item_1, _, _ = items
        instrument_1, _, _ = instruments

        ProjectStockAllocation.objects.filter(
            project=project,
            stock_item=item_1,
        ).delete()

        url = reverse('api-project-instrument-release', kwargs={'pk': project.pk})
        response = self.post(
            url,
            {
                'release_items': [
                    {'instrument_id': instrument_1.pk, 'quantity': 2},
                ],
                'release_status': 'RETURNED',
            },
            expected_code=200,
        )

        self.assertEqual(response.data['released_count'], 1)
        self.assertEqual(Decimal(str(response.data['released_quantity'])), Decimal('2'))

        instrument_1.refresh_from_db()
        self.assertEqual(instrument_1.quantity, Decimal('3'))
        self.assertFalse(
            ProjectStockAllocation.objects.filter(project=project, stock_item=item_1).exists()
        )

    def test_release_instruments_must_belong_to_project(self):
        """Release endpoint rejects instrument IDs from another project."""
        self.assignRole('project.add')
        self.assignRole('project.delete')

        project = Project.objects.create(name='Release Project')
        other_project = Project.objects.create(name='Other Project')

        part = self._make_part(name='Release Validation Part')
        location = StockLocation.objects.first()
        assert location

        item = StockItem.objects.create(part=part, location=location, quantity=1)
        other_instrument = ProjectInstrument.objects.create(
            project=other_project, stock_item=item, quantity=1
        )

        url = reverse('api-project-instrument-release', kwargs={'pk': project.pk})

        self.post(
            url,
            {'instrument_ids': [other_instrument.pk], 'release_status': 'RETURNED'},
            expected_code=400,
        )

    def test_release_instruments_rejects_past_project(self):
        """Release endpoint rejects edits for past projects."""
        self.assignRole('project.add')
        self.assignRole('project.delete')

        project = Project.objects.create(
            name='Past Release Project', status=ProjectStatus.PAST
        )
        part = self._make_part(name='Past Release Part')
        location = StockLocation.objects.first()
        assert location

        item = StockItem.objects.create(part=part, location=location, quantity=1)
        instrument = ProjectInstrument.objects.create(
            project=project, stock_item=item, quantity=1
        )

        url = reverse('api-project-instrument-release', kwargs={'pk': project.pk})

        self.post(
            url,
            {'instrument_ids': [instrument.pk], 'release_status': 'RETURNED'},
            expected_code=400,
        )

    def test_create_broken_report_attachment(self):
        """Generate and attach a broken report PDF to project."""
        self.assignRole('project.add')
        self.assignRole('project.change')

        project = Project.objects.create(name='Broken Report Project')
        part = self._make_part(name='Broken Report Instrument Part')
        location = StockLocation.objects.first()
        assert location
        item = StockItem.objects.create(part=part, location=location, quantity=1)
        instrument = ProjectInstrument.objects.create(
            project=project, stock_item=item, quantity=1
        )
        url = reverse('api-project-report-broken-create', kwargs={'pk': project.pk})

        response = self.post(
            url,
            {
                'title': 'Broken Camera Inventory Report',
                'items': [
                    {
                        'instrument_id': instrument.pk,
                        'note': 'Broken lens mount',
                    }
                ],
            },
            expected_code=201,
        )

        self.assertEqual(response.data['report_type'], 'BROKEN_INVENTORY')
        self.assertEqual(response.data['item_count'], 1)

        report = ProjectReport.objects.get(pk=response.data['pk'])
        self.assertEqual(report.project, project)
        self.assertIsNotNone(report.attachment)
        assert report.attachment is not None
        self.assertEqual(report.attachment.model_type, 'project')
        self.assertEqual(report.attachment.model_id, project.pk)
        self.assertTrue(Attachment.objects.filter(pk=report.attachment.pk).exists())

    def test_create_broken_report_manual_form_payload(self):
        """Manual payload (no instruments/items) generates a single report row."""
        self.assignRole('project.add')
        self.assignRole('project.change')

        location = StockLocation.objects.first()
        assert location
        project = Project.objects.create(name='Manual Broken Report Project', location=location)
        url = reverse('api-project-report-broken-create', kwargs={'pk': project.pk})

        response = self.post(
            url,
            {
                'report_type': 'BROKEN',
                'title': 'Manual Broken Report',
                'part_name': 'Camera Body',
                'notes': 'Broken mount screws',
            },
            expected_code=201,
        )

        self.assertEqual(response.data['report_type'], 'BROKEN_INVENTORY')
        self.assertEqual(response.data['item_count'], 1)

        report = ProjectReport.objects.get(pk=response.data['pk'])
        item = report.items.first()
        assert item is not None
        self.assertEqual(item.instrument_id, None)
        self.assertEqual(item.model, 'Camera Body')
        self.assertEqual(item.type, 'BROKEN')
        self.assertEqual(item.note, 'Broken mount screws')
        self.assertEqual(item.located, location.pathstring)

    def test_create_broken_report_multiple_manual_items(self):
        """Multiple manual payload rows generate matching report item rows."""
        self.assignRole('project.add')
        self.assignRole('project.change')

        project = Project.objects.create(name='Multi Row Broken Report')
        url = reverse('api-project-report-broken-create', kwargs={'pk': project.pk})

        response = self.post(
            url,
            {
                'report_title': 'Multi Row Report',
                'report_type': 'BROKEN',
                'items': [
                    {'part_name': 'Camera A', 'quantity': 2, 'notes': 'Lens issue'},
                    {'part_name': 'Camera B', 'quantity': 1, 'notes': 'Battery issue'},
                    {'part_name': 'Tripod', 'quantity': 3, 'notes': ''},
                ],
            },
            expected_code=201,
        )

        self.assertEqual(response.data['item_count'], 3)

        report = ProjectReport.objects.get(pk=response.data['pk'])
        rows = list(report.items.order_by('pk').values('model', 'quantity', 'note'))
        self.assertEqual(
            rows,
            [
                {'model': 'Camera A', 'quantity': 2, 'note': 'Lens issue'},
                {'model': 'Camera B', 'quantity': 1, 'note': 'Battery issue'},
                {'model': 'Tripod', 'quantity': 3, 'note': ''},
            ],
        )

    def test_create_broken_report_uses_existing_report_items(self):
        """PDF generation uses existing ProjectReportItem rows for this report."""
        self.assignRole('project.add')
        self.assignRole('project.change')

        project = Project.objects.create(name='Broken Report Existing Items Project')
        part = self._make_part(name='Broken Existing Items Instrument Part')
        location = StockLocation.objects.first()
        assert location

        item_1 = StockItem.objects.create(part=part, location=location, quantity=1)
        item_2 = StockItem.objects.create(part=part, location=location, quantity=1)

        instrument_1 = ProjectInstrument.objects.create(
            project=project, stock_item=item_1, quantity=1
        )
        instrument_2 = ProjectInstrument.objects.create(
            project=project, stock_item=item_2, quantity=1
        )

        report = ProjectReport.objects.create(project=project)
        report.items.create(instrument=instrument_1, note='Broken row 1')
        report.items.create(instrument=instrument_2, note='Broken row 2')

        url = reverse('api-project-report-broken-create', kwargs={'pk': project.pk})

        response = self.post(
            url,
            {
                'title': 'Broken Items Inventory Report',
            },
            expected_code=201,
        )

        self.assertEqual(response.data['report_type'], 'BROKEN_INVENTORY')
        self.assertEqual(response.data['item_count'], 2)

        report.refresh_from_db()
        self.assertIsNotNone(report.attachment)

    def test_project_report_singleton_get_and_post(self):
        """Singleton report endpoint auto-creates and POST is idempotent."""
        self.assignRole('project.view')
        self.assignRole('project.add')
        self.assignRole('project.change')

        project = Project.objects.create(name='Singleton Report Project')
        get_url = reverse('api-project-report-singleton', kwargs={'pk': project.pk})

        response_get = self.get(get_url, expected_code=200)
        self.assertEqual(response_get.data['project'], project.pk)
        self.assertEqual(ProjectReport.objects.filter(project=project).count(), 1)

        first_pk = response_get.data['pk']

        response_post = self.post(get_url, {}, expected_code=200)
        self.assertEqual(response_post.data['pk'], first_pk)
        self.assertEqual(ProjectReport.objects.filter(project=project).count(), 1)

    def test_project_report_list_compatibility(self):
        """Compatibility /reports/ endpoint returns list and does not recurse."""
        self.assignRole('project.view')

        project = Project.objects.create(name='Report Compatibility Project')
        url = reverse('api-project-report-list', kwargs={'pk': project.pk})

        response = self.get(url, expected_code=200)
        self.assertTrue(isinstance(response.data, list))

    def test_project_report_item_crud(self):
        """CRUD operations for singleton report items."""
        self.assignRole('project.view')
        self.assignRole('project.add')
        self.assignRole('project.change')
        self.assignRole('project.delete')

        project = Project.objects.create(name='Report Item CRUD Project')
        part = self._make_part(name='Report Item CRUD Instrument Part')
        location = StockLocation.objects.first()
        assert location
        stock_item = StockItem.objects.create(part=part, location=location, quantity=1)
        instrument = ProjectInstrument.objects.create(
            project=project,
            stock_item=stock_item,
            quantity=1,
        )
        list_url = reverse('api-project-report-item-list', kwargs={'pk': project.pk})

        response_create = self.post(
            list_url,
            {
                'instrument_id': instrument.pk,
                'note': 'Test note',
            },
            expected_code=201,
        )

        item_pk = response_create.data['pk']
        report = ProjectReport.objects.get(project=project)

        response_list = self.get(list_url, expected_code=200)
        self.assertEqual(len(response_list.data), 1)
        self.assertEqual(response_list.data[0]['report'], report.pk)
        self.assertEqual(response_list.data[0]['instrument_id'], instrument.pk)

        detail_url = reverse(
            'api-project-report-item-detail',
            kwargs={'pk': project.pk, 'item_pk': item_pk},
        )

        self.patch(detail_url, {'note': 'Updated note'}, expected_code=200)
        self.delete(detail_url, expected_code=204)
        self.assertFalse(report.items.filter(pk=item_pk).exists())

    def test_project_instrument_list_has_display_label(self):
        """Project instrumentation list exposes label/display fields for dropdowns."""
        self.assignRole('project.view')

        project = Project.objects.create(name='Instrument Label Project')
        part = self._make_part(name='Display Label Part')
        location = StockLocation.objects.first()
        assert location
        stock_item = StockItem.objects.create(
            part=part, location=location, quantity=1, serial='LBL-001'
        )
        ProjectInstrument.objects.create(project=project, stock_item=stock_item, quantity=1)

        url = reverse('api-project-instrument-list-by-project', kwargs={'pk': project.pk})
        response = self.get(url, expected_code=200)

        record = response.data[0]
        self.assertTrue(record['instrument_display_name'])
        self.assertEqual(record['display_name'], record['instrument_display_name'])
        self.assertEqual(record['label'], record['instrument_display_name'])

    def test_project_report_item_rejects_instrument_from_other_project(self):
        """Report item creation rejects instrument not linked to URL project."""
        self.assignRole('project.add')
        self.assignRole('project.change')

        project = Project.objects.create(name='Project A')
        other_project = Project.objects.create(name='Project B')
        part = self._make_part(name='Report Scope Part')
        location = StockLocation.objects.first()
        assert location
        stock_item = StockItem.objects.create(part=part, location=location, quantity=1)
        foreign_instrument = ProjectInstrument.objects.create(
            project=other_project,
            stock_item=stock_item,
            quantity=1,
        )

        list_url = reverse('api-project-report-item-list', kwargs={'pk': project.pk})
        self.post(
            list_url,
            {'instrument_id': foreign_instrument.pk, 'note': 'Should fail'},
            expected_code=400,
        )

    def test_project_report_item_backfill_maps_by_serial(self):
        """Migration backfill maps legacy report row to project instrument by serial."""
        self.assignRole('project.add')

        project = Project.objects.create(name='Backfill Project')
        part = self._make_part(name='Backfill Part')
        location = StockLocation.objects.first()
        assert location
        stock_item = StockItem.objects.create(
            part=part,
            location=location,
            quantity=1,
            serial='SER-BACKFILL-1',
        )
        instrument = ProjectInstrument.objects.create(
            project=project,
            stock_item=stock_item,
            quantity=1,
        )
        report = ProjectReport.objects.create(project=project)
        item = report.items.create(
            manufacture='',
            model='',
            sn='SER-BACKFILL-1',
            type='',
            specification='',
            note='legacy row',
            located='',
            instrument=None,
        )

        migration_module = import_module(
            'projects.migrations.0006_projectreportitem_instrument_fk'
        )
        migration_module.backfill_project_report_item_instrument(django_apps, None)

        item.refresh_from_db()
        self.assertEqual(item.instrument_id, instrument.pk)

    def test_project_dashboard_payload(self):
        """Dashboard endpoint returns aggregated operations data."""
        self.assignRole('project.view')
        self.assignRole('project.add')

        today = date.today()
        location_a = StockLocation.objects.first()
        assert location_a

        location_b = StockLocation.objects.exclude(pk=location_a.pk).first()
        if location_b is None:
            location_b = StockLocation.objects.create(name='CWB')

        part_probe = self._make_part(name='Wave Probe')
        extra_category = PartCategory.objects.create(name='Optics')
        part_camera = Part.objects.create(name='Camera', category=extra_category)
        part_probe.category.requires_calibration = True
        part_probe.category.calibration_interval_days = 365
        part_probe.category.save()
        extra_category.requires_calibration = True
        extra_category.calibration_interval_days = 365
        extra_category.save()

        reserved_item = StockItem.objects.create(
            part=part_probe,
            location=location_a,
            quantity=3,
            last_calibration_date=today - timedelta(days=360),
        )
        calibration_overdue_item = StockItem.objects.create(
            part=part_camera,
            location=location_b,
            quantity=2,
            last_calibration_date=today - timedelta(days=400),
        )
        low_stock_item = StockItem.objects.create(
            part=part_camera,
            location=location_a,
            quantity=1,
        )
        broken_item = StockItem.objects.create(
            part=part_probe,
            location=location_b,
            quantity=1,
            tracklet_status='BROKEN',
        )
        partial_issue_item = StockItem.objects.create(
            part=part_probe,
            location=location_a,
            quantity=5,
            broken_quantity=2,
            missing_quantity=2,
            tracklet_status='IN_STOCK',
        )

        # Make one item clearly the most recent record.
        StockItem.objects.filter(pk=low_stock_item.pk).update(
            created=low_stock_item.created + timedelta(days=1)
        )
        low_stock_item.refresh_from_db()

        upcoming_project = Project.objects.create(
            name='Tow Tank Campaign',
            status=ProjectStatus.FUTURE,
            start_date=today + timedelta(days=2),
            end_date=today + timedelta(days=6),
            location=location_a,
        )
        later_project = Project.objects.create(
            name='Camera Validation',
            status=ProjectStatus.FUTURE,
            start_date=today + timedelta(days=5),
            end_date=today + timedelta(days=9),
            location=location_b,
        )
        Project.objects.create(
            name='Archived Campaign',
            status=ProjectStatus.PAST,
            start_date=today - timedelta(days=10),
            end_date=today - timedelta(days=2),
        )

        ProjectInstrument.objects.create(
            project=upcoming_project,
            stock_item=reserved_item,
            quantity=1,
        )
        ProjectInstrument.objects.create(
            project=later_project,
            stock_item=calibration_overdue_item,
            quantity=1,
        )
        ProjectStockAllocation.objects.create(
            project=upcoming_project,
            stock_item=reserved_item,
            quantity=1,
        )

        reserved_item.refresh_from_db()

        response = self.get(reverse('api-project-dashboard'), expected_code=200)
        data = response.data

        self.assertEqual(data['thresholds']['low_stock'], 1)
        self.assertGreaterEqual(data['summary']['total_stock_items'], 4)
        self.assertGreaterEqual(data['summary']['available_equipment'], 1)
        self.assertGreaterEqual(data['summary']['reserved_equipment'], 1)
        self.assertEqual(data['summary']['broken_items'], 2)
        self.assertEqual(data['summary']['missing_items'], 2)
        self.assertGreaterEqual(data['summary']['out_of_service'], 1)

        self.assertEqual(data['upcoming_projects'][0]['name'], 'Tow Tank Campaign')
        self.assertEqual(data['upcoming_projects'][1]['name'], 'Camera Validation')

        reserved_names = {entry['item_name'] for entry in data['reserved_equipment_soon']}
        self.assertIn(reserved_item.part.full_name, reserved_names)

        calibration_rows = {
            entry['stock_item']: entry for entry in data['calibration_due']
        }
        due_soon_entry = calibration_rows[reserved_item.pk]
        self.assertEqual(due_soon_entry['status'], 'due_soon')
        self.assertEqual(due_soon_entry['stock_item'], reserved_item.pk)
        self.assertEqual(
            calibration_rows[calibration_overdue_item.pk]['status'],
            'overdue',
        )

        location_rows = {entry['label']: entry['value'] for entry in data['stock_by_location']}
        self.assertGreaterEqual(location_rows[location_a.name], 2)
        self.assertGreaterEqual(location_rows[location_b.name], 2)

        category_rows = {
            entry['label']: entry['value'] for entry in data['category_distribution']
        }
        self.assertGreaterEqual(category_rows[part_probe.category.name], 2)
        self.assertGreaterEqual(category_rows[part_camera.category.name], 2)

        self.assertEqual(data['recently_added_equipment'][0]['stock_item'], low_stock_item.pk)

        low_stock_rows = {
            entry['stock_item']: entry for entry in data['low_stock_warning']
        }
        self.assertIn(low_stock_item.pk, low_stock_rows)
        self.assertEqual(str(low_stock_rows[low_stock_item.pk]['available_quantity']), '1.000000')

        usage_rows = {entry['stock_item']: entry for entry in data['most_used_equipment']}
        self.assertIn(reserved_item.pk, usage_rows)
        self.assertEqual(usage_rows[reserved_item.pk]['usage_count'], 2)
