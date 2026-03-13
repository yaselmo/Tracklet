"""API tests for operations app."""

from datetime import datetime, timedelta, timezone as dt_timezone

from django.urls import reverse
from django.utils import timezone

from company.models import Company
from part.models import Part, PartCategory
from stock.models import StockItem
from Tracklet.unit_test import InvenTreeAPITestCase

from .models import (
    Event,
    EventFurnitureAssignment,
    EventType,
    Planner,
    RentalLineItem,
    RentalOrder,
    Venue,
)


class OperationsApiTest(InvenTreeAPITestCase):
    fixtures = ['company']

    roles = [
        'sales_order.view',
        'sales_order.add',
        'sales_order.change',
        'sales_order.delete',
    ]

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()

        cls.event_type = EventType.objects.create(name='Conference')
        cls.venue = Venue.objects.create(name='Main Hall')
        cls.planner = Planner.objects.create(name='Alice Planner')
        rentals_category = PartCategory.objects.create(name='Rentals')
        tables_category = PartCategory.objects.create(
            name='Tables', parent=rentals_category
        )
        cls.rental_part = Part.objects.create(
            name='Round Table', IPN='RENTAL-0001', category=tables_category
        )
        cls.asset = StockItem.objects.create(
            part=cls.rental_part, quantity=5, title='Speaker Set'
        )

    def test_event_list_and_create(self):
        list_url = reverse('api-tracklet-event-list')

        response = self.get(list_url)
        self.assertEqual(response.status_code, 200)

        payload = {
            'title': 'Tech Expo',
            'event_type': self.event_type.pk,
            'venue': self.venue.pk,
            'planner': self.planner.pk,
            'start_datetime': '2026-04-10T09:00:00Z',
            'end_datetime': '2026-04-10T18:00:00Z',
            'late_night_takedown': True,
            'status': 20,
            'notes': 'Main event day',
        }

        response = self.post(list_url, payload, expected_code=201)

        self.assertTrue(response.data['reference'].startswith('EV'))
        self.assertEqual(response.data['title'], payload['title'])

        event = Event.objects.get(pk=response.data['pk'])
        self.assertEqual(event.venue.pk, self.venue.pk)

    def test_event_furniture_assignment_create_and_filter(self):
        start = timezone.now() + timedelta(days=30)
        end = start + timedelta(hours=12)

        event = Event.objects.create(
            title='Furniture Setup Test',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=start,
            end_datetime=end,
            status=20,
        )

        list_url = reverse('api-tracklet-event-furniture-list')

        self.post(
            list_url,
            {
                'event': event.pk,
                'part': self.rental_part.pk,
                'quantity': 12,
                'status': 10,
                'notes': 'Main hall guest seating',
            },
            expected_code=201,
        )

        second_response = self.post(
            list_url,
            {
                'event': event.pk,
                'part': self.rental_part.pk,
                'quantity': 3,
                'status': 20,
                'notes': 'Additional seating',
            },
            expected_code=201,
        )
        self.assertFalse(second_response.data['updated_existing'])

        response = self.get(list_url, {'event': event.pk, 'in_use': True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 2)
        self.assertEqual(
            response.data['results'][0]['event_detail']['reference'], event.reference
        )

        active_response = self.get(
            list_url, {'part': self.rental_part.pk, 'active': True}
        )
        self.assertEqual(active_response.status_code, 200)
        self.assertEqual(active_response.data['count'], 2)
        self.assertEqual(
            EventFurnitureAssignment.objects.filter(
                event=event, part=self.rental_part
            ).count(),
            2,
        )

    def test_event_furniture_same_day_non_overlapping_allowed(self):
        base = timezone.now() + timedelta(days=7)

        event_a = Event.objects.create(
            title='Morning Event',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=base.replace(hour=8, minute=0, second=0, microsecond=0),
            end_datetime=base.replace(hour=10, minute=0, second=0, microsecond=0),
            status=20,
        )
        event_b = Event.objects.create(
            title='Afternoon Event',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=base.replace(hour=14, minute=0, second=0, microsecond=0),
            end_datetime=base.replace(hour=16, minute=0, second=0, microsecond=0),
            status=20,
        )

        list_url = reverse('api-tracklet-event-furniture-list')

        self.post(
            list_url,
            {
                'event': event_a.pk,
                'part': self.rental_part.pk,
                'quantity': 1,
                'status': 10,
            },
            expected_code=201,
        )
        self.post(
            list_url,
            {
                'event': event_b.pk,
                'part': self.rental_part.pk,
                'quantity': 1,
                'status': 10,
            },
            expected_code=201,
        )

        self.assertEqual(
            EventFurnitureAssignment.objects.filter(part=self.rental_part).count(), 2
        )

    def test_event_furniture_overlapping_events_blocked(self):
        start = timezone.now() + timedelta(days=10)
        end = start + timedelta(hours=4)

        event_a = Event.objects.create(
            title='Overlap A',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=start,
            end_datetime=end,
            status=20,
        )
        event_b = Event.objects.create(
            title='Overlap B',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=start + timedelta(hours=1),
            end_datetime=end + timedelta(hours=1),
            status=20,
        )

        list_url = reverse('api-tracklet-event-furniture-list')

        self.post(
            list_url,
            {
                'event': event_a.pk,
                'part': self.rental_part.pk,
                'quantity': 1,
                'status': 10,
            },
            expected_code=201,
        )
        self.post(
            list_url,
            {
                'event': event_b.pk,
                'part': self.rental_part.pk,
                'quantity': 1,
                'status': 10,
            },
            expected_code=400,
        )

        self.assertEqual(
            EventFurnitureAssignment.objects.filter(part=self.rental_part).count(), 1
        )

    def test_event_furniture_update_excludes_self_from_overlap(self):
        start = timezone.now() + timedelta(days=12)
        end = start + timedelta(hours=3)

        event = Event.objects.create(
            title='Self Update Event',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=start,
            end_datetime=end,
            status=20,
        )

        assignment = EventFurnitureAssignment.objects.create(
            event=event,
            part=self.rental_part,
            quantity=1,
            status=10,
            checked_out_at=start,
            checked_in_at=end,
        )

        detail_url = reverse(
            'api-tracklet-event-furniture-detail', kwargs={'pk': assignment.pk}
        )

        self.patch(
            detail_url,
            {
                'quantity': 2,
                'checked_out_at': (start + timedelta(minutes=15)).isoformat(),
                'checked_in_at': (end + timedelta(minutes=15)).isoformat(),
            },
            expected_code=200,
        )

        assignment.refresh_from_db()
        self.assertEqual(assignment.quantity, 2)

    def test_event_furniture_boundary_touching_ranges_allowed(self):
        start = timezone.now() + timedelta(days=15)

        event_a = Event.objects.create(
            title='Boundary A',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=start,
            end_datetime=start + timedelta(hours=2),
            status=20,
        )
        event_b = Event.objects.create(
            title='Boundary B',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=start + timedelta(hours=2),
            end_datetime=start + timedelta(hours=4),
            status=20,
        )

        list_url = reverse('api-tracklet-event-furniture-list')

        self.post(
            list_url,
            {
                'event': event_a.pk,
                'part': self.rental_part.pk,
                'quantity': 1,
                'status': 10,
            },
            expected_code=201,
        )

        self.post(
            list_url,
            {
                'event': event_b.pk,
                'part': self.rental_part.pk,
                'quantity': 1,
                'status': 10,
            },
            expected_code=201,
        )

    def test_event_furniture_feb_to_march_non_overlapping_allowed(self):
        event_old = Event.objects.create(
            title='Feb Reservation',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=datetime(2026, 2, 27, 9, 0, tzinfo=dt_timezone.utc),
            end_datetime=datetime(2026, 2, 28, 18, 0, tzinfo=dt_timezone.utc),
            status=20,
        )
        event_new = Event.objects.create(
            title='March Reservation',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=datetime(2026, 3, 19, 9, 0, tzinfo=dt_timezone.utc),
            end_datetime=datetime(2026, 3, 27, 18, 0, tzinfo=dt_timezone.utc),
            status=20,
        )

        list_url = reverse('api-tracklet-event-furniture-list')

        self.post(
            list_url,
            {
                'event': event_old.pk,
                'part': self.rental_part.pk,
                'quantity': 1,
                'status': 10,
                'checked_out_at': '2026-02-27T09:00:00Z',
                'checked_in_at': '2026-02-28T18:00:00Z',
            },
            expected_code=201,
        )

        self.post(
            list_url,
            {
                'event': event_new.pk,
                'part': self.rental_part.pk,
                'quantity': 1,
                'status': 10,
                'checked_out_at': '2026-03-19T09:00:00Z',
                'checked_in_at': '2026-03-27T18:00:00Z',
            },
            expected_code=201,
        )

    def test_event_furniture_march_overlap_blocked(self):
        event_existing = Event.objects.create(
            title='Existing March Reservation',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=datetime(2026, 3, 20, 9, 0, tzinfo=dt_timezone.utc),
            end_datetime=datetime(2026, 3, 22, 18, 0, tzinfo=dt_timezone.utc),
            status=20,
        )
        event_new = Event.objects.create(
            title='New March Reservation',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=datetime(2026, 3, 19, 9, 0, tzinfo=dt_timezone.utc),
            end_datetime=datetime(2026, 3, 27, 18, 0, tzinfo=dt_timezone.utc),
            status=20,
        )

        list_url = reverse('api-tracklet-event-furniture-list')

        self.post(
            list_url,
            {
                'event': event_existing.pk,
                'part': self.rental_part.pk,
                'quantity': 1,
                'status': 10,
                'checked_out_at': '2026-03-20T09:00:00Z',
                'checked_in_at': '2026-03-22T18:00:00Z',
            },
            expected_code=201,
        )

        self.post(
            list_url,
            {
                'event': event_new.pk,
                'part': self.rental_part.pk,
                'quantity': 1,
                'status': 10,
                'checked_out_at': '2026-03-19T09:00:00Z',
                'checked_in_at': '2026-03-27T18:00:00Z',
            },
            expected_code=400,
        )

    def test_event_furniture_exact_boundary_from_datetimes_allowed(self):
        event_existing = Event.objects.create(
            title='Boundary Existing',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=datetime(2026, 3, 20, 9, 0, tzinfo=dt_timezone.utc),
            end_datetime=datetime(2026, 3, 21, 9, 0, tzinfo=dt_timezone.utc),
            status=20,
        )
        event_new = Event.objects.create(
            title='Boundary New',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=datetime(2026, 3, 21, 9, 0, tzinfo=dt_timezone.utc),
            end_datetime=datetime(2026, 3, 22, 9, 0, tzinfo=dt_timezone.utc),
            status=20,
        )

        list_url = reverse('api-tracklet-event-furniture-list')

        self.post(
            list_url,
            {
                'event': event_existing.pk,
                'part': self.rental_part.pk,
                'quantity': 1,
                'status': 10,
                'checked_out_at': '2026-03-20T09:00:00Z',
                'checked_in_at': '2026-03-21T09:00:00Z',
            },
            expected_code=201,
        )

        self.post(
            list_url,
            {
                'event': event_new.pk,
                'part': self.rental_part.pk,
                'quantity': 1,
                'status': 10,
                'checked_out_at': '2026-03-21T09:00:00Z',
                'checked_in_at': '2026-03-22T09:00:00Z',
            },
            expected_code=201,
        )

    def test_event_furniture_update_same_assignment_no_self_conflict(self):
        event = Event.objects.create(
            title='Self Conflict Guard',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=datetime(2026, 3, 19, 9, 0, tzinfo=dt_timezone.utc),
            end_datetime=datetime(2026, 3, 27, 18, 0, tzinfo=dt_timezone.utc),
            status=20,
        )

        assignment = EventFurnitureAssignment.objects.create(
            event=event,
            part=self.rental_part,
            quantity=1,
            status=10,
            checked_out_at=datetime(2026, 3, 19, 9, 0, tzinfo=dt_timezone.utc),
            checked_in_at=datetime(2026, 3, 27, 18, 0, tzinfo=dt_timezone.utc),
        )

        detail_url = reverse(
            'api-tracklet-event-furniture-detail', kwargs={'pk': assignment.pk}
        )

        self.patch(
            detail_url,
            {
                'checked_out_at': '2026-03-19T10:00:00Z',
                'checked_in_at': '2026-03-27T19:00:00Z',
                'quantity': 2,
            },
            expected_code=200,
        )

    def test_event_furniture_reservation_state_filter(self):
        now = timezone.now()

        upcoming_event = Event.objects.create(
            title='Upcoming Reservation Event',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=now + timedelta(days=3),
            end_datetime=now + timedelta(days=4),
            status=20,
        )
        past_event = Event.objects.create(
            title='Past Reservation Event',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=now - timedelta(days=4),
            end_datetime=now - timedelta(days=3),
            status=20,
        )

        list_url = reverse('api-tracklet-event-furniture-list')

        self.post(
            list_url,
            {
                'event': upcoming_event.pk,
                'part': self.rental_part.pk,
                'quantity': 1,
                'status': 10,
            },
            expected_code=201,
        )
        self.post(
            list_url,
            {
                'event': past_event.pk,
                'part': self.rental_part.pk,
                'quantity': 1,
                'status': 10,
            },
            expected_code=201,
        )

        upcoming_response = self.get(
            list_url, {'part': self.rental_part.pk, 'reservation_state': 'upcoming'}
        )
        self.assertEqual(upcoming_response.status_code, 200)
        self.assertEqual(upcoming_response.data['count'], 1)

        past_response = self.get(
            list_url, {'part': self.rental_part.pk, 'reservation_state': 'past'}
        )
        self.assertEqual(past_response.status_code, 200)
        self.assertEqual(past_response.data['count'], 1)

    def test_stock_availability_reflects_active_event_reservations(self):
        now = timezone.now()
        event = Event.objects.create(
            title='Stock Availability Event',
            event_type=self.event_type,
            venue=self.venue,
            planner=self.planner,
            start_datetime=now - timedelta(hours=1),
            end_datetime=now + timedelta(hours=1),
            status=20,
        )

        item = StockItem.objects.create(part=self.rental_part, quantity=1)

        list_url = reverse('api-tracklet-event-furniture-list')
        stock_url = reverse('api-stock-detail', kwargs={'pk': item.pk})

        before = self.get(stock_url)
        self.assertEqual(before.status_code, 200)
        self.assertEqual(before.data['availability'], 'AVAILABLE')

        self.post(
            list_url,
            {
                'event': event.pk,
                'part': self.rental_part.pk,
                'quantity': 1,
                'status': 10,
                'checked_out_at': (now - timedelta(minutes=30)).isoformat(),
                'checked_in_at': (now + timedelta(minutes=30)).isoformat(),
            },
            expected_code=201,
        )

        during = self.get(stock_url)
        self.assertEqual(during.status_code, 200)
        self.assertEqual(during.data['availability'], 'RESERVED')

        assignment = EventFurnitureAssignment.objects.filter(
            event=event, part=self.rental_part
        ).first()
        assignment.status = 30
        assignment.save()

        after = self.get(stock_url)
        self.assertEqual(after.status_code, 200)
        self.assertEqual(after.data['availability'], 'AVAILABLE')

    def test_rental_order_create_and_line_validation(self):
        customer = Company.objects.filter(is_customer=True).first()
        self.assertIsNotNone(customer)

        order_url = reverse('api-tracklet-rental-order-list')
        line_url = reverse('api-tracklet-rental-line-list')

        response = self.post(
            order_url,
            {
                'customer': customer.pk,
                'rental_start': '2026-05-01T09:00:00Z',
                'rental_end': '2026-05-05T09:00:00Z',
                'status': 20,
                'notes': 'Projector and speakers',
            },
            expected_code=201,
        )

        order_pk = response.data['pk']

        self.post(
            line_url,
            {
                'order': order_pk,
                'asset': self.asset.pk,
                'quantity': 1,
                'notes': 'Primary speaker set',
            },
            expected_code=201,
        )

        second_order = self.post(
            order_url,
            {
                'customer': customer.pk,
                'rental_start': '2026-05-03T10:00:00Z',
                'rental_end': '2026-05-06T09:00:00Z',
                'status': 20,
            },
            expected_code=201,
        )

        self.post(
            line_url,
            {'order': second_order.data['pk'], 'asset': self.asset.pk, 'quantity': 1},
            expected_code=400,
        )

        self.assertEqual(RentalOrder.objects.count(), 2)
        self.assertEqual(RentalLineItem.objects.count(), 1)

    def test_stock_availability_reflects_active_rental_line(self):
        customer = Company.objects.filter(is_customer=True).first()
        self.assertIsNotNone(customer)

        order_url = reverse('api-tracklet-rental-order-list')
        line_url = reverse('api-tracklet-rental-line-list')
        stock_url = reverse('api-stock-detail', kwargs={'pk': self.asset.pk})

        before = self.get(stock_url)
        self.assertEqual(before.status_code, 200)
        self.assertEqual(before.data['availability'], 'AVAILABLE')

        now = timezone.now()
        order = self.post(
            order_url,
            {
                'customer': customer.pk,
                'rental_start': (now - timedelta(hours=1)).isoformat(),
                'rental_end': (now + timedelta(hours=1)).isoformat(),
                'status': 20,
            },
            expected_code=201,
        )

        self.post(
            line_url,
            {
                'order': order.data['pk'],
                'asset': self.asset.pk,
                'quantity': 1,
            },
            expected_code=201,
        )

        during = self.get(stock_url)
        self.assertEqual(during.status_code, 200)
        self.assertEqual(during.data['availability'], 'IN_USE')

        self.patch(
            reverse('api-tracklet-rental-order-detail', kwargs={'pk': order.data['pk']}),
            {'status': 40},
            expected_code=200,
        )

        after = self.get(stock_url)
        self.assertEqual(after.status_code, 200)
        self.assertEqual(after.data['availability'], 'AVAILABLE')
