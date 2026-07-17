import { useState } from 'react';
import { useSession } from '../store/sessionStore';
import { storage } from '../lib/storage';
import { normalizeJoinCode } from '../lib/joinCode';

export default function JoinSessionCard() {
  const settings = storage.getSettings();
  // If store number is already saved, skip straight to session step.
  const [step, setStep] = useState(settings.storeNumber ? 'session' : 'store');

  return (
    <div className="min-h-full flex flex-col px-4 pt-6 pb-24">
      <div className="text-center mb-6">
        <div className="inline-block bg-[#0071dc] text-white font-bold text-lg px-4 py-2 rounded-xl">
          Closing Manager Checklist
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Run tonight's close with another manager. Photos, times, notes — all in one report.
        </p>
      </div>

      {step === 'store'
        ? <StoreSetup onDone={() => setStep('session')} />
        : <SessionPanel onChangeStore={() => setStep('store')} />
      }
    </div>
  );
}

// ── Step 1: store number + your name ──────────────────────────────────────

function StoreSetup({ onDone }) {
  const settings = storage.getSettings();
  const [storeNumber, setStoreNumber] = useState(settings.storeNumber || '');
  const [userName, setUserName]       = useState(settings.userName || '');
  const [error, setError]             = useState('');

  function onSave() {
    if (!storeNumber.trim()) { setError('Enter your store number.'); return; }
    if (!userName.trim())    { setError('Enter your name.'); return; }
    storage.saveSettings({ ...settings, storeNumber: storeNumber.trim(), userName: userName.trim() });
    onDone();
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-5 space-y-4">
      <div>
        <h2 className="font-bold text-slate-900 text-base">Set up your store</h2>
        <p className="text-xs text-slate-500 mt-0.5">You only need to do this once per device.</p>
      </div>

      <Field label="Store #">
        <input
          inputMode="numeric"
          value={storeNumber}
          onChange={e => { setStoreNumber(e.target.value); setError(''); }}
          placeholder="e.g. 1458"
          className="w-full rounded-lg ring-1 ring-slate-200 px-3 py-2.5 text-base focus:outline-none focus:ring-[#0071dc]"
        />
      </Field>

      <Field label="Your name">
        <input
          value={userName}
          onChange={e => { setUserName(e.target.value); setError(''); }}
          placeholder="e.g. Sarah"
          className="w-full rounded-lg ring-1 ring-slate-200 px-3 py-2.5 text-base focus:outline-none focus:ring-[#0071dc]"
        />
      </Field>

      {error && (
        <div className="text-sm text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded-lg p-2">{error}</div>
      )}

      <button
        onClick={onSave}
        className="w-full bg-[#0071dc] hover:bg-[#005bb5] active:bg-[#004a96] text-white font-semibold py-3.5 rounded-xl shadow-sm"
      >
        Save &amp; continue →
      </button>
    </div>
  );
}

// ── Step 2: start/join session ─────────────────────────────────────────────

function SessionPanel({ onChangeStore }) {
  const { createSession, joinSession } = useSession();
  const settings = storage.getSettings();
  const [mode, setMode]                 = useState('start');
  const [joinCode, setJoinCode]         = useState('');
  const [marketNumber, setMarketNumber] = useState(settings.marketNumber || '');
  const [error, setError]               = useState('');

  function onCreate() {
    storage.saveSettings({ ...settings, marketNumber });
    createSession({ storeNumber: settings.storeNumber, marketNumber });
  }

  function onJoin() {
    const code = normalizeJoinCode(joinCode);
    if (code.length < 4) { setError('Enter the 6-character code.'); return; }
    const res = joinSession(code);
    if (!res.ok) setError(res.error);
  }

  return (
    <>
      {/* Store identity banner */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="text-sm font-semibold text-slate-800">
          Store {settings.storeNumber}
          {settings.userName
            ? <span className="text-slate-500 font-normal"> · {settings.userName}</span>
            : null}
        </div>
        <button
          onClick={onChangeStore}
          className="text-xs text-[#0071dc] font-medium underline-offset-2 hover:underline"
        >
          Change store
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 overflow-hidden">
        <div className="grid grid-cols-2 text-sm font-semibold">
          <button
            onClick={() => { setMode('start'); setError(''); }}
            className={`py-3 ${mode === 'start' ? 'text-[#0071dc] border-b-2 border-[#0071dc]' : 'text-slate-500 border-b border-slate-200'}`}
          >
            Start new
          </button>
          <button
            onClick={() => { setMode('join'); setError(''); }}
            className={`py-3 ${mode === 'join' ? 'text-[#0071dc] border-b-2 border-[#0071dc]' : 'text-slate-500 border-b border-slate-200'}`}
          >
            Join with code
          </button>
        </div>

        {mode === 'start' ? (
          <div className="p-4 space-y-4">
            <Field label="Market # (optional)">
              <input
                inputMode="numeric"
                value={marketNumber}
                onChange={e => setMarketNumber(e.target.value)}
                className="w-full rounded-lg ring-1 ring-slate-200 px-3 py-2.5 text-base"
              />
            </Field>
            <button
              onClick={onCreate}
              className="w-full bg-[#0071dc] hover:bg-[#005bb5] active:bg-[#004a96] text-white font-semibold py-3.5 rounded-xl shadow-sm"
            >
              Start tonight's session
            </button>
            <p className="text-xs text-slate-500 text-center">
              You'll get a 6-character code to share with the other closing manager.
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <Field label="Join code">
              <input
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
                placeholder="ABC234"
                maxLength={6}
                className="w-full rounded-lg ring-1 ring-slate-200 px-3 py-3 text-center text-2xl tracking-[0.4em] font-bold uppercase"
              />
            </Field>
            <button
              onClick={onJoin}
              className="w-full bg-[#0071dc] hover:bg-[#005bb5] active:bg-[#004a96] text-white font-semibold py-3.5 rounded-xl shadow-sm"
            >
              Join session
            </button>
            {error && (
              <div className="text-sm text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded-lg p-2">{error}</div>
            )}
          </div>
        )}
      </div>

      <RecentSessions />
    </>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function RecentSessions() {
  const { joinSession } = useSession();
  const recent = storage.listSessions().slice(0, 4);
  if (!recent.length) return null;
  return (
    <div className="mt-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 px-1">Recent sessions</div>
      <div className="space-y-2">
        {recent.map(s => (
          <button
            key={s.id}
            onClick={() => joinSession(s.joinCode)}
            className="w-full text-left bg-white ring-1 ring-slate-200 rounded-xl p-3 hover:bg-slate-50 active:bg-slate-100 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900">
                Store {s.storeNumber} · {new Date(s.date).toLocaleDateString()}
              </div>
              <div className="text-xs text-slate-500">
                Code {s.joinCode} · {s.status === 'submitted' ? 'Submitted' : 'Open'}
              </div>
            </div>
            <span className="text-xs text-slate-400">Open →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
