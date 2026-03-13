import { t } from '@lingui/core/macro';
import { useCallback, useMemo, useState } from 'react';

import { AddItemButton } from '@lib/components/AddItemButton';
import { type RowAction, RowEditAction } from '@lib/components/RowActions';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import type { ApiFormFieldSet } from '@lib/types/Forms';
import type { TableColumn } from '@lib/types/Tables';
import { useCreateApiFormModal, useEditApiFormModal } from '../../hooks/UseForm';
import { useTable } from '../../hooks/UseTable';
import { useUserState } from '../../states/UserState';
import { DescriptionColumn } from '../ColumnRenderers';
import { TrackletTable } from '../TrackletTable';

export function StockCategoryTable() {
  const table = useTable('stockcategory');
  const user = useUserState();

  const [selectedCategory, setSelectedCategory] = useState<number>(-1);

  const tableColumns: TableColumn[] = useMemo(() => {
    return [
      {
        accessor: 'name',
        sortable: true
      },
      DescriptionColumn({}),
      {
        accessor: 'parent_detail.name',
        title: t`Parent`,
        sortable: true,
        render: (record: any) => record.parent_detail?.name || '-'
      }
    ];
  }, []);

  const categoryFields: ApiFormFieldSet = useMemo(() => {
    return {
      name: {
        required: true
      },
      description: {},
      parent: {
        field_type: 'related field',
        api_url: apiUrl(ApiEndpoints.stock_category_list),
        required: false,
        label: t`Parent Category`
      }
    };
  }, []);

  const newCategory = useCreateApiFormModal({
    url: ApiEndpoints.stock_category_list,
    title: t`New Stock Category`,
    fields: categoryFields,
    focus: 'name',
    table: table
  });

  const editCategory = useEditApiFormModal({
    url: ApiEndpoints.stock_category_list,
    pk: selectedCategory,
    title: t`Edit Stock Category`,
    fields: categoryFields,
    onFormSuccess: (record: any) => table.updateRecord(record)
  });

  const tableActions = useMemo(() => {
    return [
      <AddItemButton
        key='add-stock-category'
        tooltip={t`Add Stock Category`}
        onClick={() => newCategory.open()}
        hidden={!user.hasAddRole(UserRoles.stock)}
      />
    ];
  }, [user]);

  const rowActions = useCallback(
    (record: any): RowAction[] => {
      return [
        RowEditAction({
          hidden: !user.hasChangeRole(UserRoles.stock),
          onClick: () => {
            setSelectedCategory(record.pk);
            editCategory.open();
          }
        })
      ];
    },
    [user]
  );

  return (
    <>
      {newCategory.modal}
      {editCategory.modal}
      <TrackletTable
        url={apiUrl(ApiEndpoints.stock_category_list)}
        tableState={table}
        columns={tableColumns}
        props={{
          enableDownload: true,
          tableActions: tableActions,
          rowActions: rowActions,
          detailAction: false
        }}
      />
    </>
  );
}
