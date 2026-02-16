import { t } from '@lingui/core/macro';
import { ActionIcon } from '@mantine/core';
import { forwardRef } from 'react';
import { NavLink } from 'react-router-dom';

import TrackletIcon from './tracklet.svg';

export const TrackletLogoHomeButton = forwardRef<HTMLDivElement>(
  (props, ref) => {
    return (
      <div ref={ref} {...props}>
        <NavLink to={'/'}>
          <ActionIcon size={28} variant='transparent'>
            <TrackletLogo />
          </ActionIcon>
        </NavLink>
      </div>
    );
  }
);

export const TrackletLogo = () => {
  return <img src={TrackletIcon} alt={t`Tracklet Logo`} height={28} />;
};
