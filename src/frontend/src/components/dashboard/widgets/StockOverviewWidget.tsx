import { DonutChart } from '@mantine/charts';
import { ModelType } from '@lib/index';
import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { apiUrl } from '@lib/functions/Api';
import { t } from '@lingui/core/macro';
import { IconTool } from '@tabler/icons-react';
import {
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton
} from '@mantine/core';
import { useDocumentVisibility } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useApi } from '../../../contexts/ApiContext';
import { useUserState } from '../../../states/UserState';
import type { DashboardWidgetProps } from '../DashboardWidget';

const STOCK_STATS = [
  {
    key: 'total',
    title: 'Total Stock Items',
    color: 'blue',
    tint: 'rgba(59, 130, 246, 0.08)'
  },
  {
    key: 'available',
    title: 'Available Equipment',
    color: 'teal',
    tint: 'rgba(20, 184, 166, 0.08)'
  },
  {
    key: 'reserved',
    title: 'Reserved Equipment',
    color: 'violet',
    tint: 'rgba(139, 92, 246, 0.08)'
  },
  {
    key: 'broken',
    title: 'Broken Items',
    color: 'red',
    tint: 'rgba(239, 68, 68, 0.08)'
  },
  {
    key: 'missing',
    title: 'Missing Items',
    color: 'orange',
    tint: 'rgba(249, 115, 22, 0.08)'
  },
  {
    key: 'out-of-service',
    title: 'Out of Service',
    color: 'gray',
    tint: 'rgba(107, 114, 128, 0.08)'
  }
] as const;

const EQUIPMENT_STATE_MIX = [
  { name: 'Available', color: 'teal.6' },
  { name: 'Reserved', color: 'violet.6' },
  { name: 'Broken', color: 'red.6' },
  { name: 'Missing', color: 'orange.6' },
  { name: 'Out of Service', color: 'gray.6' }
];

interface StockSummaryResponse {
  total_stock_items: number;
  available_equipment: number;
  reserved_equipment: number;
  broken_items: number;
  missing_items: number;
  out_of_service_items: number;
}

