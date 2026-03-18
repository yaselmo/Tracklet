import { ActionIcon } from '@mantine/core';
import { forwardRef } from 'react';
import { NavLink } from 'react-router-dom';
import trackletLogo from '../../assets/tracklet.svg';

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
      src={trackletLogo}
      alt='Tracklet'
      style={{ height: 28, width: 28, borderRadius: 8 }}
    />
  );
};
