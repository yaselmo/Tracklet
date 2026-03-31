import { t } from '@lingui/core/macro';
import {
  Badge,
  Card,
  Center,
  HoverCard,
  Image,
  Pagination,
  Stack,
  Text
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { IconLayoutGrid, IconTable } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AddItemButton } from '@lib/components/AddItemButton';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { getDetailUrl } from '@lib/functions/Navigation';
import type { TableFilter } from '@lib/types/Filters';
import type { StockOperationProps } from '@lib/types/Forms';
import type { ApiFormFieldSet } from '@lib/types/Forms';
import type { InvenTreeTableProps } from '@lib/types/Tables';
import type { TableColumn } from '@lib/types/Tables';
import type { TableState } from '@lib/types/Tables';
import SegmentedIconControl from '../../components/buttons/SegmentedIconControl';
import { useApi } from '../../contexts/ApiContext';
import { formatCurrency, formatPriceRange } from '../../defaults/formatters';
import { InvenTreeIcon } from '../../functions/icons';
import { generateUrl } from '../../functions/urls';
import { useCreateApiFormModal } from '../../hooks/UseForm';
import { useStockAdjustActions } from '../../hooks/UseStockAdjustActions';
import { useTable } from '../../hooks/UseTable';
import { useGlobalSettingsState } from '../../states/SettingsStates';
import { useUserState } from '../../states/UserState';
import {
  DateColumn,
  DescriptionColumn,
  LocationColumn,
  StockColumn
} from '../ColumnRenderers';
import {
  BatchFilter,
  HasBatchCodeFilter,
  InStockFilter,
  IncludeVariantsFilter,
  IsSerializedFilter,
  ManufacturerFilter,
  SerialFilter,
  SerialGTEFilter,
  SerialLTEFilter,
  SupplierFilter
} from '../Filter';
import { TrackletTable } from '../TrackletTable';
import TrackletTableHeader from '../TrackletTableHeader';
import { getStockAvailabilityStyle } from './stockAvailabilityStyles';

const STOCK_IMAGE_SIZE_PX = 48;
const STOCK_IMAGE_PREVIEW_SIZE_PX = 220;
const STOCK_GRID_PAGE_SIZE = 24;
const STOCK_GRID_MIN_CARD_WIDTH_PX = 160;

function StockItemImageCell({ record }: Readonly<{ record: any }>) {
  const [imageError, setImageError] = useState(false);

  const imageSource =
    record?.image || record?.part_detail?.thumbnail || record?.part_detail?.image;
  const resolvedSource = imageSource ? generateUrl(imageSource) : '';
  const showImage = !!resolvedSource && !imageError;

  return (
    <HoverCard
      disabled={!showImage}
      withinPortal
      openDelay={120}
      closeDelay={60}
      shadow='md'
      zIndex={3000}
      position='right-start'
    >
      <HoverCard.Target>
        <Center h={STOCK_IMAGE_SIZE_PX} w={STOCK_IMAGE_SIZE_PX}>
          {showImage ? (
            <img
              src={resolvedSource}
              alt={record?.title || record?.part_detail?.name || 'Stock item'}
              onError={() => setImageError(true)}
              style={{
                width: `${STOCK_IMAGE_SIZE_PX}px`,
                height: `${STOCK_IMAGE_SIZE_PX}px`,
                objectFit: 'cover',
                borderRadius: '8px',
                display: 'block'
              }}
            />
          ) : (
            <Center
              h={STOCK_IMAGE_SIZE_PX}
              w={STOCK_IMAGE_SIZE_PX}
              style={{
                borderRadius: '8px',
                backgroundColor: 'var(--mantine-color-gray-1)',
                color: 'var(--mantine-color-gray-6)'
              }}
            >
              <InvenTreeIcon icon='photo' iconProps={{ size: 20, stroke: 1.5 }} />
            </Center>
          )}
        </Center>
      </HoverCard.Target>
      <HoverCard.Dropdown p={6}>
        <Image
          src={resolvedSource}
          alt={record?.title || record?.part_detail?.name || 'Stock item preview'}
          w={STOCK_IMAGE_PREVIEW_SIZE_PX}
          h={STOCK_IMAGE_PREVIEW_SIZE_PX}
          fit='cover'
          radius='sm'
        />
      </HoverCard.Dropdown>
    </HoverCard>
  );
}

