import { useEffect, useRef, useState } from 'react';
import { useSession } from '../store/sessionStore';
import ReportPreview from '../components/ReportPreview';
import { exportReportToPdf, defaultPdfFilename } from '../lib/pdfExport';
import { openMailto, copyEmailToClipboard, buildEmailSubject, buildEmailBody } from '../lib/emailExport';
import { fetchRecentSessions } from '../lib/sessionHistory';

export default function ReportView() {
  const { session, submitSession, mode } = useSession();
  const reportRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  if (!session) return null;
  const submitted = session.status === 'submitted';

  async function doPdf() {
    setBusy('pdf'); setToast('');
    try {
      const { pages } = await exportReportToPdf(reportRef.current, defaultPdfFilename(session));
      setToast(`PDF saved (${pages} page${pages > 1 ? 's' : ''}).`);
    } catch (e) {
      setToast(`PDF failed: ${e?.message || e}`);
    } finally {
      setBusy('');
    }
  }

  async function doCopyEmail() {
    setBusy('copy'); setToast('');
    try {
      await copyEmailToClipboard(session);
      setToast('Email copied to clipboard.');
    } catch (e) {
      setToast(`Copy failed: ${e?.message || e}`);
    } finally {
      setBusy('');
    }
  }

  function doMailto() {
    openMailto(session);
  }

  function doSubmit() {
    if (submitted) return;
    if (!confirm('Lock this checklist as submitted? You will no longer be able to edit it.')) return;
    submitSession();
    setToast('Submitted. Checklist is now read-only.');
  }

  return (
    <div className="px-4 pt-4 pb-32 space-y-4">
      <section className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm p-4 space-y-3 no-print">
        <h3 className="text-sm font-semibold text-slate-800">Export & submit</h3>

        <div className="grid grid-cols-1 gap-2">
          <button
            onClick={doPdf}
            disabled={busy !== ''}
            className="w-full bg-[#0071dc] hover:bg-[#005bb5] active:bg-[#004a96] text-white font-semibold py-3 rounded-xl shadow-sm disabled:opacity-60"
          >
            {busy === 'pdf' ? 'Generating PDF…' : 'Export PDF for leadership'}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={doMailto}
              className="bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold py-2.5 rounded-xl"
            >Open email draft</button>
            <button
              onClick={doCopyEmail}
              disabled={busy !== ''}
              className="bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold py-2.5 rounded-xl disabled:opacity-60"
            >{busy === 'copy' ? 'Copying…' : 'Copy email'}</button>
          </div>
          <button
            onClick={() => setShowEmailPreview(v => !v)}
            className="text-xs font-medium text-slate-500 underline self-center"
          >{showEmailPreview ? 'Hide' : 'Preview'} email body</button>
        </div>

        {showEmailPreview && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Subject</div>
            <div className="bg-slate-50 ring-1 ring-slate-200 rounded p-2 text-xs font-mono break-all">
              {buildEmailSubject(session)}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Body</div>
            <pre className="bg-slate-50 ring-1 ring-slate-200 rounded p-2 text-[11px] font-mono whitespace-pre-wrap max-h-72 overflow-auto">
              {buildEmailBody(session)}
            </pre>
          </div>
        )}

        <hr className="border-slate-100" />

        <button
          onClick={doSubmit}
          disabled={submitted}
          className={
            'w-full font-semibold py-3 rounded-xl shadow-sm ' +
            (submitted
              ? 'bg-emerald-100 text-emerald-800 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white')
          }
        >
          {submitted ? '✓ Submitted (locked)' : 'Submit checklist (lock edits)'}
        </button>
        {toast && <div className="text-xs text-slate-700 bg-slate-100 ring-1 ring-slate-200 rounded p-2">{toast}</div>}
      </section>

      {mode === 'cloud' && <PastUnsubmittedNights currentId={session.id} />}

      <section>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 px-1 no-print">Leadership preview</div>
        <div className="rounded-2xl ring-1 ring-slate-200 bg-white overflow-hidden shadow-sm">
          <ReportPreview innerRef={reportRef} />
        </div>
      </section>
    </div>
  );
}

function PastUnsubmittedNights({ currentId }) {
  const { openSessionForDate } = useSession();
  const [items, setItems] = useState(null);  // null = loading
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchRecentSessions(7)
      .then(r => { if (!cancelled) setItems(r); })
      .catch(e => { if (!cancelled) setError(String(e?.message || e)); });
    return () => { cancelled = true; };
  }, [currentId]); // refetch when user switches sessions

  // Show only past, unsubmitted nights with at least some content.
  const past = (items || []).filter(d =>
    !d.isToday &&
    d.exists &&
    d.summary?.status !== 'submitted'
  );

  if (items === null) {
    return <section className="text-xs text-slate-500 text-center py-3">Checking past nights…</section>;
  }
  if (error) {
    return <section className="text-xs text-rose-700 bg-rose-50 ring-1 ring-rose-200 rounded p-2">{error}</section>;
  }
  if (past.length === 0) {
    return (
      <section className="text-xs text-slate-500 text-center py-3 no-print">
        No unsubmitted nights in the last 7 days.
      </section>
    );
  }

  return (
    <section className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm overflow-hidden no-print">
      <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Unsubmitted past nights</h3>
        <span className="text-xs text-slate-500">{past.length}</span>
      </header>
      <ul className="divide-y divide-slate-100">
        {past.map(d => {
          const s = d.summary;
          const pct = s.total ? Math.round((s.complete / s.total) * 100) : 0;
          const isCurrent = d.id === currentId;
          return (
            <li key={d.id}>
              <button
                disabled={isCurrent}
                onClick={() => openSessionForDate(d.dateISO)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{d.dateLabel}</div>
                  <div className="text-xs text-slate-500">
                    {s.complete}/{s.total} tasks · {s.associates} associates
                    {s.photos ? ` · ${s.photos} photos` : ''}
                    {s.notes ? ` · ${s.notes} notes` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-900">{pct}%</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">
                    {isCurrent ? 'viewing' : 'open →'}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">
        Click a night to open and submit it.
      </div>
    </section>
  );
}
