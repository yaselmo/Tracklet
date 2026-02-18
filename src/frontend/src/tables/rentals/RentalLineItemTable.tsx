import { t } from '@lingui/core/macro';
import { useMemo } from 'react';

import { AddItemButton } from '@lib/components/AddItemButton';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { useRentalLineItemFields } from '../../forms/EventRentalForms';
import { useCreateApiFormModal } from '../../hooks/UseForm';
import { useTable } from '../../hooks/UseTable';
import { useUserState } from '../../states/UserState';
import { TrackletTable } from '../TrackletTable';

export function RentalLineItemTable({
  orderId,
  refreshOrder
}: Readonly<{
  orderId: number;
  refreshOrder: () => void;
}>) {
  const table = useTable(`rental-lines-${orderId}`);
  const user = useUserState();

  const fields = useRentalLineItemFields({ orderId });

  const createLine = useCreateApiFormModal({
    url: ApiEndpoints.tracklet_rental_line_list,
    title: t`Add Rental Line Item`,
    fields,
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
  }, [user]);

  const columns = useMemo(() => {
    return [
      {
        accessor: 'asset',
        title: t`Asset`,
        sortable: true,
        render: (record: any) =>
          record.asset_detail?.asset_tag || record.asset_detail?.name || '-'
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
