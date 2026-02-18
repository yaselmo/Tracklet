import { t } from '@lingui/core/macro';
import { useMemo } from 'react';

import { ApiEndpoints, apiUrl } from '@lib/index';
import type { ApiFormFieldSet } from '@lib/types/Forms';

export function useEventFields(): ApiFormFieldSet {
  return useMemo(() => {
    return {
      reference: {},
      title: {},
      event_type: {
        field_type: 'related field',
        api_url: apiUrl(ApiEndpoints.tracklet_event_type_list),
        required: true,
        modelRenderer: (instance) => instance?.name || ''
      },
      venue: {
        field_type: 'related field',
        api_url: apiUrl(ApiEndpoints.tracklet_venue_list),
        required: true,
        modelRenderer: (instance) => instance?.name || ''
      },
      planner: {
        field_type: 'related field',
        api_url: apiUrl(ApiEndpoints.tracklet_planner_list),
        required: false,
        modelRenderer: (instance) => instance?.name || ''
      },
      start_datetime: {},
      end_datetime: {},
      late_night_takedown: {},
      status: {},
      notes: {}
    };
  }, []);
}

export function useVenueFields(): ApiFormFieldSet {
  return useMemo(() => {
    return {
      name: {},
      address: {},
      contact_name: {},
      contact_email: {},
      active: {},
      notes: {}
    };
  }, []);
}

export function usePlannerFields(): ApiFormFieldSet {
  return useMemo(() => {
    return {
      name: {},
      email: {},
      phone: {},
      active: {},
      notes: {}
    };
  }, []);
}

export function useEventTypeFields(): ApiFormFieldSet {
  return useMemo(() => {
    return {
      name: {},
      description: {},
      active: {}
    };
  }, []);
}

export function useFurnitureItemFields(): ApiFormFieldSet {
  return useMemo(() => {
    return {
      name: {},
      description: {},
      category: {},
      asset_tag: {},
      active: {},
      notes: {}
    };
  }, []);
}

export function useEventFurnitureAssignmentFields({
  eventId,
  defaults,
  onPartChange
}: {
  eventId?: number;
  defaults?: Partial<{
    status: number;
  }>;
  onPartChange?: (pk: number | null, data: any) => void;
} = {}): ApiFormFieldSet {
  return useMemo(() => {
    return {
      event: {
        value: eventId,
        hidden: !!eventId,
        disabled: !!eventId
      },
      part: {
        field_type: 'related field',
        api_url: apiUrl(ApiEndpoints.part_list),
        filters: {
          active: true,
          IPN_regex: '^RENTAL-',
          category_detail: true
        },
        required: true,
        onValueChange: (pk: number | null, data: any) => onPartChange?.(pk, data),
        modelRenderer: (instance) => {
          const categoryPath =
            instance?.category_detail?.pathstring || instance?.category_name || '';
          if (categoryPath) {
            return `${instance?.name || ''} — ${categoryPath}`;
          }
          return instance?.name || '';
        }
      },
      quantity: {
        value: 1
      },
      status: {
        value: defaults?.status
      },
      checked_out_at: {},
      checked_in_at: {},
      notes: {}
    };
  }, [eventId, defaults?.status, onPartChange]);
}

export function useRentalAssetFields(): ApiFormFieldSet {
  return useMemo(() => {
    return {
      name: {},
      asset_tag: {},
      serial: {},
      active: {},
      notes: {}
    };
  }, []);
}

export function useRentalOrderFields({
  customerId
}: {
  customerId?: number;
} = {}): ApiFormFieldSet {
  return useMemo(() => {
    return {
      reference: {},
      customer: {
        filters: {
          is_customer: true,
          active: true
        },
        value: customerId
      },
      rental_start: {},
      rental_end: {},
      returned_date: {},
      status: {},
      responsible: {},
      notes: {}
    };
  }, [customerId]);
}

export function useRentalLineItemFields({
  orderId
}: {
  orderId?: number;
} = {}): ApiFormFieldSet {
  return useMemo(() => {
    return {
      order: {
        value: orderId,
        hidden: !!orderId,
        disabled: !!orderId
      },
      asset: {
        filters: {
          active: true
        }
      },
      quantity: {
        value: 1,
        description: t`Quantity of this asset for the rental`
      },
      notes: {}
    };
  }, [orderId]);
}
