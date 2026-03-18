import { t } from '@lingui/core/macro';
import {
  Anchor,
  Badge,
  Button,
  Grid,
  Group,
  Skeleton,
  Space,
  Stack,
  Text,
  Tooltip
} from '@mantine/core';
import {
  IconArrowLeft,
  IconArrowRight,
  IconBoxPadding,
  IconChecklist,
  IconEdit,
  IconHistory,
  IconInfoCircle,
  IconPackages,
  IconSearch,
  IconSitemap
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ActionButton } from '@lib/components/ActionButton';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { UserRoles } from '@lib/enums/Roles';
import { apiUrl } from '@lib/functions/Api';
import { getDetailUrl, getOverviewUrl } from '@lib/functions/Navigation';
import type { StockOperationProps } from '@lib/types/Forms';
import AdminButton from '../../components/buttons/AdminButton';
import {
  type DetailsField,
  DetailsTable
} from '../../components/details/Details';
import DetailsBadge from '../../components/details/DetailsBadge';
import { DetailsImage } from '../../components/details/DetailsImage';
import { ItemDetailsGrid } from '../../components/details/ItemDetails';
import {
  ActionDropdown,
  DeleteItemAction,
  OptionsActionDropdown
} from '../../components/items/ActionDropdown';
import InstanceDetail from '../../components/nav/InstanceDetail';
import NavigationTree from '../../components/nav/NavigationTree';
import { PageDetail } from '../../components/nav/PageDetail';
import AttachmentPanel from '../../components/panels/AttachmentPanel';
import NotesPanel from '../../components/panels/NotesPanel';
import type { PanelType } from '../../components/panels/Panel';
import { PanelGroup } from '../../components/panels/PanelGroup';
import LocateItemButton from '../../components/plugins/LocateItemButton';
import { useApi } from '../../contexts/ApiContext';
import { formatCurrency, formatDate, formatDecimal } from '../../defaults/formatters';
import {
  processStockItemPatchPayload,
  useFindSerialNumberForm,
  useStockFields,
  useStockItemSerializeFields
} from '../../forms/StockForms';
import { InvenTreeIcon } from '../../functions/icons';
import {
  useCreateApiFormModal,
  useDeleteApiFormModal,
  useEditApiFormModal
} from '../../hooks/UseForm';
import { useInstance } from '../../hooks/UseInstance';
import { useStockAdjustActions } from '../../hooks/UseStockAdjustActions';
import {
  getTrackletStatusColor,
  getTrackletStatusLabel,
  getTrackletStatusPill
} from '../../components/render/TrackletStatus';
import { useGlobalSettingsState } from '../../states/SettingsStates';
import { useUserState } from '../../states/UserState';
import InstalledItemsTable from '../../tables/stock/InstalledItemsTable';
import { StockItemTable } from '../../tables/stock/StockItemTable';
import StockItemTestResultTable from '../../tables/stock/StockItemTestResultTable';
import { StockThumbTable } from '../../tables/stock/StockThumbTable';
import { StockTrackingTable } from '../../tables/stock/StockTrackingTable';

