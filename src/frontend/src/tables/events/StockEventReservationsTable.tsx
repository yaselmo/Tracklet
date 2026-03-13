import { t } from '@lingui/core/macro';
import { Accordion, Badge, Button, Stack } from '@mantine/core';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { apiUrl } from '@lib/functions/Api';
import { navigateToLink } from '@lib/functions/Navigation';
import { formatDate } from '../../defaults/formatters';
import { useTable } from '../../hooks/UseTable';
import { TrackletTable } from '../TrackletTable';

function statusBadgeColor(status: number): string {
  switch (status) {
    case 10:
      return 'gray';
    case 20:
      return 'blue';
    case 30:
      return 'green';
    case 40:
      return 'yellow';
    case 50:
      return 'red';
    default:
      return 'gray';
  }
}

function renderReservationDate(record: any, mode: 'start' | 'end'): string {
  const value =
    mode === 'start'
      ? record.checked_out_at || record.event_detail?.start_datetime
      : record.checked_in_at || record.event_detail?.end_datetime;

  if (!value) {
    return '-';
  }

  return formatDate(value, { showTime: true }) || '-';
}

export function StockEventReservationsTable({
  partId
}: Readonly<{ partId?: number }>) {
  const navigate = useNavigate();
  const upcomingTable = useTable(`stock-event-reservations-upcoming-${partId}`);
  const pastTable = useTable(`stock-event-reservations-past-${partId}`);

  const columns = useMemo(() => {
    return [
      {
        accessor: 'event',
        title: t`Event name`,
        render: (record: any) => (
          <Button
            variant='subtle'
            size='xs'
            px={0}
            onClick={(e) =>
              navigateToLink(`/events/event/${record.event_detail?.pk}`, navigate, e)
            }
          >
            {record.event_detail?.title || '-'}
          </Button>
        )
      },
      {
        accessor: 'status_name',
        title: t`Status`,
        render: (record: any) => (
          <Badge color={statusBadgeColor(record.status)}>
            {record.status_name || '-'}
          </Badge>
        )
      },
      {
        accessor: 'checked_out_at',
        title: t`Checked Out At`,
        render: (record: any) => renderReservationDate(record, 'start')
      },
      {
        accessor: 'checked_in_at',
        title: t`Checked In At`,
        render: (record: any) => renderReservationDate(record, 'end')
      },
      {
        accessor: 'quantity',
        title: t`Quantity`
      },
      {
        accessor: 'event_link',
        title: t`Event Link`,
        render: (record: any) => (
          <Button
            variant='light'
            size='xs'
            onClick={(e) =>
              navigateToLink(`/events/event/${record.event_detail?.pk}`, navigate, e)
            }
          >
            {t`Open Event`}
          </Button>
        )
      }
    ];
  }, [navigate]);

  if (!partId) {
    return null;
  }

  return (
    <Stack gap='md'>
      <TrackletTable
        url={apiUrl(ApiEndpoints.tracklet_event_furniture_list)}
        tableState={upcomingTable}
        columns={columns}
        props={{
          params: {
            part: partId,
            reservation_state: 'upcoming',
            ordering: 'checked_out_at'
          },
          enableSelection: false,
          enableDownload: true
        }}
      />

      <Accordion multiple={false}>
        <Accordion.Item value='past'>
          <Accordion.Control>{t`Past Reservations`}</Accordion.Control>
          <Accordion.Panel>
            <TrackletTable
              url={apiUrl(ApiEndpoints.tracklet_event_furniture_list)}
              tableState={pastTable}
              columns={columns}
              props={{
                params: {
                  part: partId,
                  reservation_state: 'past',
                  ordering: '-checked_out_at'
                },
                enableSelection: false,
                enableDownload: true
              }}
            />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
