/**
 * Firebase Scheduled Cloud Function — Daily Closing Report Email
 *
 * Sends a closing-checklist summary email via Outlook / Microsoft 365 SMTP
 * to a configurable list of recipients at a scheduled time.
 *
 * ── One-time setup ────────────────────────────────────────────────────────
 *
 * 1. Switch Firebase project to Blaze (pay-as-you-go) plan.
 *    Scheduled functions require Blaze; the free quota is included.
 *
 * 2. Create the config document in Firestore (Firebase Console → Firestore):
 *      Collection : config
 *      Document   : emailSettings
 *      Fields:
 *        enabled    : true                          (boolean)
 *        smtpUser   : "you@walmart.com"             (string)
 *        smtpPass   : "your-outlook-app-password"   (string — NOT your login password)
 *        recipients : ["dm@example.com", "ops@example.com"]  (array of strings)
 *        stores     : ["1458", "2001"]              (array of store number strings)
 *
 *    To get an Outlook App Password:
 *      → account.microsoft.com → Security → Advanced security options → App passwords
 *
 * 3. Deploy:
 *      npm install -g firebase-tools   (if not already installed)
 *      firebase login
 *      firebase deploy --only functions
 *
 * 4. Adjust the schedule:
 *    Default cron below is "0 3 * * *" = 3:00 AM UTC = 10:00 PM EDT / 9:00 PM CDT.
 *    Edit sendDailyClosingReport's schedule string, then redeploy, OR
 *    change the schedule in Firebase Console → Functions → sendDailyClosingReport
 *    → Edit → Schedule.
 *
 * ── How it works ──────────────────────────────────────────────────────────
 * At the scheduled time the function:
 *   1. Reads config/emailSettings from Firestore.
 *   2. For each store number listed, looks up today's session doc
 *      ({storeNbr}-{YYYY-MM-DD}).
 *   3. If the session exists and is non-empty, sends an email summary.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp }  = require('firebase-admin/app');
const { getFirestore }   = require('firebase-admin/firestore');
const nodemailer         = require('nodemailer');

initializeApp();

// ── Scheduled function ────────────────────────────────────────────────────

exports.sendDailyClosingReport = onSchedule(
  {
    schedule: '0 3 * * *',  // 3:00 AM UTC ≈ 10 PM EDT / 9 PM CDT
    timeZone: 'America/Chicago',
    region: 'us-central1',
  },
  async () => {
    const db = getFirestore();

    // Load email config from Firestore (Admin SDK bypasses security rules).
    const cfgSnap = await db.doc('config/emailSettings').get();
    if (!cfgSnap.exists) {
      console.log('[email] config/emailSettings not found — skipping.');
      return;
    }
    const cfg = cfgSnap.data();
    if (!cfg.enabled) {
      console.log('[email] disabled in config — skipping.');
      return;
    }

    const stores     = Array.isArray(cfg.stores)     ? cfg.stores     : [];
    const recipients = Array.isArray(cfg.recipients) ? cfg.recipients : [];
    if (!stores.length || !recipients.length) {
      console.warn('[email] stores or recipients empty — skipping.');
      return;
    }

    // Today in Central time.
    const today = new Date()
      .toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); // YYYY-MM-DD

    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
      tls: { ciphers: 'SSLv3' },
    });

    for (const store of stores) {
      const sessionId = `${store}-${today}`;
      const snap = await db.doc(`sessions/${sessionId}`).get();

      if (!snap.exists) {
        console.log(`[email] no session for ${sessionId} — skipping store ${store}.`);
        continue;
      }

      const session = snap.data();
      const subject = buildSubject(store, today);
      const text    = buildBody(store, today, session);

      try {
        await transporter.sendMail({
          from:    cfg.smtpUser,
          to:      recipients.join(', '),
          subject,
          text,
        });
        console.log(`[email] sent for store ${store} to ${recipients.join(', ')}`);
      } catch (err) {
        console.error(`[email] failed for store ${store}:`, err.message);
      }
    }
  }
);

// ── Helpers ───────────────────────────────────────────────────────────────

function buildSubject(store, date) {
  const [y, m, d] = date.split('-');
  return `Store ${store} Closing Report — ${m}/${d}/${y}`;
}

function buildBody(store, date, session) {
  const m1 = managerName(session, 'manager1');
  const m2 = managerName(session, 'manager2');
  const lines = [
    `Store ${store} Closing Report`,
    `Date: ${date}`,
    `Managers: ${m1}${m2 ? ` & ${m2}` : ''}`,
    `Status: ${session.status || 'open'}`,
    '',
  ];

  const tasks = session.tasks || {};
  let total = 0, complete = 0, photos = 0;
  const sectionLines = [];

  // Summarize tasks section by section.
  const sections = getSectionOrder(session);
  for (const { title, taskIds } of sections) {
    const taskRows = [];
    for (const id of taskIds) {
      const t = tasks[id];
      if (!t) continue;
      total++;
      const done = isComplete(t);
      if (done) complete++;
      photos += (t.photos || []).length;
      const glyph = done ? '[x]' : '[ ]';
      const extra = [];
      if (t.completedAt) extra.push(`done ${shortTime(t.completedAt)}`);
      if (t.notes?.trim()) extra.push(t.notes.trim().slice(0, 80));
      if ((t.photos || []).length) extra.push(`${t.photos.length} photo(s)`);
      taskRows.push(`  ${glyph} ${id}${extra.length ? ' — ' + extra.join(' · ') : ''}`);
    }
    if (taskRows.length) {
      sectionLines.push(`== ${title} ==`);
      sectionLines.push(...taskRows);
      sectionLines.push('');
    }
  }

  lines.push(`Summary: ${complete}/${total} complete · ${photos} photo(s)`);
  if (session.shiftNotes?.trim()) {
    lines.push('');
    lines.push('Shift notes:');
    lines.push(session.shiftNotes.trim());
  }
  lines.push('');
  lines.push(...sectionLines);
  lines.push(`Generated by Closing Manager Checklist · ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT`);
  return lines.join('\n');
}

function managerName(session, key) {
  return session?.managers?.[key]?.name?.trim() || '';
}

function isComplete(taskState) {
  if (taskState.completedAt) return true;
  const v = taskState.value;
  return v === true || v === 'yes' || v === 'done' || v === 'complete';
}

function shortTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago',
  });
}

// Returns sections with their task id lists in a predictable order,
// derived from whatever task ids exist in the session snapshot.
function getSectionOrder(session) {
  const prefixOrder = [
    'food', 'ogp', 'gm', 'app', 'cons', 'fe', 'truck', 'saf', 'hand', 'notes',
  ];
  const buckets = {};
  for (const id of Object.keys(session.tasks || {})) {
    const prefix = id.split('_')[0];
    if (!buckets[prefix]) buckets[prefix] = [];
    buckets[prefix].push(id);
  }
  const result = [];
  for (const p of prefixOrder) {
    if (buckets[p]) {
      result.push({ title: sectionTitle(p), taskIds: buckets[p].sort() });
      delete buckets[p];
    }
  }
  for (const [p, ids] of Object.entries(buckets)) {
    result.push({ title: sectionTitle(p), taskIds: ids.sort() });
  }
  return result;
}

const TITLES = {
  food: 'Food', ogp: 'Digital / OGP', gm: 'General Merchandise',
  app: 'Apparel', cons: 'Consumables', fe: 'Front End / Service',
  truck: 'Truck / Backroom', saf: 'Safety / Compliance',
  hand: 'Third Shift Handoff', notes: 'Important Notes',
};

function sectionTitle(prefix) {
  return TITLES[prefix] || prefix.toUpperCase();
}