export default function StockDetail() {
  const { id } = useParams();

  const api = useApi();
  const user = useUserState();

  const globalSettings = useGlobalSettingsState();

  const enableExpiry = useMemo(
    () => globalSettings.isSet('STOCK_ENABLE_EXPIRY'),
    [globalSettings]
  );

  const navigate = useNavigate();

  const [treeOpen, setTreeOpen] = useState(false);

  const {
    instance: stockitem,
    refreshInstance,
    refreshInstancePromise,
    instanceQuery
  } = useInstance({
    endpoint: ApiEndpoints.stock_item_list,
    pk: id,
    params: {
      part_detail: true,
      location_detail: true,
      path_detail: true
    }
  });

  const { instance: serialNumbers, instanceQuery: serialNumbersQuery } =
    useInstance({
      endpoint: ApiEndpoints.stock_serial_info,
      pk: id
    });

  const findBySerialNumber = useFindSerialNumberForm({
    partId: stockitem.part
  });

  const projectAssignmentsQuery = useQuery({
    queryKey: ['stock-project-assignments', stockitem.pk],
    enabled: !!stockitem.pk,
    queryFn: async () => {
      const [allocationResponse, instrumentResponse] = await Promise.all([
        api
          .get(apiUrl(ApiEndpoints.project_allocation_list), {
            params: {
              stock_item: stockitem.pk,
              limit: 100
            }
          })
          .then((response) => response.data)
          .catch(() => []),
        api
          .get(apiUrl(ApiEndpoints.project_instrument_list), {
            params: {
              stock_item: stockitem.pk,
              limit: 100
            }
          })
          .then((response) => response.data)
          .catch(() => [])
      ]);

      const allocations = allocationResponse?.results ?? allocationResponse ?? [];
      const instruments = instrumentResponse?.results ?? instrumentResponse ?? [];

      const statsByProject = new Map<
        number,
        { allocation_quantity: number; instrument_quantity: number }
      >();

      allocations.forEach((row: any) => {
        const projectId = Number(row.project);
        if (!projectId) return;

        const current = statsByProject.get(projectId) ?? {
          allocation_quantity: 0,
          instrument_quantity: 0
        };

        current.allocation_quantity += Number(row.quantity ?? 0);
        statsByProject.set(projectId, current);
      });

      instruments.forEach((row: any) => {
        const projectId = Number(row.project);
        if (!projectId) return;

        const current = statsByProject.get(projectId) ?? {
          allocation_quantity: 0,
          instrument_quantity: 0
        };

        current.instrument_quantity += Number(row.quantity ?? 0);

        statsByProject.set(projectId, current);
      });

      const projectIds = [...statsByProject.keys()];

      if (projectIds.length <= 0) {
        return [];
      }

      const projects = await Promise.all(
        projectIds.map(async (projectId) => {
          try {
            const response = await api.get(apiUrl(ApiEndpoints.project_list, projectId));
            return response.data;
          } catch {
            return {
              pk: projectId,
              name: `Project #${projectId}`
            };
          }
        })
      );

      return projects
        .map((project: any) => ({
          ...project,
          ...(statsByProject.get(Number(project.pk)) ?? {
            allocation_quantity: 0,
            instrument_quantity: 0
          })
        }))
        .sort((a: any, b: any) =>
          String(a.name ?? '').localeCompare(String(b.name ?? ''))
        );
    }
  });

  const detailsPanel = useMemo(() => {
    const data = { ...stockitem };
    data.available_stock = Math.max(
      0,
      (data.quantity ?? 0) -
        (data.broken_quantity ?? 0) -
        (data.missing_quantity ?? 0) -
        (data.allocated ?? 0)
    );
    data.part_name = stockitem.name;
    data.category_name = stockitem.category;

    if (instanceQuery.isFetching) {
      return <Skeleton />;
    }

    const tl: DetailsField[] = [
      {
        type: 'text',
        name: 'part_name',
        label: t`Name`,
        icon: 'part',
        hidden: !stockitem.name,
        value_formatter: () => (
          <Group gap='xs' wrap='nowrap'>
            <Text>{stockitem.name}</Text>
            <ActionButton
              icon={<IconEdit size={14} />}
              tooltip={t`Edit Name`}
              hidden={!user.hasChangePermission(ModelType.stockitem)}
              onClick={() => editStockName.open()}
            />
          </Group>
        )
      },
      {
        type: 'text',
        name: 'category_name',
        label: t`Category`,
        icon: 'info',
        hidden: !stockitem.category
      },
      {
        name: 'tracklet_status',
        type: 'text',
        label: t`Status`,
        icon: 'status',
        value_formatter: () => getTrackletStatusPill(stockitem)
      },
      {
        type: 'link',
        name: 'link',
        label: t`Link`,
        external: true,
        copy: true,
        hidden: !stockitem.link
      }
    ];

    // Top right - available stock information
    const tr: DetailsField[] = [
      {
        type: 'text',
        name: 'serial',
        label: t`Serial Number`,
        hidden: !stockitem.serial,
        value_formatter: () => (
          <Group gap='xs' justify='space-apart'>
            <Text>{stockitem.serial}</Text>
            <Space flex={10} />
            <Group gap={2} justify='right'>
              {serialNumbers.previous?.pk && (
                <Tooltip label={t`Previous serial number`} position='top'>
                  <Button
                    p={3}
                    aria-label='previous-serial-number'
                    leftSection={<IconArrowLeft />}
                    variant='transparent'
                    size='sm'
                    onClick={() => {
                      navigate(
                        getDetailUrl(
                          ModelType.stockitem,
                          serialNumbers.previous.pk
                        )
                      );
                    }}
                  >
                    {serialNumbers.previous.serial}
                  </Button>
                </Tooltip>
              )}
              <ActionButton
                icon={<IconSearch size={18} />}
                tooltip={
                  stockitem.part
                    ? t`Find serial number`
                    : t`Find stock item by serial number`
                }
                tooltipAlignment='top'
                variant='transparent'
                onClick={findBySerialNumber.open}
              />
              {serialNumbers.next?.pk && (
                <Tooltip label={t`Next serial number`} position='top'>
                  <Button
                    p={3}
                    aria-label='next-serial-number'
                    rightSection={<IconArrowRight />}
                    variant='transparent'
                    size='sm'
                    onClick={() => {
                      navigate(
                        getDetailUrl(ModelType.stockitem, serialNumbers.next.pk)
                      );
                    }}
                  >
                    {serialNumbers.next.serial}
                  </Button>
                </Tooltip>
              )}
            </Group>
          </Group>
        )
      },
      {
        type: 'number',
        name: 'quantity',
        label: t`Quantity`,
        hidden: !!stockitem.serial && stockitem.quantity == 1
      },
      {
        type: 'number',
        name: 'available_stock',
        label: t`Available`,
        icon: 'stock'
      },
      {
        type: 'number',
        name: 'broken_quantity',
        label: t`Broken`,
        icon: 'issue',
        hidden: !stockitem.broken_quantity
      },
      {
        type: 'number',
        name: 'missing_quantity',
        label: t`Missing`,
        icon: 'cancel',
        hidden: !stockitem.missing_quantity
      },
      {
        type: 'number',
        name: 'allocated',
        label: t`Allocated to Orders`,
        icon: 'tick_off',
        hidden: !stockitem.allocated
      },
      {
        type: 'text',
        name: 'batch',
        label: t`Batch Code`,
        hidden: !stockitem.batch
      }
    ];

    // Bottom left: location information
    const bl: DetailsField[] = [
      {
        name: 'supplier_part',
        label: t`Supplier Part`,
        type: 'link',
        model_field: 'SKU',
        model: ModelType.supplierpart,
        hidden: !stockitem.supplier_part
      },
      {
        type: 'link',
        name: 'location',
        label: t`Location`,
        model: ModelType.stocklocation,
        hidden: !stockitem.location
      },
      {
        type: 'link',
        name: 'belongs_to',
        label: t`Installed In`,
        model_filters: {
          part_detail: true
        },
        model_formatter: (model: any) => {
          let text = model?.part_detail?.full_name ?? model?.name;
          if (model.serial && model.quantity == 1) {
            text += ` # ${model.serial}`;
          }

          return text;
        },
        icon: 'stock',
        model: ModelType.stockitem,
        hidden: !stockitem.belongs_to
      },
      {
        type: 'link',
        name: 'parent',
        icon: 'sitemap',
        label: t`Parent Item`,
        model: ModelType.stockitem,
        hidden: !stockitem.parent,
        model_formatter: (model: any) => {
          return t`Parent stock item`;
        }
      },
      {
        type: 'link',
        name: 'consumed_by',
        label: t`Consumed By`,
        model: ModelType.build,
        hidden: !stockitem.consumed_by,
        icon: 'build',
        model_field: 'reference'
      },
      {
        type: 'link',
        name: 'build',
        label: t`Build Order`,
        model: ModelType.build,
        hidden: !stockitem.build,
        model_field: 'reference'
      },
      {
        type: 'link',
        name: 'purchase_order',
        label: t`Purchase Order`,
        model: ModelType.purchaseorder,
        hidden: !stockitem.purchase_order,
        icon: 'purchase_orders',
        model_field: 'reference'
      },
      {
        type: 'link',
        name: 'sales_order',
        label: t`Sales Order`,
        model: ModelType.salesorder,
        hidden: !stockitem.sales_order,
        icon: 'sales_orders',
        model_field: 'reference'
      },
      {
        type: 'link',
        name: 'customer',
        label: t`Customer`,
        model: ModelType.company,
        hidden: !stockitem.customer
      }
    ];

    // Bottom right - any other information
    const br: DetailsField[] = [
      // Expiry date
      {
        type: 'date',
        name: 'expiry_date',
        label: t`Expiry Date`,
        hidden: !enableExpiry || !stockitem.expiry_date,
        icon: 'calendar'
      },
      // TODO: Ownership
      {
        type: 'text',
        name: 'purchase_price',
        label: t`Unit Price`,
        icon: 'currency',
        hidden: !stockitem.purchase_price,
        value_formatter: () => {
          return formatCurrency(stockitem.purchase_price, {
            currency: stockitem.purchase_price_currency
          });
        }
      },
      {
        type: 'text',
        name: 'stock_value',
        label: t`Stock Value`,
        icon: 'currency',
        hidden:
          !stockitem.purchase_price ||
          stockitem.quantity == 1 ||
          stockitem.quantity == 0,
        value_formatter: () => {
          return formatCurrency(stockitem.purchase_price, {
            currency: stockitem.purchase_price_currency,
            multiplier: stockitem.quantity
          });
        }
      },
      {
        type: 'text',
        name: 'packaging',
        icon: 'part',
        label: t`Packaging`,
        hidden: !stockitem.packaging
      },
      {
        type: 'text',
        name: 'updated',
        icon: 'calendar',
        label: t`Last Updated`
      },
      {
        type: 'date',
        name: 'last_calibration_date',
        icon: 'calendar',
        label: t`Last Calibration`,
        hidden: !stockitem.last_calibration_date
      },
      {
        type: 'date',
        name: 'last_factory_calibration_date',
        icon: 'calendar',
        label: t`Last Factory Calibration`,
        hidden: !stockitem.last_factory_calibration_date
      },
      {
        type: 'text',
        name: 'stocktake',
        icon: 'calendar',
        label: t`Last Stocktake`,
        hidden: !stockitem.stocktake
      }
    ];

    return (
      <ItemDetailsGrid>
        <Grid grow>
          <DetailsImage
            appRole={UserRoles.stock}
            imageActions={{
              selectExisting: true,
              downloadImage: true,
              uploadFile: true,
              deleteFile: true
            }}
            src={stockitem.image}
            apiPath={apiUrl(ApiEndpoints.stock_item_list, stockitem.pk)}
            refresh={refreshInstance}
            pk={String(stockitem.pk ?? '')}
            existingImageTable={StockThumbTable}
          />
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <DetailsTable fields={tl} item={data} />
          </Grid.Col>
        </Grid>
        <DetailsTable fields={tr} item={data} />
        <DetailsTable fields={bl} item={data} />
        <DetailsTable fields={br} item={data} />
        <Stack gap='xs'>
          <Text fw={600}>{t`Assigned Projects`}</Text>
          {projectAssignmentsQuery.isFetching ? (
            <Skeleton height={28} />
          ) : (projectAssignmentsQuery.data?.length ?? 0) <= 0 ? (
            <Text c='dimmed'>{t`This stock item is not assigned to any project`}</Text>
          ) : (
            <Stack gap={4}>
              {projectAssignmentsQuery.data?.map((project: any) => (
                <Group
                  key={project.pk}
                  justify='space-between'
                  align='center'
                  wrap='nowrap'
                >
                  <Stack gap={0}>
                    <Anchor href={getDetailUrl(ModelType.project, project.pk)}>
                      {project.name}
                    </Anchor>
                    <Text size='xs' c='dimmed'>
                      {`${project.start_date ? formatDate(project.start_date) : t`No start`} - ${project.end_date ? formatDate(project.end_date) : t`No end`}`}
                    </Text>
                  </Stack>
                  <Group gap='xs' wrap='nowrap'>
                    {project.status && (
                      <Badge
                        color={
                          project.status === 'ONGOING'
                            ? 'green'
                            : project.status === 'FUTURE'
                              ? 'blue'
                              : 'gray'
                        }
                      >
                        {project.status}
                      </Badge>
                    )}
                    {project.instrument_quantity > 0 && (
                      <Badge color='blue'>
                        {`${t`Instr`}: ${formatDecimal(project.instrument_quantity)}`}
                      </Badge>
                    )}
                    {project.allocation_quantity > 0 && (
                      <Badge color='teal'>
                        {`${t`Alloc`}: ${formatDecimal(project.allocation_quantity)}`}
                      </Badge>
                    )}
                  </Group>
                </Group>
              ))}
            </Stack>
          )}
        </Stack>
      </ItemDetailsGrid>
    );
  }, [
    stockitem,
    serialNumbers,
    serialNumbersQuery.isFetching,
    instanceQuery.isFetching,
    enableExpiry,
    projectAssignmentsQuery.data,
    projectAssignmentsQuery.isFetching
  ]);

  // API query to determine if this stock item has trackable BOM items
  const trackedBomItemQuery = useQuery({
    queryKey: ['tracked-bom-item', stockitem.pk, stockitem.part],
    queryFn: () => {
      if (
        !stockitem.pk ||
        !stockitem.part ||
        !stockitem.part_detail?.assembly
      ) {
        return false;
      }

      return api
        .get(apiUrl(ApiEndpoints.bom_list), {
          params: {
            part: stockitem.part,
            sub_part_trackable: true,
            limit: 1
          }
        })
        .then((response) => {
          if (response.status == 200) {
            return response.data.count > 0;
          } else {
            return null;
          }
        });
    }
  });

  const showInstalledItems: boolean = useMemo(() => {
    if (stockitem?.installed_items) {
      // There are installed items in this stock item
      return true;
    }

    if (!!trackedBomItemQuery.data) {
      return trackedBomItemQuery.data;
    }

    // Fall back to whether this is an assembly or not
    return stockitem?.part_detail?.assembly;
  }, [trackedBomItemQuery, stockitem]);

  const stockPanels: PanelType[] = useMemo(() => {
    return [
      {
        name: 'details',
        label: t`Stock Details`,
        icon: <IconInfoCircle />,
        content: detailsPanel
      },
      {
        name: 'tracking',
        label: t`Stock Tracking`,
        icon: <IconHistory />,
        content: stockitem.pk ? (
          <StockTrackingTable itemId={stockitem.pk} />
        ) : (
          <Skeleton />
        )
      },
      {
        name: 'test-results',
        label: t`Test Results`,
        icon: <IconChecklist />,
        hidden: !stockitem?.part_detail?.testable,
        content: stockitem?.pk ? (
          <StockItemTestResultTable
            itemId={stockitem.pk}
            partId={stockitem.part}
          />
        ) : (
          <Skeleton />
        )
      },
      {
        name: 'installed_items',
        label: t`Installed Items`,
        icon: <IconBoxPadding />,
        hidden: !showInstalledItems,
        content: <InstalledItemsTable stockItem={stockitem} />
      },
      {
        name: 'child_items',
        label: t`Child Items`,
        icon: <IconSitemap />,
        hidden: (stockitem?.child_items ?? 0) == 0,
        content: stockitem?.pk ? (
          <StockItemTable
            tableName='child-stock'
            params={{ ancestor: stockitem.pk }}
          />
        ) : (
          <Skeleton />
        )
      },
      AttachmentPanel({
        model_type: ModelType.stockitem,
        model_id: stockitem.pk
      }),
      NotesPanel({
        model_type: ModelType.stockitem,
        model_id: stockitem.pk,
        has_note: !!stockitem.notes
      })
    ];
  }, [
    showInstalledItems,
    stockitem,
    serialNumbers,
    serialNumbersQuery,
    id,
    user
  ]);

  const breadcrumbs = useMemo(
    () => [
      { name: t`Stock`, url: '/stock' },
      ...(stockitem.location_path ?? []).map((l: any) => ({
        name: l.name,
        url: getDetailUrl(ModelType.stocklocation, l.pk)
      }))
    ],
    [stockitem]
  );

  const editStockItemFields = useStockFields({
    create: false,
    stockItem: stockitem,
    modalId: 'edit-stock-item',
    includeConditionFields: false
  });

  const editStockName = useEditApiFormModal({
    url: ApiEndpoints.stock_item_list,
    pk: stockitem.pk,
    title: t`Edit Name`,
    modalId: 'edit-stock-name',
    fields: {
      name: {
        description: t`Enter a name for this stock item`
      }
    },
    onFormSuccess: refreshInstance
  });

  const editStockItem = useEditApiFormModal({
    url: ApiEndpoints.stock_item_list,
    pk: stockitem.pk,
    title: t`Edit Stock Item`,
    modalId: 'edit-stock-item',
    fields: editStockItemFields,
    processFormData: (data) =>
      processStockItemPatchPayload(data, {
        fallbackCurrency:
          stockitem.purchase_price_currency ||
          globalSettings.getSetting('INVENTREE_DEFAULT_CURRENCY') ||
          'CAD'
      }),
    onFormSuccess: refreshInstance
  });

  const preDeleteContent = useMemo(() => {
    // TODO: Fill this out with information on the stock item.
    // e.g. list of child items which would be deleted, etc
    return undefined;
  }, [stockitem]);

  const deleteStockItem = useDeleteApiFormModal({
    url: ApiEndpoints.stock_item_list,
    pk: stockitem.pk,
    title: t`Delete Stock Item`,
    preFormContent: preDeleteContent,
    onFormSuccess: () => {
      if (stockitem.location) {
        navigate(getDetailUrl(ModelType.stocklocation, stockitem.location));
      } else {
        navigate(getOverviewUrl(ModelType.stockitem));
      }
    }
  });

  const stockOperationProps: StockOperationProps = useMemo(() => {
    return {
      items: [stockitem],
      model: ModelType.stockitem,
      refresh: () => {
        const location = stockitem?.location;
        refreshInstancePromise().then((response) => {
          if (response.status == 'error') {
            // If an error occurs refreshing the instance,
            // the stock likely has likely been depleted
            if (location) {
              navigate(getDetailUrl(ModelType.stocklocation, location));
            } else {
              navigate(getOverviewUrl(ModelType.stockitem));
            }
          }
        });
      },
      filters: {
        in_stock: true
      }
    };
  }, [stockitem]);

  const stockAdjustActions = useStockAdjustActions({
    formProps: stockOperationProps,
    delete: false,
    assign: !!stockitem.in_stock && stockitem.part_detail?.salable,
    return: !!stockitem.consumed_by || !!stockitem.customer,
    merge: false
  });

  const serializeStockFields = useStockItemSerializeFields({
    partId: stockitem.part,
    trackable: stockitem.part_detail?.trackable,
    modalId: 'stock-item-serialize'
  });

  const serializeStockItem = useCreateApiFormModal({
    url: ApiEndpoints.stock_serialize,
    pk: stockitem.pk,
    title: t`Serialize Stock Item`,
    modalId: 'stock-item-serialize',
    fields: serializeStockFields,
    initialData: {
      quantity: stockitem.quantity,
      destination: stockitem.location ?? stockitem.part_detail?.default_location
    },
    onFormSuccess: (response: any) => {
      if (response.length >= stockitem.quantity) {
        // Entire item was serialized
        // Navigate to the first result
        navigate(getDetailUrl(ModelType.stockitem, response[0].pk));
      } else {
        refreshInstance();
      }
    },
    successMessage: t`Stock item serialized`
  });

  const stockActions = useMemo(() => {
    // Can this stock item be transferred to a different location?
    const canTransfer =
      user.hasChangeRole(UserRoles.stock) &&
      !stockitem.sales_order &&
      !stockitem.belongs_to &&
      !stockitem.customer &&
      !stockitem.consumed_by;

    const isBuilding = stockitem.is_building;

    const serial = stockitem.serial;
    const serialized =
      serial != null &&
      serial != undefined &&
      serial != '' &&
      stockitem.quantity == 1;

    return [
      <AdminButton model={ModelType.stockitem} id={stockitem.pk} />,
      <LocateItemButton stockId={stockitem.pk} />,
      <ActionDropdown
        tooltip={t`Stock Operations`}
        icon={<IconPackages />}
        actions={[
          ...stockAdjustActions.menuActions,
          {
            name: t`Serialize`,
            tooltip: t`Serialize stock`,
            hidden:
              serialized ||
              stockitem?.quantity < 1 ||
              stockitem?.part_detail?.trackable != true,
            icon: <InvenTreeIcon icon='serial' iconProps={{ color: 'blue' }} />,
            onClick: () => {
              serializeStockItem.open();
            }
          },
          {
            name: t`Order`,
            tooltip: t`Order Stock`,
            hidden: true
          }
        ]}
      />,
      <OptionsActionDropdown
        tooltip={t`Stock Item Actions`}
        actions={[
          DeleteItemAction({
            hidden: !user.hasDeleteRole(UserRoles.stock),
            onClick: () => deleteStockItem.open()
          })
        ]}
      />
    ];
  }, [stockitem, user, stockAdjustActions.menuActions]);

  const stockBadges: ReactNode[] = useMemo(() => {
    let available =
      (stockitem?.quantity ?? 0) -
      (stockitem?.broken_quantity ?? 0) -
      (stockitem?.missing_quantity ?? 0) -
      (stockitem?.allocated ?? 0);
    available = Math.max(0, available);

    return instanceQuery.isLoading
      ? []
      : [
          <DetailsBadge
            color='yellow'
            label={t`In Production`}
            visible={stockitem.is_building}
          />,
          <DetailsBadge
            color='blue'
            label={`${t`Serial Number`}: ${stockitem.serial}`}
            visible={!!stockitem.serial}
            key='serial'
          />,
          <DetailsBadge
            color='blue'
            label={`${t`Quantity`}: ${formatDecimal(stockitem.quantity)}`}
            visible={!stockitem.serial}
            key='quantity'
          />,
          <DetailsBadge
            color='orange'
            label={`${t`Broken`}: ${formatDecimal(stockitem.broken_quantity ?? 0)}`}
            visible={(stockitem?.broken_quantity ?? 0) > 0}
            key='broken'
          />,
          <DetailsBadge
            color='red'
            label={`${t`Missing`}: ${formatDecimal(stockitem.missing_quantity ?? 0)}`}
            visible={(stockitem?.missing_quantity ?? 0) > 0}
            key='missing'
          />,
          <DetailsBadge
            color='yellow'
            label={`${t`Available`}: ${formatDecimal(available)}`}
            visible={
              stockitem.in_stock &&
              !stockitem.serial &&
              available != stockitem.quantity
            }
            key='available'
          />,
          <DetailsBadge
            color='blue'
            label={`${t`Batch Code`}: ${stockitem.batch}`}
            visible={!!stockitem.batch}
            key='batch'
          />,
          <DetailsBadge
            color={getTrackletStatusColor(stockitem.tracklet_status)}
            label={getTrackletStatusLabel(stockitem.tracklet_status)}
            visible={!!stockitem.tracklet_status}
            key='status'
          />,
          <DetailsBadge
            color='yellow'
            label={t`Stale`}
            visible={enableExpiry && stockitem.stale && !stockitem.expired}
            key='stale'
          />,
          <DetailsBadge
            color='orange'
            label={t`Expired`}
            visible={enableExpiry && stockitem.expired}
            key='expired'
          />,
          <DetailsBadge
            color='red'
            label={t`Unavailable`}
            visible={stockitem.in_stock == false}
            key='unavailable'
          />
        ];
  }, [stockitem, instanceQuery, enableExpiry]);

  return (
    <>
      {findBySerialNumber.modal}
      <InstanceDetail
        query={instanceQuery}
        requiredPermission={ModelType.stockitem}
      >
        <Stack>
          {user.hasViewRole(UserRoles.stock_location) && (
            <NavigationTree
              title={t`Stock Locations`}
              modelType={ModelType.stocklocation}
              endpoint={ApiEndpoints.stock_location_tree}
              opened={treeOpen}
              onClose={() => setTreeOpen(false)}
              selectedId={stockitem?.location}
            />
          )}
          <PageDetail
            title={stockitem.name || t`Stock Item`}
            imageUrl={
              stockitem.image ??
              stockitem.thumbnail ??
              stockitem.part_detail?.image ??
              stockitem.part_detail?.thumbnail
            }
            subtitle={
              stockitem.category ||
              (stockitem.serial
                ? `${t`Serial Number`}: ${stockitem.serial}`
                : stockitem.batch || undefined)
            }
            editAction={editStockItem.open}
            editEnabled={user.hasChangePermission(ModelType.stockitem)}
            badges={stockBadges}
            breadcrumbs={
              user.hasViewRole(UserRoles.stock_location)
                ? breadcrumbs
                : undefined
            }
            lastCrumb={[
              {
                name: stockitem.name || t`Stock Item`,
                url: `/stock/item/${stockitem.pk}/`
              }
            ]}
            breadcrumbAction={() => {
              setTreeOpen(true);
            }}
            actions={stockActions}
          />
          <PanelGroup
            pageKey='stockitem'
            panels={stockPanels}
            model={ModelType.stockitem}
            id={stockitem.pk}
            instance={stockitem}
          />
        </Stack>
      </InstanceDetail>
      {editStockItem.modal}
      {editStockName.modal}
      {deleteStockItem.modal}
      {serializeStockItem.modal}
      {stockAdjustActions.modals.map((modal) => modal.modal)}
    </>
  );
}
