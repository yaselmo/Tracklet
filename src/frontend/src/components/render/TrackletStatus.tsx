import { Badge } from '@mantine/core';

export const TRACKLET_STATUS_OPTIONS = [
  { value: 'IN_STOCK', label: 'IN STOCK' },
  { value: 'IN_USE', label: 'IN USE' },
  { value: 'BROKEN', label: 'BROKEN' },
  { value: 'MISSING', label: 'MISSING' },
  { value: 'UNAVAILABLE', label: 'UNAVAILABLE' }
];

export function getTrackletStatusColor(status?: string): string {
  switch ((status || '').toUpperCase()) {
    case 'MISSING':
      return 'red';
    case 'BROKEN':
      return 'dark';
    case 'IN_USE':
      return 'orange';
    case 'IN_STOCK':
      return 'green';
    case 'UNAVAILABLE':
      return 'gray';
    default:
      return 'gray';
  }
}

export function getTrackletStatusLabel(status?: string): string {
  switch ((status || '').toUpperCase()) {
    case 'MISSING':
      return 'MISSING';
    case 'BROKEN':
      return 'BROKEN';
    case 'IN_USE':
      return 'IN USE';
    case 'IN_STOCK':
      return 'IN STOCK';
    case 'UNAVAILABLE':
      return 'UNAVAILABLE';
    default:
      return (status || '').replaceAll('_', ' ').toUpperCase();
  }
}

export function getTrackletStatusPill(itemOrStatus: any) {
  const status =
    typeof itemOrStatus === 'string'
      ? itemOrStatus
      : itemOrStatus?.tracklet_status ?? '';

  return (
    <Badge color={getTrackletStatusColor(status)}>
      {getTrackletStatusLabel(status)}
    </Badge>
  );
}
