type EventStatusBadgeStyle = {
  bg: string;
  fg: string;
};

const DEFAULT_STATUS_STYLE: EventStatusBadgeStyle = {
  bg: 'var(--mantine-color-gray-6)',
  fg: '#fff'
};

const STATUS_STYLE: Record<string, EventStatusBadgeStyle> = {
  SCHEDULED: { bg: 'var(--mantine-color-blue-6)', fg: '#fff' },
  IN_PROGRESS: { bg: 'var(--mantine-color-yellow-5)', fg: '#111' },
  COMPLETED: { bg: 'var(--mantine-color-green-6)', fg: '#fff' },
  CANCELLED: { bg: 'var(--mantine-color-red-6)', fg: '#fff' },
  ON_HOLD: { bg: 'var(--mantine-color-grape-6)', fg: '#fff' },
  DRAFT: DEFAULT_STATUS_STYLE,
  TBD: DEFAULT_STATUS_STYLE
};

export function getEventStatusBadgeStyle(
  status: unknown
): EventStatusBadgeStyle {
  const statusKey = String(status ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

  return STATUS_STYLE[statusKey] ?? DEFAULT_STATUS_STYLE;
}
