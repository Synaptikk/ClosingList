import { useSession, managerLabel } from '../store/sessionStore';
import { relTime } from '../lib/timeUtils';

export default function ManagerPresenceBadge() {
  const { session } = useSession();
  if (!session) return null;
  const m1 = session.managers?.manager1?.name?.trim();
  const m2 = session.managers?.manager2?.name?.trim();
  const p1 = session.presence?.manager1;
  const p2 = session.presence?.manager2;
  const now = new Date();
  const isLive = (ts) => ts && (now - new Date(ts)) < 2 * 60 * 1000;

  return (
    <div className="flex flex-wrap gap-2">
      <PresencePill label={m1 || 'Manager 1'} live={isLive(p1)} ts={p1} />
      <PresencePill label={m2 || 'Manager 2'} live={isLive(p2)} ts={p2} />
    </div>
  );
}

function PresencePill({ label, live, ts }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ring-1 bg-white ring-slate-200">
      <span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      <span className="font-medium text-slate-800">{label}</span>
      <span className="text-slate-400">{live ? 'online' : ts ? relTime(ts) : 'not joined'}</span>
    </div>
  );
}
