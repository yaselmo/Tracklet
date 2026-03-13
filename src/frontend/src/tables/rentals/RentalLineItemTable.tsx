import { t } from '@lingui/core/macro';
import { Badge, Button, Group, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { AddItemButton } from '@lib/components/AddItemButton';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { navigateToLink } from '@lib/functions/Navigation';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../contexts/ApiContext';
import { useRentalLineItemFields } from '../../forms/EventRentalForms';
import { useCreateApiFormModal } from '../../hooks/UseForm';
import { useModal } from '../../hooks/UseModal';
import { useTable } from '../../hooks/UseTable';
import { useUserState } from '../../states/UserState';
import { DateColumn } from '../ColumnRenderers';
import { TrackletTable } from '../TrackletTable';

function rentalStatusBadgeColor(status: number): string {
  switch (status) {
    case 10:
      return 'gray';
    case 20:
      return 'blue';
    case 30:
      return 'yellow';
    case 40:
      return 'green';
    case 50:
      return 'red';
    default:
      return 'gray';
  }
}

export function RentalLineItemTable({
  order,
  refreshOrder
}: Readonly<{
  order: any;
  refreshOrder: () => void;
}>) {
  const orderId = order?.pk;
  const api = useApi();
  const table = useTable(`rental-lines-${orderId}`);
  const usageTable = useTable(`rental-lines-usage-${orderId}`);
  const user = useUserState();
  const navigate = useNavigate();
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const overlapWindow = useMemo(
    () => ({
      overlap_start: order?.rental_start,
      overlap_end: order?.rental_end
    }),
    [order?.rental_end, order?.rental_start]
  );

  const usageModal = useModal({
    id: `rental-line-usage-modal-${orderId}`,
    title: t`Booked across rentals`,
    size: 'xl',
    children: (
      <TrackletTable
        url={apiUrl(ApiEndpoints.tracklet_rental_line_list)}
        tableState={usageTable}
        columns={[
          {
            accessor: 'order',
            title: t`Rental Order`,
            render: (record: any) => (
              <Button
                variant='subtle'
                size='xs'
                px={0}
                onClick={(e) => {
                  navigateToLink(
                    `/rentals/rental-order/${record.order_detail?.pk}`,
                    navigate,
                    e
                  );
                }}
              >
                {record.order_detail?.reference}
              </Button>
            )
          },
          {
            accessor: 'order_detail.customer_detail.name',
            title: t`Customer`,
            render: (record: any) => record.order_detail?.customer_detail?.name || '-'
          },
          {
            accessor: 'order_detail.status_name',
            title: t`Status`,
            render: (record: any) => (
              <Badge color={rentalStatusBadgeColor(record.order_detail?.status)}>
                {record.order_detail?.status_name || '-'}
              </Badge>
            )
          },
          DateColumn({
            accessor: 'order_detail.rental_start',
            title: t`Rental Start`,
            extra: { showTime: true }
          }),
          DateColumn({
            accessor: 'order_detail.rental_end',
            title: t`Rental End`,
            extra: { showTime: true }
          }),
          {
            accessor: 'quantity',
            title: t`Quantity`
          },
          {
            accessor: 'notes',
            title: t`Notes`
          }
        ]}
        props={{
          params: {
            asset: selectedAssetId || undefined,
            active: true,
            ...overlapWindow
          },
          enableSelection: false,
          enableDownload: true
        }}
      />
    )
  });

  const usageCountQuery = useQuery({
    enabled:
      !!selectedAssetId && !!overlapWindow.overlap_start && !!overlapWindow.overlap_end,
    queryKey: [
      'rental-line-usage-count',
      selectedAssetId,
      overlapWindow.overlap_start,
      overlapWindow.overlap_end
    ],
    queryFn: async () => {
      return api
        .get(apiUrl(ApiEndpoints.tracklet_rental_line_list), {
          params: {
            asset: selectedAssetId,
            active: true,
            ...overlapWindow,
            limit: 1
          }
        })
        .then((response) => response.data?.count ?? 0);
    }
  });

  const fields = useRentalLineItemFields({
    orderId,
    order,
    onAssetChange: (pk) => setSelectedAssetId(pk)
  });

  const createLine = useCreateApiFormModal({
    url: ApiEndpoints.tracklet_rental_line_list,
    title: t`Add Rental Line Item`,
    fields,
    preFormContent: (
      <Group justify='space-between'>
        <Text size='sm' c='dimmed'>
          {selectedAssetId
            ? t`${usageCountQuery.data ?? 0} overlapping rental booking(s) for this asset`
            : t`Select an asset to check overlapping rentals`}
        </Text>
        <Button
          variant='subtle'
          size='xs'
          disabled={!selectedAssetId}
          onClick={() => usageModal.open()}
        >
          {t`View rentals`}
        </Button>
      </Group>
    ),
    onOpen: () => {
      setSelectedAssetId(null);
    },
    onFormSuccess: refreshOrder
  });

  const tableActions = useMemo(() => {
    return [
      <AddItemButton
        key='add-rental-line-item'
        tooltip={t`Add Rental Line Item`}
        onClick={() => createLine.open()}
        hidden={!user.hasAddRole(UserRoles.sales_order)}
      />
    ];
  }, [createLine, user]);

  const columns = useMemo(() => {
    return [
      {
        accessor: 'asset',
        title: t`Asset`,
        sortable: true,
        render: (record: any) =>
          record.asset_detail?.title || record.asset_detail?.part_full_name || '-'
      },
      {
        accessor: 'asset_detail.serial',
        title: t`Serial`,
        render: (record: any) => record.asset_detail?.serial || '-'
      },
      {
        accessor: 'asset_detail.availability',
        title: t`Availability`,
        render: (record: any) => record.asset_detail?.availability || '-'
      },
      {
        accessor: 'quantity',
        title: t`Quantity`,
        sortable: true
      },
      {
        accessor: 'notes',
        title: t`Notes`
      }
    ];
  }, []);

  return (
    <>
      {usageModal.modal}
      {createLine.modal}
      <TrackletTable
        url={apiUrl(ApiEndpoints.tracklet_rental_line_list)}
        tableState={table}
        columns={columns}
        props={{
          params: {
            order: orderId,
            asset_detail: true
          },
          tableActions,
          enableSelection: true
        }}
      />
    </>
  );
}
