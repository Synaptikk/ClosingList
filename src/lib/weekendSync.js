// Live sync for the Weekend FTPR checklist.
//
// Doc path: weekends/{storeNumber}-{weekOfSaturdayISO}
// One doc per store per weekend. Both Saturday and Sunday state live in the
// same doc under state.saturday / state.sunday so a Sunday manager sees what
// Saturday's crew already did.
//
// Design goals (modeled on sessionSync.js):
//   1. Subscribe with onSnapshot for live push from Firestore.
//   2. Diff-aware writes with dot-notation paths — a single checkbox flip
//      sends ~80 bytes, not the whole 2-day tree.
//   3. Debounce writes (350ms) so bursts of typing / rapid clicks coalesce.
//   4. Echo suppression via _writeToken so our own write coming back through
//      the snapshot doesn't reapply itself onto local state.
//   5. Field-level last-write-wins. Two managers toggling the same checkbox
//      each write dot-path `state.saturday.slot_a.checks.wet_wall = true|false`
//      — Firestore serializes, the last one wins, both clients see the same
//      final value on the next snapshot round-trip.
//   6. Photos are kept SMALL in the doc: only { id, downloadUrl, storagePath,
//      addedAt, addedBy }. The heavy base64 dataUrl lives only in Storage.
//      On snapshot receipt we set dataUrl = downloadUrl so the existing
//      <img src={p.dataUrl}> render path keeps working unchanged.

