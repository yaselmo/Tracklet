import { t } from '@lingui/core/macro';
import { ActionIcon } from '@mantine/core';
import { forwardRef } from 'react';
import { NavLink } from 'react-router-dom';

const TRACKLET_LOGO = '/static/web/tracklet-logo.png';

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
  return (
    <img
      src={TRACKLET_LOGO}
      alt={t`Tracklet Logo`}
      style={{ display: 'block', height: 28, objectFit: 'contain', width: 'auto' }}
    />
  );
};
