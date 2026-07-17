import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../store/sessionStore';
import { storage } from '../lib/storage';
import {
  parseAssociates,
  blankAssociate,
  tagDuplicates,
  mergeAssociates,
  toRosterEntry,
  toCsv,
  readFileAsText,
} from '../lib/associateImport';

const SAMPLE = `Paste ClosingList email output, CSV / TSV, JSON, or one name per line.

Closing List — Store 1458 — 2026-06-10

Cashier
  Maria G.: 1:30-10:30pm:
  Devon P.: 2-11pm: CALLED OFF (Sick)`;

const TEMPLATE_CSV = `name,shift,area,accomplishment,notes,manager
Maria G.,1:30-10:30pm,Cashier,,,
Devon P.,2-11pm,Cashier,,CALLED OFF (Sick),
Sam W.,3-11pm,Grocery,,,`;

export default function AssociateImportPanel() {
  const { session, setAssociates, addAssociate, updateAssociate, removeAssociate } = useSession();
  const [text, setText] = useState('');
  const [showImport, setShowImport] = useState(session.associates.length === 0);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [preview, setPreview] = useState(null); // { rows: [{...associate, _dupe}], source: 'paste'|'file'|'roster' }
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const submitted = session.status === 'submitted';

  const storeNumber = useMemo(() => storage.getSettings()?.storeNumber || '', []);
  const [savedRoster, setSavedRoster] = useState(() => storage.getStoreRoster(storeNumber));

  // Refresh roster snapshot when the panel is opened (in case another tab wrote it).
  useEffect(() => {
    if (showImport) setSavedRoster(storage.getStoreRoster(storeNumber));
  }, [showImport, storeNumber]);

  function flash(msg) {
    setInfo(msg);
    setTimeout(() => setInfo(''), 2500);
  }

  function buildPreview(rowsRaw, source) {
    if (!rowsRaw || !rowsRaw.length) {
      setError('Could not find any associates in that input.');
      setPreview(null);
      return;
    }
    setError('');
    const tagged = tagDuplicates(session.associates, rowsRaw);
    setPreview({ rows: tagged, source });
  }

  function doParseText() {
    buildPreview(parseAssociates(text), 'paste');
  }

  async function doPickFile(file) {
    setError('');
    if (!file) return;
    try {
      const raw = await readFileAsText(file);
      const parsed = parseAssociates(raw);
      buildPreview(parsed, 'file');
      if (parsed.length) setText(raw); // let the user tweak text if they want
    } catch (e) {
      setError(`Could not read file: ${e?.message || e}`);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) doPickFile(file);
  }

  function doLoadRoster() {
    const roster = storage.getStoreRoster(storeNumber);
    setSavedRoster(roster);
    if (!roster || !roster.associates?.length) {
      setError('No saved roster for this store yet. Import a list first, then click "Save as store roster".');
      return;
    }
    buildPreview(roster.associates.map(a => ({ ...a })), 'roster');
  }

  function doCommit(strategy) {
    if (!preview) return;
    const merged = mergeAssociates(session.associates, preview.rows, strategy);
    setAssociates(merged);
    setPreview(null);
    setText('');
    setShowImport(false);
    flash(`Imported ${preview.rows.length} row(s) (${strategy}).`);
  }

  function doSaveRoster() {
    const roster = (session.associates || []).map(toRosterEntry).filter(a => a.name);
    if (!roster.length) {
      setError('Nothing to save — the associate list is empty.');
      return;
    }
    const res = storage.saveStoreRoster(storeNumber, roster);
    if (!res.ok) { setError(`Could not save roster: ${res.error}`); return; }
    setSavedRoster(storage.getStoreRoster(storeNumber));
    flash(`Saved ${roster.length} associate(s) as roster for store ${storeNumber || '(default)'}.`);
  }

  function doClearRoster() {
    if (!confirm('Delete the saved roster for this store?')) return;
    storage.clearStoreRoster(storeNumber);
    setSavedRoster(null);
    flash('Saved roster cleared.');
  }

  function doDownloadTemplate() {
    downloadCsv('associates-template.csv', TEMPLATE_CSV);
  }

  function doExportCurrent() {
    if (!session.associates.length) { setError('No associates to export.'); return; }
    downloadCsv(`associates-${session.date?.slice(0,10) || 'export'}.csv`, toCsv(session.associates));
  }

  const dupeCount = preview ? preview.rows.filter(r => r._dupe).length : 0;
  const newCount = preview ? preview.rows.length - dupeCount : 0;

  return (
    <div className="space-y-4">
      {session.associates.length === 0 && (
        <div className="bg-blue-50 ring-1 ring-blue-200 rounded-xl p-3 flex items-start gap-2.5">
          <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          <div className="text-[13px] text-blue-900 leading-snug">
            <span className="font-semibold">Waiting for APAISuite push.</span>{' '}
            Open APAISuite → ClosingList and tap <strong>Collect</strong>. Your roster will show up here automatically. Or paste/upload manually below.
          </div>
        </div>
      )}
      <section className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Associates ({session.associates.length})</h3>
          <div className="flex gap-2 flex-wrap">
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

        {showImport && !preview && (
          <div className="mt-3 space-y-3">
            {/* Quick-action row — the automation win: one-click load from saved store roster. */}
            <div className="flex flex-wrap gap-2 items-center">
              <button
                onClick={doLoadRoster}
                disabled={!savedRoster}
                className="text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                title={savedRoster ? `Load ${savedRoster.associates.length} associate(s) saved for store ${storeNumber || '(default)'}` : 'No saved roster yet'}
              >Load saved roster{savedRoster ? ` (${savedRoster.associates.length})` : ''}</button>
              <button
                onClick={doSaveRoster}
                disabled={!session.associates.length}
                className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg disabled:opacity-50"
                title="Save the current list as the reusable roster for this store"
              >Save current as store roster</button>
              {savedRoster && (
                <button
                  onClick={doClearRoster}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-800 px-2 py-1.5"
                >Clear roster</button>
              )}
              <span className="text-[11px] text-slate-500 ml-auto">
                Store {storeNumber || '(not set)'}{savedRoster ? ` • roster saved ${formatWhen(savedRoster.savedAt)}` : ''}
              </span>
            </div>

            {/* File upload + drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`rounded-lg border-2 border-dashed p-4 text-center text-xs transition-colors ${
                dragOver ? 'border-[#0071dc] bg-blue-50' : 'border-slate-300 bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,.json"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) doPickFile(f); }}
              />
              <div className="text-slate-600">
                <strong>Drop a file</strong> here (.csv, .tsv, .txt, .json) or
                {' '}<button onClick={() => fileInputRef.current?.click()} className="text-[#0071dc] underline font-semibold">choose a file</button>
              </div>
              <div className="mt-1 text-slate-500">
                <button onClick={doDownloadTemplate} className="underline hover:text-slate-700">Download CSV template</button>
                {session.associates.length > 0 && (
                  <>
                    {' '}·{' '}
                    <button onClick={doExportCurrent} className="underline hover:text-slate-700">Export current list</button>
                  </>
                )}
              </div>
            </div>

            {/* Manual paste */}
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
                onClick={doParseText}
                disabled={!text.trim()}
                className="text-xs font-semibold bg-[#0071dc] text-white hover:bg-[#005bb5] px-3 py-1.5 rounded-lg disabled:opacity-50"
              >Preview import</button>
            </div>
            <p className="text-[11px] text-slate-500">
              Accepts the APAISuite <strong>ClosingList</strong> email output (paste straight from the extension),
              CSV / TSV (with or without header — columns auto-detected), JSON, or one name per line.
              Duplicates against the current list are flagged in the preview.
            </p>
          </div>
        )}

        {/* Preview / confirm stage */}
        {showImport && preview && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs font-semibold text-slate-800">
                Preview ({preview.rows.length} row{preview.rows.length === 1 ? '' : 's'} from {sourceLabel(preview.source)})
              </div>
              <div className="text-[11px] text-slate-500">
                <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 mr-1">{newCount} new</span>
                <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{dupeCount} duplicate</span>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg ring-1 ring-slate-200 divide-y divide-slate-100">
              {preview.rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                  <span className={`inline-block w-14 text-[10px] font-bold uppercase tracking-wide ${
                    r._dupe ? 'text-amber-700' : 'text-emerald-700'
                  }`}>{r._dupe ? 'DUPE' : 'NEW'}</span>
                  <span className="flex-1 truncate font-medium text-slate-900">{r.name || '(unnamed)'}</span>
                  <span className="text-slate-500 truncate">{r.area}</span>
                  <span className="text-slate-500 truncate">{r.shift}</span>
                </div>
              ))}
            </div>

            {error && <div className="text-xs text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded p-2">{error}</div>}

            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => setPreview(null)}
                className="text-xs font-semibold bg-white ring-1 ring-slate-200 hover:bg-slate-50 px-3 py-1.5 rounded-lg"
              >Back</button>
              <button
                onClick={() => doCommit('append-skip')}
                className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg"
                title="Add only non-duplicate rows"
              >Append (skip {dupeCount || 'no'} dupes)</button>
              <button
                onClick={() => doCommit('append-merge')}
                disabled={dupeCount === 0}
                className="text-xs font-semibold bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg disabled:opacity-50"
                title="Update matching associates with new shift/area/notes"
              >Merge into duplicates</button>
              <button
                onClick={() => doCommit('replace')}
                className="text-xs font-semibold bg-[#0071dc] text-white hover:bg-[#005bb5] px-3 py-1.5 rounded-lg"
              >Replace list</button>
            </div>
          </div>
        )}

        {info && <div className="mt-3 text-xs text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded p-2">{info}</div>}
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

function sourceLabel(source) {
  if (source === 'file') return 'file';
  if (source === 'roster') return 'saved roster';
  return 'paste';
}

function formatWhen(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays <= 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  } catch { return ''; }
}

function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
