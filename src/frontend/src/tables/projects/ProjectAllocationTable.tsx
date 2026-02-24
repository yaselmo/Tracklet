import { t } from '@lingui/core/macro';
import { useCallback, useMemo, useState } from 'react';

import { AddItemButton } from '@lib/components/AddItemButton';
import { RowEditAction, type RowAction } from '@lib/components/RowActions';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { useProjectAllocationFields } from '../../forms/ProjectForms';
import {
  useCreateApiFormModal,
  useDeleteApiFormModal,
  useEditApiFormModal
} from '../../hooks/UseForm';
import { useTable } from '../../hooks/UseTable';
import { useUserState } from '../../states/UserState';
import { RenderStockItem, RenderStockLocation } from '../../components/render/Stock';
import { TrackletTable } from '../TrackletTable';

export default function ProjectAllocationTable({
  projectId,
  readOnly
}: Readonly<{ projectId: number; readOnly?: boolean }>) {
  const table = useTable(`project-allocation-${projectId}`);
  const user = useUserState();
  const [selected, setSelected] = useState<number>(0);

  const addFields = useProjectAllocationFields(projectId);
  const editFields = useProjectAllocationFields();

  const addAllocation = useCreateApiFormModal({
    url: ApiEndpoints.project_allocations,
    pk: projectId,
    title: t`Add Stock Item`,
    fields: addFields,
    onFormSuccess: table.refreshTable
  });

  const editAllocation = useEditApiFormModal({
    url: ApiEndpoints.project_allocation_list,
    pk: selected,
    title: t`Edit Allocation`,
    fields: editFields,
    onFormSuccess: table.refreshTable
  });

  const deleteAllocation = useDeleteApiFormModal({
    url: ApiEndpoints.project_allocation_list,
    pk: selected,
    title: t`Remove Allocation`,
    onFormSuccess: table.refreshTable
  });

  const rowActions = useCallback(
    (record: any): RowAction[] => {
      return [
        RowEditAction({
          hidden: readOnly || !user.hasChangeRole(UserRoles.project),
          onClick: () => {
            setSelected(record.pk);
            editAllocation.open();
          }
        }),
        {
          title: t`Remove`,
          color: 'red',
          hidden: readOnly || !user.hasDeleteRole(UserRoles.project),
          onClick: () => {
            setSelected(record.pk);
            deleteAllocation.open();
          }
        }
      ];
    },
    [readOnly, user, editAllocation.open, deleteAllocation.open]
  );

  const tableColumns = useMemo(() => {
    return [
      {
        accessor: 'stock_item',
        title: t`Stock Item`,
        sortable: true,
        render: (record: any) => (
          <RenderStockItem instance={record.stock_item_detail} link />
        )
      },
      {
        accessor: 'part',
        title: t`Part / SKU`,
        sortable: true,
        render: (record: any) => record.part_detail?.full_name || ''
      },
      {
        accessor: 'location',
        title: t`Location`,
        sortable: true,
        render: (record: any) =>
          record.location_detail ? (
            <RenderStockLocation instance={record.location_detail} link />
          ) : (
            ''
          )
      },
      {
        accessor: 'quantity',
        title: t`Quantity`,
        sortable: true
      },
      {
        accessor: 'notes',
        title: t`Notes`,
        sortable: false
      }
    ];
  }, []);

  const tableActions = useMemo(() => {
    return [
      <AddItemButton
        key='add-project-allocation'
        tooltip={t`Add Stock Item`}
        onClick={() => addAllocation.open()}
        hidden={readOnly || !user.hasAddRole(UserRoles.project)}
      />
    ];
  }, [readOnly, user, addAllocation.open]);

  return (
    <>
      {addAllocation.modal}
      {editAllocation.modal}
      {deleteAllocation.modal}
      <TrackletTable
        url={apiUrl(ApiEndpoints.project_allocations, projectId)}
        tableState={table}
        columns={tableColumns}
        props={{
          rowActions,
          tableActions,
          enableSelection: false,
          enableDownload: true
        }}
      />
    </>
  );
}
