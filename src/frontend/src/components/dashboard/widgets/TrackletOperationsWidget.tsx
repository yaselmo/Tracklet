import { t } from '@lingui/core/macro';
import { BarChart, DonutChart } from '@mantine/charts';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Card,
  Divider,
  Group,
  Loader,
  Paper,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Tooltip
} from '@mantine/core';
import {
  IconActivityHeartbeat,
  IconAlertTriangle,
  IconCalendarEvent,
  IconChartDonut3,
  IconChartHistogram,
  IconClipboardList,
  IconSettings,
  IconMapPin,
  IconTool
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiEndpoints } from '@lib/enums/ApiEndpoints';
import { ModelType } from '@lib/enums/ModelType';
import { apiUrl } from '@lib/functions/Api';
import { getDetailUrl, getOverviewUrl } from '@lib/functions/Navigation';
import { useApi } from '../../../contexts/ApiContext';
import { formatDate } from '../../../defaults/formatters';
import {
  canViewSettingsRoot,
  getSystemPanelAccess
} from '../../../functions/settingsPermissions';
import { useUserState } from '../../../states/UserState';
import { StylishText } from '../../items/StylishText';
import type { DashboardWidgetProps } from '../DashboardWidget';

type DashboardSummary = {
  total_stock_items: number;
  available_equipment?: number;
  reserved_equipment?: number;
  broken_items?: number;
  missing_items?: number;
  out_of_service?: number;
  available_count?: number;
  reserved_count?: number;
  broken_count?: number;
  missing_count?: number;
  out_of_service_count?: number;
};

type DashboardProject = {
  pk: number;
  name: string;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

type DashboardReservation = {
  stock_item: number;
  item_name: string;
  project: number;
  project_name: string;
  reservation_type: string;
  start_date?: string | null;
  end_date?: string | null;
};

type DashboardCalibration = {
  stock_item: number;
  item_name: string;
  last_calibration?: string | null;
  next_due_date?: string | null;
  status: string;
  days_until_due?: number | null;
};

type DashboardBreakdown = {
  label: string;
  value: number;
};

type DashboardRecentEquipment = {
  stock_item: number;
  name: string;
  category: string;
  location: string;
  created?: string | null;
};

type DashboardLowStock = {
  stock_item: number;
  item_name: string;
  available_quantity: string;
  location: string;
};

type DashboardUsage = {
  stock_item: number;
  item_name: string;
  usage_count: number;
  total_reserved_quantity: string;
};

type ProjectDashboardPayload = {
  summary: DashboardSummary;
  thresholds: Record<string, number>;
  upcoming_projects: DashboardProject[];
  reserved_equipment_soon: DashboardReservation[];
  calibration_due: DashboardCalibration[];
  stock_by_location: DashboardBreakdown[];
  category_distribution: DashboardBreakdown[];
  recently_added_equipment: DashboardRecentEquipment[];
  low_stock_warning: DashboardLowStock[];
  most_used_equipment: DashboardUsage[];
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

function EmptyState({
  title,
  description
}: Readonly<{
  title: string;
  description: string;
}>) {
  return (
    <Paper
      p='md'
      radius='md'
      style={{
        background:
          'linear-gradient(135deg, rgba(238, 242, 255, 0.8), rgba(240, 253, 250, 0.85))'
      }}
    >
      <Text fw={600}>{title}</Text>
      <Text size='sm' c='dimmed'>
        {description}
      </Text>
    </Paper>
  );
}

function SectionCard({
  title,
  icon,
  children
}: Readonly<{
  title: string;
  icon: ReactNode;
  children: ReactNode;
}>) {
  return (
    <Card
      withBorder
      radius='lg'
      padding='lg'
      style={{
        height: '100%',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(246,248,251,0.95))'
      }}
    >
      <Stack gap='md' style={{ height: '100%' }}>
        <Group justify='space-between'>
          <Group gap='sm'>
            <ThemeIcon radius='md' variant='light' size='lg' color='blue'>
              {icon}
            </ThemeIcon>
            <StylishText size='md'>{title}</StylishText>
          </Group>
        </Group>
        {children}
      </Stack>
    </Card>
  );
}

function KpiCard({
  label,
  value,
  color,
  onClick
}: Readonly<{
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
}>) {
  return (
    <Paper
      radius='lg'
      p='md'
      withBorder
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        background: `linear-gradient(135deg, var(--mantine-color-${color}-0), white)`,
        cursor: onClick ? 'pointer' : 'default'
      }}
    >
      <Text size='sm' c='dimmed'>
        {label}
      </Text>
      <StylishText size='xl'>{`${value}`}</StylishText>
    </Paper>
  );
}

