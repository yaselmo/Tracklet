import { t } from '@lingui/core/macro';
import { useMemo } from 'react';

import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { apiUrl } from '@lib/functions/Api';
import type { ApiFormFieldSet } from '@lib/types/Forms';

export function useProjectFields(): ApiFormFieldSet {
  return useMemo(() => {
    return {
      name: {},
      description: {},
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
      status: {},
      start_date: {},
      end_date: {}
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
        filters: {
          available: true,
          in_stock: true,
          part_detail: true,
          location_detail: true
        },
        description: t`Select stock item to allocate`
      },
      quantity: {},
      notes: {}
    };
  }, [projectId]);
}

export function useProjectInstrumentFields(projectId?: number): ApiFormFieldSet {
  return useMemo(() => {
    return {
      project: {
        hidden: !!projectId,
        value: projectId
      },
      stock_item: {
        filters: {
          available: true,
          in_stock: true,
          part_detail: true,
          location_detail: true
        },
        description: t`Select stock item to track as an instrument`
      },
      quantity: {
        value: 1
      },
      notes: {}
    };
  }, [projectId]);
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
        value: 1
      },
      location: {
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
          const partName = part?.full_name || part?.name || `Instrument ${instance?.pk ?? ''}`;
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
