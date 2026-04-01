import type { ReactNode } from 'react';

import { ModelType } from '@lib/enums/ModelType';
import { getDetailUrl } from '@lib/functions/Navigation';
import { type InstanceRenderInterface, RenderInlineModel } from './Instance';
import { StatusRenderer } from './StatusRenderer';

export function RenderEvent(
  props: Readonly<InstanceRenderInterface>
): ReactNode {
  const { instance } = props;

  return (
    <RenderInlineModel
      {...props}
      primary={instance.reference || instance.title}
      secondary={instance.title}
      suffix={StatusRenderer({
        status: instance.status,
        type: ModelType.event
      })}
      url={props.link ? getDetailUrl(ModelType.event, instance.pk) : undefined}
    />
  );
}

export function RenderRentalOrder(
  props: Readonly<InstanceRenderInterface>
): ReactNode {
  const { instance } = props;

  return (
    <RenderInlineModel
      {...props}
      primary={instance.reference}
      secondary={instance.customer_detail?.name || instance.status_name}
      suffix={StatusRenderer({
        status: instance.status,
        type: ModelType.rentalorder
      })}
      url={
        props.link ? getDetailUrl(ModelType.rentalorder, instance.pk) : undefined
      }
    />
  );
}
