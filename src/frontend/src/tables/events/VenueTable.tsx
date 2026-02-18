import { t } from '@lingui/core/macro';
import { useMemo } from 'react';

import { AddItemButton } from '@lib/components/AddItemButton';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { useVenueFields } from '../../forms/EventRentalForms';
import { useCreateApiFormModal } from '../../hooks/UseForm';
import { useTable } from '../../hooks/UseTable';
import { useUserState } from '../../states/UserState';
import { BooleanColumn } from '../ColumnRenderers';
import { TrackletTable } from '../TrackletTable';

export function VenueTable() {
  const table = useTable('events-venues');
  const user = useUserState();

  const fields = useVenueFields();

  const createVenue = useCreateApiFormModal({
    url: ApiEndpoints.tracklet_venue_list,
    title: t`Add Venue`,
    fields
  });

  const tableActions = useMemo(() => {
    return [
      <AddItemButton
        key='add-venue'
        tooltip={t`Add Venue`}
        onClick={() => createVenue.open()}
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
        accessor: 'address',
        title: t`Address`
      },
      {
        accessor: 'contact_name',
        title: t`Contact Name`
      },
      {
        accessor: 'contact_email',
        title: t`Contact Email`
      },
      BooleanColumn({
        accessor: 'active',
        title: t`Active`
      })
    ];
  }, []);

  return (
    <>
      {createVenue.modal}
      <TrackletTable
        url={apiUrl(ApiEndpoints.tracklet_venue_list)}
        tableState={table}
        columns={columns}
        props={{
          tableActions,
          enableSelection: true,
          enableSearch: true,
          enableFilters: true,
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
