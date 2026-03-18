"""Task definitions for the 'importer' app."""

from datetime import timedelta

import structlog

import Tracklet.helpers
import Tracklet.tasks

logger = structlog.get_logger('inventree')


def import_data(session_id: int):
    """Load data from the provided file.

    Attempt to load data from the provided file, and potentially handle any errors.
    """
    import importer.models

    try:
        session = importer.models.DataImportSession.objects.get(pk=session_id)
        logger.info("Loading data from session ID '%s'", session_id)
        session.import_data()
    except (ValueError, importer.models.DataImportSession.DoesNotExist):
        logger.error("Data import session with ID '%s' does not exist", session_id)
        return


@Tracklet.tasks.scheduled_task(Tracklet.tasks.ScheduledTask.DAILY)
def cleanup_import_sessions():
    """Periodically remove old import sessions.

    Every 5 days, remove any importer sessions that are more than 5 days old
    """
    CLEANUP_DAYS = 5

    import importer.models

    if not Tracklet.tasks.check_daily_holdoff('cleanup_import_sessions', CLEANUP_DAYS):
        return

    logger.info('Cleaning old data import sessions')

    before = Tracklet.helpers.current_date() - timedelta(days=CLEANUP_DAYS)

    sessions = importer.models.DataImportSession.objects.filter(timestamp__lte=before)

    if sessions.count() > 0:
        logger.info('Deleting %s old data import sessions', sessions.count())
        sessions.delete()

    Tracklet.tasks.record_task_success('cleanup_import_sessions')
