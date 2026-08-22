import { BackgroundImage } from '@mantine/core';

const TRACKLET_LOGIN_BACKGROUND = '/static/web/tracklet-login-background.png';

/**
 * Render content within a "splash screen" container.
 */
export default function SplashScreen({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <BackgroundImage
      src={TRACKLET_LOGIN_BACKGROUND}
      style={{
        minHeight: '100vh',
        backgroundPosition: 'center',
        backgroundSize: 'cover'
      }}
    >
      {children}
    </BackgroundImage>
  );
}
