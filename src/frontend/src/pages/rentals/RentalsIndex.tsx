import { t } from '@lingui/core/macro';
import { Stack } from '@mantine/core';
import { IconBuildingStore, IconClipboardList, IconPackage } from '@tabler/icons-react';
import { useMemo } from 'react';

import { UserRoles } from '@lib/enums/Roles';
import PermissionDenied from '../../components/errors/PermissionDenied';
import { PageDetail } from '../../components/nav/PageDetail';
import { PanelGroup } from '../../components/panels/PanelGroup';
import { useUserState } from '../../states/UserState';
import { CompanyTable } from '../../tables/company/CompanyTable';
import { RentalAssetTable } from '../../tables/rentals/RentalAssetTable';
import { RentalOrderTable } from '../../tables/rentals/RentalOrderTable';

export default function RentalsIndex() {
  const user = useUserState();

  const panels = useMemo(() => {
    return [
      {
        name: 'rental-orders',
        label: t`Rental Orders`,
        icon: <IconClipboardList />,
        content: <RentalOrderTable />
      },
      {
        name: 'assets',
        label: t`Assets / Items`,
        icon: <IconPackage />,
        content: <RentalAssetTable />
      },
      {
        name: 'customers',
        label: t`Customers`,
        icon: <IconBuildingStore />,
        content: (
          <CompanyTable path='rentals/customer' params={{ is_customer: true }} />
        )
      }
    ];
  }, [user]);

  if (!user.isLoggedIn() || !user.hasViewRole(UserRoles.sales_order)) {
    return <PermissionDenied />;
  }

  return (
    <Stack>
      <PageDetail title={t`Rentals`} />
      <PanelGroup
        pageKey='rentals-index'
        panels={panels}
        model={'rentals'}
        id={null}
      />
    </Stack>
  );
}
