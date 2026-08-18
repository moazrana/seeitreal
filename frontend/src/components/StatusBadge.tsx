import type { ArStatus } from '@ar-menu/shared';

const LABELS: Record<ArStatus, string> = {
  pending: 'Pending',
  generating: 'Generating…',
  qa: 'In review',
  live: 'Live',
};

export function StatusBadge({ status }: { status: ArStatus }) {
  return <span className={`status-badge status-${status}`}>{LABELS[status]}</span>;
}
