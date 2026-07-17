import { useEffect, useRef, useState } from 'react';
import { useSession, managerLabel } from '../store/sessionStore';
import { TASK_TYPES, OWNERS } from '../config/checklistConfig';
import { computeStatus, formatTime, parseDueTime, relTime } from '../lib/timeUtils';
import TaskStatusBadge from './TaskStatusBadge';
import PhotoUploader from './PhotoUploader';

// Checkbox-style task types collapse to a single Yes/No interaction.
// Tapping "No" opens the Note + Photo disclosures so a reason can be left for follow-up.
const YESNO_TYPES = new Set([TASK_TYPES.CHECKBOX, TASK_TYPES.TIMED_CHECKBOX, TASK_TYPES.YES_NO]);

export default function TaskCard({ task, sectionId, highlighted = false }) {
  const { session, updateTask, completeTask, activeManager } = useSession();
  const state = session.tasks[task.id] || {};
  const submitted = session.status === 'submitted';
  const [, force] = useState(0);
  useEffect(() => { const iv = setInterval(() => force(x => x + 1), 30000); return () => clearInterval(iv); }, []);

  const noteRef  = useRef(null);
  const photoRef = useRef(null);

  const status = computeStatus(task, state, session.date, new Date());
  const due = parseDueTime(task.dueTime, session.date);
  const ownerLabel = ownerToLabel(task.owner, session);
  const isYesNo = YESNO_TYPES.has(task.type);
  const needsReason = isYesNo
    && state.value === 'no'
    && !state.notes?.trim()
    && (state.photos?.length || 0) === 0
    && !submitted;

  function openReasonDisclosures() {
    if (noteRef.current)  noteRef.current.open  = true;
    if (photoRef.current) photoRef.current.open = true;
  }

  return (
    <article
      data-task-id={task.id}
      className={
        'bg-white rounded-xl ring-1 ring-slate-200 shadow-sm p-3.5 ' +
        (highlighted ? 'ring-2 ring-[#0071dc] shadow-md' : '') +
        (needsReason ? ' ring-amber-300' : '')
      }
    >
      <header className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-[15px] font-semibold text-slate-900 leading-tight">{task.title}</h4>
            {task.priority === 'high' && <span className="text-[10px] uppercase tracking-wide font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">High</span>}
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500">
            <OwnerChip owner={task.owner} label={ownerLabel} />
            {due && <span>Due {formatTime(due)}</span>}
            {state.lastUpdatedAt && (
              <span title={new Date(state.lastUpdatedAt).toLocaleString()}>
                · updated {relTime(state.lastUpdatedAt)} by {managerLabel(session, state.lastUpdatedBy)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <TaskStatusBadge status={status} />
          {isYesNo && state.value === 'no' && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 ring-1 ring-rose-200">NO</span>
          )}
        </div>
      </header>

      <div className="mt-3">
        <TaskBody
          task={task}
          state={state}
          disabled={submitted}
          update={(p) => updateTask(task.id, p)}
          complete={(v) => completeTask(task.id, v)}
          onYesNoNo={openReasonDisclosures}
        />
      </div>

      {needsReason && (
        <div className="mt-2 bg-amber-50 ring-1 ring-amber-200 text-amber-900 text-xs rounded-lg p-2.5 flex flex-wrap items-center gap-2">
          <span className="flex-1 min-w-0">⚠ Add a note or photo so it can be followed up.</span>
          <button
            onClick={() => { if (noteRef.current) { noteRef.current.open = true; noteRef.current.querySelector('textarea')?.focus(); } }}
            className="text-[11px] font-semibold bg-amber-200 hover:bg-amber-300 text-amber-900 px-2 py-1 rounded"
          >Open note</button>
          <button
            onClick={() => { if (photoRef.current) { photoRef.current.open = true; photoRef.current.querySelector('button')?.focus(); } }}
            className="text-[11px] font-semibold bg-amber-200 hover:bg-amber-300 text-amber-900 px-2 py-1 rounded"
          >Open photo</button>
        </div>
      )}

      {task.type === TASK_TYPES.PHOTO && (
        <div className="mt-2">
          <PhotoUploader taskId={task.id} photos={state.photos || []} disabled={submitted} />
        </div>
      )}

      <div className="mt-3 flex flex-col gap-1.5">
        {task.type !== TASK_TYPES.NOTE && (
          <Disclosure
            innerRef={noteRef}
            label="Note"
            indicator={state.notes?.trim() ? '●' : ''}
          >
            <textarea
              value={state.notes || ''}
              disabled={submitted}
              onChange={e => updateTask(task.id, { notes: e.target.value })}
              placeholder={state.value === 'no' ? 'Why not? Leave a follow-up note…' : 'Notes…'}
              rows={2}
              className="w-full rounded-lg ring-1 ring-slate-200 px-3 py-2 text-base focus:ring-[#0071dc] focus:outline-none disabled:bg-slate-50"
            />
          </Disclosure>
        )}

        {task.type !== TASK_TYPES.PHOTO && (
          <Disclosure
            innerRef={photoRef}
            label="Photo"
            indicator={(state.photos?.length || 0) > 0 ? `${state.photos.length}` : ''}
          >
            <PhotoUploader taskId={task.id} photos={state.photos || []} disabled={submitted} />
          </Disclosure>
        )}
      </div>

      {state.completedAt && (
        <div className="mt-2 text-[11px] text-emerald-700 font-medium">
          ✓ {state.value === 'no' ? 'Answered No' : 'Completed'} {formatTime(state.completedAt)} by {managerLabel(session, state.completedBy)}
        </div>
      )}
    </article>
  );
}

function Disclosure({ innerRef, label, indicator, children }) {
  const hasContent = !!indicator;
  return (
    <details
      ref={innerRef}
      className="group rounded-lg ring-1 ring-slate-200 bg-slate-50 [&[open]]:bg-white [&[open]]:ring-slate-300"
    >
      <summary className="list-none cursor-pointer select-none px-3 py-1.5 text-xs font-medium text-slate-600 flex items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        <svg className="w-3.5 h-3.5 text-slate-400 transition-transform group-open:rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 6 15 12 9 18" />
        </svg>
        <span>{hasContent ? `${label} added` : `Add ${label.toLowerCase()}`}</span>
        {hasContent && indicator !== '●' && (
          <span className="ml-auto inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">
            {indicator}
          </span>
        )}
        {hasContent && indicator === '●' && (
          <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500" />
        )}
      </summary>
      <div className="px-3 pb-3 pt-1">
        {children}
      </div>
    </details>
  );
}

function TaskBody({ task, state, disabled, update, complete, onYesNoNo }) {
  switch (task.type) {
    // All checkbox-style tasks share the Yes/No interaction.
    case TASK_TYPES.CHECKBOX:
    case TASK_TYPES.TIMED_CHECKBOX:
    case TASK_TYPES.YES_NO:
      return (
        <div className="flex gap-2">
          <ToggleButton
            active={state.value === 'yes'}
            disabled={disabled}
            tone="emerald"
            onClick={() => { update({ value: 'yes' }); complete(true); }}
          >Yes</ToggleButton>
          <ToggleButton
            active={state.value === 'no'}
            disabled={disabled}
            tone="rose"
            onClick={() => { update({ value: 'no' }); complete(true); onYesNoNo?.(); }}
          >No</ToggleButton>
        </div>
      );

    case TASK_TYPES.NOTE:
      return (
        <textarea
          value={state.notes || ''}
          disabled={disabled}
          onChange={e => update({ notes: e.target.value })}
          onBlur={() => { if (state.notes?.trim() && !state.completedAt) complete(true); }}
          placeholder="Notes…"
          rows={2}
          className="w-full rounded-lg ring-1 ring-slate-200 px-3 py-2 text-base focus:ring-[#0071dc] focus:outline-none disabled:bg-slate-50"
        />
      );

    case TASK_TYPES.NUMERIC:
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={state.value ?? ''}
            disabled={disabled}
            onChange={e => update({ value: e.target.value })}
            onBlur={() => { if (state.value !== '' && state.value != null && !state.completedAt) complete(true); }}
            className="w-24 rounded-lg ring-1 ring-slate-200 px-3 py-2 text-base disabled:bg-slate-50"
          />
          <span className="text-xs text-slate-500">Enter a number</span>
        </div>
      );

    case TASK_TYPES.TIME:
      return (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="time"
            value={state.value || ''}
            disabled={disabled}
            onChange={e => update({ value: e.target.value })}
            className="rounded-lg ring-1 ring-slate-200 px-3 py-2 text-base disabled:bg-slate-50"
          />
          <button
            disabled={disabled}
            onClick={() => {
              const now = new Date();
              const hh = now.getHours().toString().padStart(2, '0');
              const mm = now.getMinutes().toString().padStart(2, '0');
              update({ value: `${hh}:${mm}` });
              complete(true);
            }}
            className="text-xs font-medium bg-slate-100 hover:bg-slate-200 active:bg-slate-300 px-3 py-2 rounded-lg disabled:opacity-50"
          >Use now</button>
          {state.value && !disabled && (
            <button
              onClick={() => complete(!state.completedAt)}
              className={'text-xs font-medium px-3 py-2 rounded-lg ' + (state.completedAt ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 hover:bg-slate-200')}
            >{state.completedAt ? '✓ Marked done' : 'Mark done'}</button>
          )}
        </div>
      );

    case TASK_TYPES.MULTI_SELECT:
      return (
        <div className="flex flex-wrap gap-2">
          {(task.options || []).map(opt => {
            const selected = (state.value || '').split(',').includes(opt);
            return (
              <button
                key={opt}
                disabled={disabled}
                onClick={() => {
                  const cur = new Set((state.value || '').split(',').filter(Boolean));
                  selected ? cur.delete(opt) : cur.add(opt);
                  update({ value: Array.from(cur).join(',') });
                }}
                className={
                  'px-3 py-1.5 rounded-full text-sm ring-1 ' +
                  (selected ? 'bg-[#0071dc] text-white ring-[#0071dc]' : 'bg-white text-slate-700 ring-slate-200')
                }
              >{opt}</button>
            );
          })}
        </div>
      );

    case TASK_TYPES.PHOTO:
      return null; // photo uploader rendered separately below

    default:
      return <div className="text-xs text-slate-500">Unsupported task type: {task.type}</div>;
  }
}

function ToggleButton({ active, tone, onClick, disabled, children }) {
  const map = {
    emerald: active ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    rose:    active ? 'bg-rose-600 text-white shadow-sm' : 'bg-rose-50 text-rose-800 ring-rose-200',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 py-3 rounded-xl font-semibold text-sm ring-1 ${map[tone]} disabled:opacity-50 active:scale-[0.98] transition`}
    >{children}</button>
  );
}

function ownerToLabel(owner, session) {
  if (owner === OWNERS.MANAGER_1) return managerLabel(session, 'manager1');
  if (owner === OWNERS.MANAGER_2) return managerLabel(session, 'manager2');
  if (owner === OWNERS.SHARED) return 'Shared';
  return 'Unassigned';
}

function OwnerChip({ owner, label }) {
  const tone = {
    [OWNERS.MANAGER_1]: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
    [OWNERS.MANAGER_2]: 'bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200',
    [OWNERS.SHARED]:    'bg-slate-100 text-slate-700 ring-slate-200',
    [OWNERS.UNASSIGNED]:'bg-slate-50 text-slate-500 ring-slate-200',
  }[owner] || 'bg-slate-50 text-slate-500 ring-slate-200';
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded ring-1 text-[10px] font-medium ${tone}`}>{label}</span>;
}
