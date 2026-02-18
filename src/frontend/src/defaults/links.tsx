import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { openContextModal } from '@mantine/modals';

import { UserRoles } from '@lib/enums/Roles';
import type { SettingsStateProps } from '@lib/types/Settings';
import type { UserStateProps } from '@lib/types/User';
import {
  IconBox,
  IconCalendarEvent,
  IconBuildingFactory2,
  IconClipboardList,
  IconDashboard,
  IconPackages,
  IconShoppingCart,
  IconTruckDelivery
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { MenuLinkItem } from '../components/items/MenuLinks';
import { StylishText } from '../components/items/StylishText';
import { isModuleEnabled } from './featureFlags';

type NavTab = {
  name: string;
  title: string;
  icon: ReactNode;
  role?: UserRoles;
};

export function getNavTabs(user: UserStateProps): NavTab[] {
  const navTabs: NavTab[] = [
    {
      name: 'home',
      title: t`Dashboard`,
      icon: <IconDashboard />
    },
    {
      name: 'part',
      title: t`Parts`,
      icon: <IconBox />,
      role: UserRoles.part
    },
    {
      name: 'stock',
      title: t`Stock`,
      icon: <IconPackages />,
      role: UserRoles.stock
    },
    {
      name: 'manufacturing',
      title: t`Manufacturing`,
      icon: <IconBuildingFactory2 />,
      role: UserRoles.build
    },
    {
      name: 'purchasing',
      title: t`Purchasing`,
      icon: <IconShoppingCart />,
      role: UserRoles.purchase_order
    },
    {
      name: 'sales',
      title: t`Sales`,
      icon: <IconTruckDelivery />,
      role: UserRoles.sales_order
    },
    {
      name: 'events',
      title: t`Events`,
      icon: <IconCalendarEvent />,
      role: UserRoles.sales_order
    },
    {
      name: 'rentals',
      title: t`Rentals`,
      icon: <IconClipboardList />,
      role: UserRoles.sales_order
    }
  ];

  return navTabs.filter((tab) => {
    if (tab.name === 'manufacturing' && !isModuleEnabled('manufacturing')) {
      return false;
    }

    if (tab.name === 'purchasing' && !isModuleEnabled('purchasing')) {
      return false;
    }

    if (tab.name === 'sales' && !isModuleEnabled('sales')) {
      return false;
    }

    if (tab.name === 'events' && !isModuleEnabled('events')) {
      return false;
    }

    if (tab.name === 'rentals' && !isModuleEnabled('rentals')) {
      return false;
    }

    if (!tab.role) return true;
    return user.hasViewRole(tab.role);
  });
}

export const docLinks = {
  // Replace these with your Tracklet documentation URLs if / when you publish them
  app: 'https://github.com/yaselmo/Tracklet#readme',
  getting_started: 'https://github.com/yaselmo/Tracklet#readme',
  api: 'https://github.com/yaselmo/Tracklet#readme',
  developer: 'https://github.com/yaselmo/Tracklet#readme',
  faq: 'https://github.com/yaselmo/Tracklet#readme',
  github: 'https://github.com/yaselmo/Tracklet',
  errorcodes: 'https://github.com/yaselmo/Tracklet#readme'
};

export function DocumentationLinks(): MenuLinkItem[] {
  return [
    {
      id: 'gettin-started',
      title: t`Getting Started`,
      link: docLinks.getting_started,
      external: true,
      description: t`Getting started with Tracklet`
    },
    {
      id: 'api',
      title: t`API`,
      link: docLinks.api,
      external: true,
      description: t`Tracklet API documentation`
    },
    {
      id: 'developer',
      title: t`Developer Manual`,
      link: docLinks.developer,
      external: true,
      description: t`Tracklet developer manual`
    },
    {
      id: 'faq',
      title: t`FAQ`,
      link: docLinks.faq,
      external: true,
      description: t`Frequently asked questions`
    },
    {
      id: 'github',
      title: t`GitHub Repository`,
      link: docLinks.github,
      external: true,
      description: t`Tracklet source code on GitHub`
    }
  ];
}

export function serverInfo() {
  return openContextModal({
    modal: 'info',
    title: (
      <StylishText size='xl'>
        <Trans>System Information</Trans>
      </StylishText>
    ),
    size: 'xl',
    innerProps: {}
  });
}

export function aboutTracklet() {
  return openContextModal({
    modal: 'about',
    title: (
      <StylishText size='xl'>
        <Trans>About Tracklet</Trans>
      </StylishText>
    ),
    size: 'xl',
    innerProps: {}
  });
}

export function licenseInfo() {
  return openContextModal({
    modal: 'license',
    title: (
      <StylishText size='xl'>
        <Trans>License Information</Trans>
      </StylishText>
    ),
    size: 'xl',
    innerProps: {}
  });
}

export function AboutLinks(
  settings: SettingsStateProps,
  user: UserStateProps
): MenuLinkItem[] {
  const base_items: MenuLinkItem[] = [
    {
      id: 'instance',
      title: t`System Information`,
      description: t`About this Tracklet instance`,
      icon: 'info',
      action: serverInfo
    },
    {
      id: 'licenses',
      title: t`License Information`,
      description: t`Licenses for dependencies of the Tracklet software`,
      icon: 'license',
      action: licenseInfo
    }
  ];

  // Restrict the about link if that setting is set
  if (user.isSuperuser() || !settings.isSet('INVENTREE_RESTRICT_ABOUT')) {
    base_items.push({
      id: 'about',
      title: t`About Tracklet`,
      description: t`About the Tracklet project`,
      icon: 'info',
      action: aboutTracklet
    });
  }
  return base_items;
}
