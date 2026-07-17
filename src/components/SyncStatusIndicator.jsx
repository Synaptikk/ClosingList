import { useSession } from '../store/sessionStore';

export default function SyncStatusIndicator() {
  const { syncStatus, mode } = useSession();
  // syncStatus: idle | syncing | synced | error | local
  const local = mode !== 'cloud';
  const m = local
    ? { label: 'Local only', dot: 'bg-slate-400', title: 'Firebase not configured — saved on this device' }
    : ({
        idle:    { label: 'Connecting…',   dot: 'bg-slate-300 animate-pulse' },
        syncing: { label: 'Syncing…',      dot: 'bg-sky-400 animate-pulse' },
        synced:  { label: 'Synced',        dot: 'bg-emerald-500', title: 'Live with other devices' },
        error:   { label: 'Sync error',    dot: 'bg-rose-500', title: 'Cloud write failed; saved locally' },
      }[syncStatus] || { label: 'Saved',  dot: 'bg-emerald-500' });
  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-slate-600" title={m.title || ''}>
      <span className={`w-2 h-2 rounded-full ${m.dot}`} />
      {m.label}
    </div>
  );
}