function statusColor(status?: string | null) {
  switch ((status ?? '').toUpperCase()) {
    case 'ONGOING':
      return 'teal';
    case 'FUTURE':
      return 'blue';
    case 'PAST':
      return 'gray';
    case 'OVERDUE':
      return 'red';
    case 'DUE_SOON':
      return 'yellow';
    default:
      return 'gray';
  }
}

function formatMaybeDate(value?: string | null) {
  return value ? formatDate(value) : '-';
}

function quantityLabel(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : value;
}

function pluralizeDays(days: number) {
  return days === 1 ? t`day` : t`days`;
}

function reservationWindowDescription(days: number) {
  return days > 0
    ? t`Project allocations and instrumentation scheduled in the next ${days} ${pluralizeDays(days)} will appear here.`
    : t`Project allocations and instrumentation starting today will appear here.`;
}

function calibrationWindowDescription(days: number) {
  return days > 0
    ? t`Equipment due within ${days} ${pluralizeDays(days)} and overdue calibration checks will be shown here.`
    : t`Equipment due today and overdue calibration checks will be shown here.`;
}

function lowStockWindowDescription(threshold: number) {
  return t`Items with available quantity at or below ${threshold} will be flagged here.`;
}

function getSummaryCounts(summary?: DashboardSummary) {
  return {
    totalStockItems: summary?.total_stock_items ?? 0,
    availableCount: summary?.available_count ?? summary?.available_equipment ?? 0,
    reservedCount: summary?.reserved_count ?? summary?.reserved_equipment ?? 0,
    brokenCount: summary?.broken_count ?? summary?.broken_items ?? 0,
    missingCount: summary?.missing_count ?? summary?.missing_items ?? 0,
    outOfServiceCount:
      summary?.out_of_service_count ?? summary?.out_of_service ?? 0
  };
}

