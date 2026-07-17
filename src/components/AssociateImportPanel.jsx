import { useMemo, useState } from 'react';
import { useSession } from '../store/sessionStore';
import { parseAssociates, blankAssociate } from '../lib/associateImport';

const SAMPLE = `Paste ClosingList email output here:

Closing List — Store 1458 — 2026-06-10

Cashier
  Maria G.: 1:30-10:30pm:
  Devon P.: 2-11pm: CALLED OFF (Sick)

— or paste CSV / JSON / one name per line —`;

export default function AssociateImportPanel() {
  const { session, setAssociates, addAssociate, updateAssociate, removeAssociate } = useSession();
  const [text, setText] = useState('');
  const [showImport, setShowImport] = useState(session.associates.length === 0);
  const [error, setError] = useState('');
  const submitted = session.status === 'submitted';

  function doImport(mode) {
    setError('');
    const parsed = parseAssociates(text);
    if (!parsed.length) { setError('Could not find any associates in that text.'); return; }
    if (mode === 'replace') setAssociates(parsed);
    else setAssociates([...session.associates, ...parsed]);
    setText('');
    setShowImport(false);
  }

  return (
    <div className="space-y-4">
      <section className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Associates ({session.associates.length})</h3>
          <div className="flex gap-2">
            <button
              onClick={() => addAssociate(blankAssociate())}
              disabled={submitted}
              className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg disabled:opacity-50"
            >+ Add</button>
            <button
              onClick={() => setShowImport(v => !v)}
              disabled={submitted}
              className="text-xs font-semibold bg-[#0071dc] text-white hover:bg-[#005bb5] px-3 py-1.5 rounded-lg disabled:opacity-50"
            >{showImport ? 'Hide import' : 'Import / paste'}</button>
          </div>
        </div>

        {showImport && (
          <div className="mt-3 space-y-2">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={SAMPLE}
              rows={6}
              className="w-full rounded-lg ring-1 ring-slate-200 px-3 py-2 text-sm font-mono"
            />
            {error && <div className="text-xs text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded p-2">{error}</div>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => doImport('append')}
                className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg"
              >Append</button>
              <button
                onClick={() => doImport('replace')}
                className="text-xs font-semibold bg-[#0071dc] text-white hover:bg-[#005bb5] px-3 py-1.5 rounded-lg"
              >Replace list</button>
            </div>
            <p className="text-[11px] text-slate-500">
              Accepts the APAISuite <strong>ClosingList</strong> email output (paste straight from the extension),
              CSV (with or without header), JSON, or one name per line. The extension's job groups become each
              row's <em>Area</em>; <code>CALLED OFF</code> lands in <em>Notes</em>.
            </p>
          </div>
        )}
      </section>

      {session.associates.length === 0 && !showImport && (
        <div className="bg-white rounded-2xl ring-1 ring-slate-200 p-6 text-center text-sm text-slate-500">
          No associates yet. Paste a list or add them one by one.
        </div>
      )}

      <GroupedAssociates
        associates={session.associates}
        session={session}
        disabled={submitted}
        onChange={(id, patch) => updateAssociate(id, patch)}
        onRemove={(id) => removeAssociate(id)}
      />
    </div>
  );
}

// Group associates by their `area` field, alphabetical, "Unassigned" last.
// Within each group, sort by name (matching APAISuite's render output style).
function GroupedAssociates({ associates, session, disabled, onChange, onRemove }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const a of associates) {
      const key = (a.area || '').trim() || '(Unassigned)';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === '(Unassigned)') return 1;
      if (b === '(Unassigned)') return -1;
      return a.localeCompare(b);
    });
    return keys.map(k => ({
      key: k,
      members: map.get(k).slice().sort((x, y) => (x.name || '').localeCompare(y.name || '')),
    }));
  }, [associates]);

  if (associates.length === 0) return null;

  return (
    <div className="space-y-4">
      {groups.map(g => (
        <section key={g.key}>
          <header className="flex items-baseline justify-between px-1 mb-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">{g.key}</h4>
            <span className="text-[11px] text-slate-400">{g.members.length}</span>
          </header>
          <div className="space-y-2">
            {g.members.map(a => (
              <AssociateRow
                key={a.id}
                associate={a}
                session={session}
                disabled={disabled}
                onChange={(patch) => onChange(a.id, patch)}
                onRemove={() => onRemove(a.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AssociateRow({ associate, session, disabled, onChange, onRemove }) {
  const [open, setOpen] = useState(!associate.name);
  return (
    <div className="bg-white rounded-xl ring-1 ring-slate-200 shadow-sm">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left p-3 flex items-center gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">{associate.name || '(unnamed)'}</div>
          <div className="text-xs text-slate-500 truncate">
            {associate.shift || 'No shift'}
            {associate.accomplishment ? ` — ${associate.accomplishment}` : ''}
            {associate.notes ? <span className="text-rose-700"> · {associate.notes}</span> : null}
          </div>
        </div>
        {!disabled && (
          <button
            onClick={(e) => { e.stopPropagation(); if (confirm('Remove this associate?')) onRemove(); }}
            className="text-rose-600 text-xl px-2"
            aria-label="Remove"
          >×</button>
        )}
      </button>

      {open && (
        <div className="border-t border-slate-100 p-3 grid grid-cols-2 gap-2 bg-slate-50">
          <Field label="Name" full><input value={associate.name} disabled={disabled} onChange={e => onChange({ name: e.target.value })} className="w-full rounded ring-1 ring-slate-200 px-2 py-1.5 text-sm disabled:bg-white" /></Field>
          <Field label="Shift"><input value={associate.shift} disabled={disabled} onChange={e => onChange({ shift: e.target.value })} className="w-full rounded ring-1 ring-slate-200 px-2 py-1.5 text-sm disabled:bg-white" placeholder="e.g. 2-11" /></Field>
          <Field label="Area"><input value={associate.area} disabled={disabled} onChange={e => onChange({ area: e.target.value })} className="w-full rounded ring-1 ring-slate-200 px-2 py-1.5 text-sm disabled:bg-white" /></Field>
          <Field label="Accomplishment" full><input value={associate.accomplishment} disabled={disabled} onChange={e => onChange({ accomplishment: e.target.value })} className="w-full rounded ring-1 ring-slate-200 px-2 py-1.5 text-sm disabled:bg-white" /></Field>
          <Field label="Notes" full><input value={associate.notes} disabled={disabled} onChange={e => onChange({ notes: e.target.value })} className="w-full rounded ring-1 ring-slate-200 px-2 py-1.5 text-sm disabled:bg-white" /></Field>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <label className={`block ${full ? 'col-span-2' : ''}`}>
      <span className="block text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">{label}</span>
      {children}
    </label>
  );
}
