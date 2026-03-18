from django.core.management.base import BaseCommand

from stock.models import StockItem


class Command(BaseCommand):
    help = 'Synchronize tracklet_status for all stock items'

    def add_arguments(self, parser):
        parser.add_argument(
            '--batch-size',
            type=int,
            default=500,
            help='Number of rows to process per batch',
        )

    def handle(self, *args, **options):
        batch_size = max(int(options.get('batch_size', 500) or 500), 1)
        changed = 0
        processed = 0

        queryset = StockItem.objects.order_by('pk').only(
            'pk',
            'quantity',
            'tracklet_status',
            'sales_order',
            'belongs_to',
            'customer',
            'consumed_by',
            'is_building',
        )

        for item in queryset.iterator(chunk_size=batch_size):
            processed += 1
            if item.sync_tracklet_status(save=False):
                # Intentionally bypass model save/plugin validation for this
                # maintenance backfill to avoid deferred-field delta issues.
                StockItem.objects.filter(pk=item.pk).update(
                    tracklet_status=item.tracklet_status
                )
                changed += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Sync complete. Processed={processed}, updated={changed}'
            )
        )
