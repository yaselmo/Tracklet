import { t } from '@lingui/core/macro';
import { Stack } from '@mantine/core';
import {
  IconCalendarEvent,
  IconMapPin,
  IconUserCog,
  IconVersions
} from '@tabler/icons-react';
import { useMemo } from 'react';

import { UserRoles } from '@lib/enums/Roles';
import PermissionDenied from '../../components/errors/PermissionDenied';
import { PageDetail } from '../../components/nav/PageDetail';
import { PanelGroup } from '../../components/panels/PanelGroup';
import { useUserState } from '../../states/UserState';
import { EventTable } from '../../tables/events/EventTable';
import { EventTypeTable } from '../../tables/events/EventTypeTable';
import { PlannerTable } from '../../tables/events/PlannerTable';
import { VenueTable } from '../../tables/events/VenueTable';

export default function EventsIndex() {
  const user = useUserState();

  const panels = useMemo(() => {
    return [
      {
        name: 'events',
        label: t`Events`,
        icon: <IconCalendarEvent />,
        content: <EventTable />
      },
      {
        name: 'venues',
        label: t`Venues`,
        icon: <IconMapPin />,
        content: <VenueTable />
      },
      {
        name: 'planners',
        label: t`Planners`,
        icon: <IconUserCog />,
        content: <PlannerTable />
      },
      {
        name: 'types',
        label: t`Event Types`,
        icon: <IconVersions />,
        content: <EventTypeTable />
      }
    ];
  }, [user]);

  if (!user.isLoggedIn() || !user.hasViewRole(UserRoles.sales_order)) {
    return <PermissionDenied />;
  }

  return (
    <Stack>
      <PageDetail title={t`Events`} />
      <PanelGroup
        pageKey='events-index'
        panels={panels}
        model={'events'}
        id={null}
      />
    </Stack>
  );
}
