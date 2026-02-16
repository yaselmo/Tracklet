import {
  IconCalendar,
  IconMapPin,
  IconMoon,
  IconTag,
  IconUser
} from '@tabler/icons-react';
import { useMemo } from 'react';

import type { ApiFormFieldSet } from '@lib/types/Forms';

export function useEventFields(): ApiFormFieldSet {
  return useMemo(() => {
    return {
      title: {
        required: true
      },
      start_date: {
        required: true,
        icon: <IconCalendar />
      },
      end_date: {
        icon: <IconCalendar />
      },
      late_night_takedown: {
        icon: <IconMoon />
      },
      planner: {
        icon: <IconUser />
      },
      venue: {
        icon: <IconMapPin />
      },
      event_type: {
        icon: <IconTag />
      },
      status: {},
      description: {}
    };
  }, []);
}
