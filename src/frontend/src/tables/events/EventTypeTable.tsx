import { t } from '@lingui/core/macro';
import { useMemo } from 'react';

import { AddItemButton } from '@lib/components/AddItemButton';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { useEventTypeFields } from '../../forms/EventRentalForms';
import { useCreateApiFormModal } from '../../hooks/UseForm';
import { useTable } from '../../hooks/UseTable';
import { useUserState } from '../../states/UserState';
import { BooleanColumn } from '../ColumnRenderers';
import { TrackletTable } from '../TrackletTable';

export function EventTypeTable() {
  const table = useTable('events-types');
  const user = useUserState();

  const fields = useEventTypeFields();

  const createType = useCreateApiFormModal({
    url: ApiEndpoints.tracklet_event_type_list,
    title: t`Add Event Type`,
    fields
  });

  const tableActions = useMemo(() => {
    return [
      <AddItemButton
        key='add-event-type'
        tooltip={t`Add Event Type`}
        onClick={() => createType.open()}
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
        accessor: 'description',
        title: t`Description`
      },
      BooleanColumn({
        accessor: 'active',
        title: t`Active`
      })
    ];
  }, []);

  return (
    <>
      {createType.modal}
      <TrackletTable
        url={apiUrl(ApiEndpoints.tracklet_event_type_list)}
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
