import { t } from '@lingui/core/macro';
import { Badge, Text } from '@mantine/core';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { AddItemButton } from '@lib/components/AddItemButton';
import { ProgressBar } from '@lib/components/ProgressBar';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { navigateToLink } from '@lib/functions/Navigation';
import type { TableFilter } from '@lib/types/Filters';
import { useRentalOrderFields } from '../../forms/EventRentalForms';
import { useCreateApiFormModal } from '../../hooks/UseForm';
import { useTable } from '../../hooks/UseTable';
import { useUserState } from '../../states/UserState';
import {
  CompanyColumn,
  DateColumn,
  ReferenceColumn,
  ResponsibleColumn
} from '../ColumnRenderers';
import { TrackletTable } from '../TrackletTable';

export function RentalOrderTable({
  customerId
}: Readonly<{
  customerId?: number;
}>) {
  const table = useTable('rentals-order-index');
  const user = useUserState();
  const navigate = useNavigate();

  const fields = useRentalOrderFields({ customerId });

  const createOrder = useCreateApiFormModal({
    url: ApiEndpoints.tracklet_rental_order_list,
    title: t`Add Rental Order`,
    fields,
    initialData: {
      customer: customerId
    },
    follow: true
  });

  const tableActions = useMemo(() => {
    return [
      <AddItemButton
        key='add-rental-order'
        tooltip={t`Add Rental Order`}
        onClick={() => createOrder.open()}
        hidden={!user.hasAddRole(UserRoles.sales_order)}
      />
    ];
  }, [user]);

  const tableFilters: TableFilter[] = useMemo(() => {
    return [
      {
        name: 'status',
        label: t`Status`,
        type: 'choice',
        choices: [
          { value: '10', label: t`Draft` },
          { value: '20', label: t`Active` },
          { value: '30', label: t`Overdue` },
          { value: '40', label: t`Returned` },
          { value: '50', label: t`Cancelled` }
        ]
      },
      {
        name: 'customer',
        label: t`Customer`,
        type: 'api',
        apiUrl: apiUrl(ApiEndpoints.company_list),
        apiFilter: { is_customer: true },
        modelRenderer: (instance: any) => instance.name
      },
      {
        name: 'responsible',
        label: t`Responsible`,
        type: 'api',
        apiUrl: apiUrl(ApiEndpoints.owner_list),
        modelRenderer: (instance: any) => instance.name
      },
      {
        name: 'overdue',
        label: t`Overdue`
      },
      {
        name: 'rental_start_after',
        label: t`Rental Start After`,
        type: 'date'
      },
      {
        name: 'rental_start_before',
        label: t`Rental Start Before`,
        type: 'date'
      },
      {
        name: 'rental_end_after',
        label: t`Rental End After`,
        type: 'date'
      },
      {
        name: 'rental_end_before',
        label: t`Rental End Before`,
        type: 'date'
      }
    ];
  }, []);

  const columns = useMemo(() => {
    return [
      ReferenceColumn({}),
      {
        accessor: 'customer__name',
        title: t`Customer`,
        sortable: true,
        render: (record: any) => (
          <CompanyColumn company={record.customer_detail} />
        )
      },
      DateColumn({
        accessor: 'rental_start',
        title: t`Rental Start`,
        extra: { showTime: true }
      }),
      DateColumn({
        accessor: 'rental_end',
        title: t`Due Back`,
        extra: { showTime: true }
      }),
      DateColumn({
        accessor: 'returned_date',
        title: t`Returned Date`,
        extra: { showTime: true }
      }),
      {
        accessor: 'status_name',
        title: t`Status`,
        sortable: true,
        render: (record: any) => (
          <Badge color={record.overdue ? 'yellow' : undefined}>
            {record.status_name}
          </Badge>
        )
      },
      {
        accessor: 'line_items',
        title: t`Line Items`,
        render: (record: any) => (
          <ProgressBar
            progressLabel
            value={record.returned_lines || 0}
            maximum={record.line_items || 0}
          />
        )
      },
      ResponsibleColumn({}),
      {
        accessor: 'notes_preview',
        title: t`Notes`,
        render: (record: any) => (
          <Text size='sm'>{record.notes_preview || '-'}</Text>
        )
      },
      DateColumn({
        accessor: 'last_updated',
        title: t`Last Updated`,
        extra: { showTime: true }
      })
    ];
  }, []);

  return (
    <>
      {createOrder.modal}
      <TrackletTable
        url={apiUrl(ApiEndpoints.tracklet_rental_order_list)}
        tableState={table}
        columns={columns}
        props={{
          params: {
            customer: customerId,
            customer_detail: true
          },
          tableFilters,
          tableActions,
          enableSelection: true,
          enableDownload: true,
          onRowClick: (record, index, event) => {
            navigateToLink(
              `/rentals/rental-order/${record.pk}`,
              navigate,
              event
            );
          }
        }}
      />
    </>
  );
}