import { doc, getDoc, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const DEBOUNCE_MS = 350;

export function createWeekendSync({ db, docId, getState, applyRemote, onStatus }) {
  const ref = doc(db, 'weekends', docId);

  let lastSyncedSnapshot = null;   // serialized state at last successful push or remote apply
  let pendingTimer = null;
  let unsubscribe = null;
  let pendingWriteTokens = new Set();
  let destroyed = false;

  function setStatus(s) { try { onStatus?.(s); } catch {} }

  async function ensureDoc() {
    // Never blindly overwrite — another manager may have already populated it.
    try {
      setStatus('syncing');
      const existing = await getDoc(ref);
      if (existing.exists()) {
        const data = existing.data();
        lastSyncedSnapshot = deepCopy(data.state || {});
        // Hand the initial state to the store so it hydrates from the cloud.
        applyRemote(data.state || {});
        setStatus('synced');
        return;
      }
      // Fresh doc — seed with the current local state (may be empty init).
      const local = getState();
      if (!local) return;
      const serialized = serializeState(local);
      await setDoc(ref, {
        state: serialized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      lastSyncedSnapshot = deepCopy(serialized);
      setStatus('synced');
    } catch (e) {
      console.warn('[weekend-sync] ensureDoc failed', e);
      setStatus('error');
    }
  }

  function startSubscription() {
    unsubscribe = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const remote = snap.data();
      const tok = remote.writeToken;
      if (tok != null && pendingWriteTokens.has(tok)) {
        pendingWriteTokens.delete(tok);
        lastSyncedSnapshot = deepCopy(remote.state || {});
        setStatus('synced');
        return;
      }
      lastSyncedSnapshot = deepCopy(remote.state || {});
      applyRemote(remote.state || {});
      setStatus('synced');
    }, (err) => {
      console.warn('[weekend-sync] snapshot error', err);
      setStatus('error');
    });
  }

  function schedulePush() {
    if (destroyed) return;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(flushPush, DEBOUNCE_MS);
  }

  async function flushPush() {
    if (destroyed) return;
    const current = getState();
    if (!current) return;
    const serialized = serializeState(current);
    // Build diff under `state.` prefix so dot-notation targets nested fields
    // in the doc, not the doc root.
    const diff = {};
    if (!lastSyncedSnapshot) {
      // First push after subscription started but before ensureDoc completed —
      // just send the whole thing.
      diff['state'] = serialized;
    } else {
      walkDiff(lastSyncedSnapshot, serialized, 'state', diff);
    }
    if (Object.keys(diff).length === 0) return;
    try {
      setStatus('syncing');
      const token = Date.now() + Math.floor(Math.random() * 1000);
      diff['writeToken'] = token;
      diff['updatedAt'] = serverTimestamp();
      pendingWriteTokens.add(token);
      if (pendingWriteTokens.size > 10) {
        pendingWriteTokens = new Set([...pendingWriteTokens].slice(-5));
      }
      await updateDoc(ref, diff).catch(async (err) => {
        // If doc doesn't exist yet (race with ensureDoc), fall back to setDoc.
        if (err?.code === 'not-found') {
          await setDoc(ref, {
            state: serialized,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            writeToken: token,
          });
        } else {
          throw err;
        }
      });
      lastSyncedSnapshot = deepCopy(serialized);
      setStatus('synced');
    } catch (e) {
      console.warn('[weekend-sync] flushPush failed', e, Object.keys(diff));
      setStatus('error');
    }
  }

  async function init() {
    await ensureDoc();
    startSubscription();
  }

  function destroy() {
    destroyed = true;
    clearTimeout(pendingTimer);
    if (unsubscribe) unsubscribe();
    pendingWriteTokens.clear();
  }

  return { init, schedulePush, flushPush, destroy };
}

// ---------------------------------------------------------------------------
// Serialization: strip volatile / local-only fields.
// Photos: drop dataUrl (would blow the 1 MB doc limit). Only keep cloud refs.
// If a photo hasn't finished uploading yet (no storagePath / downloadUrl), we
// skip it — it'll get published on the next debounce tick after upload completes.
// ---------------------------------------------------------------------------
function serializeState(state) {
  const out = {};
  for (const [day, slots] of Object.entries(state || {})) {
    out[day] = {};
    for (const [slotId, slot] of Object.entries(slots || {})) {
      const photos = {};
      for (const [itemId, arr] of Object.entries(slot.photos || {})) {
        const cloud = (arr || [])
          .filter(p => p && (p.storagePath || p.downloadUrl))
          .map(p => ({
            id: p.id,
            storagePath: p.storagePath || null,
            downloadUrl: p.downloadUrl || null,
            addedAt: p.addedAt || null,
            addedBy: p.addedBy || null,
          }));
        if (cloud.length) photos[itemId] = cloud;
      }
      out[day][slotId] = {
        name: slot.name || '',
        assignees: slot.assignees || {},
        checks: slot.checks || {},
        notes: slot.notes || {},
        photos,
      };
    }
  }
  return out;
}

function walkDiff(a, b, prefix, out) {
  if (b === a) return;
  if (!isPlainObject(a) || !isPlainObject(b)) {
    if (!scalarEqual(a, b)) out[prefix] = b;
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const path = prefix ? `${prefix}.${sanitizeKey(k)}` : sanitizeKey(k);
    if (a[k] === b[k]) continue;
    if (isPlainObject(a[k]) && isPlainObject(b[k])) {
      walkDiff(a[k], b[k], path, out);
    } else if (Array.isArray(a[k]) && Array.isArray(b[k])) {
      if (!arraysEqual(a[k], b[k])) out[path] = b[k];
    } else {
      if (!scalarEqual(a[k], b[k])) out[path] = b[k];
    }
  }
}

// Dot-notation paths in Firestore can't contain literal dots in field names,
// but our itemIds are all safe (snake_case). Just a defensive no-op that
// leaves everything alone.
function sanitizeKey(k) {
  return String(k);
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && v.constructor === Object;
}
function scalarEqual(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return false;
}
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
function deepCopy(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

// ---------------------------------------------------------------------------
// Weekend doc id: {storeNumber}-{weekOfSaturdayISO}.
// weekOfSaturdayISO is the ISO date (YYYY-MM-DD) of the Saturday for the
// weekend currently in view. Sat → today, Sun → yesterday, everything else
// → the upcoming Saturday (Fri crew prepping for the weekend still gets
// grouped with Sat/Sun).
// ---------------------------------------------------------------------------
export function weekendDocId(storeNumber, now = new Date()) {
  const sat = saturdayOf(now);
  const y = sat.getFullYear();
  const m = String(sat.getMonth() + 1).padStart(2, '0');
  const d = String(sat.getDate()).padStart(2, '0');
  return `${storeNumber}-${y}-${m}-${d}`;
}

export function weekOfSaturday(now = new Date()) {
  const sat = saturdayOf(now);
  const y = sat.getFullYear();
  const m = String(sat.getMonth() + 1).padStart(2, '0');
  const d = String(sat.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function saturdayOf(now) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = d.getDay(); // 0 Sun, 6 Sat
  if (dow === 6) return d;                                           // today = Sat
  if (dow === 0) { d.setDate(d.getDate() - 1); return d; }           // Sun → yesterday
  // Mon–Fri: upcoming Sat
  d.setDate(d.getDate() + (6 - dow));
  return d;
}
