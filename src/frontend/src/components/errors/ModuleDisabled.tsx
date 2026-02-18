import { t } from '@lingui/core/macro';

import GenericErrorPage from './GenericErrorPage';

export default function ModuleDisabled({
  moduleName
}: Readonly<{
  moduleName: string;
}>) {
  return (
    <GenericErrorPage
      title={t`Module Disabled`}
      message={`${moduleName}: ${t`This module is disabled in Tracklet`}`}
    />
  );
}
