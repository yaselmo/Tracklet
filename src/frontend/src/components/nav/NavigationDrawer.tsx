import { t } from '@lingui/core/macro';
import { Container, Drawer, Flex, Group, Space } from '@mantine/core';
import { useViewportSize } from '@mantine/hooks';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ModelType } from '@lib/enums/ModelType';
import { UserRoles } from '@lib/enums/Roles';
import { AboutLinks, DocumentationLinks } from '../../defaults/links';
import {
  manufacturingEnabled,
  purchasingEnabled,
  salesEnabled
} from '../../defaults/moduleFlags';
import useInstanceName from '../../hooks/UseInstanceName';
import * as classes from '../../main.css';
import { useServerApiState } from '../../states/ServerApiState';
import { useGlobalSettingsState } from '../../states/SettingsStates';
import { useUserState } from '../../states/UserState';
import { TrackletLogo } from '../items/TrackletLogo';
import { type MenuLinkItem, MenuLinks } from '../items/MenuLinks';
import { StylishText } from '../items/StylishText';

// TODO @matmair #1: implement plugin loading and menu item generation see #5269
const plugins: MenuLinkItem[] = [];

export function NavigationDrawer({
  opened,
  close
}: Readonly<{
  opened: boolean;
  close: () => void;
}>) {
  return (
    <Drawer
      opened={opened}
      onClose={close}
      size='lg'
      withCloseButton={false}
      classNames={{
        body: classes.navigationDrawer
      }}
    >
      <DrawerContent closeFunc={close} />
    </Drawer>
  );
}

function DrawerContent({ closeFunc }: Readonly<{ closeFunc?: () => void }>) {
  const user = useUserState();
  const server = useServerApiState((state) => state.server);

  const globalSettings = useGlobalSettingsState();

  const [scrollHeight, setScrollHeight] = useState(0);
  const ref = useRef(null);
  const { height } = useViewportSize();

  const title = useInstanceName();

  // update scroll height when viewport size changes
  useEffect(() => {
    if (ref.current == null) return;
    setScrollHeight(height - ref.current['clientHeight'] - 65);
  });

  // Construct menu items
  const menuItemsNavigate: MenuLinkItem[] = useMemo(() => {
    return [
      {
        id: 'home',
        title: t`Dashboard`,
        link: '/',
        icon: 'dashboard'
      },
      {
        id: 'stock',
        title: t`Stock`,
        link: '/stock',
        hidden: !user.hasViewPermission(ModelType.stockitem),
        icon: 'stock'
      },
      {
        id: 'build',
        title: t`Manufacturing`,
        link: '/manufacturing/',
        hidden:
          !manufacturingEnabled(server) || !user.hasViewRole(UserRoles.build),
        icon: 'build'
      },
      {
        id: 'purchasing',
        title: t`Purchasing`,
        link: '/purchasing/',
        hidden:
          !purchasingEnabled(server) ||
          !user.hasViewRole(UserRoles.purchase_order),
        icon: 'purchase_orders'
      },
      {
        id: 'suppliers',
        title: t`Suppliers`,
        link: '/suppliers/',
        hidden: !user.hasViewRole(UserRoles.purchase_order),
        icon: 'suppliers'
      },
      {
        id: 'sales',
        title: t`Sales`,
        link: '/sales/',
        hidden: !salesEnabled(server) || !user.hasViewRole(UserRoles.sales_order),
        icon: 'sales_orders'
      },
      {
        id: 'projects',
        title: t({ id: 'nav.projects', message: 'Projects' }),
        link: '/projects/',
        hidden: !user.hasViewRole(UserRoles.project),
        icon: 'list_details'
      },
      {
        id: 'users',
        title: t`Users`,
        link: '/core/index/users',
        icon: 'user'
      },
      {
        id: 'groups',
        title: t`Groups`,
        link: '/core/index/groups',
        icon: 'group'
      }
    ];
  }, [user, server]);

  const menuItemsAction: MenuLinkItem[] = useMemo(() => {
    return [
      // Temporarily disabled:
      // {
      //   id: 'barcode',
      //   title: t`Scan Barcode`,
      //   link: '/scan',
      //   icon: 'barcode',
      //   hidden: !globalSettings.isSet('BARCODE_ENABLE')
      // }
    ];
  }, [user, globalSettings]);

  const menuItemsDocumentation: MenuLinkItem[] = useMemo(
    () => DocumentationLinks(),
    []
  );

  const menuItemsAbout: MenuLinkItem[] = useMemo(
    () => AboutLinks(globalSettings, user),
    []
  );

  return (
    <Flex direction='column' mih='100vh' p={16}>
      <Group wrap='nowrap'>
        <TrackletLogo />
        <StylishText size='xl'>{title}</StylishText>
      </Group>
      <Space h='xs' />
      <Container className={classes.layoutContent} p={0}>
        <MenuLinks
          title={t`Navigation`}
          links={menuItemsNavigate}
          beforeClick={closeFunc}
        />
        <MenuLinks
          title={t`Actions`}
          links={menuItemsAction}
          beforeClick={closeFunc}
        />
        <Space h='md' />
        {plugins.length > 0 ? (
          <MenuLinks
            title={t`Plugins`}
            links={plugins}
            beforeClick={closeFunc}
          />
        ) : (
          <></>
        )}
      </Container>
      <div ref={ref}>
        <Space h='md' />
        <MenuLinks
          title={t`Documentation`}
          links={menuItemsDocumentation}
          beforeClick={closeFunc}
        />
        <Space h='md' />
        <MenuLinks
          title={t`About`}
          links={menuItemsAbout}
          beforeClick={closeFunc}
        />
      </div>
    </Flex>
  );
}
