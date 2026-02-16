import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { t } from '@lingui/core/macro';
import { Skeleton, Stack } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  DetailsTable,
  type DetailsField
} from '../../components/details/Details';
import { ItemDetailsGrid } from '../../components/details/ItemDetails';
import InstanceDetail from '../../components/nav/InstanceDetail';
import { PageDetail } from '../../components/nav/PageDetail';
import type { PanelType } from '../../components/panels/Panel';
import { PanelGroup } from '../../components/panels/PanelGroup';
import { useInstance } from '../../hooks/UseInstance';

export default function EventDetail() {
  const { id } = useParams();

  const { instance, instanceQuery } = useInstance({
    endpoint: ApiEndpoints.event_list,
    pk: id
  });

  const detailsPanel = useMemo(() => {
    if (instanceQuery.isFetching) {
      return <Skeleton />;
    }

    const fields: DetailsField[] = [
      {
        type: 'string',
        name: 'title',
        label: t`Title`,
        icon: 'info',
        copy: true
      },
      {
        type: 'text',
        name: 'description',
        label: t`Description`,
        icon: 'note',
        hidden: !instance?.description
      },
      {
        type: 'status',
        name: 'status_custom_key',
        label: t`Status`,
        icon: 'status',
        model: ModelType.event
      },
      {
        type: 'date',
        name: 'start_date',
        label: t`Start Date`,
        icon: 'calendar'
      },
      {
        type: 'date',
        name: 'end_date',
        label: t`End Date`,
        icon: 'calendar',
        hidden: !instance?.end_date
      },
      {
        type: 'boolean',
        name: 'late_night_takedown',
        label: t`Late-night takedown?`,
        icon: 'status'
      },
      {
        type: 'string',
        name: 'planner',
        label: t`Planner`,
        icon: 'user',
        badge: 'user',
        hidden: !instance?.planner
      },
      {
        type: 'string',
        name: 'venue',
        label: t`Venue`,
        icon: 'location',
        hidden: !instance?.venue
      },
      {
        type: 'string',
        name: 'event_type_text',
        label: t`Event Type`,
        icon: 'category',
        hidden: !instance?.event_type_text
      },
      {
        type: 'date',
        name: 'creation_date',
        label: t`Creation Date`,
        icon: 'calendar',
        hidden: !instance?.creation_date
      },
      {
        type: 'string',
        name: 'created_by',
        label: t`Created By`,
        icon: 'user',
        badge: 'user',
        hidden: !instance?.created_by
      }
    ];

    return (
      <ItemDetailsGrid>
        <DetailsTable fields={fields} item={instance} title={t`Event Details`} />
      </ItemDetailsGrid>
    );
  }, [instance, instanceQuery]);

  const panels: PanelType[] = useMemo(() => {
    return [
      {
        name: 'detail',
        label: t`Event Details`,
        icon: <IconInfoCircle />,
        content: detailsPanel
      }
    ];
  }, [detailsPanel]);

  return (
    <InstanceDetail query={instanceQuery} requiredPermission={ModelType.event}>
      <Stack gap='xs'>
        <PageDetail
          title={`${t`Event`}: ${instance?.title ?? instance?.pk ?? id}`}
          breadcrumbs={[{ name: 'Events', url: '/events/' }]}
          lastCrumb={[
            {
              name: instance?.title ?? `${instance?.pk ?? id}`,
              url: `/events/event/${instance?.pk ?? id}/`
            }
          ]}
        />
        <PanelGroup
          pageKey='event'
          panels={panels}
          model={ModelType.event}
          id={instance?.pk}
          instance={instance}
          reloadInstance={instanceQuery.refetch}
        />
      </Stack>
    </InstanceDetail>
  );
}