function StockOverviewWidgetContent() {
  const api = useApi();
  const user = useUserState();
  const visibility = useDocumentVisibility();
  const [activeStat, setActiveStat] =
    useState<(typeof STOCK_STATS)[number]['key']>('total');

  const summaryQuery = useQuery({
    queryKey: ['dashboard-stock-summary', visibility],
    enabled: user.hasViewPermission(ModelType.stockitem) && visibility === 'visible',
    refetchOnMount: true,
    refetchInterval: 10 * 60 * 1000,
    queryFn: () =>
      api
        .get(apiUrl(ApiEndpoints.stock_summary))
        .then((response) => response.data as StockSummaryResponse)
  });

  const summary = summaryQuery.data;

  const stockStats = [
    { ...STOCK_STATS[0], value: summary?.total_stock_items ?? null },
    { ...STOCK_STATS[1], value: summary?.available_equipment ?? null },
    { ...STOCK_STATS[2], value: summary?.reserved_equipment ?? null },
    { ...STOCK_STATS[3], value: summary?.broken_items ?? null },
    { ...STOCK_STATS[4], value: summary?.missing_items ?? null },
    { ...STOCK_STATS[5], value: summary?.out_of_service_items ?? null }
  ] as const;

  const equipmentStateMix = [
    {
      name: 'Available',
      value: summary?.available_equipment ?? 0,
      color: EQUIPMENT_STATE_MIX[0].color
    },
    {
      name: 'Reserved',
      value: summary?.reserved_equipment ?? 0,
      color: EQUIPMENT_STATE_MIX[1].color
    },
    {
      name: 'Broken',
      value: summary?.broken_items ?? 0,
      color: EQUIPMENT_STATE_MIX[2].color
    },
    {
      name: 'Missing',
      value: summary?.missing_items ?? 0,
      color: EQUIPMENT_STATE_MIX[3].color
    },
    {
      name: 'Out of Service',
      value: summary?.out_of_service_items ?? 0,
      color: EQUIPMENT_STATE_MIX[4].color
    }
  ];

  const formatValue = (value: number | null) => {
    if (summaryQuery.isLoading && value === null) {
      return '...';
    }

    if (value === null || value === undefined) {
      return '-';
    }

    return value.toLocaleString();
  };

  return (
    <Paper
      p='xl'
      radius='md'
      style={{
        height: '100%',
        background:
          'linear-gradient(180deg, rgba(243, 248, 255, 0.98) 0%, rgba(255, 255, 255, 1) 34%)',
        border: '1px solid rgba(37, 99, 235, 0.08)'
      }}
    >
      <Stack gap='xl' h='100%'>
        <Stack gap={6}>
          <Group justify='space-between' align='center'>
            <Text fw={800} size='1.8rem' c='dark.8'>
              {t`Operations Hub`}
            </Text>
            <ThemeIcon size='xl' radius='md' variant='light' color='blue'>
              <IconTool size={20} />
            </ThemeIcon>
          </Group>
          <Text size='sm' c='dimmed'>
            {t`Monitor equipment availability and current stock condition across the operation.`}
          </Text>
        </Stack>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 6 }} spacing='md'>
          {stockStats.map((stat) => (
            <UnstyledButton
              key={stat.title}
              onClick={() => setActiveStat(stat.key)}
              aria-pressed={activeStat === stat.key}
            >
              <Paper
                p='lg'
                radius='xl'
                style={{
                  minHeight: 132,
                  height: '100%',
                  background: stat.tint,
                  border:
                    activeStat === stat.key
                      ? `1px solid var(--mantine-color-${stat.color}-3)`
                      : '1px solid rgba(148, 163, 184, 0.18)',
                  boxShadow:
                    activeStat === stat.key
                      ? '0 14px 32px rgba(15, 23, 42, 0.10)'
                      : '0 8px 20px rgba(15, 23, 42, 0.05)',
                  transition: 'all 160ms ease'
                }}
              >
                <Stack justify='space-between' h='100%' gap='md'>
                  <Text size='sm' c='dimmed' fw={600}>
                    {stat.title}
                  </Text>
                  <Text fw={800} size='2rem' lh={1} c={`${stat.color}.7`}>
                    {formatValue(stat.value)}
                  </Text>
                </Stack>
              </Paper>
            </UnstyledButton>
          ))}
        </SimpleGrid>

        <Paper
          p='xl'
          radius='md'
          style={{
            flex: 1,
            background: 'white',
            border: '1px solid var(--mantine-color-gray-2)',
            boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)'
          }}
        >
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing='xl' h='100%'>
            <Stack justify='center' gap='md'>
              <Text fw={700} size='lg'>
                {t`Current equipment state mix`}
              </Text>
              {summaryQuery.isError ? (
                <Text c='red.6' size='sm' maw={420}>
                  {t`Unable to load stock summary right now. The widget layout is still available, but live values could not be fetched.`}
                </Text>
              ) : (
                <Text c='dimmed' size='sm' maw={420}>
                  {t`This section shows the current distribution of equipment across the main operational states using the same backend summary payload as the cards above.`}
                </Text>
              )}
            </Stack>

            <Group justify='center' align='center' h='100%'>
              <Stack gap='md' align='center'>
                {summaryQuery.isLoading && !summary ? (
                  <Loader size='md' />
                ) : (
                  <DonutChart
                    data={equipmentStateMix}
                    size={220}
                    thickness={36}
                    withLabels={false}
                    withLabelsLine={false}
                    chartLabel='100%'
                  />
                )}

                <Stack gap='xs' w='100%' maw={260}>
                  {equipmentStateMix.map((item) => (
                    <Group key={item.name} justify='space-between' wrap='nowrap'>
                      <Group gap='xs' wrap='nowrap'>
                        <ThemeIcon
                          size='sm'
                          radius='xl'
                          color={item.color.split('.')[0]}
                          variant='filled'
                        />
                        <Text size='sm'>{item.name}</Text>
                      </Group>
                      <Text size='sm' fw={700}>
                        {formatValue(item.value)}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Stack>
            </Group>
          </SimpleGrid>
        </Paper>
      </Stack>
    </Paper>
  );
}

export default function StockOverviewWidget(): DashboardWidgetProps {
  const user = useUserState();

  return {
    label: 'ops-hub',
    title: t`Operations Hub`,
    description: t`Wide equipment operations overview`,
    minHeight: 8,
    minWidth: 10,
    render: () => <StockOverviewWidgetContent />,
    enabled: user.hasViewPermission(ModelType.stockitem)
  };
}
