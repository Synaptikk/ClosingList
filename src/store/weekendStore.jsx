import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { WEEKEND_DAYS, SLOTS, WEEKEND_SECTIONS } from '../config/weekendConfig';
import { storage } from '../lib/storage';
import { ensureFirebase, isFirebaseConfigured, firebaseState } from '../lib/firebase';
import { createWeekendSync, weekendDocId, weekOfSaturday } from '../lib/weekendSync';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';

// Per-store persistence key. Different stores keep separate progress.
// This is the OFFLINE CACHE — cloud is the source of truth when configured.
const STORAGE_KEY = (storeNumber) => `cmc:weekend:${storeNumber || 'unset'}`;

// Shape for one day+slot combo:
// {
//   name: string,                        // deprecated; kept for backwards compat with older localStorage payloads
//   assignees: { [sectionId]: string },  // per-section associate for THIS slot on THIS day
//   checks: { [itemId]: bool },
//   photos: { [itemId]: Photo[] },
//   notes:  { [itemId]: string },
// }
// Photo shape (live in-memory):
//   { id, dataUrl, addedAt, addedBy, storagePath?, downloadUrl?, uploading? }
// Cloud shape (in Firestore): { id, storagePath, downloadUrl, addedAt, addedBy }
// After a remote snapshot we normalize by setting dataUrl = downloadUrl so the
// existing WeekendView <img src={p.dataUrl}> render path works unchanged.
//
// Full state: { [day]: { [slotId]: SlotState } }

function initDay() {
  const day = {};
  for (const slot of SLOTS) {
    day[slot.id] = { name: '', assignees: {}, checks: {}, photos: {}, notes: {} };
  }
  return day;
}

function initState() {
  const s = {};
  for (const day of WEEKEND_DAYS) s[day] = initDay();
  return s;
}

function loadState(storeNumber) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(storeNumber));
    if (!raw) return initState();
    const parsed = JSON.parse(raw);
    return mergeIntoInit(parsed);
  } catch {
    return initState();
  }
}

// Defensive merge — ensures all days/slots exist even if the saved shape is stale
// or partial. Used both for localStorage rehydration and for absorbing remote
// snapshots (backward-compatible with the pre-cloud localStorage format).
function mergeIntoInit(parsed) {
  const merged = initState();
  for (const day of WEEKEND_DAYS) {
    if (!parsed?.[day]) continue;
    for (const slot of SLOTS) {
      const src = parsed[day][slot.id];
      if (!src) continue;
      merged[day][slot.id] = {
        name:      src.name      || '',
        assignees: src.assignees || {},
        checks:    src.checks    || {},
        photos:    normalizePhotos(src.photos),
        notes:     src.notes     || {},
      };
    }
  }
  return merged;
}

// Ensure incoming remote photos have a `dataUrl` field so the existing UI
// (which renders <img src={p.dataUrl}>) shows cloud photos without changes.
function normalizePhotos(photosByItem) {
  const out = {};
  for (const [itemId, arr] of Object.entries(photosByItem || {})) {
    out[itemId] = (arr || []).map(p => ({
      ...p,
      dataUrl: p.dataUrl || p.downloadUrl || '',
    }));
  }
  return out;
}

// Reconcile a local photo array with a remote one. Preserves local-only photos
// still mid-upload (no storagePath yet) so a photo you just took doesn't
// disappear when the snapshot arrives before its upload finishes.
function mergePhotosForItem(localArr, remoteArr) {
  const local = localArr || [];
  const remote = (remoteArr || []).map(p => ({ ...p, dataUrl: p.dataUrl || p.downloadUrl || '' }));
  const remoteIds = new Set(remote.map(p => p.id));
  // Keep any local photo that hasn't yet appeared in the remote array
  // (typically: still uploading, or uploaded but debounce not flushed).
  const localOnly = local.filter(p => !remoteIds.has(p.id));
  // For photos that ARE in remote, prefer remote (has downloadUrl) but keep
  // the local dataUrl if remote lacks one (shouldn't happen, defensive).
  const merged = remote.map(rp => {
    const lp = local.find(x => x.id === rp.id);
    if (lp && lp.dataUrl && !rp.downloadUrl) return { ...rp, dataUrl: lp.dataUrl };
    return rp;
  });
  return [...merged, ...localOnly];
}

