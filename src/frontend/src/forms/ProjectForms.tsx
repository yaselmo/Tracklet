import { t } from '@lingui/core/macro';
import { useMemo, useState } from 'react';

import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { apiUrl } from '@lib/functions/Api';
import type { ApiFormFieldSet } from '@lib/types/Forms';
import { RenderStockItem } from '../components/render/Stock';

export function useProjectFields(): ApiFormFieldSet {
  return useMemo(() => {
    return {
      name: {
        field_type: 'string',
        required: true
      },
      description: {
        field_type: 'string'
      },
      location: {
        field_type: 'related field',
        model: ModelType.stocklocation,
        api_url: apiUrl(ApiEndpoints.stock_location_list),
        required: false,
        description: t`Select project location`,
        modelRenderer: ({ instance }: any) => (
          <span>{instance?.pathstring || instance?.name || '-'}</span>
        )
      },
      status: {
        field_type: 'choice',
        value: 'FUTURE',
        choices: [
          {
            value: 'FUTURE',
            display_name: t`Future`
          },
          {
            value: 'ONGOING',
            display_name: t`Ongoing`
          },
          {
            value: 'PAST',
            display_name: t`Past`
          }
        ]
      },
      start_date: {
        field_type: 'date'
      },
      end_date: {
        field_type: 'date'
      }
    };
  }, []);
}

export function useProjectAllocationFields(projectId?: number): ApiFormFieldSet {
  return useMemo(() => {
    return {
      project: {
        hidden: !!projectId,
        value: projectId
      },
      stock_item: {
        field_type: 'related field',
        model: ModelType.stockitem,
        api_url: apiUrl(ApiEndpoints.stock_item_list),
        filters: {
          available: true,
          in_stock: true,
          part_detail: true,
          location_detail: true
        },
        description: t`Select stock item to allocate`
      },
      quantity: {
        field_type: 'number',
        min: 0
      },
      notes: {
        field_type: 'string'
      }
    };
  }, [projectId]);
}

export function useProjectInstrumentFields(projectId?: number): ApiFormFieldSet {
  const [quantity, setQuantity] = useState<number>(1);
  const [maxQuantity, setMaxQuantity] = useState<number>(1);

  return useMemo(() => {
    const clampInstrumentQuantity = (value: any) => {
      if (value == null || value === '') {
        return value;
      }

      const parsedValue = Number(value);

      if (!Number.isFinite(parsedValue)) {
        return value;
      }

      return Math.min(Math.max(parsedValue, 1), maxQuantity);
    };

    return {
      project: {
        hidden: !!projectId,
        value: projectId
      },
      stock_item: {
        field_type: 'related field',
        model: ModelType.stockitem,
        api_url: apiUrl(ApiEndpoints.stock_item_list),
        filters: {
          available: true,
          in_stock: true,
          project: projectId,
          part_detail: true,
          location_detail: true
        },
        description: t`Select stock item to track as an instrument`,
        modelRenderer: ({ instance }: any) => (
          <RenderStockItem
            instance={instance}
            extra={{ show_location: false }}
          />
        ),
        onValueChange: (_value: any, instance: any) => {
          if (!instance) {
            setQuantity(1);
            setMaxQuantity(1);
            return;
          }

          const totalQuantity = Number(instance.quantity ?? 0);
          const allocatedQuantity = Number(instance.allocated ?? 0);
          const availableQuantity = Math.max(totalQuantity - allocatedQuantity, 0);
          const nextQuantity = availableQuantity > 0 ? availableQuantity : 1;

          setMaxQuantity(nextQuantity);
          setQuantity(nextQuantity);
        }
      },
      quantity: {
        field_type: 'number',
        value: quantity,
        min: 1,
        max: maxQuantity,
        clampBehavior: 'strict',
        adjustValue: clampInstrumentQuantity,
        onValueChange: (value: any) => {
          const nextQuantity = clampInstrumentQuantity(value);

          if (nextQuantity == null || nextQuantity === '') {
            setQuantity(1);
            return;
          }

          setQuantity(Number(nextQuantity));
        }
      },
      notes: {
        field_type: 'string'
      }
    };
  }, [projectId, quantity, maxQuantity]);
}

export function useProjectAutoAssignInstrumentFields(): ApiFormFieldSet {
  return useMemo(() => {
    return {
      part: {
        field_type: 'related field',
        required: true,
        label: t`Part`,
        description: t`Select part to auto-assign from stock`,
        model: ModelType.part,
        api_url: apiUrl(ApiEndpoints.part_list),
        filters: {
          in_stock: true
        }
      },
      quantity: {
        field_type: 'number',
        value: 1
      },
      location: {
        field_type: 'related field',
        required: false,
        model: ModelType.stocklocation,
        api_url: apiUrl(ApiEndpoints.stock_location_list)
      }
    };
  }, []);
}

export function useProjectReportItemFields(projectId: number): ApiFormFieldSet {
  return useMemo(() => {
    return {
      instrument_id: {
        field_type: 'related field',
        required: true,
        label: t`Instrument`,
        description: t`Select an instrument linked to this project`,
        api_url: apiUrl(ApiEndpoints.project_instruments, projectId),
        filters: {
          stock_item_detail: true,
          part_detail: true
        },
        modelRenderer: ({ instance }: any) => {
          const fromApi =
            instance?.instrument_display_name ||
            instance?.label ||
            instance?.display_name ||
            instance?.name;

          if (fromApi) {
            return <span>{fromApi}</span>;
          }

          const stock = instance?.stock_item_detail ?? {};
          const part = instance?.part_detail ?? stock?.part_detail ?? {};
          const partName =
            part?.full_name || part?.name || `Instrument ${instance?.pk ?? ''}`;
          const serial = stock?.serial ? ` #${stock.serial}` : '';
          return <span>{`${partName}${serial}`.trim()}</span>;
        }
      },
      note: {
        label: t`Usage / Notes`
      }
    };
  }, [projectId]);
}
