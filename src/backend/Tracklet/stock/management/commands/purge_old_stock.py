from collections import OrderedDict

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from build.models import BuildItem
from operations.models import RentalLineItem
from order.models import ReturnOrderLineItem, SalesOrderAllocation
from stock.models import StockItem, StockItemTestResult


class Command(BaseCommand):
    help = (
        "Safely purge stock records by deleting dependent rows first. "
        "Use --dry-run to inspect counts, then --confirm to execute."
    )

    def add_arguments(self, parser):
        mode = parser.add_mutually_exclusive_group(required=True)
        mode.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would be deleted without modifying data',
        )
        mode.add_argument(
            '--confirm',
            action='store_true',
            help='Execute deletion in the safe dependency order',
        )

    def handle(self, *args, **options):
        dry_run = bool(options['dry_run'])
        confirm = bool(options['confirm'])

        if dry_run == confirm:
            raise CommandError('Specify exactly one of --dry-run or --confirm')

        stock_ids = StockItem.objects.values('pk')

        # Delete in a strict child -> parent order to avoid FK/PROTECT violations.
        model_specs = [
            (
                'operations.RentalLineItem (asset -> StockItem, PROTECT)',
                RentalLineItem.objects.filter(asset_id__in=stock_ids),
            ),
            (
                'order.SalesOrderAllocation (item -> StockItem, CASCADE)',
                SalesOrderAllocation.objects.filter(item_id__in=stock_ids),
            ),
            (
                'order.ReturnOrderLineItem (item -> StockItem, CASCADE)',
                ReturnOrderLineItem.objects.filter(item_id__in=stock_ids),
            ),
            (
                'build.BuildItem (stock_item -> StockItem, CASCADE)',
                BuildItem.objects.filter(stock_item_id__in=stock_ids),
            ),
            (
                'stock.StockItemTestResult (stock_item -> StockItem, CASCADE)',
                StockItemTestResult.objects.filter(stock_item_id__in=stock_ids),
            ),
        ]

        stock_count = StockItem.objects.count()
        model_counts = OrderedDict((label, queryset.count()) for label, queryset in model_specs)
        legacy_fk_tables = self._legacy_fk_tables()

        self.stdout.write('Stock purge plan')
        self.stdout.write(f'- stock.StockItem rows: {stock_count}')

        for label, count in model_counts.items():
            self.stdout.write(f'- {label}: {count}')

        if legacy_fk_tables:
            self.stdout.write('- Legacy FK tables pointing to stock_stockitem:')
            for table, count in legacy_fk_tables.items():
                self.stdout.write(f'  - {table}: {count}')
        else:
            self.stdout.write('- Legacy FK tables pointing to stock_stockitem: none')

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run complete. No data was deleted.'))
            return

        deleted_summary = OrderedDict()

        with transaction.atomic():
            for label, queryset in model_specs:
                deleted, _ = queryset.delete()
                deleted_summary[label] = deleted

            legacy_deleted = self._delete_legacy_fk_rows()
            for table, deleted in legacy_deleted.items():
                deleted_summary[f'legacy_table.{table}'] = deleted

            deleted_stock, _ = StockItem.objects.all().delete()
            deleted_summary['stock.StockItem'] = deleted_stock

        self.stdout.write(self.style.SUCCESS('Purge complete.'))
        self.stdout.write('Deleted rows summary:')
        for label, deleted in deleted_summary.items():
            self.stdout.write(f'- {label}: {deleted}')

    def _legacy_fk_tables(self):
        """Return unmanaged DB tables with FK(s) to stock_stockitem and matching row counts."""
        managed_tables = {
            RentalLineItem._meta.db_table,
            SalesOrderAllocation._meta.db_table,
            ReturnOrderLineItem._meta.db_table,
            BuildItem._meta.db_table,
            StockItemTestResult._meta.db_table,
            StockItem._meta.db_table,
        }

        table_to_columns = OrderedDict()

        with connection.cursor() as cursor:
            for table in connection.introspection.table_names(cursor):
                if table in managed_tables:
                    continue

                constraints = connection.introspection.get_constraints(cursor, table)

                columns = []

                for details in constraints.values():
                    foreign_key = details.get('foreign_key')
                    if not foreign_key:
                        continue

                    target_table, _target_column = foreign_key

                    if target_table != StockItem._meta.db_table:
                        continue

                    constraint_columns = details.get('columns') or []
                    if len(constraint_columns) == 1:
                        columns.append(constraint_columns[0])

                if columns:
                    table_to_columns[table] = sorted(set(columns))

            table_counts = OrderedDict()

            for table, columns in table_to_columns.items():
                count = self._count_fk_rows(cursor, table, columns)
                if count > 0:
                    table_counts[table] = count

            return table_counts

    def _delete_legacy_fk_rows(self):
        """Delete rows from unmanaged DB tables with FK(s) to stock_stockitem."""
        to_delete = self._legacy_fk_tables()
        deleted = OrderedDict()

        if not to_delete:
            return deleted

        with connection.cursor() as cursor:
            for table in to_delete:
                constraints = connection.introspection.get_constraints(cursor, table)
                columns = []

                for details in constraints.values():
                    foreign_key = details.get('foreign_key')
                    if not foreign_key:
                        continue

                    target_table, _target_column = foreign_key

                    if target_table != StockItem._meta.db_table:
                        continue

                    constraint_columns = details.get('columns') or []
                    if len(constraint_columns) == 1:
                        columns.append(constraint_columns[0])

                columns = sorted(set(columns))
                deleted[table] = self._delete_fk_rows(cursor, table, columns)

        return deleted

    def _count_fk_rows(self, cursor, table, columns):
        table_sql = connection.ops.quote_name(table)
        stock_table = connection.ops.quote_name(StockItem._meta.db_table)

        predicates = ' OR '.join(
            f"{connection.ops.quote_name(column)} IN (SELECT id FROM {stock_table})"
            for column in columns
        )

        query = f"SELECT COUNT(*) FROM {table_sql} WHERE {predicates}"
        cursor.execute(query)
        return int(cursor.fetchone()[0])

    def _delete_fk_rows(self, cursor, table, columns):
        table_sql = connection.ops.quote_name(table)
        stock_table = connection.ops.quote_name(StockItem._meta.db_table)

        predicates = ' OR '.join(
            f"{connection.ops.quote_name(column)} IN (SELECT id FROM {stock_table})"
            for column in columns
        )

        query = f"DELETE FROM {table_sql} WHERE {predicates}"
        cursor.execute(query)
        return int(cursor.rowcount)
