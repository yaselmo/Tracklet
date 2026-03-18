import { t } from '@lingui/core/macro';
import { Stack } from '@mantine/core';
import {
  IconArchive,
  IconClockHour4,
  IconListDetails,
  IconCalendar,
} from '@tabler/icons-react';
import { useMemo } from 'react';

import { UserRoles } from '@lib/enums/Roles';
import PermissionDenied from '../../components/errors/PermissionDenied';
import { PageDetail } from '../../components/nav/PageDetail';
import { PanelGroup } from '../../components/panels/PanelGroup';
import ProjectTable from '../../tables/projects/ProjectTable';
import { useUserState } from '../../states/UserState';

export default function ProjectsIndex() {
  const user = useUserState();

  const panels = useMemo(() => {
    return [
      {
        name: 'projects',
        label: t({ id: 'projects.panel.all', message: 'Projects (All)' }),
        icon: <IconListDetails />,
        content: <ProjectTable mode='all' />
      },
      {
        name: 'future',
        label: t({ id: 'projects.panel.future', message: 'Future' }),
        icon: <IconCalendar />,
        content: <ProjectTable mode='future' />
      },
      {
        name: 'ongoing',
        label: t({ id: 'projects.panel.ongoing', message: 'Ongoing' }),
        icon: <IconClockHour4 />,
        content: <ProjectTable mode='ongoing' />
      },
      {
        name: 'past-projects',
        label: t({ id: 'projects.panel.past', message: 'Past Projects' }),
        icon: <IconArchive />,
        content: <ProjectTable mode='past' />
      }
    ];
  }, []);

  if (!user.isLoggedIn() || !user.hasViewRole(UserRoles.project)) {
    return <PermissionDenied />;
  }

  return (
    <Stack>
      <PageDetail title={t({ id: 'projects.page.title', message: 'Projects' })} />
      <PanelGroup
        pageKey='projects-index'
        panels={panels}
        model='project'
        id={null}
      />
    </Stack>
  );
}
