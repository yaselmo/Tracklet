import { t } from '@lingui/core/macro';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AddItemButton } from '@lib/components/AddItemButton';
import {
  type RowAction,
  RowDeleteAction
} from '@lib/components/RowActions';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { getDetailUrl } from '@lib/functions/Navigation';
import type { TableFilter } from '@lib/types/Filters';
import type { StockOperationProps } from '@lib/types/Forms';
import type { TableColumn } from '@lib/types/Tables';
import { formatCurrency } from '../../defaults/formatters';
import { useStockFields } from '../../forms/StockForms';
import { Thumbnail } from '../../components/images/Thumbnail';
import {
  useCreateApiFormModal,
  useDeleteApiFormModal
} from '../../hooks/UseForm';
import { useStockAdjustActions } from '../../hooks/UseStockAdjustActions';
import { useTable } from '../../hooks/UseTable';
import {
  getTrackletStatusPill,
  TRACKLET_STATUS_OPTIONS
} from '../../components/render/TrackletStatus';
import { useGlobalSettingsState } from '../../states/SettingsStates';
import { useUserState } from '../../states/UserState';
import {
  DateColumn,
  DecimalColumn,
  LocationColumn,
  StockColumn
} from '../ColumnRenderers';
import {
  InStockFilter,
  IsSerializedFilter,
  ManufacturerFilter,
  SerialFilter,
  SerialGTEFilter,
  SerialLTEFilter,
  SupplierFilter
} from '../Filter';
import { TrackletTable } from '../TrackletTable';

/**
 * Construct a list of columns for the stock item table
 */
function stockItemTableColumns({
  showLocation,
  showPricing
}: {
  showLocation: boolean;
  showPricing: boolean;
}): TableColumn[] {
  return [
    {
      accessor: 'thumbnail',
      title: '',
      sortable: false,
      switchable: false,
      width: 56,
      render: (record: any) => (
        <Thumbnail
          src={
            record.thumbnail ??
            record.image ??
            record.part_detail?.thumbnail ??
            record.part_detail?.image
          }
          alt={record.name || record.part_detail?.name || t`Stock Item`}
          size={40}
          hover
          hoverSize={220}
        />
      )
    },
    {
      accessor: 'name',
      title: t`Name`,
      sortable: true
    },
    {
      accessor: 'category',
      title: t`Category`,
      sortable: true
    },
    {
      accessor: 'serial',
      title: t`SN`,
      sortable: true
    },
    StockColumn({
      accessor: '',
      title: t`Stock`,
      sortable: true,
      ordering: 'stock'
    }),
    DecimalColumn({
      accessor: 'broken_quantity',
      title: t`Broken`,
      sortable: true,
      ordering: 'broken_quantity'
    }),
    DecimalColumn({
      accessor: 'missing_quantity',
      title: t`Missing`,
      sortable: true,
      ordering: 'missing_quantity'
    }),
    DecimalColumn({
      accessor: 'available',
      title: t`Available`,
      sortable: true,
      ordering: 'available'
    }),
    {
      accessor: 'tracklet_status',
      title: t`Status`,
      sortable: true,
      render: (record: any) => getTrackletStatusPill(record)
    },
    LocationColumn({
      hidden: !showLocation,
      accessor: 'location_detail'
    }),
    {
      accessor: 'purchase_order',
      title: t`Purchase Order`,
      defaultVisible: false,
      render: (record: any) => {
        return record.purchase_order_reference;
      }
    },
    {
      accessor: 'SKU',
      title: t`Supplier Part`,
      sortable: true,
      defaultVisible: false
    },
    {
      accessor: 'MPN',
      title: t`Manufacturer Part`,
      sortable: true,
      defaultVisible: false
    },
    {
      accessor: 'purchase_price',
      title: t`Unit Price`,
      sortable: true,
      switchable: true,
      hidden: !showPricing,
      defaultVisible: false,
      render: (record: any) =>
        formatCurrency(record.purchase_price, {
          currency: record.purchase_price_currency
        })
    },
    {
      accessor: 'packaging',
      sortable: true,
      defaultVisible: false
    },

    DateColumn({
      title: t`Expiry Date`,
      accessor: 'expiry_date',
      hidden: !useGlobalSettingsState.getState().isSet('STOCK_ENABLE_EXPIRY'),
      defaultVisible: false
    }),
    DateColumn({
      title: t`Last Updated`,
      accessor: 'updated'
    }),
    DateColumn({
      accessor: 'last_calibration_date',
      title: t`Last Calibration`,
      sortable: true
    }),
    DateColumn({
      accessor: 'last_factory_calibration_date',
      title: t`Last Factory Calibration`,
      sortable: true
    })
  ];
}

