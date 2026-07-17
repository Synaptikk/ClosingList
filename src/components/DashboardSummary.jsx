import { useEffect, useMemo, useState } from 'react';
import { useSession, managerLabel } from '../store/sessionStore';
import { checklistConfig } from '../config/checklistConfig';
import { computeStatus, STATUS, formatDate } from '../lib/timeUtils';
import ManagerPresenceBadge from './ManagerPresenceBadge';
import SyncStatusIndicator from './SyncStatusIndicator';

export default function DashboardSummary({ onJumpToSection }) {
  const { session, exitSession } = useSession();
  const [, force] = useState(0);
  useEffect(() => { const iv = setInterval(() => force(x => x + 1), 30000); return () => clearInterval(iv); }, []);

  const stats = useMemo(() => {
    if (!session) return null;
    const now = new Date();
    let total = 0, complete = 0, dueSoon = 0, overdue = 0, inProgress = 0, photos = 0, notes = 0;
    const perSection = {};
    for (const sec of checklistConfig.sections) {
      perSection[sec.id] = { total: 0, complete: 0, overdue: 0, dueSoon: 0 };
      for (const t of sec.tasks) {
        const state = session.tasks[t.id] || {};
        const status = computeStatus(t, state, session.date, now);
        total++;
        perSection[sec.id].total++;
        if (status === STATUS.COMPLETE) { complete++; perSection[sec.id].complete++; }
        else if (status === STATUS.OVERDUE) { overdue++; perSection[sec.id].overdue++; }
        else if (status === STATUS.DUE_SOON) { dueSoon++; perSection[sec.id].dueSoon++; }
        else if (status === STATUS.IN_PROGRESS) { inProgress++; }
        photos += (state.photos?.length || 0);
        if (state.notes?.trim()) notes++;
      }
    }
    return { total, complete, dueSoon, overdue, inProgress, photos, notes, perSection,
             pct: total ? Math.round((complete / total) * 100) : 0 };
  }, [session]);

  if (!session) return null;

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tonight</div>
            <div className="text-xl font-bold text-slate-900">Store {session.storeNumber}</div>
            <div className="text-sm text-slate-500">{formatDate(session.date)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">Join code</div>
            <div className="font-mono text-lg font-bold text-[#0071dc] tracking-widest">{session.joinCode}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-sm font-semibold text-slate-800">Overall progress</div>
            <div className="text-sm font-bold text-slate-900">{stats.pct}%</div>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0071dc] transition-all duration-500"
              style={{ width: `${stats.pct}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {stats.complete} of {stats.total} tasks complete
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          <Stat label="Overdue"  value={stats.overdue}   tone="rose" />
          <Stat label="Due soon" value={stats.dueSoon}   tone="amber" />
          <Stat label="Photos"   value={stats.photos}    tone="sky" />
          <Stat label="Notes"    value={stats.notes}     tone="slate" />
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <ManagerPresenceBadge />
          <SyncStatusIndicator />
        </div>
      </section>

      <ManagerNamesCard session={session} />

      <CoverageCard session={session} />

      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 px-1">Sections</div>
        <div className="grid grid-cols-2 gap-2">
          {checklistConfig.sections.map(sec => {
            const ps = stats.perSection[sec.id];
            const pct = ps.total ? Math.round((ps.complete / ps.total) * 100) : 0;
            return (
              <button
                key={sec.id}
                onClick={() => onJumpToSection?.(sec.id)}
                className="bg-white ring-1 ring-slate-200 rounded-xl p-3 text-left active:bg-slate-50"
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900 truncate">{sec.title}</div>
                  {ps.overdue > 0 && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-rose-500" />}
                </div>
                <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${ps.overdue ? 'bg-rose-500' : ps.dueSoon ? 'bg-amber-400' : 'bg-emerald-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-slate-500">{ps.complete}/{ps.total} · {pct}%</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="text-center">
        <button
          onClick={() => { if (confirm('Leave this session? It will stay saved on this device.')) exitSession(); }}
          className="text-xs text-slate-500 underline"
        >
          Leave session
        </button>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const colors = {
    rose:  'bg-rose-50 ring-rose-200 text-rose-900',
    amber: 'bg-amber-50 ring-amber-200 text-amber-900',
    sky:   'bg-sky-50 ring-sky-200 text-sky-900',
    slate: 'bg-slate-50 ring-slate-200 text-slate-800',
  }[tone] || 'bg-slate-50 ring-slate-200 text-slate-800';
  return (
    <div className={`rounded-xl ring-1 ${colors} py-2`}>
      <div className="text-lg font-bold leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function ManagerNamesCard({ session }) {
  const { patchSession } = useSession();
  const submitted = session.status === 'submitted';
  const m1 = session.managers?.manager1?.name || '';
  const m2 = session.managers?.manager2?.name || '';
  const setName = (key, name) => {
    patchSession({ managers: { ...session.managers, [key]: { ...session.managers[key], name } } });
  };
  return (
    <section className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Closing managers</div>
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="Manager 1"
          value={m1}
          disabled={submitted}
          onChange={e => setName('manager1', e.target.value)}
          className="rounded-lg ring-1 ring-slate-200 px-3 py-2 text-base disabled:bg-slate-50"
        />
        <input
          placeholder="Manager 2"
          value={m2}
          disabled={submitted}
          onChange={e => setName('manager2', e.target.value)}
          className="rounded-lg ring-1 ring-slate-200 px-3 py-2 text-base disabled:bg-slate-50"
        />
      </div>
      <textarea
        placeholder="Shift notes (optional)"
        value={session.shiftNotes || ''}
        disabled={submitted}
        onChange={e => patchSession({ shiftNotes: e.target.value })}
        rows={2}
        className="mt-2 w-full rounded-lg ring-1 ring-slate-200 px-3 py-2 text-base disabled:bg-slate-50"
      />
    </section>
  );
}

// Team Lead detection: area contains "Team Lead" or word-boundary "TL".
// Word-boundary on TL avoids matching "TA" (Team Associate) or "Maintenance".
const TL_RE = /(team\s*lead|\bTL\b)/i;
// Call-out detection: matches what the extension and the email-format parser write.
const CALLOFF_RE = /called off/i;

function CoverageCard({ session }) {
  const total = session.associates.length;
  const teamLeads = session.associates.filter(a => TL_RE.test(a.area || '')).length;
  const callOffs = session.associates.filter(a => CALLOFF_RE.test(a.notes || '')).length;
  if (total === 0) return null;
  return (
    <section className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Tonight's coverage</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <CoverageStat label="Associates" value={total - callOffs} sub={callOffs ? `of ${total}` : null} tone="sky" />
        <CoverageStat label="Team Leads" value={teamLeads} tone="indigo" />
        <CoverageStat label="Call-outs"  value={callOffs}  tone={callOffs ? 'rose' : 'slate'} />
      </div>
    </section>
  );
}

function CoverageStat({ label, value, sub, tone }) {
  const colors = {
    sky:     'bg-sky-50 ring-sky-200 text-sky-900',
    indigo:  'bg-indigo-50 ring-indigo-200 text-indigo-900',
    rose:    'bg-rose-50 ring-rose-200 text-rose-900',
    slate:   'bg-slate-50 ring-slate-200 text-slate-700',
  }[tone] || 'bg-slate-50 ring-slate-200 text-slate-700';
  return (
    <div className={`rounded-xl ring-1 ${colors} py-2.5`}>
      <div className="text-2xl font-bold leading-none">{value}</div>
      {sub && <div className="text-[10px] mt-0.5 opacity-70">{sub}</div>}
      <div className="text-[10px] uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}
