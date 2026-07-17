import { useSession, managerLabel } from '../store/sessionStore';
import { todayISO } from '../lib/timeUtils';

export default function MobileHeader({ view, onMenu }) {
  const { session, activeManager, setActiveManager, openSessionForDate } = useSession();
  const submitted = session?.status === 'submitted';
  const viewingPast = isPastSession(session);

  return (
    <header className="sticky top-0 z-30 bg-[#0071dc] text-white shadow-md no-print">
      <div className="px-4 pt-3 pb-2 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#ffc220] text-[#0071dc] font-bold grid place-items-center text-base">
          C
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs/tight opacity-80 truncate">
            {session ? `Store ${session.storeNumber}` : 'Closing Manager Checklist'}
          </div>
          <div className="text-base font-semibold truncate">
            {viewTitle(view, session, viewingPast)}
          </div>
        </div>
        {session && (
          <ManagerSwitcher
            session={session}
            activeManager={activeManager}
            onChange={setActiveManager}
            disabled={submitted}
          />
        )}
      </div>
      {viewingPast && (
        <button
          onClick={() => openSessionForDate(todayISO().slice(0, 10))}
          className="w-full bg-amber-400 text-amber-950 text-xs font-semibold px-4 py-1 text-center hover:bg-amber-300 active:bg-amber-500"
        >
          Viewing past night ({formatPast(session.date)}) — tap to return to tonight
        </button>
      )}
      {submitted && (
        <div className="bg-emerald-200 text-emerald-950 text-xs font-semibold px-4 py-1 text-center">
          Submitted — read only
        </div>
      )}
    </header>
  );
}

function isPastSession(session) {
  if (!session?.date) return false;
  const sd = new Date(session.date);
  const t  = new Date();
  return new Date(sd.getFullYear(), sd.getMonth(), sd.getDate()).getTime() <
         new Date(t.getFullYear(),  t.getMonth(),  t.getDate()).getTime();
}
function formatPast(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function viewTitle(view, session, viewingPast) {
  if (view === 'home') {
    if (viewingPast && session?.date) return formatPast(session.date);
    return 'Tonight';
  }
  return {
    checklist:  'Checklist',
    associates: 'Associates',
    report:     'Report',
  }[view] || 'Closing';
}

function ManagerSwitcher({ session, activeManager, onChange, disabled }) {
  return (
    <button
      onClick={() => onChange(activeManager === 'manager1' ? 'manager2' : 'manager1')}
      disabled={disabled}
      className="text-xs font-semibold bg-white/15 hover:bg-white/25 active:bg-white/30 rounded-full px-3 py-1.5 ring-1 ring-white/20 disabled:opacity-50"
      title="Switch which manager you are"
    >
      Acting as: {managerLabel(session, activeManager)}
    </button>
  );
}
