import { t } from '@lingui/core/macro';
import { Stack } from '@mantine/core';
import { IconBuildingStore, IconListDetails, IconTable } from '@tabler/icons-react';
import { useMemo } from 'react';

import { UserRoles } from '@lib/enums/Roles';
import { useLocalStorage } from '@mantine/hooks';
import PermissionDenied from '../../components/errors/PermissionDenied';
import { PageDetail } from '../../components/nav/PageDetail';
import { PanelGroup } from '../../components/panels/PanelGroup';
import SegmentedControlPanel from '../../components/panels/SegmentedControlPanel';
import { useUserState } from '../../states/UserState';
import { CompanyTable } from '../../tables/company/CompanyTable';
import ParametricCompanyTable from '../../tables/company/ParametricCompanyTable';

export default function SuppliersIndex() {
  const user = useUserState();

  const [supplierView, setSupplierView] = useLocalStorage<string>({
    key: 'supplier-view',
    defaultValue: 'table'
  });

  const panels = useMemo(() => {
    return [
      SegmentedControlPanel({
        name: 'suppliers',
        label: t`Suppliers`,
        icon: <IconBuildingStore />,
        selection: supplierView,
        onChange: setSupplierView,
        options: [
          {
            value: 'table',
            label: t`Table View`,
            icon: <IconTable />,
            content: (
              <CompanyTable
                path='suppliers/supplier'
                params={{ is_supplier: true }}
              />
            )
          },
          {
            value: 'parametric',
            label: t`Parametric View`,
            icon: <IconListDetails />,
            content: (
              <ParametricCompanyTable queryParams={{ is_supplier: true }} />
            )
          }
        ]
      })
    ];
  }, [supplierView]);

  if (!user.isLoggedIn() || !user.hasViewRole(UserRoles.purchase_order)) {
    return <PermissionDenied />;
  }

  return (
    <Stack>
      <PageDetail title={t`Suppliers`} />
      <PanelGroup
        pageKey='suppliers-index'
        panels={panels}
        model={'suppliers'}
        id={null}
      />
    </Stack>
  );
}
