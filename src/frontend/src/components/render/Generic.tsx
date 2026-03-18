import type { ReactNode } from 'react';

import { type InstanceRenderInterface, RenderInlineModel } from './Instance';

export function RenderParameterTemplate({
  instance
}: Readonly<InstanceRenderInterface>): ReactNode {
  return (
    <RenderInlineModel
      primary={instance.name}
      secondary={instance.description}
      suffix={instance.units}
    />
  );
}

export function RenderParameter({
  instance
}: Readonly<InstanceRenderInterface>): ReactNode {
  return (
    <RenderInlineModel
      primary={instance.template?.name || ''}
      secondary={instance.description}
      suffix={instance.data || instance.data_numeric || ''}
    />
  );
}

export function RenderProjectCode({
  instance
}: Readonly<InstanceRenderInterface>): ReactNode {
  return (
    instance && (
      <RenderInlineModel
        primary={instance.code}
        suffix={instance.description}
      />
    )
  );
}

export function RenderProject({
  instance
}: Readonly<InstanceRenderInterface>): ReactNode {
  return (
    instance && (
      <RenderInlineModel
        primary={instance.name}
        secondary={instance.description || instance.status}
      />
    )
  );
}

export function RenderProjectStockAllocation({
  instance
}: Readonly<InstanceRenderInterface>): ReactNode {
  const primary =
    instance?.stock_item_detail?.name ||
    instance?.stock_item_detail?.part_detail?.full_name ||
    instance?.stock_item_detail?.part_detail?.name ||
    instance?.item_name ||
    instance?.project_name ||
    instance?.name;

  const secondary =
    instance?.project_detail?.name ||
    instance?.project_name ||
    instance?.notes ||
    instance?.quantity;

  return instance && <RenderInlineModel primary={primary} secondary={secondary} />;
}

export function RenderContentType({
  instance
}: Readonly<InstanceRenderInterface>): ReactNode {
  return instance && <RenderInlineModel primary={instance.app_labeled_name} />;
}

export function RenderError({
  instance
}: Readonly<InstanceRenderInterface>): ReactNode {
  return instance && <RenderInlineModel primary={instance.name} />;
}

export function RenderImportSession({
  instance
}: {
  instance: any;
}): ReactNode {
  return instance && <RenderInlineModel primary={instance.data_file} />;
}

export function RenderSelectionList({
  instance
}: Readonly<InstanceRenderInterface>): ReactNode {
  return (
    instance && (
      <RenderInlineModel
        primary={instance.name}
        secondary={instance.description}
      />
    )
  );
}
