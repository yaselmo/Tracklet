import { t } from '@lingui/core/macro';
import { Badge, Text } from '@mantine/core';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { AddItemButton } from '@lib/components/AddItemButton';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { navigateToLink } from '@lib/functions/Navigation';
import type { TableFilter } from '@lib/types/Filters';
import { useEventFields } from '../../forms/EventRentalForms';
import { useCreateApiFormModal } from '../../hooks/UseForm';
import { useTable } from '../../hooks/UseTable';
import { useUserState } from '../../states/UserState';
import { DateColumn, ReferenceColumn } from '../ColumnRenderers';
import { TrackletTable } from '../TrackletTable';
import { getEventStatusBadgeStyle } from './eventStatusStyles';

export function EventTable() {
  const table = useTable('events-index');
  const user = useUserState();
  const navigate = useNavigate();

  const eventFields = useEventFields();

  const createEvent = useCreateApiFormModal({
    url: ApiEndpoints.tracklet_event_list,
    title: t`Add Event`,
    fields: eventFields,
    follow: true
  });

  const tableActions = useMemo(() => {
    return [
      <AddItemButton
        key='add-event'
        tooltip={t`Add Event`}
        onClick={() => createEvent.open()}
        hidden={!user.hasAddRole(UserRoles.sales_order)}
      />
    ];
  }, [user]);

  const filters: TableFilter[] = useMemo(() => {
    return [
      {
        name: 'status',
        label: t`Status`,
        type: 'choice',
        choices: [
          { value: '10', label: t`Draft` },
          { value: '20', label: t`Scheduled` },
          { value: '30', label: t`In Progress` },
          { value: '40', label: t`Completed` },
          { value: '50', label: t`Cancelled` }
        ]
      },
      {
        name: 'event_type',
        label: t`Event Type`,
        type: 'api',
        apiUrl: apiUrl(ApiEndpoints.tracklet_event_type_list),
        modelRenderer: (instance: any) => instance.name
      },
      {
        name: 'venue',
        label: t`Venue`,
        type: 'api',
        apiUrl: apiUrl(ApiEndpoints.tracklet_venue_list),
        modelRenderer: (instance: any) => instance.name
      },
      {
        name: 'planner',
        label: t`Planner`,
        type: 'api',
        apiUrl: apiUrl(ApiEndpoints.tracklet_planner_list),
        modelRenderer: (instance: any) => instance.name
      },
      {
        name: 'start_after',
        label: t`Start After`,
        type: 'date'
      },
      {
        name: 'start_before',
        label: t`Start Before`,
        type: 'date'
      },
      {
        name: 'end_after',
        label: t`End After`,
        type: 'date'
      },
      {
        name: 'end_before',
        label: t`End Before`,
        type: 'date'
      }
    ];
  }, []);

  const columns = useMemo(() => {
    return [
      ReferenceColumn({}),
      {
        accessor: 'title',
        title: t`Title`,
        sortable: true
      },
      {
        accessor: 'event_type',
        title: t`Event Type`,
        sortable: true,
        render: (record: any) => record.event_type_detail?.name || '-'
      },
      {
        accessor: 'venue',
        title: t`Venue`,
        sortable: true,
        render: (record: any) => record.venue_detail?.name || '-'
      },
      {
        accessor: 'planner',
        title: t`Planner`,
        sortable: true,
        render: (record: any) => record.planner_detail?.name || '-'
      },
      DateColumn({
        accessor: 'start_datetime',
        title: t`Start DateTime`,
        extra: { showTime: true }
      }),
      DateColumn({
        accessor: 'end_datetime',
        title: t`End DateTime`,
        extra: { showTime: true }
      }),
      {
        accessor: 'late_night_takedown',
        title: t`Late Night Takedown`,
        render: (record: any) => (
          <Badge color={record.late_night_takedown ? 'blue' : 'gray'}>
            {record.late_night_takedown ? t`Yes` : t`No`}
          </Badge>
        )
      },
      {
        accessor: 'status_name',
        title: t`Status`,
        sortable: true,
        render: (record: any) => {
          const style = getEventStatusBadgeStyle(
            record.status_name ?? record.status
          );

          return (
            <Badge
              styles={{
                root: {
                  backgroundColor: style.bg,
                  color: style.fg
                }
              }}
            >
              {record.status_name}
            </Badge>
          );
        }
      },
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
      {createEvent.modal}
      <TrackletTable
        url={apiUrl(ApiEndpoints.tracklet_event_list)}
        tableState={table}
        columns={columns}
        props={{
          tableActions,
          tableFilters: filters,
          enableSelection: true,
          enableDownload: true,
          onRowClick: (record, index, event) => {
            navigateToLink(`/events/event/${record.pk}`, navigate, event);
          }
        }}
      />
    </>
  );
}
