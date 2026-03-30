import { t } from '@lingui/core/macro';
import { Alert, Anchor, Group, Loader, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { apiUrl } from '@lib/functions/Api';
import { getDetailUrl } from '@lib/functions/Navigation';
import { useApi } from '../../../contexts/ApiContext';
import { formatDate } from '../../../defaults/formatters';
import { useUserState } from '../../../states/UserState';
import { StylishText } from '../../items/StylishText';
import type { DashboardWidgetProps } from '../DashboardWidget';

function OngoingProjectsContent() {
  const api = useApi();
  const navigate = useNavigate();

  const projectsQuery = useQuery({
    queryKey: ['dashboard-ongoing-projects'],
    queryFn: () =>
      api
        .get(apiUrl(ApiEndpoints.project_list), {
          params: {
            status: 'ONGOING',
            ordering: 'start_date',
            limit: 8
          }
        })
        .then((response: any) => response.data?.results ?? response.data ?? [])
        .catch(() => [])
  });

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  const openProjectDetails = (projectId: number) => {
    navigate(`${getDetailUrl(ModelType.project, projectId)}details`);
  };

  if (projectsQuery.isFetching) {
    return (
      <Group justify='center' py='md'>
        <Loader size='sm' />
      </Group>
    );
  }

  if ((projects?.length ?? 0) <= 0) {
    return (
      <Alert color='blue' title={t`No Ongoing Projects`}>
        <Text>{t`There are currently no ongoing projects`}</Text>
      </Alert>
    );
  }

  return (
    <Stack gap='xs'>
      {projects.map((project: any) => {
        const start = project.start_date ? formatDate(project.start_date) : t`No start`;
        const end = project.end_date ? formatDate(project.end_date) : t`No end`;

        return (
          <Group key={project.pk} justify='space-between' wrap='nowrap'>
            <Anchor
              component='button'
              type='button'
              onClick={() => openProjectDetails(project.pk)}
            >
              {project.name}
            </Anchor>
            <Text size='sm' c='dimmed'>
              {`${start} - ${end}`}
            </Text>
          </Group>
        );
      })}
    </Stack>
  );
}

export default function OngoingProjectsDashboardWidget(): DashboardWidgetProps {
  const user = useUserState();

  return {
    label: 'gstart',
    title: t`Ongoing Projects`,
    description: t`Display ongoing projects`,
    minWidth: 5,
    minHeight: 4,
    render: () => (
      <Stack>
        <StylishText size='xl'>{t`Ongoing Projects`}</StylishText>
        <OngoingProjectsContent />
      </Stack>
    ),
    enabled: user.hasViewPermission(ModelType.project)
  };
}
