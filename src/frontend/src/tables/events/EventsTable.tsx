import { t } from '@lingui/core/macro';
import { useMemo } from 'react';

import { AddItemButton } from '@lib/components/AddItemButton';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import type { TableFilter } from '@lib/types/Filters';
import { useEventFields } from '../../forms/EventForms';
import { useCreateApiFormModal } from '../../hooks/UseForm';
import { useTable } from '../../hooks/UseTable';
import { useUserState } from '../../states/UserState';
import {
  BooleanColumn,
  DateColumn,
  StartDateColumn,
  StatusColumn,
  UserColumn
} from '../ColumnRenderers';
import {
  CreatedAfterFilter,
  CreatedBeforeFilter,
  StartDateAfterFilter,
  StartDateBeforeFilter,
  StatusFilterOptions,
  UserFilter
} from '../Filter';
import { TrackletTable } from '../TrackletTable';

export function EventsTable() {
  const table = useTable('event-index');
  const user = useUserState();

  const tableFilters: TableFilter[] = useMemo(() => {
    return [
      {
        name: 'status',
        label: t`Status`,
        description: t`Filter by event status`,
        choiceFunction: StatusFilterOptions(ModelType.event)
      },
      {
        name: 'event_type',
        label: t`Event Type`,
        description: t`Filter by event type`,
        type: 'choice',
        choices: [
          { value: '', label: t`Unspecified` },
          { value: 'conference', label: t`Conference` },
          { value: 'party', label: t`Party` },
          { value: 'meeting', label: t`Meeting` },
          { value: 'wedding', label: t`Wedding` },
          { value: 'other', label: t`Other` }
        ]
      },
      {
        name: 'has_end_date',
        type: 'boolean',
        label: t`Has End Date`,
        description: t`Show events with an end date`
      },
      {
        name: 'late_night_takedown',
        type: 'boolean',
        label: t`Late-night takedown`,
        description: t`Show events requiring late-night takedown`
      },
      {
        name: 'venue',
        type: 'text',
        label: t`Venue`,
        description: t`Filter by venue`
      },
      CreatedBeforeFilter(),
      CreatedAfterFilter(),
      StartDateBeforeFilter(),
      StartDateAfterFilter(),
      {
        name: 'end_date_before',
        type: 'date',
        label: t`End Date Before`,
        description: t`Show events with an end date before this date`
      },
      {
        name: 'end_date_after',
        type: 'date',
        label: t`End Date After`,
        description: t`Show events with an end date after this date`
      },
      UserFilter({
        name: 'created_by',
        label: t`Created By`,
        description: t`Filter by user who created the event`
      }),
      UserFilter({
        name: 'planner',
        label: t`Planner`,
        description: t`Filter by event planner`
      })
    ];
  }, []);

  const eventFields = useEventFields();

  const newEvent = useCreateApiFormModal({
    url: ApiEndpoints.event_list,
    title: t`Add Event`,
    fields: eventFields,
    focus: 'title',
    follow: false,
    modelType: ModelType.event,
    table: table
  });

  const tableActions = useMemo(() => {
    return [
      <AddItemButton
        key='add-event'
        tooltip={t`Add Event`}
        onClick={() => newEvent.open()}
        hidden={!user.hasAddRole(UserRoles.sales_order)}
      />
    ];
  }, [user]);

  const tableColumns = useMemo(() => {
    return [
      {
        accessor: 'pk',
        title: t`Reference`,
        sortable: true,
        switchable: true,
        width: 90
      },
      {
        accessor: 'title',
        title: t`Title`,
        sortable: true,
        switchable: true,
        minWidth: '200px'
      },
      StatusColumn({ model: ModelType.event }),
      StartDateColumn({}),
      DateColumn({
        accessor: 'end_date',
        title: t`End Date`
      }),
      BooleanColumn({
        accessor: 'late_night_takedown',
        title: t`Late-night takedown?`,
        ordering: 'late_night_takedown'
      }),
      UserColumn({
        accessor: 'planner_detail',
        title: t`Planner`,
        ordering: 'planner'
      }),
      {
        accessor: 'venue',
        title: t`Venue`,
        sortable: true,
        switchable: true,
        minWidth: '180px'
      },
      {
        accessor: 'event_type',
        title: t`Event Type`,
        sortable: true,
        switchable: true,
        minWidth: '150px',
        render: (record: any) => record.event_type_text || record.event_type || '-'
      }
    ];
  }, []);

  return (
    <>
      {newEvent.modal}
      <TrackletTable
        url={apiUrl(ApiEndpoints.event_list)}
        tableState={table}
        columns={tableColumns}
        props={{
          tableFilters: tableFilters,
          tableActions: tableActions,
          modelType: ModelType.event,
          enableSelection: true,
          enableDownload: true
        }}
      />
    </>
  );
}