function StockItemCard({
  record,
  showAvailability,
  onOpen
}: Readonly<{
  record: any;
  showAvailability: boolean;
  onOpen: (record: any) => void;
}>) {
  const [imageError, setImageError] = useState(false);

  const imageSource =
    record?.image ||
    record?.part_detail?.preview ||
    record?.part_detail?.thumbnail ||
    record?.part_detail?.image;
  const resolvedSource = imageSource ? generateUrl(imageSource) : '';
  const showImage = !!resolvedSource && !imageError;

  const availability = getStockAvailabilityStyle(
    record?.availability,
    record?.availability_text
  );

  return (
    <Card
      withBorder
      radius='md'
      shadow='xs'
      p='xs'
      onClick={() => onOpen(record)}
      style={{
        cursor: 'pointer',
        height: '100%',
        width: '100%',
        minWidth: 0,
        maxWidth: 'none'
      }}
    >
      <Card.Section withBorder>
        <Center
          style={{
            aspectRatio: '4 / 3',
            backgroundColor: showImage
              ? 'var(--mantine-color-body)'
              : 'var(--mantine-color-gray-1)',
            overflow: 'hidden'
          }}
        >
          {showImage ? (
            <img
              src={resolvedSource}
              alt={record?.title || record?.part_detail?.name || 'Stock item'}
              onError={() => setImageError(true)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block'
              }}
            />
          ) : (
            <InvenTreeIcon icon='photo' iconProps={{ size: 42, stroke: 1.4 }} />
          )}
        </Center>
      </Card.Section>
      <Stack gap={4} mt='xs' style={{ minWidth: 0 }}>
        <Text fw={600} lineClamp={2}>
          {record?.title || record?.part_detail?.name || record?.part || '-'}
        </Text>
        <Text size='sm' c='dimmed' lineClamp={1}>
          {record?.category_detail?.name || '-'}
        </Text>
        <Text size='sm' lineClamp={1}>
          {record?.location_detail?.name || '-'}
        </Text>
        <Text size='sm'>
          {t`Stock`}: {record?.stock ?? record?.quantity ?? '-'}
        </Text>
        {showAvailability && (
          <Badge
            styles={{
              root: {
                backgroundColor: availability.bg,
                color: availability.fg,
                width: 'fit-content'
              }
            }}
          >
            {availability.label}
          </Badge>
        )}
      </Stack>
    </Card>
  );
}

