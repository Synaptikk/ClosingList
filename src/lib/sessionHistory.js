// Fetches recent session docs from Firestore. One-shot reads (not subscribed).
// Used by the Report tab to list unsubmitted past nights.

import { doc, getDoc } from 'firebase/firestore';
import { ensureFirebase } from './firebase';

const STORE = '1458';

// Returns an array of { id, dateISO, dateLabel, exists, summary } for the last
// `daysBack` days (today included). Order: newest first.
// `summary` is null if the doc doesn't exist; otherwise
//   { status, complete, total, associates, photos, notes, submittedAt, updatedAt }
export async function fetchRecentSessions(daysBack = 7) {
  const fb = await ensureFirebase();
  if (!fb) return [];

  const today = new Date();
  const days = [];
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    days.push({
      id:        `${STORE}-${iso}`,
      dateISO:   iso,
      dateLabel: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      isToday:   i === 0,
    });
  }

  const results = await Promise.all(
    days.map(async (d) => {
      try {
        const snap = await getDoc(doc(fb.db, 'sessions', d.id));
        if (!snap.exists()) return { ...d, exists: false, summary: null };
        return { ...d, exists: true, summary: summarize(snap.data()) };
      } catch (e) {
        return { ...d, exists: false, summary: null, error: String(e?.message || e) };
      }
    })
  );
  return results;
}

function summarize(data) {
  const tasks = data.tasks || {};
  let complete = 0, total = 0, photos = 0, notes = 0;
  for (const t of Object.values(tasks)) {
    total++;
    if (t?.completedAt) complete++;
    if (t?.photos?.length) photos += t.photos.length;
    if (t?.notes?.trim()) notes++;
  }
  return {
    status:      data.status || 'open',
    complete, total, photos, notes,
    associates:  (data.associates || []).length,
    submittedAt: data.submittedAt || null,
    updatedAt:   data.updatedAt?.toMillis?.() ?? data.updatedAt ?? null,
    managers:    data.managers || {},
  };
}

function pad(n) { return n.toString().padStart(2, '0'); }
