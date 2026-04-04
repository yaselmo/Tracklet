import { Trans } from '@lingui/react/macro';
import {
  Button,
  Center,
  Container,
  Divider,
  Group,
  Loader,
  Paper,
  Stack,
  Text
} from '@mantine/core';
import { Outlet, useNavigate } from 'react-router-dom';
import SplashScreen from '../../components/SplashScreen';
import { doLogout } from '../../functions/auth';

export default function LoginLayoutComponent() {
  return (
    <SplashScreen>
      <Center mih='100vh' p='lg'>
        <Container size={560}>
          <Outlet />
        </Container>
      </Center>
    </SplashScreen>
  );
}

export function Wrapper({
  children,
  titleText,
  logOff = false,
  loader = false,
  smallPadding = false,
  logoSrc,
  logoAlt = 'Tracklet logo',
  logoHeight = 56,
  showTitle = true,
  showDivider = true
}: Readonly<{
  children?: React.ReactNode;
  titleText: string;
  logOff?: boolean;
  loader?: boolean;
  smallPadding?: boolean;
  logoSrc?: string;
  logoAlt?: string;
  logoHeight?: number;
  showTitle?: boolean;
  showDivider?: boolean;
}>) {
  const navigate = useNavigate();

  return (
    <Paper p='xl' withBorder miw={425} shadow='xl' radius='lg'>
      <Stack gap={smallPadding ? 0 : 'md'}>
        {logoSrc && (
          <Center pb='xs'>
            <img
              src={logoSrc}
              alt={logoAlt}
              style={{
                height: logoHeight,
                maxWidth: '100%',
                width: 'auto',
                objectFit: 'contain',
                display: 'block'
              }}
            />
          </Center>
        )}
        {showTitle && (
          <Text fw={800} size='2.5rem' ta='center' c='dark.8' mb={18}>
            {titleText}
          </Text>
        )}
        {showDivider && <Divider p='xs' />}
        {loader && (
          <Group justify='center'>
            <Loader />
          </Group>
        )}
        {children}
        {logOff && (
          <>
            <Divider p='xs' />
            <Button onClick={() => doLogout(navigate)} color='red'>
              <Trans>Log off</Trans>
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}
