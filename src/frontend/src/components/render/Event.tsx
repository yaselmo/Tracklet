import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';

import { ModelType } from '@lib/enums/ModelType';
import { getDetailUrl } from '@lib/functions/Navigation';
import { type InstanceRenderInterface, RenderInlineModel } from './Instance';
import { StatusRenderer } from './StatusRenderer';

/**
 * Inline rendering of a single Event instance
 */
export function RenderEvent(
  props: Readonly<InstanceRenderInterface>
): ReactNode {
  const { instance } = props;

  return (
    <RenderInlineModel
      {...props}
      primary={instance.title ?? `${t`Event`} ${instance.pk}`}
      secondary={instance.description || instance.start_date}
      suffix={StatusRenderer({
        status: instance.status_custom_key,
        type: ModelType.event
      })}
      url={props.link ? getDetailUrl(ModelType.event, instance.pk) : undefined}
    />
  );
}

