import { t } from '@lingui/core/macro';
import { Badge, Button, Group, SegmentedControl, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArmchair, IconCheck, IconEdit, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AddItemButton } from '@lib/components/AddItemButton';
import type { RowAction } from '@lib/components/RowActions';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { navigateToLink } from '@lib/functions/Navigation';
import type { TableFilter } from '@lib/types/Filters';
import { useApi } from '../../contexts/ApiContext';
import { useEventFurnitureAssignmentFields } from '../../forms/EventRentalForms';
import {
  useCreateApiFormModal,
  useDeleteApiFormModal,
  useEditApiFormModal
} from '../../hooks/UseForm';
import { useModal } from '../../hooks/UseModal';
import { useTable } from '../../hooks/UseTable';
import { useUserState } from '../../states/UserState';
import { DateColumn } from '../ColumnRenderers';
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

export function EventFurnitureTable({ event }: Readonly<{ event: any }>) {
  const eventId = event?.pk;
  const api = useApi();
  const table = useTable(`event-furniture-${eventId}`);
  const usageTable = useTable(`event-furniture-usage-${eventId}`);
  const user = useUserState();
  const navigate = useNavigate();
  const [selectedAssignment, setSelectedAssignment] = useState<number>(-1);
  const [defaultFilter, setDefaultFilter] = useState<'in-use' | 'all'>('in-use');
  const [usageFilter, setUsageFilter] = useState<'active' | 'all'>('active');
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState<number | null>(null);
  const [assignmentInitialData, setAssignmentInitialData] = useState<any>({});

  const usageModal = useModal({
    id: `event-furniture-usage-modal-${eventId}`,
    title: t`Used across all events`,
    size: 'xl',
    children: (
      <Stack gap='sm'>
        <Group justify='space-between'>
          <Text size='sm'>
            {selectedPartId
              ? t`Showing usage for selected part`
              : t`Select a part to view usage`}
          </Text>
          <SegmentedControl
            size='xs'
            value={usageFilter}
            onChange={(value: string) => setUsageFilter(value as 'active' | 'all')}
            data={[
              { label: t`Active only`, value: 'active' },
              { label: t`All history`, value: 'all' }
            ]}
          />
        </Group>
        <TrackletTable
          url={apiUrl(ApiEndpoints.tracklet_event_furniture_list)}
          tableState={usageTable}
          columns={[
            {
              accessor: 'event',
              title: t`Event`,
              render: (record: any) => (
                <Button
                  variant='subtle'
                  size='xs'
                  px={0}
                  onClick={(e) => {
                    navigateToLink(
                      `/events/event/${record.event_detail?.pk}`,
                      navigate,
                      e
                    );
                  }}
                >
                  {record.event_detail?.reference} - {record.event_detail?.title}
                </Button>
              )
            },
            {
              accessor: 'status_name',
              title: t`Status`,
              render: (record: any) => (
                <Badge color={statusBadgeColor(record.status)}>{record.status_name}</Badge>
              )
            },
            {
              accessor: 'quantity',
              title: t`Qty`
            },
            DateColumn({
              accessor: 'checked_out_at',
              title: t`Checked out`,
              extra: { showTime: true }
            }),
            DateColumn({
              accessor: 'checked_in_at',
              title: t`Checked in`,
              extra: { showTime: true }
            }),
            {
              accessor: 'event_detail.venue_name',
              title: t`Venue`,
              render: (record: any) => record.event_detail?.venue_name || '-'
            },
            {
              accessor: 'event_detail.planner_name',
              title: t`Planner`,
              render: (record: any) => record.event_detail?.planner_name || '-'
            }
          ]}
          props={{
            params: {
              part: selectedPartId || undefined,
              active: usageFilter === 'active'
            },
            enableSelection: false,
            enableDownload: true
          }}
        />
      </Stack>
    )
  });

  const usageCountQuery = useQuery({
    enabled: isCreateModalOpen && !!selectedPartId,
    queryKey: ['event-furniture-part-usage-count', selectedPartId],
    queryFn: async () => {
      return api
        .get(apiUrl(ApiEndpoints.tracklet_event_furniture_list), {
          params: {
            part: selectedPartId,
            active: true,
            limit: 1
          }
        })
        .then((response) => response.data?.count ?? 0);
    }
  });

  const updateAssignmentDefaultDates = useCallback(() => {
    const checkedOut = event?.start_datetime
      ? dayjs(event.start_datetime).toISOString()
      : undefined;

    let checkedIn = event?.end_datetime
      ? dayjs(event.end_datetime).toISOString()
      : undefined;

    if (event?.late_night_takedown && event?.end_datetime) {
      checkedIn = dayjs(event.end_datetime)
        .add(1, 'day')
        .hour(2)
        .minute(0)
        .second(0)
        .millisecond(0)
        .toISOString();
    }

    setAssignmentInitialData({
      checked_out_at: checkedOut,
      checked_in_at: checkedIn
    });
  }, [event]);

  const createAssignment = useCreateApiFormModal({
    url: ApiEndpoints.tracklet_event_furniture_list,
    title: t`Add Furniture`,
    successMessage: null,
    initialData: assignmentInitialData,
    preFormContent: (
      <Group justify='space-between'>
        <Text size='sm' c='dimmed'>
          {selectedPartId
            ? t`${usageCountQuery.data ?? 0} active assignment(s) for this item`
            : t`Select an item to see usage across events`}
        </Text>
        <Button
          variant='subtle'
          size='xs'
          disabled={!selectedPartId}
          onClick={() => usageModal.open()}
        >
          {t`Used across all events`}
        </Button>
      </Group>
    ),
    fields: useEventFurnitureAssignmentFields({
      eventId,
      defaults: { status: 10 },
      onPartChange: (pk) => {
        setSelectedPartId(pk);
        if (pk) {
          updateAssignmentDefaultDates();
        }
      }
    }),
    onOpen: () => {
      setCreateModalOpen(true);
      setSelectedPartId(null);
      setAssignmentInitialData({});
    },
    onClose: () => {
      setCreateModalOpen(false);
    },
    onFormSuccess: (data: any) => {
      table.refreshTable();
      notifications.show({
        color: 'green',
        title: data?.updated_existing
          ? t`Updated existing assignment`
          : t`Assignment created`,
        message: data?.updated_existing
          ? t`Existing furniture assignment was updated`
          : t`Furniture assignment created successfully`
      });
    }
  });

  const editAssignment = useEditApiFormModal({
    url: ApiEndpoints.tracklet_event_furniture_list,
    pk: selectedAssignment,
    title: t`Edit Furniture Assignment`,
    fields: {
      quantity: {},
      status: {},
      checked_out_at: {},
      checked_in_at: {},
      notes: {}
    },
    onFormSuccess: () => table.refreshTable()
  });

  const markInUse = useEditApiFormModal({
    url: ApiEndpoints.tracklet_event_furniture_list,
    pk: selectedAssignment,
    title: t`Mark In Use`,
    fields: {
      status: { value: 20, hidden: true }
    },
    fetchInitialData: false,
    onFormSuccess: () => table.refreshTable()
  });

  const markReturned = useEditApiFormModal({
    url: ApiEndpoints.tracklet_event_furniture_list,
    pk: selectedAssignment,
    title: t`Mark Returned`,
    fields: {
      status: { value: 30, hidden: true },
      checked_in_at: {}
    },
    onFormSuccess: () => table.refreshTable()
  });

  const deleteAssignment = useDeleteApiFormModal({
    url: ApiEndpoints.tracklet_event_furniture_list,
    pk: selectedAssignment,
    title: t`Remove Furniture`,
    preFormWarning: t`Are you sure you want to remove this furniture assignment?`,
    onFormSuccess: () => table.refreshTable()
  });

  const tableFilters: TableFilter[] = useMemo(() => {
    return [
      {
        name: 'status',
        label: t`Status`,
        type: 'choice',
        choices: [
          { value: '10', label: t`Reserved` },
          { value: '20', label: t`In Use` },
          { value: '30', label: t`Returned` },
          { value: '40', label: t`Missing` },
          { value: '50', label: t`Damaged` }
        ]
      }
    ];
  }, []);

  const tableActions = useMemo(() => {
    return [
      <AddItemButton
        key='add-event-furniture'
        tooltip={t`Add Furniture`}
        onClick={() => createAssignment.open()}
        hidden={!user.hasAddRole(UserRoles.sales_order)}
      />,
      <Group key='event-furniture-toggle' gap='xs'>
        <IconArmchair size={16} />
        <SegmentedControl
          size='xs'
          value={defaultFilter}
          onChange={(value: string) => setDefaultFilter(value as 'in-use' | 'all')}
          data={[
            { label: t`In use only`, value: 'in-use' },
            { label: t`Show all`, value: 'all' }
          ]}
        />
      </Group>
    ];
  }, [createAssignment, user, defaultFilter]);

  const rowActions = useCallback(
    (record: any): RowAction[] => {
      return [
        {
          title: t`Mark In Use`,
          icon: <IconCheck />,
          hidden:
            record.status === 20 || !user.hasChangeRole(UserRoles.sales_order),
          onClick: () => {
            setSelectedAssignment(record.pk);
            markInUse.open();
          }
        },
        {
          title: t`Mark Returned`,
          icon: <IconCheck />,
          hidden:
            record.status === 30 || !user.hasChangeRole(UserRoles.sales_order),
          onClick: () => {
            setSelectedAssignment(record.pk);
            markReturned.open();
          }
        },
        {
          title: t`Edit`,
          icon: <IconEdit />,
          hidden: !user.hasChangeRole(UserRoles.sales_order),
          onClick: () => {
            setSelectedAssignment(record.pk);
            editAssignment.open();
          }
        },
        {
          title: t`Remove`,
          color: 'red',
          icon: <IconTrash />,
          hidden: !user.hasDeleteRole(UserRoles.sales_order),
          onClick: () => {
            setSelectedAssignment(record.pk);
            deleteAssignment.open();
          }
        }
      ];
    },
    [user, editAssignment, deleteAssignment, markInUse, markReturned]
  );

  const columns = useMemo(() => {
    return [
      {
        accessor: 'part',
        title: t`Item`,
        sortable: true,
        ordering: 'part__name',
        render: (record: any) =>
          record.part_detail?.name || record.item_detail?.name || '-'
      },
      {
        accessor: 'category',
        title: t`Category`,
        sortable: true,
        ordering: 'part__category__pathstring',
        render: (record: any) =>
          record.part_detail?.category_path || record.item_detail?.category || '-'
      },
      {
        accessor: 'quantity',
        title: t`Qty`,
        sortable: true
      },
      {
        accessor: 'status_name',
        title: t`Status`,
        sortable: true,
        render: (record: any) => (
          <Badge color={statusBadgeColor(record.status)}>{record.status_name}</Badge>
        )
      },
      DateColumn({
        accessor: 'checked_out_at',
        title: t`Checked out`,
        extra: { showTime: true }
      }),
      DateColumn({
        accessor: 'checked_in_at',
        title: t`Checked in`,
        extra: { showTime: true }
      }),
      {
        accessor: 'notes_preview',
        title: t`Notes`,
        render: (record: any) => record.notes_preview || '-'
      }
    ];
  }, []);

  return (
    <>
      {usageModal.modal}
      {createAssignment.modal}
      {editAssignment.modal}
      {markInUse.modal}
      {markReturned.modal}
      {deleteAssignment.modal}
      <TrackletTable
        url={apiUrl(ApiEndpoints.tracklet_event_furniture_list)}
        tableState={table}
        columns={columns}
        props={{
          params: {
            event: eventId,
            in_use: defaultFilter === 'in-use'
          },
          rowActions,
          tableActions,
          tableFilters,
          enableSelection: true,
          enableDownload: true
        }}
      />
    </>
  );
}
