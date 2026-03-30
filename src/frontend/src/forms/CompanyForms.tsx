import { t } from '@lingui/core/macro';
import type {
  ApiFormAdjustFilterType,
  ApiFormFieldSet
} from '@lib/types/Forms';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { apiUrl } from '@lib/functions/Api';
import {
  IconAt,
  IconCurrencyDollar,
  IconGlobe,
  IconHash,
  IconLink,
  IconNote,
  IconPhone
} from '@tabler/icons-react';
import { useMemo } from 'react';
import { RenderStockItem } from '../components/render/Stock';

/**
 * Field set for SupplierPart instance
 */
export function useSupplierPartFields({
  supplierId,
  manufacturerId,
  manufacturerPartId,
  partId,
  useStockSelection = false
}: {
  supplierId?: number;
  manufacturerId?: number;
  manufacturerPartId?: number;
  partId?: number;
  useStockSelection?: boolean;
}) {
  return useMemo(() => {
    const fields: ApiFormFieldSet = {
      part: {
        value: partId,
        disabled: !!partId,
        hidden: useStockSelection,
        filters: {
          part: partId,
          purchaseable: true,
          active: true
        }
      },
      manufacturer_part: {
        value: manufacturerPartId,
        filters: {
          manufacturer: manufacturerId,
          part_detail: true,
          manufacturer_detail: true
        },
        adjustFilters: (adjust: ApiFormAdjustFilterType) => {
          return {
            ...adjust.filters,
            part: adjust.data.part
          };
        }
      },
      stock_item: {
        field_type: 'related field',
        hidden: !useStockSelection,
        model: ModelType.stockitem,
        api_url: apiUrl(ApiEndpoints.stock_item_list),
        filters: {
          part_detail: true,
          supplier_part: 'null',
          in_stock: true
        },
        description: t`Select an existing stock item to link this supplier part to`,
        modelRenderer: ({ instance }: any) => (
          <RenderStockItem instance={instance} link={false} />
        ),
        onValueChange: (_value, data) => {
          fields.part.value = data?.part ?? data?.part_detail?.pk ?? undefined;
        }
      },
      supplier: {
        value: supplierId,
        hidden: !!supplierId,
        disabled: !!supplierId,
        filters: {
          active: true,
          is_supplier: true
        }
      },
      SKU: {
        icon: <IconHash />
      },
      description: {},
      link: {
        icon: <IconLink />
      },
      note: {
        icon: <IconNote />
      },
      active: {}
    };

    return fields;
  }, [
    supplierId,
    manufacturerId,
    manufacturerPartId,
    partId,
    useStockSelection
  ]);
}

export function useManufacturerPartFields() {
  return useMemo(() => {
    const fields: ApiFormFieldSet = {
      part: {},
      manufacturer: {
        filters: {
          active: true,
          is_manufacturer: true
        }
      },
      MPN: {},
      description: {},
      link: {}
    };

    return fields;
  }, []);
}

/**
 * Field set for editing a company instance
 */
export function companyFields(): ApiFormFieldSet {
  return {
    name: {},
    description: {},
    website: {
      icon: <IconGlobe />
    },
    currency: {
      icon: <IconCurrencyDollar />
    },
    phone: {
      icon: <IconPhone />
    },
    email: {
      icon: <IconAt />
    },
    tax_id: {},
    is_supplier: {},
    is_manufacturer: {},
    is_customer: {},
    active: {}
  };
}
