import { t } from '@lingui/core/macro';
import { useMemo } from 'react';

import { AddItemButton } from '@lib/components/AddItemButton';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { usePlannerFields } from '../../forms/EventRentalForms';
import { useCreateApiFormModal } from '../../hooks/UseForm';
import { useTable } from '../../hooks/UseTable';
import { useUserState } from '../../states/UserState';
import { BooleanColumn } from '../ColumnRenderers';
import { TrackletTable } from '../TrackletTable';

export function PlannerTable() {
  const table = useTable('events-planners');
  const user = useUserState();

  const fields = usePlannerFields();

  const createPlanner = useCreateApiFormModal({
    url: ApiEndpoints.tracklet_planner_list,
    title: t`Add Planner`,
    fields
  });

  const tableActions = useMemo(() => {
    return [
      <AddItemButton
        key='add-planner'
        tooltip={t`Add Planner`}
        onClick={() => createPlanner.open()}
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
        accessor: 'email',
        title: t`Email`
      },
      {
        accessor: 'phone',
        title: t`Phone`
      },
      BooleanColumn({
        accessor: 'active',
        title: t`Active`
      })
    ];
  }, []);

  return (
    <>
      {createPlanner.modal}
      <TrackletTable
        url={apiUrl(ApiEndpoints.tracklet_planner_list)}
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
