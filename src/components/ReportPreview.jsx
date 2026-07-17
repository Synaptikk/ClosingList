import { useRef } from 'react';
import { useSession, managerLabel } from '../store/sessionStore';
import { checklistConfig, TASK_TYPES, OWNERS } from '../config/checklistConfig';
import { computeStatus, STATUS, formatTime, formatDate } from '../lib/timeUtils';

// ReportPreview is both: visible on the Report tab, AND the DOM exportPdf snapshots.
// All inline-styled / Tailwind-styled with print-safe colors. No external images.

const ReportPreview = ({ innerRef }) => {
  const { session } = useSession();
  if (!session) return null;

  const now = new Date();
  const sectionData = checklistConfig.sections.map(sec => {
    const tasks = sec.tasks.map(t => {
      const state = session.tasks[t.id] || {};
      const status = computeStatus(t, state, session.date, now);
      return { task: t, state, status };
    });
    return { sec, tasks };
  });

  const totals = sectionData.reduce((acc, s) => {
    for (const r of s.tasks) {
      acc.total++;
      if (r.status === STATUS.COMPLETE) acc.complete++;
      else if (r.status === STATUS.OVERDUE) acc.overdue++;
      else if (r.status === STATUS.DUE_SOON) acc.dueSoon++;
    }
    return acc;
  }, { total: 0, complete: 0, overdue: 0, dueSoon: 0 });

  const allPhotos = [];
  for (const s of sectionData) for (const r of s.tasks) for (const p of r.state.photos || []) allPhotos.push({ taskTitle: r.task.title, ...p });

  return (
    <div ref={innerRef} className="bg-white text-slate-900 max-w-[860px] mx-auto p-6 text-[13px] leading-relaxed">
      <header className="border-b-2 border-slate-900 pb-3 mb-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-bold">Closing Report — Store {session.storeNumber}</h1>
          <div className="text-xs text-slate-500">{formatDate(session.date)}</div>
        </div>
        <div className="mt-1 text-xs text-slate-600">
          Managers: <strong>{managerLabel(session, 'manager1')}</strong> &nbsp;·&nbsp; <strong>{managerLabel(session, 'manager2')}</strong>
          {session.marketNumber ? ` · Market ${session.marketNumber}` : ''}
        </div>
      </header>

      <section className="grid grid-cols-4 gap-2 mb-4 text-center">
        <SummaryBox label="Total" value={totals.total} />
        <SummaryBox label="Complete" value={totals.complete} tone="emerald" />
        <SummaryBox label="Due soon" value={totals.dueSoon} tone="amber" />
        <SummaryBox label="Overdue" value={totals.overdue} tone="rose" />
      </section>

      {session.shiftNotes?.trim() && (
        <section className="mb-4">
          <h2 className="text-sm font-bold mb-1">Shift notes</h2>
          <div className="bg-slate-50 ring-1 ring-slate-200 rounded p-2 whitespace-pre-wrap">{session.shiftNotes}</div>
        </section>
      )}

      {sectionData.map(({ sec, tasks }) => {
        const visible = tasks.filter(r => r.task.reportInclude !== false);
        if (visible.length === 0) return null;
        return (
          <section key={sec.id} className="mb-4 break-inside-avoid">
            <h2 className="text-sm font-bold border-b border-slate-300 mb-2 pb-1">{sec.title}</h2>
            <ul className="space-y-1.5">
              {visible.map(({ task, state, status }) => (
                <li key={task.id} className="flex gap-2">
                  <span className="mt-0.5 inline-block w-4 text-center">{statusGlyph(status)}</span>
                  <div className="flex-1">
                    <div>
                      <strong>{task.title}</strong>{' '}
                      {renderValue(task, state)}
                      {state.completedAt && (
                        <span className="text-xs text-slate-500"> — done {formatTime(state.completedAt)} by {managerLabel(session, state.completedBy)}</span>
                      )}
                      {task.dueTime && !state.completedAt && (
                        <span className="text-xs text-slate-500"> — due {task.dueTime}</span>
                      )}
                    </div>
                    {state.notes?.trim() && task.type !== TASK_TYPES.NOTE && (
                      <div className="text-xs text-slate-700 italic">Note: {state.notes}</div>
                    )}
                    {(state.photos?.length || 0) > 0 && (
                      <div className="text-[11px] text-slate-500">📷 {state.photos.length} photo{state.photos.length > 1 ? 's' : ''}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {session.associates.length > 0 && (
        <section className="mb-4 break-inside-avoid">
          <h2 className="text-sm font-bold border-b border-slate-300 mb-2 pb-1">Associates & accomplishments</h2>
          <ul className="space-y-1">
            {session.associates.map(a => (
              <li key={a.id}>
                <strong>{a.name}</strong>
                {a.shift ? <span className="text-slate-600"> · {a.shift}</span> : null}
                {a.area ? <span className="text-slate-600"> · {a.area}</span> : null}
                {a.accomplishment && <> — {a.accomplishment}</>}
                {a.notes && <span className="text-slate-600 italic"> ({a.notes})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {allPhotos.length > 0 && (
        <section className="mb-4">
          <h2 className="text-sm font-bold border-b border-slate-300 mb-2 pb-1">Photo evidence ({allPhotos.length})</h2>
          <div className="grid grid-cols-3 gap-2">
            {allPhotos.map((p, i) => (
              <figure key={p.id + i} className="break-inside-avoid">
                <img src={p.dataUrl} alt={p.caption || p.taskTitle} className="w-full h-32 object-cover ring-1 ring-slate-200 rounded" />
                <figcaption className="text-[10px] text-slate-600 mt-1 leading-tight">
                  <strong>{p.taskTitle}</strong>{p.caption ? ` — ${p.caption}` : ''}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-6 pt-3 border-t border-slate-200 text-[11px] text-slate-500">
        Generated by Closing Manager Checklist · {new Date().toLocaleString()}
        {session.submittedAt && <> · Submitted {new Date(session.submittedAt).toLocaleString()}</>}
      </footer>
    </div>
  );
};

function SummaryBox({ label, value, tone }) {
  const map = {
    emerald: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    amber:   'bg-amber-50 text-amber-900 ring-amber-200',
    rose:    'bg-rose-50 text-rose-900 ring-rose-200',
  };
  return (
    <div className={`ring-1 rounded py-2 ${map[tone] || 'bg-slate-50 text-slate-900 ring-slate-200'}`}>
      <div className="text-lg font-bold leading-none">{value}</div>
      <div className="text-[10px] uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function statusGlyph(s) {
  return {
    complete: '✔',
    overdue: '⚠',
    due_soon: '⏰',
    in_progress: '•',
    not_started: '◦',
  }[s] || '·';
}

function renderValue(task, state) {
  switch (task.type) {
    case TASK_TYPES.CHECKBOX:
    case TASK_TYPES.TIMED_CHECKBOX:
    case TASK_TYPES.YES_NO:
      if (!state.value) return null;
      return state.value === 'no'
        ? <strong className="text-rose-700">— NO</strong>
        : <em>— {state.value}</em>;
    case TASK_TYPES.NUMERIC:   return state.value !== '' && state.value != null ? <em>— {state.value}</em> : null;
    case TASK_TYPES.TIME:      return state.value ? <em>— {state.value}</em> : null;
    case TASK_TYPES.MULTI_SELECT: return state.value ? <em>— {state.value}</em> : null;
    case TASK_TYPES.NOTE:      return state.notes?.trim() ? <em>— {state.notes}</em> : null;
    default: return null;
  }
}

export default ReportPreview;
