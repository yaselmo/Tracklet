import { BackgroundImage } from '@mantine/core';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
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

  const splashImage = '/Login_Splash.png';

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