// Apply a remote state snapshot on top of local state. Field-level merge:
// for each (day, slot), take the remote value; for photos specifically,
// reconcile per-item so local-only pending photos survive.
function mergeRemoteIntoLocal(local, remote) {
  const out = initState();
  for (const day of WEEKEND_DAYS) {
    for (const slot of SLOTS) {
      const l = local?.[day]?.[slot.id] || {};
      const r = remote?.[day]?.[slot.id] || {};
      const photos = {};
      const allItemIds = new Set([
        ...Object.keys(l.photos || {}),
        ...Object.keys(r.photos || {}),
      ]);
      for (const itemId of allItemIds) {
        const arr = mergePhotosForItem(l.photos?.[itemId], r.photos?.[itemId]);
        if (arr.length) photos[itemId] = arr;
      }
      out[day][slot.id] = {
        name:      r.name      ?? l.name      ?? '',
        assignees: r.assignees ?? l.assignees ?? {},
        checks:    r.checks    ?? l.checks    ?? {},
        notes:     r.notes     ?? l.notes     ?? {},
        photos,
      };
    }
  }
  return out;
}

function reducer(state, action) {
  const { day, slot } = action;

  function withSlot(updater) {
    const prev = state[day][slot];
    return { ...state, [day]: { ...state[day], [slot]: updater(prev) } };
  }

  switch (action.type) {
    case 'HYDRATE':
      return action.state;

    case 'MERGE_REMOTE':
      return mergeRemoteIntoLocal(state, action.remote);

    case 'SET_NAME':
      return withSlot(s => ({ ...s, name: action.value }));

    case 'SET_ASSIGNEE': {
      const { sectionId, value } = action;
      return withSlot(s => ({
        ...s,
        assignees: { ...s.assignees, [sectionId]: value },
      }));
    }

    case 'SET_NOTE': {
      const { itemId, value } = action;
      return withSlot(s => ({
        ...s,
        notes: { ...s.notes, [itemId]: value },
      }));
    }

    case 'TOGGLE_CHECK': {
      const { itemId } = action;
      return withSlot(s => ({
        ...s,
        checks: { ...s.checks, [itemId]: !s.checks[itemId] },
      }));
    }

    case 'ADD_PHOTO': {
      const { itemId, photo } = action;
      return withSlot(s => ({
        ...s,
        // Adding a photo IS the proof of task done — auto-check.
        checks: { ...s.checks, [itemId]: true },
        photos: { ...s.photos, [itemId]: [...(s.photos[itemId] || []), photo] },
      }));
    }

    case 'PATCH_PHOTO': {
      // Update a photo in place (used after Storage upload completes to
      // attach storagePath + downloadUrl).
      const { itemId, photoId, patch } = action;
      return withSlot(s => ({
        ...s,
        photos: {
          ...s.photos,
          [itemId]: (s.photos[itemId] || []).map(p =>
            p.id === photoId ? { ...p, ...patch } : p
          ),
        },
      }));
    }

    case 'REMOVE_PHOTO': {
      const { itemId, photoId } = action;
      return withSlot(s => ({
        ...s,
        photos: {
          ...s.photos,
          [itemId]: (s.photos[itemId] || []).filter(p => p.id !== photoId),
        },
      }));
    }

    case 'RESET_DAY': {
      const next = { ...state };
      next[day] = initDay();
      return next;
    }

    default:
      return state;
  }
}

const Ctx = createContext(null);

