import { t } from '@lingui/core/macro';
import { Skeleton, Stack } from '@mantine/core';
import {
  IconBellCog,
  IconDeviceDesktop,
  IconFileAnalytics,
  IconLock,
  IconPlugConnected,
  IconSearch,
  IconUserCircle
} from '@tabler/icons-react';
import { lazy, useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useShallow } from 'zustand/react/shallow';
import PageTitle from '../../../components/nav/PageTitle';
import { SettingsHeader } from '../../../components/nav/SettingsHeader';
import type { PanelType } from '../../../components/panels/Panel';
import { PanelGroup } from '../../../components/panels/PanelGroup';
import { UserSettingList } from '../../../components/settings/SettingList';
import { Loadable } from '../../../functions/loading';
import { getUserSettingsPanelAccess } from '../../../functions/settingsPermissions';
import { useUserState } from '../../../states/UserState';
import { SecurityContent } from './AccountSettings/SecurityContent';
import { AccountContent } from './AccountSettings/UserPanel';

const PluginSettingsGroup = Loadable(
  lazy(() => import('./PluginSettingsGroup'))
);

// Keep User Settings intentionally minimal for this deployment.
// Edit this list to control which user settings panels are visible.
const ALLOWED_USER_SETTINGS = ['account', 'security'] as const;
const DEFAULT_USER_SETTINGS_PANEL = 'account';

/**
 * User settings page
 */
