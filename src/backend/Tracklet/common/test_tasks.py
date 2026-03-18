"""Tests for tasks in app common."""

from unittest import mock

from django.conf import settings
from django.test import TestCase

from common.models import NewsFeedEntry, NotificationEntry
from Tracklet.tasks import offload_task

from . import tasks as common_tasks


class TaskTest(TestCase):
    """Tests for common tasks."""

    def test_delete(self):
        """Test that the task `delete_old_notifications` runs through without errors."""
        # check empty run
        self.assertEqual(NotificationEntry.objects.all().count(), 0)
        offload_task(common_tasks.delete_old_notifications)


class NewsFeedTests(TestCase):
    """Tests for update_news_feed task.

    Tests cover different networking and addressing possibilities.
    """

    def setUp(self):
        """Setup for tests."""
        # Needs to be set to allow SQLite to store entries
        settings.USE_TZ = True

        # Store setting to restore on teardown
        self.news_url = settings.INVENTREE_NEWS_URL

        NewsFeedEntry.objects.all().delete()

    def tearDown(self):
        """Teardown for tests."""
        # Restore proper setting
        settings.INVENTREE_NEWS_URL = self.news_url

        NewsFeedEntry.objects.all().delete()

    def test_valid_url(self):
        """Tests that news feed is updated when accessing a valid URL."""
        # Use a fake URL and mock the network request (no external dependency)
        settings.INVENTREE_BASE_URL = 'https://example.com'
        settings.INVENTREE_NEWS_URL = 'https://example.com/feed.atom'

        class DummyResponse:
            def __init__(self, content: bytes):
                self.content = content

        feed_xml = """<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Tracklet News</title>
  <id>tag:example.com,2026:feed</id>
  <updated>2026-02-16T00:00:00Z</updated>
  <entry>
    <title>Test Entry</title>
    <id>tag:example.com,2026:1</id>
    <link href="https://example.com/news/1" />
    <published>2026-02-16T00:00:00Z</published>
    <author><name>Example</name></author>
    <summary>Test summary</summary>
  </entry>
</feed>
"""

        try:
            with mock.patch(
                'common.tasks.requests.get',
                return_value=DummyResponse(feed_xml.encode('utf-8')),
            ):
                common_tasks.update_news_feed()
        except Exception as ex:  # pragma: no cover
            self.fail(f'News feed raised exceptions: {ex}')

        self.assertNotEqual(NewsFeedEntry.objects.all().count(), 0)

    def test_connection_error(self):
        """Test connecting to an unavailable endpoint.

        This also emulates calling the endpoint behind a blocking proxy.
        """
        settings.INVENTREE_NEWS_URL = 'http://10.255.255.1:81'

        with self.assertLogs('inventree', level='WARNING'):
            with mock.patch('common.tasks.requests.get', side_effect=Exception('fail')):
                common_tasks.update_news_feed()

        self.assertEqual(NewsFeedEntry.objects.all().count(), 0)

    def test_unset_url(self):
        """Test that no call is made to news feed if URL setting is invalid."""
        settings.INVENTREE_NEWS_URL = ''

        self.assertTrue(
            offload_task(common_tasks.update_news_feed)
        )  # Task considered complete
        self.assertEqual(
            NewsFeedEntry.objects.all().count(), 0
        )  # No Feed entries created

        settings.INVENTREE_NEWS_URL = 0

        self.assertTrue(
            offload_task(common_tasks.update_news_feed)
        )  # Task considered complete
        self.assertEqual(
            NewsFeedEntry.objects.all().count(), 0
        )  # No Feed entries created

        settings.INVENTREE_NEWS_URL = None

        self.assertTrue(
            offload_task(common_tasks.update_news_feed)
        )  # Task considered complete
        self.assertEqual(
            NewsFeedEntry.objects.all().count(), 0
        )  # No Feed entries created
