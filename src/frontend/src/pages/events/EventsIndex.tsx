import { Stack } from '@mantine/core';

import { UserRoles } from '@lib/enums/Roles';
import PermissionDenied from '../../components/errors/PermissionDenied';
import { PageDetail } from '../../components/nav/PageDetail';
import { useUserState } from '../../states/UserState';
import { EventsTable } from '../../tables/events/EventsTable';

export default function EventsIndex() {
  const user = useUserState();

  if (!user.isLoggedIn() || !user.hasViewRole(UserRoles.sales_order)) {
    return <PermissionDenied />;
  }

  return (
    <Stack>
      <PageDetail title='Events' />
      <EventsTable />
    </Stack>
  );
}
