/** Status badge — color + text label (never color alone). */

const MAP: Record<
  string,
  { className: string; label: string }
> = {
  pending: { className: 'rp-badge-pending', label: 'Pending' },
  navigating: { className: 'rp-badge-current', label: 'Navigating' },
  arrived: { className: 'rp-badge-current', label: 'Arrived' },
  in_progress: { className: 'rp-badge-current', label: 'In progress' },
  delivered: { className: 'rp-badge-done', label: 'Delivered' },
  failed: { className: 'rp-badge-failed', label: 'Failed' },
  skipped: { className: 'rp-badge-skipped', label: 'Skipped' },
  cancelled: { className: 'rp-badge-done', label: 'Cancelled' },
  confirmed: { className: 'rp-badge-current', label: 'Confirmed' },
  approximate: { className: 'rp-badge-warn', label: 'Approximate' },
  unverified: { className: 'rp-badge-pending', label: 'Unverified' },
  flagged: { className: 'rp-badge-failed', label: 'Flagged' },
};

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const meta = MAP[status] ?? {
    className: 'rp-badge-pending',
    label: status || 'Unknown',
  };
  return (
    <span className={`rp-badge ${meta.className}`}>
      {label ?? meta.label}
    </span>
  );
}
