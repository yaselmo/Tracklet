import { t } from '@lingui/core/macro';
import { DonutChart } from '@mantine/charts';
import {
  ActionIcon,
  Alert,
  Card,
  Group,
  Loader,
  Paper,
  Progress,
  Stack,
  Text,
  ThemeIcon,
  Tooltip
} from '@mantine/core';
import { IconExternalLink, IconMapPin } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { apiUrl } from '@lib/functions/Api';
import { getOverviewUrl } from '@lib/functions/Navigation';
import { useApi } from '../../../contexts/ApiContext';
import { useUserState } from '../../../states/UserState';
import { StylishText } from '../../items/StylishText';
import type { DashboardWidgetProps } from '../DashboardWidget';

type LocationAllocationRow = {
  pk?: number | null;
  label: string;
  value: number;
};

type LocationAllocationPayload = {
  stock_by_location: LocationAllocationRow[];
};

const CHART_COLORS = [
  'blue.6',
  'teal.6',
  'cyan.6',
  'lime.6',
  'grape.6',
  'orange.6',
  'pink.6',
  'indigo.6'
];

function LocationAllocationContent() {
  const api = useApi();
  const navigate = useNavigate();
  const isLoggedIn = useUserState((state) => state.isLoggedIn());

  const dashboardQuery = useQuery<LocationAllocationPayload>({
    queryKey: ['dashboard-location-allocation'],
    enabled: isLoggedIn,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: () =>
      api
        .get(apiUrl(ApiEndpoints.project_dashboard))
        .then((response: any) => response.data)
  });

  const rows = useMemo(
    () => dashboardQuery.data?.stock_by_location ?? [],
    [dashboardQuery.data]
  );

  const total = useMemo(
    () => rows.reduce((sum, entry) => sum + entry.value, 0),
    [rows]
  );

  const chartData = useMemo(
    () =>
      rows.map((entry, index) => ({
        name: entry.label,
        value: entry.value,
        color: CHART_COLORS[index % CHART_COLORS.length]
      })),
    [rows]
  );

  const openStockList = (entry?: LocationAllocationRow) => {
    const overviewUrl = getOverviewUrl(ModelType.stockitem);

    if (!entry) {
      navigate(overviewUrl);
      return;
    }

    const params = new URLSearchParams();

    if (entry.pk == null) {
      params.set('location', 'null');
      params.set('cascade', 'false');
    } else {
      params.set('location', String(entry.pk));
      params.set('cascade', 'true');
    }

    navigate(`${overviewUrl}?${params.toString()}`);
  };

  if (dashboardQuery.isLoading) {
    return (
      <Group justify='center' py='xl'>
        <Loader size='md' />
      </Group>
    );
  }

  if (!isLoggedIn) {
    return (
      <Alert color='blue' title={t`Sign in required`}>
        <Text size='sm'>
          {t`Sign in to load the operations dashboard data.`}
        </Text>
      </Alert>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <Alert color='red' title={t`Location data unavailable`}>
        <Text size='sm'>
          {t`The location allocation dashboard could not be loaded right now.`}
        </Text>
      </Alert>
    );
  }

  if (rows.length === 0) {
    return (
      <Alert color='blue' title={t`No stock locations yet`}>
        <Text size='sm'>
          {t`Location totals will be shown once stock items are placed in locations.`}
        </Text>
      </Alert>
    );
  }

  return (
    <Card
      radius='lg'
      padding='lg'
      style={{
        height: '100%',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(246,248,251,0.95))',
        border: '1px solid rgba(24, 100, 171, 0.12)'
      }}
    >
      <Stack gap='md' style={{ height: '100%' }}>
        <Group justify='space-between' align='start'>
          <Group gap='sm'>
            <ThemeIcon radius='md' variant='light' size='lg' color='blue'>
              <IconMapPin size={18} />
            </ThemeIcon>
            <Stack gap={2}>
              <StylishText size='lg'>{t`Location Allocation`}</StylishText>
              <Text size='sm' c='dimmed'>
                {t`Stock items distributed across rooms, labs, storage areas, and unassigned inventory.`}
              </Text>
            </Stack>
          </Group>
          <Tooltip label={t`Open all stock items`} position='left'>
            <ActionIcon
              variant='light'
              color='blue'
              onClick={() => openStockList()}
              aria-label={t`Open all stock items`}
            >
              <IconExternalLink size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>

        <Group align='center' justify='space-between' wrap='nowrap'>
          <DonutChart
            data={chartData}
            size={220}
            thickness={28}
            withLabels={false}
            chartLabel={t`Locations`}
          />
          <Stack gap={4} align='center' miw={120}>
            <Text size='sm' c='dimmed'>
              {t`Total`}
            </Text>
            <StylishText size='xl'>{`${total}`}</StylishText>
            <Text size='sm' c='dimmed'>
              {t`items`}
            </Text>
          </Stack>
        </Group>

        <Stack gap='xs'>
          {rows.map((entry, index) => {
            const pct = total > 0 ? (entry.value / total) * 100 : 0;
            const color = CHART_COLORS[index % CHART_COLORS.length];

            return (
              <Paper
                key={`${entry.label}-${entry.pk ?? 'unassigned'}`}
                withBorder
                radius='md'
                p='sm'
                onClick={() => openStockList(entry)}
                role='button'
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openStockList(entry);
                  }
                }}
                style={{
                  cursor: 'pointer',
                  background:
                    'linear-gradient(135deg, rgba(248,250,252,0.95), rgba(255,255,255,1))'
                }}
              >
                <Group justify='space-between' align='center' mb={6}>
                  <Group gap='xs' wrap='nowrap'>
                    <ThemeIcon
                      size='xs'
                      radius='xl'
                      color={color.split('.')[0]}
                      variant='filled'
                    />
                    <Text size='sm' fw={600}>
                      {entry.label}
                    </Text>
                  </Group>
                  <Group gap='xs' wrap='nowrap'>
                    <Text size='sm' c='dimmed'>
                      {pct.toFixed(0)}%
                    </Text>
                    <Text size='sm' fw={700}>
                      {entry.value}
                    </Text>
                  </Group>
                </Group>
                <Progress value={pct} color={color} radius='xl' size='md' />
              </Paper>
            );
          })}
        </Stack>
      </Stack>
    </Card>
  );
}

export default function LocationAllocationDashboardWidget(): DashboardWidgetProps {
  const user = useUserState();

  return {
    label: 'loc-alloc',
    title: t`Location Allocation`,
    description: t`Show allocation of stock items by location`,
    minWidth: 5,
    minHeight: 6,
    render: () => <LocationAllocationContent />,
    enabled: user.hasViewPermission(ModelType.stockitem)
  };
}