/**
 * Construct a list of available filters for the stock item table
 */
function stockItemTableFilters({
  enableExpiry
}: {
  enableExpiry: boolean;
}): TableFilter[] {
  return [
    {
      name: 'status',
      label: t`Status`,
      description: t`Filter by stock status`,
      choiceFunction: () =>
        TRACKLET_STATUS_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label
        }))
    },
    {
      name: 'allocated',
      label: t`Allocated`,
      description: t`Show items which have been allocated`
    },
    {
      name: 'available',
      label: t`Available`,
      description: t`Show items which are available`
    },
    {
      name: 'broken',
      label: t`Broken`,
      description: t`Show items with broken quantity`
    },
    {
      name: 'cascade',
      label: t`Include Sublocations`,
      description: t`Include stock in sublocations`
    },
    {
      name: 'depleted',
      label: t`Depleted`,
      description: t`Show depleted stock items`
    },
    InStockFilter(),
    {
      name: 'is_building',
      label: t`In Production`,
      description: t`Show items which are in production`
    },
    SupplierFilter(),
    ManufacturerFilter(),
    {
      name: 'category',
      label: t`Category`,
      description: t`Filter by stock item category`,
      type: 'text'
    },
    {
      name: 'consumed',
      label: t`Consumed`,
      description: t`Show items which have been consumed by a build order`
    },
    {
      name: 'installed',
      label: t`Installed`,
      description: t`Show stock items which are installed in other items`
    },
    {
      name: 'missing',
      label: t`Missing`,
      description: t`Show items with missing quantity`
    },
    {
      name: 'sent_to_customer',
      label: t`Sent to Customer`,
      description: t`Show items which have been sent to a customer`
    },
    IsSerializedFilter(),
    SerialFilter(),
    SerialLTEFilter(),
    SerialGTEFilter(),
    {
      name: 'tracked',
      label: t`Tracked`,
      description: t`Show tracked items`
    },
    {
      name: 'has_purchase_price',
      label: t`Has Purchase Price`,
      description: t`Show items which have a purchase price`
    },
    {
      name: 'expired',
      label: t`Expired`,
      description: t`Show items which have expired`,
      active: enableExpiry
    },
    {
      name: 'stale',
      label: t`Stale`,
      description: t`Show items which are stale`,
      active: enableExpiry
    },
    {
      name: 'expiry_before',
      label: t`Expired Before`,
      description: t`Show items which expired before this date`,
      type: 'date',
      active: enableExpiry
    },
    {
      name: 'expiry_after',
      label: t`Expired After`,
      description: t`Show items which expired after this date`,
      type: 'date',
      active: enableExpiry
    },
    {
      name: 'updated_before',
      label: t`Updated Before`,
      description: t`Show items updated before this date`,
      type: 'date'
    },
    {
      name: 'updated_after',
      label: t`Updated After`,
      description: t`Show items updated after this date`,
      type: 'date'
    },
    {
      name: 'stocktake_before',
      label: t`Stocktake Before`,
      description: t`Show items counted before this date`,
      type: 'date'
    },
    {
      name: 'stocktake_after',
      label: t`Stocktake After`,
      description: t`Show items counted after this date`,
      type: 'date'
    },
    {
      name: 'external',
      label: t`External Location`,
      description: t`Show items in an external location`
    }
  ];
}

/*
 * Load a table of stock items
 */
