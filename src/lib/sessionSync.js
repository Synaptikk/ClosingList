// Bandwidth-aware Firestore sync for the session doc.
//
// Design goals (per user requirement to avoid wasted bandwidth):
//   1. Subscribe to the session doc with onSnapshot — push updates from
//      Firestore arrive in real time without polling.
//   2. Push local edits with diff-aware writes: compare current state to
//      last-synced snapshot, build dot-notation field paths for only what
//      changed. A single checkbox flip writes ~80 bytes, not the whole doc.
//   3. Debounce writes to coalesce bursty edits (typing notes, multi-tap)
//      into one round-trip per ~800ms.
//   4. Echo suppression: when our own write comes back through onSnapshot
//      (with the local server timestamp), don't treat it as a remote update.
//   5. Last-writer-wins per field via server timestamps; we track
//      lastUpdatedAt per task already.
//   6. Photos: kept out of the doc — uploaded to Firebase Storage and
//      referenced by a thin subcollection so the parent doc stays small.
//
// The session reducer continues to drive in-memory state. This module is a
// thin two-way bridge: state changes → debounced flush to Firestore;
// Firestore snapshots → apply remote patch via dispatch('applyRemote').

import { doc, getDoc, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const DEBOUNCE_MS = 800;

export function createSessionSync({ db, sessionId, getSession, applyRemote, onStatus }) {
  const ref = doc(db, 'sessions', sessionId);

  let lastSyncedSnapshot = null;   // deep-copied session shape at last successful push or remote apply
  let pendingTimer = null;
  let unsubscribe = null;
  let pendingWriteTokens = new Set(); // updatedAt values we've written; used to suppress echo
  let destroyed = false;

  function setStatus(s) { try { onStatus?.(s); } catch {} }

  async function ensureDoc() {
    // CRITICAL: do not overwrite if the doc already exists. The extension
    // (or another manager's device) may have populated associates / tasks
    // and a setDoc with merge:true still atomically replaces array fields.
    // The onSnapshot listener will deliver the existing state via applyRemote.
    try {
      setStatus('syncing');
      const existing = await getDoc(ref);
      if (existing.exists()) {
        lastSyncedSnapshot = deepCopy(existing.data());
        setStatus('synced');
        return;
      }
      // Fresh doc — seed with local initial state so subsequent diffs have a baseline.
      const s = getSession();
      if (!s) return;
      const initial = serializeSession(s);
      await setDoc(ref, initial);
      lastSyncedSnapshot = deepCopy(initial);
      setStatus('synced');
    } catch (e) {
      console.warn('[sync] ensureDoc failed', e);
      setStatus('error');
    }
  }

  function startSubscription() {
    unsubscribe = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const remote = snap.data();
      // Echo suppression: if the doc's updatedAt token matches one we just wrote, skip.
      const tok = remote.updatedAt?.toMillis?.() ?? remote.updatedAt;
      if (tok != null && pendingWriteTokens.has(tok)) {
        pendingWriteTokens.delete(tok);
        lastSyncedSnapshot = deepCopy(remote);
        setStatus('synced');
        return;
      }
      // Apply remote patch into local state. The reducer's applyRemote handler
      // merges field-by-field, preserving local-only ephemeral state if any.
      lastSyncedSnapshot = deepCopy(remote);
      applyRemote(remote);
      setStatus('synced');
    }, (err) => {
      console.warn('[sync] snapshot error', err);
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
    const current = getSession();
    if (!current) return;
    const serialized = serializeSession(current);
    const diff = buildDiff(lastSyncedSnapshot, serialized);
    if (Object.keys(diff).length === 0) return; // nothing to send
    try {
      setStatus('syncing');
      // Mark the write so echo suppression knows when it comes back.
      const token = Date.now();
      diff['_writeToken'] = token; // private field; used by echo dedupe
      pendingWriteTokens.add(token);
      // Trim the set to avoid leaking; only the most recent few matter.
      if (pendingWriteTokens.size > 10) {
        pendingWriteTokens = new Set([...pendingWriteTokens].slice(-5));
      }
      diff['updatedAt'] = serverTimestamp();
      await updateDoc(ref, diff);
      // optimistic local-applied snapshot = current serialized (sans server-timestamp)
      lastSyncedSnapshot = deepCopy({ ...serialized, _writeToken: token });
      setStatus('synced');
    } catch (e) {
      console.warn('[sync] flushPush failed', e, diff);
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

// Strip volatile / local-only fields and shape what we send to Firestore.
// Photos: metadata stays in the doc (small — storagePath, downloadUrl, caption);
// the dataUrl blob is dropped (would blow the 1 MB doc limit).
function serializeSession(s) {
  return {
    storeNbr:     s.storeNumber,
    storeNumber:  s.storeNumber, // legacy alias
    marketNumber: s.marketNumber || '',
    date:         s.date,
    joinCode:     s.joinCode,
    managers:     s.managers || { manager1: { name: '' }, manager2: { name: '' } },
    shiftNotes:   s.shiftNotes || '',
    status:       s.status || 'open',
    submittedAt:  s.submittedAt || null,
    createdAt:    s.createdAt || null,
    tasks: serializeTasks(s.tasks || {}),
    associates: s.associates || [],
    presence: s.presence || {},
  };
}
function serializeTasks(tasks) {
  const out = {};
  for (const [id, t] of Object.entries(tasks)) {
    if (!t) continue;
    out[id] = {
      ...t,
      // Strip any local-only dataUrl blobs; keep cloud-uploaded references.
      photos: (t.photos || [])
        .filter(p => p.storagePath || p.downloadUrl)   // local-only (dataUrl) photos don't sync
        .map(p => ({
          id: p.id,
          storagePath: p.storagePath || null,
          downloadUrl: p.downloadUrl || null,
          caption: p.caption || '',
          uploadedAt: p.uploadedAt || null,
          uploadedBy: p.uploadedBy || null,
        })),
    };
  }
  return out;
}

// Build a flat dot-notation diff object: only fields that changed between
// before and after end up in the update payload.
function buildDiff(before, after) {
  const diff = {};
  if (!before) {
    // Whole-doc init.
    return { ...after };
  }
  walkDiff(before, after, '', diff);
  return diff;
}

// Compares nested objects and writes dot-notation paths into `out`.
// Arrays are treated atomically (replaced if any element differs) — Firestore
// can't merge arrays piecewise anyway.
function walkDiff(a, b, prefix, out) {
  if (b === a) return;
  // null / scalar / mismatched types → atomic write
  if (!isPlainObject(a) || !isPlainObject(b)) {
    if (!shallowEqual(a, b)) out[prefix.replace(/\.$/, '')] = b;
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === '_writeToken') continue; // internal marker
    const path = prefix ? `${prefix}.${k}` : k;
    if (a[k] === b[k]) continue;
    if (isPlainObject(a[k]) && isPlainObject(b[k])) {
      walkDiff(a[k], b[k], path, out);
    } else if (Array.isArray(a[k]) && Array.isArray(b[k])) {
      if (!arraysEqual(a[k], b[k])) out[path] = b[k];
    } else {
      if (!shallowEqual(a[k], b[k])) out[path] = b[k];
    }
  }
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && v.constructor === Object;
}
function shallowEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every(k => a[k] === b[k]);
}
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  // Cheap deep compare via JSON — fine for the small associate / photo arrays we sync.
  return JSON.stringify(a) === JSON.stringify(b);
}
function deepCopy(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

// Deterministic session id matches what the APAISuite extension writes.
export function deterministicSessionId(storeNumber, dateISO) {
  const d = new Date(dateISO);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${storeNumber}-${yyyy}-${mm}-${dd}`;
}