function OperationsContent() {
  const api = useApi();
  const navigate = useNavigate();
  const isLoggedIn = useUserState((state) => state.isLoggedIn());

  const dashboardQuery = useQuery<ProjectDashboardPayload>({
    queryKey: ['tracklet-operations-dashboard'],
    enabled: isLoggedIn,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: () =>
      api
        .get(apiUrl(ApiEndpoints.project_dashboard))
        .then((response: any) => response.data)
  });

  const data = dashboardQuery.data;
  const summaryCounts = useMemo(() => getSummaryCounts(data?.summary), [data?.summary]);
  const reservationWindowDays = data?.thresholds.reservation_window_days ?? 7;
  const calibrationWarningDays = data?.thresholds.calibration_warning_days ?? 14;
  const lowStockThreshold = data?.thresholds.low_stock ?? 2;

  const openStockList = (filters?: Record<string, string>) => {
    const overviewUrl = getOverviewUrl(ModelType.stockitem);
    const params = new URLSearchParams(filters);
    const query = params.toString();
    navigate(query ? `${overviewUrl}?${query}` : overviewUrl);
  };

  const openStockItemDetails = (stockItemId: number) => {
    navigate(`${getDetailUrl(ModelType.stockitem, stockItemId)}details`);
  };

  const openProjectDetails = (projectId: number) => {
    navigate(`${getDetailUrl(ModelType.project, projectId)}details`);
  };

  const summaryChart = useMemo(() => {
    if (!data) {
      return [];
    }

    return [
      {
        name: t`Available`,
        value: summaryCounts.availableCount,
        color: 'green.6'
      },
      {
        name: t`Reserved`,
        value: summaryCounts.reservedCount,
        color: 'blue.6'
      },
      {
        name: t`Broken`,
        value: summaryCounts.brokenCount,
        color: 'red.6'
      },
      {
        name: t`Missing`,
        value: summaryCounts.missingCount,
        color: 'orange.6'
      },
      {
        name: t`Out of Service`,
        value: summaryCounts.outOfServiceCount,
        color: 'gray.6'
      }
    ].filter((entry) => entry.value > 0);
  }, [summaryCounts]);

  const categoryChart = useMemo(() => {
    return (
      data?.category_distribution.map((entry, index) => ({
        name: entry.label,
        value: entry.value,
        color: CHART_COLORS[index % CHART_COLORS.length]
      })) ?? []
    );
  }, [data]);

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

  if (dashboardQuery.isError || !data) {
    const error = dashboardQuery.error as any;
    const status = error?.response?.status;
    const detail =
      error?.response?.data?.detail ||
      error?.response?.data?.error ||
      error?.message;

    return (
      <Alert color='red' title={t`Dashboard data unavailable`}>
        <Text size='sm'>
          {t`The operations dashboard could not be loaded right now.`}
        </Text>
        {status && (
          <Text size='xs' c='dimmed' mt='xs'>
            {`${t`Status`}: ${status}`}
          </Text>
        )}
        {detail && (
          <Text size='xs' c='dimmed'>
            {String(detail)}
          </Text>
        )}
      </Alert>
    );
  }

  return (
    <Stack gap='md'>
      <Card
        radius='lg'
        padding='lg'
        style={{
          background:
            'linear-gradient(135deg, rgba(227,242,253,0.95), rgba(232,245,233,0.95))',
          border: '1px solid rgba(24, 100, 171, 0.12)'
        }}
      >
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 6 }}>
          <KpiCard
            label={t`Total Stock Items`}
            value={summaryCounts.totalStockItems}
            color='blue'
            onClick={() => openStockList()}
          />
          <KpiCard
            label={t`Available Equipment`}
            value={summaryCounts.availableCount}
            color='teal'
            onClick={() => openStockList({ available: 'true' })}
          />
          <KpiCard
            label={t`Reserved Equipment`}
            value={summaryCounts.reservedCount}
            color='cyan'
            onClick={() => openStockList({ status: 'IN_USE' })}
          />
          <KpiCard
            label={t`Broken Items`}
            value={summaryCounts.brokenCount}
            color='orange'
            onClick={() => openStockList({ broken: 'true' })}
          />
          <KpiCard
            label={t`Missing Items`}
            value={summaryCounts.missingCount}
            color='grape'
            onClick={() => openStockList({ missing: 'true' })}
          />
          <KpiCard
            label={t`Out of Service`}
            value={summaryCounts.outOfServiceCount}
            color='red'
          />
        </SimpleGrid>
        {summaryChart.length > 0 && (
          <>
            <Divider my='md' />
            <Group justify='space-between' align='center'>
              <Text size='sm' c='dimmed'>
                {t`Current equipment state mix`}
              </Text>
              <Group gap='lg' align='center'>
                <DonutChart
                  data={summaryChart}
                  size={160}
                  thickness={22}
                  withLabels={false}
                  chartLabel={t`Stock`}
                />
                <Stack gap='xs'>
                  {summaryChart.map((entry) => (
                    <Group key={entry.name} gap='xs' wrap='nowrap'>
                      <ThemeIcon
                        size='xs'
                        radius='xl'
                        color={entry.color.split('.')[0]}
                        variant='filled'
                      />
                      <Text size='sm'>{entry.name}</Text>
                      <Text size='sm' fw={600}>
                        {entry.value}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Group>
            </Group>
          </>
        )}
      </Card>

      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <SectionCard title={t`Upcoming Projects`} icon={<IconCalendarEvent size={18} />}>
          {data.upcoming_projects.length > 0 ? (
            <Stack gap='sm'>
              {data.upcoming_projects.map((project) => (
                <Paper key={project.pk} withBorder radius='md' p='sm'>
                  <Group justify='space-between' align='start'>
                    <Stack gap={2}>
                      <Anchor
                        component='button'
                        type='button'
                        onClick={() => openProjectDetails(project.pk)}
                        fw={600}
                      >
                        {project.name}
                      </Anchor>
                      <Text size='sm' c='dimmed'>
                        {`${formatMaybeDate(project.start_date)} - ${formatMaybeDate(
                          project.end_date
                        )}`}
                      </Text>
                    </Stack>
                    {project.status && (
                      <Badge color={statusColor(project.status)} variant='light'>
                        {project.status}
                      </Badge>
                    )}
                  </Group>
                </Paper>
              ))}
            </Stack>
          ) : (
            <EmptyState
              title={t`No projects starting soon`}
              description={t`Projects with start dates in the next planning window will appear here.`}
            />
          )}
        </SectionCard>

        <SectionCard
          title={t`Reserved Equipment Soon`}
          icon={<IconClipboardList size={18} />}
        >
          <Text size='sm' c='dimmed'>
            {reservationWindowDescription(reservationWindowDays)}
          </Text>
          {data.reserved_equipment_soon.length > 0 ? (
            <ScrollArea.Autosize mah={320}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t`Item`}</Table.Th>
                    <Table.Th>{t`Project`}</Table.Th>
                    <Table.Th>{t`Window`}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.reserved_equipment_soon.map((entry) => (
                    <Table.Tr key={`${entry.project}-${entry.stock_item}`}>
                      <Table.Td>
                        <Anchor
                          component='button'
                          type='button'
                          onClick={() => openStockItemDetails(entry.stock_item)}
                        >
                          {entry.item_name}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>
                        <Anchor
                          component='button'
                          type='button'
                          onClick={() => openProjectDetails(entry.project)}
                        >
                          {entry.project_name}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text size='sm'>{formatMaybeDate(entry.start_date)}</Text>
                          <Text size='xs' c='dimmed'>
                            {formatMaybeDate(entry.end_date)}
                          </Text>
                        </Stack>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          ) : (
            <EmptyState
              title={t`No near-term reservations`}
              description={reservationWindowDescription(reservationWindowDays)}
            />
          )}
        </SectionCard>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <SectionCard title={t`Calibration Due`} icon={<IconTool size={18} />}>
          <Text size='sm' c='dimmed'>
            {calibrationWindowDescription(calibrationWarningDays)}
          </Text>
          {data.calibration_due.length > 0 ? (
            <Stack gap='sm'>
              {data.calibration_due.map((entry) => (
                <Paper key={entry.stock_item} withBorder radius='md' p='sm'>
                  <Group justify='space-between' align='start'>
                    <Stack gap={2}>
                      <Anchor
                        component='button'
                        type='button'
                        onClick={() => openStockItemDetails(entry.stock_item)}
                      >
                        {entry.item_name}
                      </Anchor>
                      <Text size='sm' c='dimmed'>
                        {t`Last calibration`}: {formatMaybeDate(entry.last_calibration)}
                      </Text>
                      <Text size='sm'>
                        {t`Next due`}: {formatMaybeDate(entry.next_due_date)}
                      </Text>
                    </Stack>
                    <Badge
                      color={statusColor(entry.status)}
                      variant={entry.status === 'overdue' ? 'filled' : 'light'}
                    >
                      {entry.status === 'overdue' ? t`Overdue` : t`Due Soon`}
                    </Badge>
                  </Group>
                </Paper>
              ))}
            </Stack>
          ) : (
            <EmptyState
              title={t`No calibration alerts`}
              description={calibrationWindowDescription(calibrationWarningDays)}
            />
          )}
        </SectionCard>

        <SectionCard
          title={t`Low Stock Warning`}
          icon={<IconAlertTriangle size={18} />}
        >
          <Text size='sm' c='dimmed'>
            {lowStockWindowDescription(lowStockThreshold)}
          </Text>
          {data.low_stock_warning.length > 0 ? (
            <Stack gap='sm'>
              {data.low_stock_warning.map((entry) => (
                <Paper key={entry.stock_item} withBorder radius='md' p='sm'>
                  <Group justify='space-between' align='center'>
                    <Stack gap={2}>
                      <Anchor
                        component='button'
                        type='button'
                        onClick={() => openStockItemDetails(entry.stock_item)}
                      >
                        {entry.item_name}
                      </Anchor>
                      <Text size='sm' c='dimmed'>
                        {entry.location || t`No location`}
                      </Text>
                    </Stack>
                    <Stack gap={4} align='flex-end'>
                      <Badge color='yellow' variant='light'>
                        {`${quantityLabel(entry.available_quantity)} ${t`available`}`}
                      </Badge>
                      <Progress
                        value={Math.min(
                          (Number.parseFloat(entry.available_quantity) /
                            Math.max(lowStockThreshold, 1)) *
                            100,
                          100
                        )}
                        color='yellow'
                        size='sm'
                        w={120}
                      />
                    </Stack>
                  </Group>
                </Paper>
              ))}
            </Stack>
          ) : (
            <EmptyState
              title={t`Stock levels look healthy`}
              description={lowStockWindowDescription(lowStockThreshold)}
            />
          )}
        </SectionCard>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <SectionCard title={t`Stock by Location`} icon={<IconMapPin size={18} />}>
          {data.stock_by_location.length > 0 ? (
            <BarChart
              h={260}
              data={data.stock_by_location}
              dataKey='label'
              series={[{ name: 'value', color: 'blue.6', label: t`Items` }]}
            />
          ) : (
            <EmptyState
              title={t`No stock locations yet`}
              description={t`Location totals will be shown once stock items are placed in locations.`}
            />
          )}
        </SectionCard>

        <SectionCard
          title={t`Category Distribution`}
          icon={<IconChartDonut3 size={18} />}
        >
          {categoryChart.length > 0 ? (
            <Group justify='space-between' align='center' wrap='nowrap'>
              <DonutChart
                data={categoryChart}
                size={220}
                thickness={28}
                withLabels={false}
                chartLabel={t`Categories`}
              />
              <Stack gap='xs' style={{ flex: 1 }}>
                {data.category_distribution.slice(0, 5).map((entry, index) => (
                  <Group key={entry.label} justify='space-between'>
                    <Group gap='xs'>
                      <ThemeIcon
                        size='xs'
                        radius='xl'
                        color={CHART_COLORS[index % CHART_COLORS.length].split('.')[0]}
                        variant='filled'
                      />
                      <Text size='sm'>{entry.label}</Text>
                    </Group>
                    <Text size='sm' fw={600}>
                      {entry.value}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Group>
          ) : (
            <EmptyState
              title={t`No category data`}
              description={t`Once stock exists, this chart will show how equipment is distributed across categories.`}
            />
          )}
        </SectionCard>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }}>
        <SectionCard
          title={t`Recently Added Equipment`}
          icon={<IconActivityHeartbeat size={18} />}
        >
          {data.recently_added_equipment.length > 0 ? (
            <ScrollArea.Autosize mah={280}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t`Name`}</Table.Th>
                    <Table.Th>{t`Category`}</Table.Th>
                    <Table.Th>{t`Location`}</Table.Th>
                    <Table.Th>{t`Created`}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.recently_added_equipment.map((entry) => (
                    <Table.Tr key={entry.stock_item}>
                      <Table.Td>
                        <Anchor
                          component='button'
                          type='button'
                          onClick={() => openStockItemDetails(entry.stock_item)}
                        >
                          {entry.name}
                        </Anchor>
                      </Table.Td>
                      <Table.Td>{entry.category || '-'}</Table.Td>
                      <Table.Td>{entry.location || '-'}</Table.Td>
                      <Table.Td>{formatMaybeDate(entry.created)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>
          ) : (
            <EmptyState
              title={t`No recent equipment`}
              description={t`Newly created stock items will appear here.`}
            />
          )}
        </SectionCard>

        <SectionCard
          title={t`Most Used Equipment`}
          icon={<IconChartHistogram size={18} />}
        >
          {data.most_used_equipment.length > 0 ? (
            <Stack gap='sm'>
              {data.most_used_equipment.map((entry) => (
                <Paper key={entry.stock_item} withBorder radius='md' p='sm'>
                  <Group justify='space-between' align='center'>
                    <Anchor
                      component='button'
                      type='button'
                      onClick={() => openStockItemDetails(entry.stock_item)}
                    >
                      {entry.item_name}
                    </Anchor>
                    <Group gap='xs'>
                      <Badge color='blue' variant='light'>
                        {`${entry.usage_count} ${t`allocations`}`}
                      </Badge>
                      <Badge color='teal' variant='light'>
                        {`${quantityLabel(entry.total_reserved_quantity)} ${t`reserved`}`}
                      </Badge>
                    </Group>
                  </Group>
                </Paper>
              ))}
            </Stack>
          ) : (
            <EmptyState
              title={t`No usage history yet`}
              description={t`Equipment usage will appear once projects start reserving instruments and stock.`}
            />
          )}
        </SectionCard>
      </SimpleGrid>
    </Stack>
  );
}

export default function TrackletOperationsDashboardWidget(): DashboardWidgetProps {
  const user = useUserState();
  const navigate = useNavigate();
  const canOpenDashboardAlerts =
    canViewSettingsRoot(user, 'system') &&
    getSystemPanelAccess(user, 'dashboard').view;

  return {
    label: 'ops-hub',
    title: t`Operations Hub`,
    description: t`Daily operations dashboard for stock, projects, reservations, and calibration`,
    minWidth: 10,
    minHeight: 12,
    render: () => (
      <Stack gap='md'>
        <Group justify='space-between' align='end'>
          <Stack gap={2}>
            <StylishText size='xl'>{t`Operations Hub`}</StylishText>
            <Text size='sm' c='dimmed'>
              {t`Live stock, project, reservation, calibration, and usage signals for daily lab operations`}
            </Text>
          </Stack>
          {canOpenDashboardAlerts && (
            <Tooltip label={t`Dashboard Alerts`} position='left'>
              <ActionIcon
                variant='light'
                size='lg'
                aria-label='dashboard-alert-settings'
                onClick={() => {
                  navigate('/settings/system/dashboard');
                }}
              >
                <IconSettings size={18} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
        <OperationsContent />
      </Stack>
    ),
    enabled:
      user.hasViewPermission(ModelType.project) &&
      user.hasViewPermission(ModelType.stockitem)
  };
}