export function WeekendProvider({ children }) {
  // Track the current store; reload state whenever it changes.
  const [storeNumber, setStoreNumber] = useState(() => storage.getSettings().storeNumber || '');
  const [userName,    setUserName]    = useState(() => storage.getSettings().userName    || '');

  const [state, dispatch] = useReducer(reducer, storeNumber, loadState);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const saveTimer = useRef(null);

  // Sync engine handle + status.
  const syncRef = useRef(null);
  const [syncStatus, setSyncStatus] = useState(isFirebaseConfigured() ? 'idle' : 'local');
  // Mode: 'cloud' when Firebase configured + store known; else 'local'.
  const mode = isFirebaseConfigured() && storeNumber ? 'cloud' : 'local';

  // Watch settings changes (login screen, "Change store" flow, other tabs).
  useEffect(() => {
    const check = () => {
      const s = storage.getSettings();
      const nextStore = s.storeNumber || '';
      const nextName  = s.userName    || '';
      if (nextStore !== storeNumber) {
        setStoreNumber(nextStore);
        // Rehydrate from local cache immediately; cloud sync (if configured)
        // will then reconcile via the new subscription.
        dispatch({ type: 'HYDRATE', state: loadState(nextStore) });
      }
      if (nextName !== userName) setUserName(nextName);
    };
    const iv = setInterval(check, 1000);
    const onStorage = () => check();
    window.addEventListener('storage', onStorage);
    return () => { clearInterval(iv); window.removeEventListener('storage', onStorage); };
  }, [storeNumber, userName]);

  // Debounced persist to localStorage on every state change (offline cache).
  // Photos: strip dataUrl blobs to avoid quota problems — the cloud copy
  // survives via downloadUrl. For local-only mode (no Firebase) we keep the
  // full dataUrl so offline devices still see thumbnails.
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        const cacheable = mode === 'cloud' ? stripHeavyPhotoBlobs(state) : state;
        localStorage.setItem(STORAGE_KEY(storeNumber), JSON.stringify(cacheable));
      } catch (e) {
        console.warn('[weekend] failed to persist state', e);
      }
    }, 200);
    return () => clearTimeout(saveTimer.current);
  }, [state, storeNumber, mode]);

  // Cloud sync lifecycle: attach a sync engine whenever storeNumber (+ Firebase)
  // are ready. Detach on store change / unmount.
  useEffect(() => {
    if (mode !== 'cloud') {
      setSyncStatus('local');
      return;
    }
    let cancelled = false;
    let sync = null;
    setSyncStatus('idle');

    (async () => {
      const fb = await ensureFirebase().catch(() => null);
      if (cancelled || !fb) { setSyncStatus('error'); return; }
      const docId = weekendDocId(storeNumber);
      sync = createWeekendSync({
        db: fb.db,
        docId,
        getState: () => stateRef.current,
        applyRemote: (remote) => dispatch({ type: 'MERGE_REMOTE', remote }),
        onStatus: (s) => setSyncStatus(s),
      });
      syncRef.current = sync;
      await sync.init();
    })();

    return () => {
      cancelled = true;
      if (sync) sync.destroy();
      syncRef.current = null;
    };
    // Recompute the docId weekly-ish by re-running on storeNumber change.
    // (We intentionally don't recompute on every render — Saturday's boundary
    // is checked at mount; a manager rarely leaves the page open across the
    // Sat/Sun boundary and back to Monday.)
  }, [storeNumber, mode]);

  // Push every state change through the sync engine (debounced internally).
  useEffect(() => {
    if (!syncRef.current) return;
    syncRef.current.schedulePush();
  }, [state]);

  // ---- actions --------------------------------------------------------------
  const setName     = useCallback((day, slot, value)                       => dispatch({ type: 'SET_NAME',     day, slot, value }),        []);
  const setAssignee = useCallback((day, slot, sectionId, value)            => dispatch({ type: 'SET_ASSIGNEE', day, slot, sectionId, value }), []);
  const setNote     = useCallback((day, slot, itemId, value)               => dispatch({ type: 'SET_NOTE',     day, slot, itemId, value }), []);
  const toggle      = useCallback((day, slot, itemId)                      => dispatch({ type: 'TOGGLE_CHECK', day, slot, itemId }),       []);
  const removePhoto = useCallback((day, slot, itemId, photoId)             => dispatch({ type: 'REMOVE_PHOTO', day, slot, itemId, photoId }), []);
  // Reset must survive an immediate refresh — flush both localStorage and
  // Firestore synchronously so the user can't out-race the 200/350ms debounces.
  const resetDay = useCallback((day) => {
    dispatch({ type: 'RESET_DAY', day, slot: null });
    // Build what the post-reset state should look like WITHOUT waiting for
    // React to commit, then persist it right away.
    const cur = stateRef.current || initState();
    const post = { ...cur, [day]: initDay() };
    try {
      clearTimeout(saveTimer.current);
      localStorage.setItem(STORAGE_KEY(storeNumber), JSON.stringify(post));
    } catch (e) {
      console.warn('[weekend] failed to persist reset', e);
    }
    // Force-flush the Firestore push with the freshly-computed state so
    // deleteField() sentinels land before the user refreshes.
    if (syncRef.current?.flushPush) {
      stateRef.current = post; // sync engine's getState reads this ref
      syncRef.current.flushPush();
    }
  }, [storeNumber]);

  // addPhoto: kicks off a background Storage upload when in cloud mode, so
  // remote users see the photo without needing the 2-3 MB dataUrl to travel
  // through Firestore.
  const addPhoto = useCallback((day, slot, itemId, photo) => {
    // Add locally first so the taker sees the thumbnail immediately.
    const withFlag = mode === 'cloud'
      ? { ...photo, uploading: true }
      : photo;
    dispatch({ type: 'ADD_PHOTO', day, slot, itemId, photo: withFlag });

    if (mode !== 'cloud') return;
    if (!photo.dataUrl) return;
    const fb = firebaseState();
    if (!fb) return;
    const path = `weekends/${storeNumber}/${weekOfSaturday()}/${day}/${slot}/${itemId}/${photo.id}.jpg`;
    (async () => {
      try {
        const r = storageRef(fb.storage, path);
        await uploadString(r, photo.dataUrl, 'data_url', { contentType: 'image/jpeg' });
        const downloadUrl = await getDownloadURL(r);
        dispatch({
          type: 'PATCH_PHOTO', day, slot, itemId, photoId: photo.id,
          patch: { storagePath: path, downloadUrl, uploading: false },
        });
      } catch (err) {
        console.warn('[weekend] photo upload failed; staying local', err);
        dispatch({
          type: 'PATCH_PHOTO', day, slot, itemId, photoId: photo.id,
          patch: { uploading: false, uploadError: String(err?.message || err) },
        });
      }
    })();
  }, [mode, storeNumber]);

  const slotData = useCallback(
    (day, slot) => state[day]?.[slot] ?? { name: '', assignees: {}, checks: {}, photos: {}, notes: {} },
    [state]
  );

  const countChecked = useCallback((day, slot) => {
    const data = state[day]?.[slot]?.checks ?? {};
    return Object.values(data).filter(Boolean).length;
  }, [state]);

  const totalItems = WEEKEND_SECTIONS.reduce((n, s) => n + s.items.length, 0);

  return (
    <Ctx.Provider value={{
      state, slotData, setName, setAssignee, setNote, toggle, addPhoto, removePhoto, resetDay,
      countChecked, totalItems, storeNumber, userName,
      syncStatus, mode,
    }}>
      {children}
    </Ctx.Provider>
  );
}

// Strip large base64 blobs from photos before writing to localStorage.
// In cloud mode the downloadUrl is enough — dataUrl is regenerated (or
// simply aliased to downloadUrl) on the next remote snapshot / on load.
function stripHeavyPhotoBlobs(state) {
  const out = {};
  for (const [day, slots] of Object.entries(state || {})) {
    out[day] = {};
    for (const [slotId, slot] of Object.entries(slots || {})) {
      const photos = {};
      for (const [itemId, arr] of Object.entries(slot.photos || {})) {
        photos[itemId] = (arr || []).map(p => {
          // Keep dataUrl only if we haven't uploaded yet (offline / mid-upload).
          if (p.downloadUrl || p.storagePath) {
            const { dataUrl, ...rest } = p;
            return { ...rest, dataUrl: p.downloadUrl || '' };
          }
          return p;
        });
      }
      out[day][slotId] = { ...slot, photos };
    }
  }
  return out;
}

export function useWeekend() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWeekend must be inside WeekendProvider');
  return ctx;
}
