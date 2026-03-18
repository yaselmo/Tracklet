import { t } from '@lingui/core/macro';
import { useMemo } from 'react';

import { AddItemButton } from '@lib/components/AddItemButton';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { useProjectFields } from '../../forms/ProjectForms';
import { useCreateApiFormModal } from '../../hooks/UseForm';
import { useTable } from '../../hooks/UseTable';
import { useUserState } from '../../states/UserState';
import { DateColumn } from '../ColumnRenderers';
import { TrackletTable } from '../TrackletTable';

export default function ProjectTable({
  mode
}: Readonly<{ mode: 'all' | 'future' | 'ongoing' | 'past' }>) {
  const table = useTable(`projects-${mode}`);
  const user = useUserState();

  const projectFields = useProjectFields();
  const canAddProject =
    user.hasAddRole(UserRoles.project) &&
    user.hasAddPermission(ModelType.project);

  const createProject = useCreateApiFormModal({
    url: ApiEndpoints.project_list,
    title: t`Create Project`,
    fields: projectFields,
    modelType: ModelType.project,
    follow: true
  });

  const tableColumns = useMemo(() => {
    return [
      {
        accessor: 'name',
        title: t`Name`,
        sortable: true
      },
      DateColumn({
        accessor: 'start_date',
        title: t`Start Date`,
        sortable: true
      }),
      {
        accessor: 'status',
        title: t`Status`,
        sortable: true
      },
      {
        accessor: 'allocations_count',
        title: t`Allocated Items`,
        sortable: true
      },
      {
        accessor: 'allocated_quantity',
        title: t`Total Allocated Qty`,
        sortable: true
      }
    ];
  }, []);

  const tableActions = useMemo(() => {
    if (mode === 'past') {
      return [];
    }

    return [
      <AddItemButton
        key='add-project'
        tooltip={t`Create Project`}
        onClick={() => createProject.open()}
        hidden={!canAddProject}
      />
    ];
  }, [mode, canAddProject, createProject.open]);

  return (
    <>
      {createProject.modal}
      <TrackletTable
        url={apiUrl(ApiEndpoints.project_list)}
        tableState={table}
        columns={tableColumns}
        props={{
          params: {
            status:
              mode === 'all'
                ? 'ALL'
                : mode === 'future'
                  ? 'FUTURE'
                  : mode === 'ongoing'
                    ? 'ONGOING'
                    : 'PAST'
          },
          tableActions,
          modelType: ModelType.project,
          enableSelection: false,
          enableDownload: true
        }}
      />
    </>
  );
}
