import { t } from '@lingui/core/macro';
import { useCallback, useMemo, useState } from 'react';

import { AddItemButton } from '@lib/components/AddItemButton';
import { ActionButton } from '@lib/components/ActionButton';
import { RowEditAction, type RowAction } from '@lib/components/RowActions';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { IconBolt, IconBoxOff } from '@tabler/icons-react';
import { NumberInput, Select, Stack } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { RenderStockItem, RenderStockLocation } from '../../components/render/Stock';
import { useApi } from '../../contexts/ApiContext';
import {
  useProjectAutoAssignInstrumentFields,
  useProjectInstrumentFields
} from '../../forms/ProjectForms';
import { showApiErrorMessage } from '../../functions/notifications';
import {
  useCreateApiFormModal,
  useDeleteApiFormModal,
  useEditApiFormModal
} from '../../hooks/UseForm';
import { useTable } from '../../hooks/UseTable';
import { useUserState } from '../../states/UserState';
import { TrackletTable } from '../TrackletTable';

export default function ProjectInstrumentationPanel({
  projectId,
  readOnly
}: Readonly<{ projectId: number; readOnly?: boolean }>) {
  const table = useTable(`project-instruments-${projectId}`);
  const user = useUserState();
  const api = useApi();
  const [selectedInstrument, setSelectedInstrument] = useState<number>(0);

  const addFields = useProjectInstrumentFields(projectId);
  const editFields = useProjectInstrumentFields(projectId);
  const autoAssignFields = useProjectAutoAssignInstrumentFields();

  const addInstrument = useCreateApiFormModal({
    url: ApiEndpoints.project_instruments,
    pk: projectId,
    title: t`Add Instrument`,
    fields: addFields,
    successMessage: t`Instrument added`,
    onFormSuccess: table.refreshTable
  });

  const autoAssignInstrument = useCreateApiFormModal({
    url: ApiEndpoints.project_instrument_auto_assign,
    pk: projectId,
    title: t`Auto assign from stock`,
    fields: autoAssignFields,
    successMessage: t`Instruments auto-assigned`,
    onFormSuccess: table.refreshTable
  });

  const editInstrument = useEditApiFormModal({
    url: ApiEndpoints.project_instrument_list,
    pk: selectedInstrument,
    title: t`Edit Instrument`,
    fields: editFields,
    successMessage: t`Instrument updated`,
    onFormSuccess: table.refreshTable
  });

  const deleteInstrument = useDeleteApiFormModal({
    url: ApiEndpoints.project_instrument_list,
    pk: selectedInstrument,
    title: t`Remove Instrument`,
    onFormSuccess: table.refreshTable
  });

  const rowActions = useCallback(
    (record: any): RowAction[] => {
      return [
        RowEditAction({
          hidden: readOnly || !user.hasChangeRole(UserRoles.project),
          onClick: () => {
            setSelectedInstrument(record.pk);
            editInstrument.open();
          }
        }),
        {
          title: t`Remove`,
          color: 'red',
          hidden: readOnly || !user.hasDeleteRole(UserRoles.project),
          onClick: () => {
            setSelectedInstrument(record.pk);
            deleteInstrument.open();
          }
        }
      ];
    },
    [readOnly, user, editInstrument.open, deleteInstrument.open]
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
        render: (record: any) =>
          record.part_detail?.IPN || record.part_detail?.full_name || ''
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

  const selectedInstruments = useMemo(
    () =>
      table.selectedRecords.map((record: any) => ({
        pk: record.pk,
        quantity: Number(record.quantity ?? 0)
      })),
    [table.selectedRecords]
  );
  const selectedInstrumentIds = useMemo(
    () => selectedInstruments.map((instrument) => instrument.pk),
    [selectedInstruments]
  );

  const releaseSelectedInstruments = useCallback(() => {
    if (selectedInstruments.length <= 0) {
      return;
    }

    let selectedReleaseStatus = 'RETURNED';
    const singleSelectedInstrument =
      selectedInstruments.length === 1 ? selectedInstruments[0] : undefined;
    let selectedReleaseQuantity = singleSelectedInstrument?.quantity ?? 1;

    modals.openConfirmModal({
      title: t`Release Instruments`,
      children: (
        <Stack gap='sm'>
          <Select
            label={t`Release as`}
            defaultValue='RETURNED'
            data={[
              { value: 'RETURNED', label: t`Returned` },
              { value: 'BROKEN', label: t`Broken` },
              { value: 'MISSING', label: t`Missing` }
            ]}
            allowDeselect={false}
            onChange={(value) => {
              selectedReleaseStatus = value || 'RETURNED';
            }}
          />
          {singleSelectedInstrument ? (
            <NumberInput
              label={t`Quantity to release`}
              min={1}
              max={singleSelectedInstrument.quantity}
              decimalScale={5}
              clampBehavior='strict'
              defaultValue={singleSelectedInstrument.quantity}
              onChange={(value) => {
                if (typeof value === 'number' && !Number.isNaN(value)) {
                  selectedReleaseQuantity = value;
                }
              }}
            />
          ) : null}
        </Stack>
      ),
      labels: {
        confirm: t`Release`,
        cancel: t`Cancel`
      },
      onConfirm: async () => {
        try {
          const releaseItems = singleSelectedInstrument
            ? [
                {
                  instrument_id: singleSelectedInstrument.pk,
                  quantity: selectedReleaseQuantity
                }
              ]
            : selectedInstrumentIds.map((instrumentId, index) => ({
                instrument_id: instrumentId,
                quantity: selectedInstruments[index]?.quantity ?? 1
              }));

          await api.post(
            apiUrl(ApiEndpoints.project_instrument_release, projectId),
            {
              release_items: releaseItems,
              release_status: selectedReleaseStatus
            }
          );

          showNotification({
            title: t`Success`,
            message: t`Instruments released`,
            color: 'green'
          });

          table.clearSelectedRecords();
          table.refreshTable();
        } catch (error) {
          showApiErrorMessage({
            error,
            title: t`Failed to release instruments`
          });
        }
      }
    });
  }, [api, projectId, selectedInstrumentIds, selectedInstruments, table]);

  const tableActions = useMemo(() => {
    return [
      <ActionButton
        key='release-project-instrument'
        tooltip={t`Release selected instruments`}
        onClick={releaseSelectedInstruments}
        disabled={selectedInstruments.length <= 0}
        hidden={readOnly || !user.hasDeleteRole(UserRoles.project)}
        color='red'
        icon={<IconBoxOff />}
      />,
      <ActionButton
        key='auto-assign-project-instrument'
        tooltip={t`Auto assign from stock`}
        onClick={() => autoAssignInstrument.open()}
        hidden={readOnly || !user.hasAddRole(UserRoles.project)}
        color='blue'
        icon={<IconBolt />}
      />,
      <AddItemButton
        key='add-project-instrument'
        tooltip={t`Add Instrument`}
        onClick={() => addInstrument.open()}
        hidden={readOnly || !user.hasAddRole(UserRoles.project)}
      />
    ];
  }, [
    readOnly,
    user,
    addInstrument.open,
    autoAssignInstrument.open,
    releaseSelectedInstruments,
    selectedInstruments.length
  ]);

  return (
    <>
      {addInstrument.modal}
      {autoAssignInstrument.modal}
      {editInstrument.modal}
      {deleteInstrument.modal}
      <TrackletTable
        url={apiUrl(ApiEndpoints.project_instruments, projectId)}
        tableState={table}
        columns={tableColumns}
        props={{
          rowActions,
          tableActions,
          enableSelection: true,
          enableDownload: true,
          noRecordsText: t`No instruments added`
        }}
      />
    </>
  );
}
