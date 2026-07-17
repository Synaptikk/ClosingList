import { useEffect, useState } from 'react';
import { useSession } from '../store/sessionStore';
import { checklistConfig } from '../config/checklistConfig';
import { computeStatus, STATUS } from '../lib/timeUtils';

export default function DueSoonBanner({ onJumpToChecklist }) {
  const { session } = useSession();
  const [, force] = useState(0);
  useEffect(() => { const iv = setInterval(() => force(x => x + 1), 20000); return () => clearInterval(iv); }, []);
  if (!session || session.status === 'submitted') return null;

  const now = new Date();
  let overdue = 0, dueSoon = 0;
  for (const sec of checklistConfig.sections) {
    for (const t of sec.tasks) {
      if (!t.dueTime) continue;
      const s = computeStatus(t, session.tasks[t.id] || {}, session.date, now);
      if (s === STATUS.OVERDUE) overdue++;
      else if (s === STATUS.DUE_SOON) dueSoon++;
    }
  }
  if (!overdue && !dueSoon) return null;

  return (
    <button
      onClick={onJumpToChecklist}
      className={
        'w-full rounded-xl p-3 text-left text-sm font-semibold ring-1 ' +
        (overdue
          ? 'bg-rose-50 text-rose-900 ring-rose-200'
          : 'bg-amber-50 text-amber-900 ring-amber-200')
      }
    >
      {overdue > 0 ? `${overdue} task${overdue > 1 ? 's' : ''} OVERDUE` : `${dueSoon} task${dueSoon > 1 ? 's' : ''} due soon`}
      {overdue > 0 && dueSoon > 0 && <> · {dueSoon} more due soon</>}
      <span className="float-right">Open →</span>
    </button>
  );
}
