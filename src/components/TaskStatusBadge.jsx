import { statusColor, statusLabel } from '../lib/timeUtils';

export default function TaskStatusBadge({ status, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${statusColor(status)} ${className}`}>
      <Dot status={status} />
      {statusLabel(status)}
    </span>
  );
}

function Dot({ status }) {
  const color = {
    not_started: 'bg-slate-400',
    in_progress: 'bg-sky-500',
    due_soon:    'bg-amber-500',
    overdue:     'bg-rose-500 animate-pulse',
    complete:    'bg-emerald-500',
  }[status] || 'bg-slate-400';
  return <span className={`w-1.5 h-1.5 rounded-full ${color}`} />;
}
