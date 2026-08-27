import { t } from '@lingui/core/macro';
import {
  Anchor,
  Badge,
  Box,
  Button,
  Grid,
  Group,
  Skeleton,
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
  IconPlus,
  IconSearch,
  IconSitemap
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
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
import { useManufacturerPartFields } from '../../forms/CompanyForms';
import { useParameterFields } from '../../forms/CommonForms';
import { usePartFields } from '../../forms/PartForms';
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
import { StockTrackingTable } from '../../tables/stock/StockTrackingTable';

function hasDetailValue(value: unknown): boolean {
  return (
    value !== null &&
    value !== undefined &&
    (typeof value !== 'string' || value.trim().length > 0)
  );
}

function EditableDetailValue({
  value,
  display,
  canEdit,
  onEdit,
  tooltip,
  actionIcon
}: Readonly<{
  value: unknown;
  display?: ReactNode;
  canEdit?: boolean;
  onEdit?: () => void;
  tooltip?: string;
  actionIcon?: ReactNode;
}>) {
  const isSet = hasDetailValue(value);

  return (
    <Group gap='xs' justify='space-between' wrap='nowrap' w='100%'>
      {display ?? (
        <Text size='sm' c={isSet ? undefined : 'dimmed'}>
          {isSet ? String(value) : t`Not set`}
        </Text>
      )}
      {canEdit && onEdit && (
        <ActionButton
          icon={actionIcon ?? <IconEdit size={14} />}
          tooltip={tooltip ?? t`Edit`}
          onClick={onEdit}
        />
      )}
    </Group>
  );
}

function addDaysToDate(dateValue: string | null | undefined, days: number) {
  if (!dateValue || !Number.isFinite(days) || days <= 0) {
    return null;
  }

  const date = new Date(`${dateValue}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function StockDetail() {
  const { id } = useParams();

  const api = useApi();
  const user = useUserState();
  const queryClient = useQueryClient();

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
      supplier_part_detail: true,
      location_detail: true,
      path_detail: true
    }
  });

  const { instance: serialNumbers, instanceQuery: serialNumbersQuery } =
    useInstance({
      endpoint: ApiEndpoints.stock_serial_info,
      pk: id
    });

  const refreshStockImageData = useCallback(() => {
    refreshInstance();
    void queryClient.invalidateQueries({
      queryKey: ['tabledata', apiUrl(ApiEndpoints.stock_item_list)]
    });
  }, [queryClient, refreshInstance]);

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

  const partDetailsQuery = useQuery({
    queryKey: ['stock-detail-part', stockitem.part],
    enabled: !!stockitem.part,
    queryFn: () =>
      api
        .get(apiUrl(ApiEndpoints.part_list, stockitem.part), {
          params: {
            category_detail: true,
            parameters: true
          }
        })
        .then((response) => response.data)
  });

  const partDetails = partDetailsQuery.data ?? stockitem.part_detail ?? {};

  // The direct stock creation form stores the selected category path on the
  // StockItem. Resolve it back to the existing PartCategory so calibration
  // settings can be displayed without duplicating them on each instrument.
  const stockCategoryQuery = useQuery({
    queryKey: ['stock-detail-category', stockitem.category],
    enabled: !!stockitem.category,
    queryFn: () =>
      api
        .get(apiUrl(ApiEndpoints.category_list), {
          params: {
            search: stockitem.category,
            cascade: true,
            limit: 100
          }
        })
        .then((response) => {
          const categories = response.data?.results ?? response.data ?? [];
          return categories.find(
            (category: any) =>
              category.pathstring === stockitem.category ||
              category.name === stockitem.category
          );
        })
  });

  const categoryDetails = stockitem.category
    ? stockCategoryQuery.data
    : partDetails.category_detail;

  const manufacturerPartsQuery = useQuery({
    queryKey: ['stock-detail-manufacturer-parts', stockitem.part],
    enabled: !!stockitem.part,
    queryFn: () =>
      api
        .get(apiUrl(ApiEndpoints.manufacturer_part_list), {
          params: {
            part: stockitem.part,
            manufacturer_detail: true,
            part_detail: true,
            limit: 100
          }
        })
        .then((response) => response.data?.results ?? response.data ?? [])
  });

  const parametersQuery = useQuery({
    queryKey: ['stock-detail-part-parameters', stockitem.part],
    enabled: !!stockitem.part,
    queryFn: () =>
      api
        .get(apiUrl(ApiEndpoints.parameter_list), {
          params: {
            model_type: ModelType.part,
            model_id: stockitem.part,
            limit: 250
          }
        })
        .then((response) => response.data?.results ?? response.data ?? [])
  });

  const editStockItemFields = useStockFields({
    create: false,
    stockItem: stockitem,
    modalId: 'edit-stock-item',
    includeConditionFields: true
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

  const editStockSerial = useEditApiFormModal({
    url: ApiEndpoints.stock_item_list,
    pk: stockitem.pk,
    title: t`Edit Serial Number`,
    modalId: 'edit-stock-serial',
    fields: {
      serial: {}
    },
    onFormSuccess: refreshInstance
  });

  const editStockNotes = useEditApiFormModal({
    url: ApiEndpoints.stock_item_list,
    pk: stockitem.pk,
    title: t`Edit Stock Item Notes`,
    modalId: 'edit-stock-notes',
    fields: {
      notes: {}
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

  const editPart = useEditApiFormModal({
    url: ApiEndpoints.part_list,
    pk: stockitem.part,
    title: t`Edit Shared Part`,
    modalId: 'edit-stock-shared-part',
    fields: usePartFields({
      create: false,
      partId: stockitem.part
    }),
    onFormSuccess: () => {
      void partDetailsQuery.refetch();
      refreshInstance();
    }
  });

  const editCategory = useEditApiFormModal({
    url: ApiEndpoints.category_list,
    pk: categoryDetails?.pk,
    title: t`Edit Shared Category`,
    modalId: 'edit-stock-shared-category',
    fields: {
      requires_calibration: {
        field_type: 'boolean',
        label: t`Requires calibration`,
        description: t`Parts in this category require periodic calibration`
      },
      calibration_interval_days: {
        label: t`Calibration interval (days)`,
        description: t`Default number of days between calibrations`,
        min: 1
      }
    },
    onFormSuccess: () => {
      void stockCategoryQuery.refetch();
      void partDetailsQuery.refetch();
    }
  });

  const manufacturerPartFields = useManufacturerPartFields({
    includeMPN: false
  });
  const [selectedManufacturerPart, setSelectedManufacturerPart] = useState<any>();

  const editManufacturerPart = useEditApiFormModal({
    url: ApiEndpoints.manufacturer_part_list,
    pk: selectedManufacturerPart?.pk,
    title: t`Edit Manufacturer Part`,
    modalId: 'edit-stock-manufacturer-part',
    fields: manufacturerPartFields,
    onFormSuccess: () => {
      void manufacturerPartsQuery.refetch();
    }
  });

  const parameterFields = useParameterFields({
    modelType: ModelType.part,
    modelId: stockitem.part ?? 0
  });
  const [selectedParameter, setSelectedParameter] = useState<any>();

  const createParameter = useCreateApiFormModal({
    url: ApiEndpoints.parameter_list,
    title: t`Add Instrument Parameter`,
    modalId: 'add-stock-instrument-parameter',
    fields: parameterFields,
    initialData: {
      data: ''
    },
    onFormSuccess: () => {
      void parametersQuery.refetch();
    }
  });

  const editParameter = useEditApiFormModal({
    url: ApiEndpoints.parameter_list,
    pk: selectedParameter?.pk,
    title: t`Edit Instrument Parameter`,
    modalId: 'edit-stock-instrument-parameter',
    fields: parameterFields,
    onFormSuccess: () => {
      void parametersQuery.refetch();
    }
  });

  const detailsPanel = (() => {
    const data: Record<string, any> = { ...stockitem };
    const allManufacturerParts = manufacturerPartsQuery.data ?? [];
    const linkedManufacturerPart =
      stockitem.supplier_part_detail?.manufacturer_part;
    const linkedManufacturerParts = linkedManufacturerPart
      ? allManufacturerParts.filter(
          (record: any) => record.pk === linkedManufacturerPart
        )
      : [];
    const manufacturerParts =
      linkedManufacturerParts.length > 0
        ? linkedManufacturerParts
        : allManufacturerParts;
    const parameters = parametersQuery.data ?? [];
    const canChangeStock = user.hasChangePermission(ModelType.stockitem);
    const canChangePart =
      !!stockitem.part && user.hasChangePermission(ModelType.part);
    const canChangeCategory =
      !!categoryDetails?.pk &&
      user.hasChangePermission(ModelType.partcategory);
    const canChangeManufacturer = user.hasChangeRole(
      UserRoles.purchase_order
    );

    data.available_stock = Math.max(
      0,
      (data.quantity ?? 0) -
        (data.broken_quantity ?? 0) -
        (data.missing_quantity ?? 0) -
        (data.allocated ?? 0)
    );

    const calibrationInterval = Number(
      categoryDetails?.calibration_interval_days ?? 0
    );
    const nextCalibrationDate = categoryDetails?.requires_calibration
      ? addDaysToDate(stockitem.last_calibration_date, calibrationInterval)
      : null;

    if (
      instanceQuery.isFetching ||
      partDetailsQuery.isFetching ||
      stockCategoryQuery.isFetching ||
      manufacturerPartsQuery.isFetching ||
      parametersQuery.isFetching
    ) {
      return <Skeleton />;
    }

    const renderManufacturer = (): ReactNode => {
      if (!stockitem.part) {
        return <EditableDetailValue value={null} />;
      }

      if (manufacturerParts.length === 0) {
        return <EditableDetailValue value={null} />;
      }

      return (
        <Stack gap={2} w='100%'>
          {manufacturerParts.map((record: any) => (
            <EditableDetailValue
              key={record.pk}
              value={record.manufacturer_detail?.name}
              canEdit={canChangeManufacturer}
              onEdit={() => {
                setSelectedManufacturerPart(record);
                editManufacturerPart.open();
              }}
              tooltip={t`Edit Manufacturer Part`}
            />
          ))}
        </Stack>
      );
    };

    const identificationFields: DetailsField[] = [
      {
        type: 'text',
        name: 'name',
        label: t`Name`,
        icon: 'part',
        value_formatter: () => (
          <EditableDetailValue
            value={stockitem.name}
            canEdit={canChangeStock}
            onEdit={editStockName.open}
            tooltip={t`Edit Name`}
          />
        )
      },
      {
        type: 'text',
        name: 'serial',
        label: t`Serial Number`,
        icon: 'serial',
        value_formatter: () => (
          <Group gap='xs' justify='space-between' wrap='nowrap' w='100%'>
            <EditableDetailValue
              value={stockitem.serial}
              canEdit={canChangeStock && Number(stockitem.quantity) === 1}
              onEdit={editStockSerial.open}
              tooltip={t`Edit Serial Number`}
            />
            <Group gap={2} wrap='nowrap'>
              {serialNumbers.previous?.pk && (
                <Tooltip label={t`Previous serial number`} position='top'>
                  <Button
                    p={3}
                    aria-label='previous-serial-number'
                    leftSection={<IconArrowLeft />}
                    variant='transparent'
                    size='sm'
                    onClick={() =>
                      navigate(
                        getDetailUrl(
                          ModelType.stockitem,
                          serialNumbers.previous.pk
                        )
                      )
                    }
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
                    onClick={() =>
                      navigate(
                        getDetailUrl(ModelType.stockitem, serialNumbers.next.pk)
                      )
                    }
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
        type: 'text',
        name: 'manufacturer',
        label: t`Manufacturer`,
        icon: 'manufacturers',
        value_formatter: renderManufacturer
      },
      {
        type: 'text',
        name: 'category',
        label: t`Category`,
        icon: 'info',
        value_formatter: () => (
          <EditableDetailValue
            value={stockitem.category}
            canEdit={canChangeStock}
            onEdit={editStockItem.open}
            tooltip={t`Edit Stock Item Category`}
          />
        )
      }
    ];

    const stockFields: DetailsField[] = [
      {
        type: 'number',
        name: 'quantity',
        label: t`Quantity`,
        icon: 'stock'
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
        icon: 'issue'
      },
      {
        type: 'number',
        name: 'missing_quantity',
        label: t`Missing`,
        icon: 'cancel'
      },
      {
        type: 'number',
        name: 'allocated',
        label: t`Allocated`,
        icon: 'tick_off'
      },
      {
        type: 'text',
        name: 'tracklet_status',
        label: t`Status`,
        icon: 'status',
        value_formatter: () => (
          <EditableDetailValue
            value={stockitem.tracklet_status}
            display={getTrackletStatusPill(stockitem)}
            canEdit={canChangeStock}
            onEdit={editStockItem.open}
            tooltip={t`Edit Stock Status`}
          />
        )
      },
      {
        type: 'text',
        name: 'location',
        label: t`Location`,
        icon: 'location',
        value_formatter: () => (
          <EditableDetailValue
            value={
              stockitem.location_detail?.pathstring ||
              stockitem.location_detail?.name
            }
            canEdit={canChangeStock}
            onEdit={editStockItem.open}
            tooltip={t`Edit Stock Location`}
          />
        )
      }
    ];

    const instrumentFields: DetailsField[] = [];

    if (parameters.length === 0) {
      instrumentFields.push({
        type: 'text',
        name: 'custom_parameters',
        label: t`Custom Parameters`,
        icon: 'parameters',
        value_formatter: () => (
          <EditableDetailValue
            value={null}
            canEdit={
              !!stockitem.part && user.hasAddPermission(ModelType.part)
            }
            onEdit={createParameter.open}
            tooltip={t`Add Instrument Parameter`}
            actionIcon={<IconPlus size={14} />}
          />
        )
      });
    } else {
      parameters.forEach((parameter: any) => {
        const key = `parameter_${parameter.pk}`;
        const units = parameter.template_detail?.units;
        const value = hasDetailValue(parameter.data)
          ? `${parameter.data}${units ? ` ${units}` : ''}`
          : null;
        data[key] = parameter.data;

        instrumentFields.push({
          type: 'text',
          name: key,
          label: parameter.template_detail?.name ?? t`Parameter`,
          icon: 'parameters',
          value_formatter: () => (
            <EditableDetailValue
              value={value}
              canEdit={canChangePart}
              onEdit={() => {
                setSelectedParameter(parameter);
                editParameter.open();
              }}
              tooltip={t`Edit Shared Part Parameter`}
            />
          )
        });
      });
    }

    const calibrationFields: DetailsField[] = [
      {
        type: 'text',
        name: 'calibration_required',
        label: t`Calibration Required`,
        icon: 'calendar',
        value_formatter: () => (
          <EditableDetailValue
            value={categoryDetails?.requires_calibration}
            display={
              categoryDetails ? (
                <Text size='sm'>
                  {categoryDetails.requires_calibration ? t`Yes` : t`No`}
                </Text>
              ) : undefined
            }
            canEdit={canChangeCategory}
            onEdit={editCategory.open}
            tooltip={t`Edit Shared Category Calibration Settings`}
          />
        )
      },
      {
        type: 'text',
        name: 'calibration_interval',
        label: t`Calibration Interval`,
        icon: 'calendar',
        value_formatter: () => (
          <EditableDetailValue
            value={categoryDetails?.calibration_interval_days}
            display={
              hasDetailValue(categoryDetails?.calibration_interval_days) ? (
                <Text size='sm'>
                  {`${categoryDetails.calibration_interval_days} ${t`days`}`}
                </Text>
              ) : undefined
            }
            canEdit={canChangeCategory}
            onEdit={editCategory.open}
            tooltip={t`Edit Shared Category Calibration Settings`}
          />
        )
      },
      {
        type: 'text',
        name: 'last_calibration_date',
        label: t`Last Calibration`,
        icon: 'calendar',
        value_formatter: () => (
          <EditableDetailValue
            value={stockitem.last_calibration_date}
            display={
              stockitem.last_calibration_date ? (
                <Text size='sm'>
                  {formatDate(stockitem.last_calibration_date)}
                </Text>
              ) : undefined
            }
            canEdit={canChangeStock}
            onEdit={editStockItem.open}
            tooltip={t`Edit Stock Item Calibration Dates`}
          />
        )
      },
      {
        type: 'text',
        name: 'next_calibration_date',
        label: t`Next Calibration / Due`,
        icon: 'calendar',
        value_formatter: () => (
          <EditableDetailValue
            value={
              categoryDetails?.requires_calibration === false
                ? t`Not required`
                : nextCalibrationDate
            }
            display={
              nextCalibrationDate ? (
                <Text size='sm'>{formatDate(nextCalibrationDate)}</Text>
              ) : categoryDetails?.requires_calibration === false ? (
                <Text size='sm' c='dimmed'>
                  {t`Not required`}
                </Text>
              ) : undefined
            }
          />
        )
      },
      {
        type: 'text',
        name: 'last_factory_calibration_date',
        label: t`Last Factory Calibration`,
        icon: 'calendar',
        value_formatter: () => (
          <EditableDetailValue
            value={stockitem.last_factory_calibration_date}
            display={
              stockitem.last_factory_calibration_date ? (
                <Text size='sm'>
                  {formatDate(stockitem.last_factory_calibration_date)}
                </Text>
              ) : undefined
            }
            canEdit={canChangeStock}
            onEdit={editStockItem.open}
            tooltip={t`Edit Stock Item Calibration Dates`}
          />
        )
      }
    ];

    const otherFields: DetailsField[] = [
      {
        type: 'text',
        name: 'description',
        label: t`Description`,
        icon: 'description',
        value_formatter: () => (
          <EditableDetailValue
            value={partDetails.description}
            canEdit={canChangePart}
            onEdit={editPart.open}
            tooltip={t`Edit Shared Part`}
          />
        )
      },
      {
        type: 'text',
        name: 'notes',
        label: t`Notes`,
        icon: 'notes',
        value_formatter: () => (
          <EditableDetailValue
            value={stockitem.notes}
            canEdit={canChangeStock}
            onEdit={editStockNotes.open}
            tooltip={t`Edit Stock Item Notes`}
          />
        )
      },
      {
        type: 'text',
        name: 'batch',
        label: t`Batch Code`,
        icon: 'batch',
        value_formatter: () => (
          <EditableDetailValue
            value={stockitem.batch}
            canEdit={canChangeStock}
            onEdit={editStockItem.open}
            tooltip={t`Edit Stock Item`}
          />
        )
      },
      {
        type: 'text',
        name: 'packaging',
        label: t`Packaging`,
        icon: 'part',
        value_formatter: () => (
          <EditableDetailValue
            value={stockitem.packaging}
            canEdit={canChangeStock}
            onEdit={editStockItem.open}
            tooltip={t`Edit Stock Item`}
          />
        )
      },
      {
        type: 'text',
        name: 'link',
        label: t`External Link`,
        icon: 'link',
        value_formatter: () => (
          <EditableDetailValue
            value={stockitem.link}
            display={
              stockitem.link ? (
                <Anchor
                  href={stockitem.link}
                  target='_blank'
                  rel='noreferrer noopener'
                >
                  {stockitem.link}
                </Anchor>
              ) : undefined
            }
            canEdit={canChangeStock}
            onEdit={editStockItem.open}
            tooltip={t`Edit Stock Item`}
          />
        )
      },
      {
        type: 'text',
        name: 'expiry_date',
        label: t`Expiry Date`,
        icon: 'calendar',
        value_formatter: () => (
          <EditableDetailValue
            value={stockitem.expiry_date}
            display={
              stockitem.expiry_date ? (
                <Text size='sm'>{formatDate(stockitem.expiry_date)}</Text>
              ) : undefined
            }
            canEdit={canChangeStock && enableExpiry}
            onEdit={editStockItem.open}
            tooltip={t`Edit Stock Item`}
          />
        )
      },
      {
        type: 'text',
        name: 'purchase_price',
        label: t`Unit Price`,
        icon: 'currency',
        value_formatter: () => (
          <EditableDetailValue
            value={stockitem.purchase_price}
            display={
              hasDetailValue(stockitem.purchase_price) ? (
                <Text size='sm'>
                  {formatCurrency(stockitem.purchase_price, {
                    currency: stockitem.purchase_price_currency
                  })}
                </Text>
              ) : undefined
            }
            canEdit={canChangeStock}
            onEdit={editStockItem.open}
            tooltip={t`Edit Stock Item`}
          />
        )
      },
      {
        type: 'text',
        name: 'stock_value',
        label: t`Stock Value`,
        icon: 'currency',
        value_formatter: () => (
          <EditableDetailValue
            value={stockitem.purchase_price}
            display={
              hasDetailValue(stockitem.purchase_price) ? (
                <Text size='sm'>
                  {formatCurrency(stockitem.purchase_price, {
                    currency: stockitem.purchase_price_currency,
                    multiplier: stockitem.quantity
                  })}
                </Text>
              ) : undefined
            }
          />
        )
      },
      {
        type: 'text',
        name: 'updated',
        label: t`Last Updated`,
        icon: 'calendar',
        value_formatter: () => (
          <EditableDetailValue
            value={stockitem.updated}
            display={
              stockitem.updated ? (
                <Text size='sm'>{formatDate(stockitem.updated)}</Text>
              ) : undefined
            }
          />
        )
      },
      {
        type: 'text',
        name: 'stocktake_date',
        label: t`Last Stocktake`,
        icon: 'calendar',
        value_formatter: () => (
          <EditableDetailValue
            value={stockitem.stocktake_date}
            display={
              stockitem.stocktake_date ? (
                <Text size='sm'>{formatDate(stockitem.stocktake_date)}</Text>
              ) : undefined
            }
          />
        )
      }
    ];

    const relationshipFields: DetailsField[] = [
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
        name: 'belongs_to',
        label: t`Installed In`,
        model_filters: { part_detail: true },
        model_formatter: (model: any) =>
          model?.part_detail?.full_name ?? model?.name ?? t`Stock Item`,
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
        hidden: !stockitem.parent
      },
      {
        type: 'link',
        name: 'build',
        label: t`Build Order`,
        model: ModelType.build,
        model_field: 'reference',
        hidden: !stockitem.build
      },
      {
        type: 'link',
        name: 'consumed_by',
        label: t`Consumed By`,
        model: ModelType.build,
        model_field: 'reference',
        hidden: !stockitem.consumed_by
      },
      {
        type: 'link',
        name: 'purchase_order',
        label: t`Purchase Order`,
        model: ModelType.purchaseorder,
        model_field: 'reference',
        hidden: !stockitem.purchase_order
      },
      {
        type: 'link',
        name: 'sales_order',
        label: t`Sales Order`,
        model: ModelType.salesorder,
        model_field: 'reference',
        hidden: !stockitem.sales_order
      },
      {
        type: 'link',
        name: 'customer',
        label: t`Customer`,
        model: ModelType.company,
        hidden: !stockitem.customer
      }
    ];

    return (
      <ItemDetailsGrid>
        <Box style={{ gridColumn: '1 / -1' }}>
          <Grid grow>
            <DetailsImage
              appRole={UserRoles.stock}
              imageActions={{
                downloadImage: true,
                uploadFile: true,
                deleteFile: true
              }}
              src={
                stockitem.image ??
                stockitem.thumbnail ??
                partDetails.image ??
                partDetails.thumbnail
              }
              apiPath={apiUrl(ApiEndpoints.stock_item_list, stockitem.pk)}
              refresh={refreshStockImageData}
              pk={String(stockitem.pk ?? '')}
            />
            <Grid.Col span={{ base: 12, sm: 8 }}>
              <DetailsTable
                fields={identificationFields}
                item={data}
                title={t`Instrument Information`}
              />
            </Grid.Col>
          </Grid>
        </Box>
        <DetailsTable fields={stockFields} item={data} title={t`Stock`} />
        <DetailsTable
          fields={instrumentFields}
          item={data}
          title={t`Instrument Details`}
        />
        <Box style={{ gridColumn: '1 / -1' }}>
          <DetailsTable
            fields={calibrationFields}
            item={data}
            title={t`Calibration`}
          />
        </Box>
        <Box style={{ gridColumn: '1 / -1' }}>
          <DetailsTable fields={otherFields} item={data} title={t`Other`} />
        </Box>
        {relationshipFields.some((field) => !field.hidden) && (
          <Box style={{ gridColumn: '1 / -1' }}>
            <DetailsTable
              fields={relationshipFields}
              item={data}
              title={t`Source and Assignment`}
            />
          </Box>
        )}
        <Box style={{ gridColumn: '1 / -1' }}>
          <Stack gap='xs'>
            <Text fw={600}>{t`Assigned Projects`}</Text>
            {projectAssignmentsQuery.isFetching ? (
              <Skeleton height={28} />
            ) : (projectAssignmentsQuery.data?.length ?? 0) <= 0 ? (
              <Text c='dimmed'>
                {t`This stock item is not assigned to any project`}
              </Text>
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
                      <Anchor
                        href={getDetailUrl(ModelType.project, project.pk)}
                      >
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
        </Box>
      </ItemDetailsGrid>
    );
  })();

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
    detailsPanel,
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
      {editStockSerial.modal}
      {editStockNotes.modal}
      {editPart.modal}
      {editCategory.modal}
      {editManufacturerPart.modal}
      {createParameter.modal}
      {editParameter.modal}
      {deleteStockItem.modal}
      {serializeStockItem.modal}
      {stockAdjustActions.modals.map((modal) => modal.modal)}
    </>
  );
}