export function StockItemTable({
  params = {},
  allowAdd = false,
  showLocation = true,
  showPricing = true,
  allowReturn = false,
  tableName = 'stockitems'
}: Readonly<{
  params?: any;
  allowAdd?: boolean;
  showLocation?: boolean;
  showPricing?: boolean;
  allowReturn?: boolean;
  tableName: string;
}>) {
  const table = useTable(tableName);
  const user = useUserState();

  const settings = useGlobalSettingsState();

  const stockExpiryEnabled = useMemo(
    () => settings.isSet('STOCK_ENABLE_EXPIRY'),
    [settings]
  );

  const navigate = useNavigate();

  const tableColumns = useMemo(
    () =>
      stockItemTableColumns({
        showLocation: showLocation ?? true,
        showPricing: showPricing ?? true
      }),
    [showLocation, showPricing]
  );

  const tableFilters: TableFilter[] = useMemo(
    () =>
      stockItemTableFilters({
        enableExpiry: stockExpiryEnabled
      }),
    [stockExpiryEnabled]
  );

  const stockOperationProps: StockOperationProps = useMemo(() => {
    return {
      items: table.selectedRecords,
      model: ModelType.stockitem,
      refresh: () => {
        table.clearSelectedRecords();
        table.refreshTable();
      },
      filters: {
        in_stock: true
      }
    };
  }, [table.selectedRecords, table.refreshTable]);

  const newStockItemFields = useStockFields({
    create: true,
    modalId: 'add-stock-item'
  });

  const newStockItem = useCreateApiFormModal({
    url: ApiEndpoints.stock_item_list,
    title: t`Add Stock Item`,
    modalId: 'add-stock-item',
    fields: newStockItemFields,
    initialData: {
      location: params.location
    },
    follow: params.openNewStockItem ?? true,
    table: table,
    onFormSuccess: (response: any) => {
      // Returns a list that may contain multiple serialized stock items
      // Navigate to the first result
      navigate(getDetailUrl(ModelType.stockitem, response[0].pk));
    },
    successMessage: t`Stock item serialized`
  });

  const [selectedStockItem, setSelectedStockItem] = useState<number>(-1);

  const deleteStockItem = useDeleteApiFormModal({
    url: ApiEndpoints.stock_item_list,
    pk: selectedStockItem,
    title: t`Delete Stock Item`,
    onFormSuccess: table.refreshTable
  });

  const stockAdjustActions = useStockAdjustActions({
    formProps: stockOperationProps,
    return: allowReturn
  });

  const tableActions = useMemo(() => {
    return [
      stockAdjustActions.dropdown,
      <AddItemButton
        key='add-stock-item'
        hidden={!allowAdd || !user.hasAddRole(UserRoles.stock)}
        tooltip={t`Add Stock Item`}
        onClick={() => newStockItem.open()}
      />
    ];
  }, [
    user,
    allowAdd,
    table.hasSelectedRecords,
    table.selectedRecords,
    stockAdjustActions.dropdown
  ]);

  const rowActions = useMemo(
    () => (record: any): RowAction[] => [
      RowDeleteAction({
        hidden: !user.hasDeleteRole(UserRoles.stock),
        onClick: () => {
          setSelectedStockItem(record.pk);
          deleteStockItem.open();
        }
      })
    ],
    [user, deleteStockItem]
  );

  return (
    <>
      {newStockItem.modal}
      {deleteStockItem.modal}
      {stockAdjustActions.modals.map((modal) => modal.modal)}
      <TrackletTable
        url={apiUrl(ApiEndpoints.stock_item_list)}
        tableState={table}
        columns={tableColumns}
        props={{
          enableDownload: true,
          enableSelection: true,
          enableBulkDelete: true,
          enableLabels: true,
          enableReports: true,
          tableFilters: tableFilters,
          tableActions: tableActions,
          rowActions: rowActions,
          modelType: ModelType.stockitem,
          params: {
            ...params,
            part_detail: true,
            location_detail: true,
            supplier_part_detail: true
          }
        }}
      />
    </>
  );
}
