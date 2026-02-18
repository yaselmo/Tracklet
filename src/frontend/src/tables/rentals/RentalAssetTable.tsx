import { t } from '@lingui/core/macro';
import { useMemo } from 'react';

import { AddItemButton } from '@lib/components/AddItemButton';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { useRentalAssetFields } from '../../forms/EventRentalForms';
import { useCreateApiFormModal } from '../../hooks/UseForm';
import { useTable } from '../../hooks/UseTable';
import { useUserState } from '../../states/UserState';
import { BooleanColumn } from '../ColumnRenderers';
import { TrackletTable } from '../TrackletTable';

export function RentalAssetTable() {
  const table = useTable('rentals-assets-index');
  const user = useUserState();

  const fields = useRentalAssetFields();

  const createAsset = useCreateApiFormModal({
    url: ApiEndpoints.tracklet_rental_asset_list,
    title: t`Add Rental Asset`,
    fields
  });

  const tableActions = useMemo(() => {
    return [
      <AddItemButton
        key='add-rental-asset'
        tooltip={t`Add Rental Asset`}
        onClick={() => createAsset.open()}
        hidden={!user.hasAddRole(UserRoles.sales_order)}
      />
    ];
  }, [user]);

  const columns = useMemo(() => {
    return [
      {
        accessor: 'name',
        title: t`Name`,
        sortable: true
      },
      {
        accessor: 'asset_tag',
        title: t`Asset Tag`,
        sortable: true
      },
      {
        accessor: 'serial',
        title: t`Serial`,
        sortable: true
      },
      BooleanColumn({
        accessor: 'active',
        title: t`Active`
      })
    ];
  }, []);

  return (
    <>
      {createAsset.modal}
      <TrackletTable
        url={apiUrl(ApiEndpoints.tracklet_rental_asset_list)}
        tableState={table}
        columns={columns}
        props={{
          tableActions,
          tableFilters: [
            {
              name: 'active',
              label: t`Active`
            }
          ]
        }}
      />
    </>
  );
}
