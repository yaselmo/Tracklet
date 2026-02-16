import { UnstyledButton } from '@mantine/core';

import { TrackletLogo } from '../items/TrackletLogo';

export function NavHoverMenu({
  openDrawer
}: Readonly<{
  openDrawer: () => void;
}>) {
  return (
    <UnstyledButton onClick={() => openDrawer()} aria-label='navigation-menu'>
      <TrackletLogo />
    </UnstyledButton>
  );
}