function StockItemGridView({
  tableState,
  tableFilters,
  tableActions,
  params,
  showAvailability
}: Readonly<{
  tableState: TableState;
  tableFilters: TableFilter[];
  tableActions: ReactNode[];
  params: Record<string, any>;
  showAvailability: boolean;
}>) {
  const api = useApi();
  const navigate = useNavigate();

  const tableProps: InvenTreeTableProps = useMemo(
    () => ({
      enableDownload: true,
      enableLabels: true,
      enableReports: true,
      enableFilters: true,
      enableSearch: true,
      enableRefresh: true,
      enableColumnSwitching: false,
      tableFilters,
      tableActions,
      modelType: ModelType.stockitem,
      params
    }),
    [tableFilters, tableActions, params]
  );

  useEffect(() => {
    tableState.setPage(1);
  }, [tableState.searchTerm, tableState.filterSet.activeFilters, tableState.queryFilters]);

  const gridQuery = useQuery({
    queryKey: [
      'stock-item-grid',
      tableState.tableKey,
      tableState.page,
      tableState.searchTerm,
      tableState.filterSet.activeFilters,
      tableState.queryFilters.toString(),
      params
    ],
    queryFn: async () => {
      const queryParams: Record<string, any> = {
        ...params,
        limit: STOCK_GRID_PAGE_SIZE,
        offset: (Math.max(1, tableState.page) - 1) * STOCK_GRID_PAGE_SIZE
      };

      if (tableState.queryFilters && tableState.queryFilters.size > 0) {
        for (const [key, value] of tableState.queryFilters) {
          queryParams[key] = value;
        }
      } else if (tableState.filterSet.activeFilters) {
        tableState.filterSet.activeFilters.forEach((flt: any) => {
          queryParams[flt.name] = flt.value;
        });
      }

      if (tableState.searchTerm) {
        queryParams.search = tableState.searchTerm;
      }

      return api
        .get(apiUrl(ApiEndpoints.stock_item_list), {
          params: queryParams
        })
        .then((response) => {
          const results = response.data?.results ?? response.data ?? [];
          tableState.setRecordCount(response.data?.count ?? results.length);
          tableState.setRecords(results);
          return results;
        });
    }
  });

  useEffect(() => {
    tableState.setIsLoading(gridQuery.isLoading || gridQuery.isFetching);
  }, [gridQuery.isLoading, gridQuery.isFetching]);

  const totalPages = Math.max(
    1,
    Math.ceil((tableState.recordCount ?? 0) / STOCK_GRID_PAGE_SIZE)
  );

  return (
    <Stack gap='sm'>
      <TrackletTableHeader
        tableUrl={apiUrl(ApiEndpoints.stock_item_list)}
        tableState={tableState}
        tableProps={tableProps}
        hasSwitchableColumns={false}
        columns={[]}
        filters={tableFilters}
        toggleColumn={() => null}
      />
      {!gridQuery.isFetching && (tableState.records?.length ?? 0) == 0 ? (
        <Text c='dimmed'>{t`No records found`}</Text>
      ) : (
        <div
          style={{
            display: 'grid',
            width: '100%',
            gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${STOCK_GRID_MIN_CARD_WIDTH_PX}px), 1fr))`,
            gap: 'var(--mantine-spacing-xs)',
            alignItems: 'stretch'
          }}
        >
          {gridQuery.isFetching
            ? Array.from({ length: 8 }).map((_, idx) => (
                <Card
                  key={idx}
                  withBorder
                  radius='md'
                  shadow='xs'
                  h={280}
                  style={{ width: '100%', minWidth: 0 }}
                />
              ))
            : tableState.records.map((record: any) => (
                <StockItemCard
                  key={record.pk}
                  record={record}
                  showAvailability={showAvailability}
                  onOpen={(item) =>
                    navigate(getDetailUrl(ModelType.stockitem, item.pk))
                  }
                />
              ))}
        </div>
      )}
      {totalPages > 1 && (
        <Center>
          <Pagination
            value={Math.max(1, tableState.page)}
            onChange={tableState.setPage}
            total={totalPages}
          />
        </Center>
      )}
    </Stack>
  );
}

/**
 * Construct a list of columns for the stock item table
 */
function stockItemTableColumns({
  showLocation,
  showPricing,
  showAvailability
}: {
  showLocation: boolean;
  showPricing: boolean;
  showAvailability: boolean;
}): TableColumn[] {
  return [
    {
      accessor: 'image',
      title: t`Image`,
      sortable: false,
      switchable: false,
      width: 56,
      render: (record: any) => <StockItemImageCell record={record} />
    },
    {
      accessor: 'title',
      title: t`Item`,
      sortable: true,
      render: (record: any) =>
        record.title || record.part_detail?.name || record.part || '-'
    },
    {
      accessor: 'category_detail.name',
      title: t`Category`,
      sortable: true,
      render: (record: any) => record.category_detail?.name || '-'
    },
    DescriptionColumn({
      accessor: 'notes'
    }),
    StockColumn({
      accessor: '',
      title: t`Stock`,
      sortable: true,
      ordering: 'stock'
    }),
    {
      accessor: 'availability',
      title: t`Availability`,
      hidden: !showAvailability,
      sortable: true,
      render: (record: any) => {
        const availability = getStockAvailabilityStyle(
          record.availability,
          record.availability_text
        );

        return (
          <Badge
            styles={{
              root: {
                backgroundColor: availability.bg,
                color: availability.fg
              }
            }}
          >
            {availability.label}
          </Badge>
        );
      }
    },
    {
      accessor: 'batch',
      sortable: true
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
      accessor: 'stock_value',
      title: t`Stock Value`,
      sortable: false,
      hidden: !showPricing,
      render: (record: any) => {
        const min_price =
          record.purchase_price || record.part_detail?.pricing_min;
        const max_price =
          record.purchase_price || record.part_detail?.pricing_max;
        const currency = record.purchase_price_currency || undefined;

        return formatPriceRange(min_price, max_price, {
          currency: currency,
          multiplier: record.quantity
        });
      }
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
      accessor: 'stocktake_date',
      title: t`Stocktake Date`,
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
      name: 'active',
      label: t`Active`,
      description: t`Show stock for active parts`
    },
    {
      name: 'availability',
      label: t`Availability`,
      description: t`Filter by stock availability`,
      type: 'choice',
      choices: [
        { value: 'AVAILABLE', label: t`Available` },
        { value: 'RESERVED', label: t`Reserved` },
        { value: 'IN_USE', label: t`In Use` },
        { value: 'UNAVAILABLE', label: t`Unavailable` },
        { value: 'MISSING', label: t`Missing` },
        { value: 'BROKEN', label: t`Broken` }
      ]
    },
    {
      name: 'category',
      label: t`Stock Category`,
      description: t`Filter by stock category`,
      type: 'api',
      apiUrl: apiUrl(ApiEndpoints.stock_category_list),
      apiFilter: {}
    },
    {
      name: 'assembly',
      label: t`Assembly`,
      description: t`Show stock for assembled parts`
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
    IncludeVariantsFilter(),
    SupplierFilter(),
    ManufacturerFilter(),
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
      name: 'sent_to_customer',
      label: t`Sent to Customer`,
      description: t`Show items which have been sent to a customer`
    },
    HasBatchCodeFilter(),
    BatchFilter(),
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
  showAvailability = true,
  allowReturn = false,
  allowViewToggle = false,
  tableName = 'stockitems'
}: Readonly<{
  params?: any;
  allowAdd?: boolean;
  showLocation?: boolean;
  showPricing?: boolean;
  showAvailability?: boolean;
  allowReturn?: boolean;
  allowViewToggle?: boolean;
  tableName: string;
}>) {
  const table = useTable(tableName);
  const user = useUserState();
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

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
        showPricing: showPricing ?? true,
        showAvailability: showAvailability ?? true
      }),
    [showLocation, showPricing, showAvailability]
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

  const newStockItemFields: ApiFormFieldSet = useMemo(
    () => ({
      title: {
        required: true,
        label: t`Name`
      },
      category: {
        required: true,
        field_type: 'related field',
        api_url: apiUrl(ApiEndpoints.stock_category_list),
        label: t`Category`
      },
      new_category_name: {
        field_type: 'string',
        required: false,
        label: t`New Category (Quick Create)`,
        description: t`Use this when no category exists yet`
      },
      quantity: {
        value: 1
      },
      location: {},
      notes: {}
    }),
    []
  );

  const newStockItem = useCreateApiFormModal({
    url: ApiEndpoints.stock_create_simple,
    title: t`Add Stock Item`,
    modalId: 'add-stock-item',
    fields: newStockItemFields,
    initialData: {
      location: params.location
    },
    follow: true,
    table: table,
    onFormSuccess: (response: any) => {
      navigate(getDetailUrl(ModelType.stockitem, response[0].pk));
    },
    successMessage: t`Stock item created`
  });

  const stockAdjustActions = useStockAdjustActions({
    formProps: stockOperationProps,
    return: allowReturn
  });

  const viewToggleControl = useMemo(() => {
    if (!allowViewToggle) {
      return null;
    }

    return (
      <SegmentedIconControl
        value={viewMode}
        onChange={(value) => setViewMode(value as 'table' | 'grid')}
        data={[
          {
            value: 'table',
            label: t`Table View`,
            icon: <IconTable size={16} />
          },
          {
            value: 'grid',
            label: t`Grid View`,
            icon: <IconLayoutGrid size={16} />
          }
        ]}
      />
    );
  }, [allowViewToggle, viewMode]);

  const tableQueryParams = useMemo(
    () => ({
      ...params,
      part_detail: true,
      category_detail: true,
      location_detail: true,
      supplier_part_detail: true
    }),
    [params]
  );

  const tableActions = useMemo(() => {
    const actions: ReactNode[] = [
      viewToggleControl,
      stockAdjustActions.dropdown,
      <AddItemButton
        key='add-stock-item'
        hidden={!allowAdd || !user.hasAddRole(UserRoles.stock)}
        tooltip={t`Add Stock Item`}
        onClick={() => newStockItem.open()}
      />
    ];

    return actions.filter((action) => !!action);
  }, [viewToggleControl, user, allowAdd, stockAdjustActions.dropdown]);

  return (
    <>
      {newStockItem.modal}
      {stockAdjustActions.modals.map((modal) => modal.modal)}
      {viewMode === 'table' ? (
        <TrackletTable
          url={apiUrl(ApiEndpoints.stock_item_list)}
          tableState={table}
          columns={tableColumns}
          props={{
            enableDownload: true,
            enableSelection: true,
            enableLabels: true,
            enableReports: true,
            tableFilters: tableFilters,
            tableActions: tableActions,
            modelType: ModelType.stockitem,
            params: tableQueryParams
          }}
        />
      ) : (
        <StockItemGridView
          tableState={table}
          tableFilters={tableFilters}
          tableActions={tableActions}
          params={tableQueryParams}
          showAvailability={showAvailability}
        />
      )}
    </>
  );
}
