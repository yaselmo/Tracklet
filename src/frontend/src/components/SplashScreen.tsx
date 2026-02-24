import { BackgroundImage } from '@mantine/core';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { generateUrl } from '../functions/urls';
import { useServerApiState } from '../states/ServerApiState';

/**
 * Render content within a "splash screen" container.
 */
export default function SplashScreen({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [server, fetchServerApiState] = useServerApiState(
    useShallow((state) => [state.server, state.fetchServerApiState])
  );

  // Fetch server data on mount if no server data is present
  useEffect(() => {
    if (server.server === null) {
      fetchServerApiState();
    }
  }, [server]);

  console.log('customize.splash', server.customize?.splash);

  const backendSplash = server.customize?.splash
    ? generateUrl(server.customize.splash)
    : null;
  const splashImage = '/Login_Splash.png';

  console.log('backend splash (ignored for now)', backendSplash);

  return (
    <BackgroundImage
      src={splashImage}
      style={{
        minHeight: '100vh',
        backgroundSize: 'cover',
        backgroundPosition: 'center 85%',
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#cfd6de'
      }}
    >
      {children}
    </BackgroundImage>
  );
}
