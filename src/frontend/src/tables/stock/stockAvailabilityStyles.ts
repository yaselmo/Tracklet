export type StockAvailabilityStyle = {
  bg: string;
  fg: string;
  key: string;
  label: string;
};

const DEFAULT_STYLE = {
  bg: 'var(--mantine-color-gray-6)',
  fg: '#fff'
};

const AVAIL_STYLE: Record<string, { bg: string; fg: string }> = {
  AVAILABLE: { bg: 'var(--mantine-color-green-6)', fg: '#fff' },
  UNAVAILABLE: { bg: 'var(--mantine-color-gray-6)', fg: '#fff' },
  MISSING: { bg: 'var(--mantine-color-yellow-5)', fg: '#111' },
  BROKEN: { bg: 'var(--mantine-color-red-6)', fg: '#fff' }
};

function formatAvailabilityLabel(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function getStockAvailabilityStyle(
  value: unknown,
  fallbackLabel?: string
): StockAvailabilityStyle {
  const key = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');

  const style = AVAIL_STYLE[key] ?? DEFAULT_STYLE;
  const normalizedKey = key || 'UNAVAILABLE';

  return {
    bg: style.bg,
    fg: style.fg,
    key: normalizedKey,
    label: fallbackLabel || formatAvailabilityLabel(normalizedKey)
  };
}
