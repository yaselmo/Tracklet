import { t } from '@lingui/core/macro';
import { Badge, Grid, Stack, Text } from '@mantine/core';
import { IconArmchair, IconInfoCircle, IconNotes } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { UserRoles } from '@lib/enums/Roles';
import PrimaryActionButton from '../../components/buttons/PrimaryActionButton';
import {
  type DetailsField,
  DetailsTable
} from '../../components/details/Details';
import InstanceDetail from '../../components/nav/InstanceDetail';
import { PageDetail } from '../../components/nav/PageDetail';
import type { PanelType } from '../../components/panels/Panel';
import { PanelGroup } from '../../components/panels/PanelGroup';
import { useEditApiFormModal } from '../../hooks/UseForm';
import { useInstance } from '../../hooks/UseInstance';
import { useUserState } from '../../states/UserState';
import { useEventFields } from '../../forms/EventRentalForms';
import { EventFurnitureTable } from '../../tables/events/EventFurnitureTable';

export default function EventDetail() {
  const { id } = useParams();
  const user = useUserState();

  const {
    instance: event,
    instanceQuery,
    refreshInstance
  } = useInstance({
    endpoint: ApiEndpoints.tracklet_event_list,
    pk: id
  });

  const eventFields = useEventFields();

  const editEvent = useEditApiFormModal({
    url: ApiEndpoints.tracklet_event_list,
    pk: event.pk,
    title: t`Edit Event`,
    fields: eventFields,
    onFormSuccess: refreshInstance
  });

  const changeStatus = useEditApiFormModal({
    url: ApiEndpoints.tracklet_event_list,
    pk: event.pk,
    title: t`Change Event Status`,
    fields: {
      status: {}
    },
    onFormSuccess: refreshInstance
  });

  const addNote = useEditApiFormModal({
    url: ApiEndpoints.tracklet_event_list,
    pk: event.pk,
    title: t`Add Note`,
    fields: {
      notes: {}
    },
    onFormSuccess: refreshInstance
  });

  const detailsPanel = useMemo(() => {
    const left: DetailsField[] = [
      {
        type: 'text',
        name: 'reference',
        label: t`Reference`,
        copy: true
      },
      {
        type: 'text',
        name: 'title',
        label: t`Title`,
        copy: true
      },
      {
        type: 'text',
        name: 'event_type_detail.name',
        label: t`Event Type`
      },
      {
        type: 'text',
        name: 'venue_detail.name',
        label: t`Venue`
      },
      {
        type: 'text',
        name: 'planner_detail.name',
        label: t`Planner`,
        hidden: !event.planner_detail
      }
    ];

    const right: DetailsField[] = [
      {
        type: 'date',
        name: 'start_datetime',
        label: t`Start DateTime`,
        copy: true
      },
      {
        type: 'date',
        name: 'end_datetime',
        label: t`End DateTime`,
        copy: true
      },
      {
        type: 'text',
        name: 'late_night_takedown',
        label: t`Late Night Takedown`,
        value_formatter: () => (event.late_night_takedown ? t`Yes` : t`No`)
      },
      {
        type: 'date',
        name: 'last_updated',
        label: t`Last Updated`,
        copy: true
      }
    ];

    return (
      <Grid>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <DetailsTable fields={left} item={event} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <DetailsTable fields={right} item={event} />
        </Grid.Col>
      </Grid>
    );
  }, [event]);

  const panels: PanelType[] = useMemo(() => {
    return [
      {
        name: 'overview',
        label: t`Overview`,
        icon: <IconInfoCircle />,
        content: detailsPanel
      },
      {
        name: 'furniture',
        label: t`Furniture`,
        icon: <IconArmchair />,
        content: event.pk ? <EventFurnitureTable event={event} /> : <></>
      },
      {
        name: 'notes',
        label: t`Notes`,
        icon: <IconNotes />,
        content: (
          <Text style={{ whiteSpace: 'pre-wrap' }} size='sm'>
            {event.notes || t`No notes`}
          </Text>
        )
      }
    ];
  }, [event, detailsPanel]);

  const actions = useMemo(() => {
    return [
      <PrimaryActionButton
        title={t`Edit`}
        icon='edit'
        hidden={!user.hasChangeRole(UserRoles.sales_order)}
        onClick={editEvent.open}
      />,
      <PrimaryActionButton
        title={t`Change Status`}
        icon='status'
        hidden={!user.hasChangeRole(UserRoles.sales_order)}
        onClick={changeStatus.open}
      />,
      <PrimaryActionButton
        title={t`Add Note`}
        icon='note'
        hidden={!user.hasChangeRole(UserRoles.sales_order)}
        onClick={addNote.open}
      />
    ];
  }, [user, editEvent, changeStatus, addNote]);

  return (
    <>
      {editEvent.modal}
      {changeStatus.modal}
      {addNote.modal}
      <InstanceDetail query={instanceQuery} requiredRole={UserRoles.sales_order}>
        <Stack gap='xs'>
          <PageDetail
            title={`${t`Event`}: ${event.reference}`}
            subtitle={event.title}
            actions={actions}
            breadcrumbs={[{ name: t`Events`, url: '/events/' }]}
            lastCrumb={[{ name: event.reference, url: `/events/event/${event.pk}` }]}
            badges={
              event.status_name
                ? [
                    <Badge key='event-status' size='lg'>
                      {event.status_name}
                    </Badge>
                  ]
                : []
            }
          />
          <PanelGroup
            pageKey='event-detail'
            panels={panels}
            model={'events'}
            id={event.pk}
            instance={event}
            reloadInstance={refreshInstance}
          />
        </Stack>
      </InstanceDetail>
    </>
  );
}
