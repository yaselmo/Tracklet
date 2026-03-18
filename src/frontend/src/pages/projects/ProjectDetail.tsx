import { t } from '@lingui/core/macro';
import { Badge, Skeleton, Stack } from '@mantine/core';
import {
  IconArchive,
  IconBookmark,
  IconCheck,
  IconEdit,
  IconInfoCircle,
  IconListDetails,
  IconPaperclip
} from '@tabler/icons-react';
import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { ActionButton } from '@lib/components/ActionButton';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { UserRoles } from '@lib/enums/Roles';
import {
  type DetailsField,
  DetailsTable
} from '../../components/details/Details';
import { ItemDetailsGrid } from '../../components/details/ItemDetails';
import InstanceDetail from '../../components/nav/InstanceDetail';
import { PageDetail } from '../../components/nav/PageDetail';
import NotesPanel from '../../components/panels/NotesPanel';
import type { PanelType } from '../../components/panels/Panel';
import { PanelGroup } from '../../components/panels/PanelGroup';
import { AttachmentTable } from '../../tables/general/AttachmentTable';
import ProjectAllocationTable from '../../tables/projects/ProjectAllocationTable';
import ProjectAutomaticReportsPanel from '../../tables/projects/ProjectAutomaticReportsPanel';
import ProjectInstrumentationPanel from '../../tables/projects/ProjectInstrumentationPanel';
import { useProjectFields } from '../../forms/ProjectForms';
import { useEditApiFormModal } from '../../hooks/UseForm';
import { useInstance } from '../../hooks/UseInstance';
import { useUserState } from '../../states/UserState';