export default function UserSettings() {
  const location = useLocation();
  const userState = useUserState();
  const [user, isLoggedIn] = useUserState(
    useShallow((state) => [state.user, state.isLoggedIn])
  );

  const userSettingsPanels: PanelType[] = useMemo(() => {
    return [
      {
        name: 'account',
        label: t`Account`,
        icon: <IconUserCircle />,
        content: <AccountContent />
      },
      {
        name: 'security',
        label: t`Security`,
        icon: <IconLock />,
        content: <SecurityContent />
      },
      {
        name: 'display',
        label: t`Display Options`,
        icon: <IconDeviceDesktop />,
        content: (
          <UserSettingList
            keys={[
              'ICONS_IN_NAVBAR',
              'STICKY_HEADER',
              'STICKY_TABLE_HEADER',
              'SHOW_SPOTLIGHT',
              'BARCODE_IN_FORM_FIELDS',
              'DATE_DISPLAY_FORMAT',
              'FORMS_CLOSE_USING_ESCAPE',
              'DISPLAY_STOCKTAKE_TAB',
              'ENABLE_LAST_BREADCRUMB',
              'SHOW_FULL_LOCATION_IN_TABLES',
              'SHOW_FULL_CATEGORY_IN_TABLES'
            ]}
          />
        )
      },
      {
        name: 'search',
        label: t`Search`,
        icon: <IconSearch />,
        content: (
          <UserSettingList
            keys={[
              'SEARCH_WHOLE',
              'SEARCH_REGEX',
              'SEARCH_NOTES',
              'SEARCH_PREVIEW_RESULTS',
              'SEARCH_PREVIEW_SHOW_PARTS',
              'SEARCH_HIDE_INACTIVE_PARTS',
              'SEARCH_PREVIEW_SHOW_SUPPLIER_PARTS',
              'SEARCH_PREVIEW_SHOW_MANUFACTURER_PARTS',
              'SEARCH_PREVIEW_SHOW_CATEGORIES',
              'SEARCH_PREVIEW_SHOW_STOCK',
              'SEARCH_PREVIEW_HIDE_UNAVAILABLE_STOCK',
              'SEARCH_PREVIEW_SHOW_LOCATIONS',
              'SEARCH_PREVIEW_SHOW_COMPANIES',
              'SEARCH_PREVIEW_SHOW_BUILD_ORDERS',
              'SEARCH_PREVIEW_SHOW_PURCHASE_ORDERS',
              'SEARCH_PREVIEW_EXCLUDE_INACTIVE_PURCHASE_ORDERS',
              'SEARCH_PREVIEW_SHOW_SALES_ORDERS',
              'SEARCH_PREVIEW_EXCLUDE_INACTIVE_SALES_ORDERS',
              'SEARCH_PREVIEW_SHOW_SALES_ORDER_SHIPMENTS',
              'SEARCH_PREVIEW_SHOW_RETURN_ORDERS',
              'SEARCH_PREVIEW_EXCLUDE_INACTIVE_RETURN_ORDERS'
            ]}
          />
        )
      },
      {
        name: 'notifications',
        label: t`Notifications`,
        icon: <IconBellCog />,
        content: (
          <PluginSettingsGroup
            mixin='notification'
            global={false}
            message={t`The settings below are specific to each available notification method`}
          />
        )
      },
      {
        name: 'reporting',
        label: t`Reporting`,
        icon: <IconFileAnalytics />,
        content: (
          <UserSettingList
            keys={['REPORT_INLINE', 'LABEL_INLINE', 'LABEL_DEFAULT_PRINTER']}
          />
        )
      },
      {
        name: 'plugins',
        label: t`Plugin Settings`,
        icon: <IconPlugConnected />,
        content: <PluginSettingsGroup global={false} />
      }
    ];
  }, []);

  const gatedUserSettingsPanels = useMemo(
    () =>
      userSettingsPanels.map((panel) => {
        const access = getUserSettingsPanelAccess(userState, panel.name);
        return {
          ...panel,
          hidden: panel.hidden || !access.view
        };
      }),
    [userSettingsPanels, userState]
  );

  const allowedUserSettingsSet = useMemo(
    () => new Set<string>(ALLOWED_USER_SETTINGS),
    []
  );

  const filteredUserSettingsPanels = useMemo(
    () =>
      gatedUserSettingsPanels.filter((panel) =>
        allowedUserSettingsSet.has(panel.name)
      ),
    [gatedUserSettingsPanels, allowedUserSettingsSet]
  );

  const fallbackUserSettingsPanel = useMemo(() => {
    const firstVisiblePanel = filteredUserSettingsPanels.find(
      (panel) => !panel.hidden && !panel.disabled
    );
    const defaultVisible = filteredUserSettingsPanels.find(
      (panel) =>
        panel.name === DEFAULT_USER_SETTINGS_PANEL &&
        !panel.hidden &&
        !panel.disabled
    );
    return defaultVisible?.name ?? firstVisiblePanel?.name ?? '';
  }, [filteredUserSettingsPanels]);

  const blockedPanelPath = useMemo(() => {
    const userPath = location.pathname.split('/settings/user/')[1] ?? '';
    const targetPanel = userPath.split('/')[0] ?? '';

    if (!targetPanel) {
      return false;
    }

    return !filteredUserSettingsPanels.some(
      (panel) =>
        panel.name === targetPanel && panel.hidden !== true && !panel.disabled
    );
  }, [location.pathname, filteredUserSettingsPanels]);

  if (!isLoggedIn()) {
    return <Skeleton />;
  }

  if (blockedPanelPath) {
    return (
      <Navigate
        to={
          fallbackUserSettingsPanel
            ? `/settings/user/${fallbackUserSettingsPanel}`
            : '/settings/user'
        }
        replace
      />
    );
  }

  return (
    <>
      <PageTitle title={t`User Settings`} />
      <Stack gap='xs'>
        <SettingsHeader
          label='user'
          title={t`User Settings`}
          subtitle={
            user?.first_name && user?.last_name
              ? `${user?.first_name} ${user?.last_name}`
              : null
          }
          shorthand={user?.username || ''}
        />
        <PanelGroup
          pageKey='user-settings'
          panels={filteredUserSettingsPanels}
          model='usersettings'
          id={null}
        />
      </Stack>
    </>
  );
}
