import { useEffect, useMemo, useState } from 'react';
import { useSession, managerLabel } from '../store/sessionStore';
import { checklistConfig } from '../config/checklistConfig';
import { computeStatus, STATUS } from '../lib/timeUtils';
import { OWNERS } from '../config/checklistConfig';
import TaskCard from './TaskCard';

export default function SectionAccordion({ openSectionId, highlightTaskId, onSectionOpen }) {
  const { session } = useSession();
  const [openIds, setOpenIds] = useState(() => new Set(openSectionId ? [openSectionId] : []));
  const [ownerFilter, setOwnerFilter] = useState('all');

  useEffect(() => {
    if (openSectionId) {
      setOpenIds(prev => new Set([...prev, openSectionId]));
      setTimeout(() => {
        const el = document.querySelector(`[data-section-id="${openSectionId}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, [openSectionId]);

  useEffect(() => {
    if (highlightTaskId) {
      setTimeout(() => {
        const el = document.querySelector(`[data-task-id="${highlightTaskId}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [highlightTaskId]);

  function toggle(id) {
    const next = new Set(openIds);
    if (next.has(id)) next.delete(id);
    else { next.add(id); onSectionOpen?.(id); }
    setOpenIds(next);
  }

  if (!session) return null;

  return (
    <div className="space-y-3">
      <OwnerFilter value={ownerFilter} onChange={setOwnerFilter} />
      {checklistConfig.sections.map(sec => (
        <SectionPanel
          key={sec.id}
          sec={sec}
          open={openIds.has(sec.id)}
          onToggle={() => toggle(sec.id)}
          highlightTaskId={highlightTaskId}
          ownerFilter={ownerFilter}
        />
      ))}
    </div>
  );
}

function SectionPanel({ sec, open, onToggle, highlightTaskId, ownerFilter }) {
  const { session, activeManager } = useSession();
  const visibleTasks = useMemo(() => {
    if (ownerFilter === 'all') return sec.tasks;
    if (ownerFilter === 'mine') {
      return sec.tasks.filter(t => t.owner === activeManager || t.owner === OWNERS.SHARED || t.owner === OWNERS.UNASSIGNED);
    }
    return sec.tasks.filter(t => t.owner === ownerFilter);
  }, [sec, ownerFilter, activeManager]);

  const stats = useMemo(() => {
    const now = new Date();
    let complete = 0, overdue = 0, dueSoon = 0;
    for (const t of sec.tasks) {
      const s = computeStatus(t, session.tasks[t.id] || {}, session.date, now);
      if (s === STATUS.COMPLETE) complete++;
      else if (s === STATUS.OVERDUE) overdue++;
      else if (s === STATUS.DUE_SOON) dueSoon++;
    }
    return { complete, overdue, dueSoon, total: sec.tasks.length };
  }, [sec, session]);

  return (
    <section data-section-id={sec.id} className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-slate-50"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-bold text-slate-900 truncate">{sec.title}</h3>
            {stats.overdue > 0 && (
              <span className="text-[10px] uppercase tracking-wide font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                {stats.overdue} overdue
              </span>
            )}
            {stats.dueSoon > 0 && (
              <span className="text-[10px] uppercase tracking-wide font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                {stats.dueSoon} due soon
              </span>
            )}
          </div>
          <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${stats.overdue ? 'bg-rose-500' : 'bg-emerald-500'}`}
              style={{ width: `${stats.total ? (stats.complete / stats.total) * 100 : 0}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-slate-500">{stats.complete}/{stats.total} complete</div>
        </div>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="border-t border-slate-100 p-3 bg-slate-50 space-y-2">
          {visibleTasks.length === 0 && (
            <div className="text-xs text-slate-500 text-center py-3">No tasks match the current filter.</div>
          )}
          {visibleTasks.map(t => (
            <TaskCard key={t.id} task={t} sectionId={sec.id} highlighted={highlightTaskId === t.id} />
          ))}
        </div>
      )}
    </section>
  );
}

function OwnerFilter({ value, onChange }) {
  const { session } = useSession();
  const opts = [
    { id: 'all',      label: 'All' },
    { id: 'mine',     label: 'Mine + shared' },
    { id: OWNERS.MANAGER_1, label: firstWord(managerLabel(session, 'manager1')) },
    { id: OWNERS.MANAGER_2, label: firstWord(managerLabel(session, 'manager2')) },
    { id: OWNERS.SHARED,    label: 'Shared' },
  ];
  return (
    <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 no-scrollbar">
      {opts.map(o => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={
            'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ring-1 ' +
            (value === o.id ? 'bg-[#0071dc] text-white ring-[#0071dc]' : 'bg-white text-slate-700 ring-slate-200')
          }
        >{o.label}</button>
      ))}
    </div>
  );
}

function Chevron({ open }) {
  return (
    <svg className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

// First word of a name for compact chip labels — "Sarah Johnson" → "Sarah".
// Falls back as-is for the generic "Manager 1" / "Manager 2" defaults.
function firstWord(s) {
  if (!s) return '';
  const w = s.trim().split(/\s+/)[0];
  return w.length > 14 ? w.slice(0, 13) + '…' : w;
}