export default function ProjectDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useUserState();

  const { instance: project, instanceQuery, refreshInstance } = useInstance({
    endpoint: ApiEndpoints.project_list,
    pk: id
  });

  const projectFields = useProjectFields();

  const editProject = useEditApiFormModal({
    url: ApiEndpoints.project_list,
    pk: project?.pk,
    title: t`Edit Project`,
    fields: projectFields,
    onFormSuccess: refreshInstance
  });

  const markCompleted = useEditApiFormModal({
    url: ApiEndpoints.project_list,
    pk: project?.pk,
    title: t`Mark Ongoing`,
    fetchInitialData: false,
    fields: {
      status: {
        hidden: true,
        value: 'ONGOING'
      }
    },
    successMessage: t`Project updated`,
    onFormSuccess: refreshInstance
  });

  const markArchived = useEditApiFormModal({
    url: ApiEndpoints.project_list,
    pk: project?.pk,
    title: t`Mark Past`,
    fetchInitialData: false,
    fields: {
      status: {
        hidden: true,
        value: 'PAST'
      }
    },
    successMessage: t`Project updated`,
    onFormSuccess: refreshInstance
  });

  const readOnly = useMemo(() => {
    return project?.status === 'PAST';
  }, [project?.status]);

  const actions = useMemo(() => {
    const canEdit = user.hasChangeRole(UserRoles.project);

    return [
      <ActionButton
        key='edit-project'
        tooltip={t`Edit Project`}
        icon={<IconEdit />}
        onClick={() => editProject.open()}
        hidden={!canEdit}
      />,
      <ActionButton
        key='complete-project'
        tooltip={t`Mark Ongoing`}
        icon={<IconCheck />}
        onClick={() => markCompleted.open()}
        hidden={!canEdit || readOnly || project?.status === 'ONGOING'}
      />,
      <ActionButton
        key='archive-project'
        tooltip={t`Mark Past`}
        icon={<IconArchive />}
        onClick={() => markArchived.open()}
        hidden={!canEdit || project?.status === 'PAST'}
      />
    ];
  }, [
    user,
    readOnly,
    project?.status,
    editProject.open,
    markCompleted.open,
    markArchived.open
  ]);

  useEffect(() => {
    if (id && location.pathname.match(new RegExp(`/projects/${id}/?$`))) {
      navigate('details', { replace: true });
    }
  }, [id, location.pathname, navigate]);

  const detailsPanel = useMemo(() => {
    if (instanceQuery.isFetching) {
      return <Skeleton />;
    }

    const left: DetailsField[] = [
      {
        type: 'text',
        name: 'name',
        label: t`Project Name`,
        copy: true
      },
      {
        type: 'text',
        name: 'reference',
        label: t`Reference`,
        copy: true,
        hidden: !project?.reference
      },
      {
        type: 'text',
        name: 'description',
        label: t`Description`,
        copy: true,
        hidden: !project?.description
      },
      {
        type: 'text',
        name: 'location',
        label: t`Location`,
        copy: true,
        value_formatter: () =>
          project?.location_detail?.pathstring ||
          project?.location_detail?.name ||
          '-'
      },
      {
        type: 'text',
        name: 'status',
        label: t`Status`,
        value_formatter: () => (
          <Badge
            color={
              project?.status === 'ONGOING'
                ? 'blue'
                : project?.status === 'PAST'
                  ? 'gray'
                  : 'cyan'
            }
          >
            {project?.status}
          </Badge>
        )
      }
    ];

    const right: DetailsField[] = [
      {
        type: 'date',
        name: 'start_date',
        label: t`Start Date`,
        copy: true,
        hidden: !project?.start_date
      },
      {
        type: 'date',
        name: 'end_date',
        label: t`End Date`,
        copy: true,
        hidden: !project?.end_date
      },
      {
        type: 'date',
        name: 'created',
        label: t`Created Date`,
        copy: true,
        hidden: !project?.created
      },
      {
        type: 'text',
        name: 'created_by',
        label: t`Responsible`,
        badge: 'user',
        hidden: !project?.created_by
      }
    ];

    return (
      <ItemDetailsGrid>
        <DetailsTable fields={left} item={project} />
        <DetailsTable fields={right} item={project} />
      </ItemDetailsGrid>
    );
  }, [project, instanceQuery]);

  const projectPanels: PanelType[] = useMemo(() => {
    return [
      {
        name: 'details',
        label: t`Project Details`,
        icon: <IconInfoCircle />,
        content: detailsPanel
      },
      {
        name: 'stock',
        label: t`Allocated Stock`,
        icon: <IconBookmark />,
        content: project?.pk ? (
          <ProjectAllocationTable projectId={project.pk} readOnly={readOnly} />
        ) : (
          <Skeleton />
        )
      },
      {
        name: 'instrumentation',
        label: t`Instrumentation`,
        icon: <IconListDetails />,
        content: project?.pk ? (
          <ProjectInstrumentationPanel projectId={project.pk} readOnly={readOnly} />
        ) : (
          <Skeleton />
        )
      },
      {
        name: 'attachments',
        label: t`Attachments`,
        icon: <IconPaperclip />,
        content: project?.pk ? (
          <Stack gap='md'>
            <AttachmentTable model_type={ModelType.project} model_id={project.pk} />
            <ProjectAutomaticReportsPanel
              projectId={project.pk}
              projectName={project.name}
              projectLocation={project.location}
              projectLocationDisplay={
                project?.location_detail?.pathstring ||
                project?.location_detail?.name ||
                ''
              }
              readOnly={readOnly}
            />
          </Stack>
        ) : (
          <Skeleton />
        )
      },
      NotesPanel({
        model_type: ModelType.project,
        model_id: project?.pk,
        has_note: !!project?.notes
      })
    ];
  }, [detailsPanel, project, readOnly]);

  return (
    <>
      {editProject.modal}
      {markCompleted.modal}
      {markArchived.modal}
      <InstanceDetail query={instanceQuery} requiredRole={UserRoles.project}>
        <Stack gap='xs'>
          <PageDetail
            title={project?.name || t`Project`}
            subtitle={project?.description}
            actions={actions}
            breadcrumbs={[{ name: t`Projects`, url: '/projects/' }]}
            lastCrumb={[
              { name: project?.name || t`Project`, url: `/projects/${project?.pk}` }
            ]}
          />
          <PanelGroup
            pageKey={`project-${project?.pk ?? id}`}
            panels={projectPanels}
            model={ModelType.project}
            id={project?.pk}
            reloadInstance={refreshInstance}
            instance={project}
          />
        </Stack>
      </InstanceDetail>
    </>
  );
}
