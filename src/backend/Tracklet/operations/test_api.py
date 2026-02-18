"""API tests for operations app."""

from datetime import timedelta

from django.urls import reverse
from django.utils import timezone

from Tracklet.unit_test import InvenTreeAPITestCase
from company.models import Company
from part.models import Part, PartCategory

from .models import (
    Event,
    EventFurnitureAssignment,
    EventType,
    Planner,
    RentalAsset,
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
            name='Tables',
            parent=rentals_category,
        )
        cls.rental_part = Part.objects.create(
            name='Round Table',
            IPN='RENTAL-0001',
            category=tables_category,
        )
        cls.asset = RentalAsset.objects.create(name='Speaker Set', asset_tag='SPK-01')

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
            expected_code=200,
        )
        self.assertTrue(second_response.data['updated_existing'])

        response = self.get(list_url, {'event': event.pk, 'in_use': True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(
            response.data['results'][0]['event_detail']['reference'],
            event.reference,
        )

        active_response = self.get(list_url, {'part': self.rental_part.pk, 'active': True})
        self.assertEqual(active_response.status_code, 200)
        self.assertEqual(active_response.data['count'], 1)

        assignment = EventFurnitureAssignment.objects.get(event=event, part=self.rental_part)
        self.assertEqual(assignment.quantity, 15)
        self.assertEqual(assignment.status, 20)
        self.assertEqual(
            assignment.notes,
            'Main hall guest seating\nAdditional seating',
        )

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
            {
                'order': second_order.data['pk'],
                'asset': self.asset.pk,
                'quantity': 1,
            },
            expected_code=400,
        )

        self.assertEqual(RentalOrder.objects.count(), 2)
        self.assertEqual(RentalLineItem.objects.count(), 1)
