import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { storage } from '../lib/storage';
import { generateJoinCode } from '../lib/joinCode';
import { todayISO } from '../lib/timeUtils';
import { checklistConfig, getAllTasks } from '../config/checklistConfig';
import { ensureFirebase, isFirebaseConfigured, getStoreNumber } from '../lib/firebase';
import { createSessionSync, deterministicSessionId } from '../lib/sessionSync';

const SessionCtx = createContext(null);

// Session shape (in-memory):
// {
//   id, joinCode, storeNumber, marketNumber, date,
//   managers: { manager1: { name }, manager2: { name } },
//   shiftNotes: '',
//   status: 'open' | 'submitted',
//   createdAt, updatedAt, submittedAt,
//   tasks: { [taskId]: { value, notes, photos[], completedAt, completedBy, lastUpdatedAt, lastUpdatedBy } },
//   associates: [ { id, name, shift, area, accomplishment, notes, manager } ],
//   presence: { manager1: lastSeen, manager2: lastSeen },
// }

function blankTasks() {
  const out = {};
  for (const t of getAllTasks(checklistConfig)) {
    out[t.id] = { value: '', notes: '', photos: [], completedAt: null, completedBy: null, lastUpdatedAt: null, lastUpdatedBy: null };
  }
  return out;
}

export function makeBlankSession({ storeNumber = '1458', marketNumber = '', sessionId } = {}) {
  const now = new Date().toISOString();
  return {
    id: sessionId || cryptoRandomId(),
    joinCode: generateJoinCode(6),
    storeNumber,
    marketNumber,
    date: todayISO(),
    managers: { manager1: { name: '' }, manager2: { name: '' } },
    shiftNotes: '',
    status: 'open',
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    tasks: blankTasks(),
    associates: [],
    presence: { manager1: now, manager2: null },
  };
}

function cryptoRandomId() {
  const arr = new Uint8Array(8);
  (globalThis.crypto || window.crypto).getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

// ----------------- reducer -----------------
function reducer(state, action) {
  switch (action.type) {
    case 'load': return action.session;
    case 'patch': return { ...state, ...action.patch, updatedAt: new Date().toISOString() };

    case 'applyRemote': {
      // Merge a Firestore snapshot into local state. Preserves any in-flight
      // local-only state (notably the photos[] arrays that may not yet have
      // synced their dataUrl→Storage upload).
      const remote = action.remote || {};
      if (!state) {
        // First snapshot — populate fully, but ensure all config task ids exist.
        const tasks = { ...blankTasks(), ...(remote.tasks || {}) };
        for (const id of Object.keys(tasks)) {
          tasks[id] = { photos: [], ...tasks[id] };
        }
        return {
          id: action.sessionId,
          joinCode: remote.joinCode || generateJoinCode(6),
          storeNumber: remote.storeNumber || remote.storeNbr || getStoreNumber(),
          marketNumber: remote.marketNumber || '',
          date: remote.date || todayISO(),
          managers: remote.managers || { manager1: { name: '' }, manager2: { name: '' } },
          shiftNotes: remote.shiftNotes || '',
          status: remote.status || 'open',
          createdAt: remote.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          submittedAt: remote.submittedAt || null,
          tasks,
          associates: remote.associates || [],
          presence: remote.presence || {},
        };
      }
      // Overlay remote onto existing state. For task photos, merge cloud
      // photos with any local-only ones still mid-upload (dataUrl, no storagePath).
      const tasks = { ...(state.tasks || {}) };
      for (const [id, rt] of Object.entries(remote.tasks || {})) {
        const local = state.tasks?.[id] || {};
        const remotePhotoIds = new Set((rt.photos || []).map(p => p.id));
        const localPending = (local.photos || []).filter(p => !remotePhotoIds.has(p.id));
        tasks[id] = { ...local, ...rt, photos: [...(rt.photos || []), ...localPending] };
      }
      return {
        ...state,
        storeNumber: remote.storeNumber || remote.storeNbr || state.storeNumber,
        marketNumber: remote.marketNumber ?? state.marketNumber,
        joinCode: remote.joinCode || state.joinCode,
        date: remote.date || state.date,
        managers: remote.managers || state.managers,
        shiftNotes: remote.shiftNotes ?? state.shiftNotes,
        status: remote.status || state.status,
        submittedAt: remote.submittedAt ?? state.submittedAt,
        associates: remote.associates ?? state.associates,
        presence: { ...(state.presence || {}), ...(remote.presence || {}) },
        tasks,
        updatedAt: new Date().toISOString(),
      };
    }

    case 'updateTask': {
      const { taskId, patch, by } = action;
      const now = new Date().toISOString();
      const prev = state.tasks[taskId] || {};
      const next = {
        ...prev, ...patch,
        lastUpdatedAt: now,
        lastUpdatedBy: by || prev.lastUpdatedBy,
      };
      return {
        ...state,
        updatedAt: now,
        tasks: { ...state.tasks, [taskId]: next },
      };
    }

    case 'completeTask': {
      const { taskId, by, complete } = action;
      const now = new Date().toISOString();
      const prev = state.tasks[taskId] || {};
      const next = {
        ...prev,
        completedAt: complete ? now : null,
        completedBy: complete ? by : null,
        lastUpdatedAt: now,
        lastUpdatedBy: by,
      };
      return { ...state, updatedAt: now, tasks: { ...state.tasks, [taskId]: next } };
    }

    case 'addPhoto': {
      const { taskId, photo, by } = action;
      const now = new Date().toISOString();
      const prev = state.tasks[taskId] || { photos: [] };
      const photos = [...(prev.photos || []), photo];
      return {
        ...state,
        updatedAt: now,
        tasks: { ...state.tasks, [taskId]: { ...prev, photos, lastUpdatedAt: now, lastUpdatedBy: by } },
      };
    }
    case 'removePhoto': {
      const { taskId, photoId, by } = action;
      const now = new Date().toISOString();
      const prev = state.tasks[taskId] || { photos: [] };
      const photos = (prev.photos || []).filter(p => p.id !== photoId);
      return {
        ...state,
        updatedAt: now,
        tasks: { ...state.tasks, [taskId]: { ...prev, photos, lastUpdatedAt: now, lastUpdatedBy: by } },
      };
    }
    case 'updatePhotoCaption': {
      const { taskId, photoId, caption, by } = action;
      const now = new Date().toISOString();
      const prev = state.tasks[taskId] || { photos: [] };
      const photos = (prev.photos || []).map(p => p.id === photoId ? { ...p, caption } : p);
      return {
        ...state,
        updatedAt: now,
        tasks: { ...state.tasks, [taskId]: { ...prev, photos, lastUpdatedAt: now, lastUpdatedBy: by } },
      };
    }
    case 'patchPhoto': {
      const { taskId, photoId, patch } = action;
      const now = new Date().toISOString();
      const prev = state.tasks[taskId] || { photos: [] };
      const photos = (prev.photos || []).map(p => p.id === photoId ? { ...p, ...patch } : p);
      return {
        ...state,
        updatedAt: now,
        tasks: { ...state.tasks, [taskId]: { ...prev, photos } },
      };
    }

    case 'setAssociates':
      return { ...state, associates: action.associates, updatedAt: new Date().toISOString() };
    case 'updateAssociate':
      return {
        ...state,
        updatedAt: new Date().toISOString(),
        associates: state.associates.map(a => a.id === action.id ? { ...a, ...action.patch } : a),
      };
    case 'addAssociate':
      return {
        ...state,
        updatedAt: new Date().toISOString(),
        associates: [...state.associates, action.associate],
      };
    case 'removeAssociate':
      return {
        ...state,
        updatedAt: new Date().toISOString(),
        associates: state.associates.filter(a => a.id !== action.id),
      };

    case 'presence':
      return {
        ...state,
        presence: { ...(state.presence || {}), [action.manager]: new Date().toISOString() },
      };

    case 'submit':
      return {
        ...state,
        status: 'submitted',
        submittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

    default: return state;
  }
}

// ----------------- provider -----------------
export function SessionProvider({ children }) {
  const [session, dispatch] = useReducer(reducer, null);
  const [activeManager, setActiveManagerState] = useState(() => storage.getActiveManager());
  const [syncStatus, setSyncStatus] = useState('idle');
  // 'idle' | 'local' | 'syncing' | 'synced' | 'error'
  const [mode, setMode] = useState(() => isFirebaseConfigured() ? 'cloud' : 'local');
  const saveTimer = useRef(null);
  const syncRef = useRef(null);
  const sessionRef = useRef(null);
  sessionRef.current = session;

  // Bootstrap Firebase (anon auth) up front when configured. If init fails,
  // silently fall back to local-only mode so the app remains usable offline.
  const fbReadyRef = useRef(null);
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setMode('local');
      return;
    }
    let cancelled = false;
    fbReadyRef.current = ensureFirebase()
      .then((fb) => {
        if (cancelled || !fb) return null;
        setMode('cloud');
        return fb;
      })
      .catch((e) => {
        if (cancelled) return null;
        console.warn('[firebase] init failed — falling back to local mode', e);
        setMode('local');
        return null;
      });
    return () => { cancelled = true; };
  }, []);

  // Bootstrap: recover an active session if one is stored.
  // Rule: on load, always default to TODAY's session id. Yesterday's stored id
  // is ignored (you get a fresh session for today). Past dates are still
  // reachable explicitly via openSessionForDate from the Report tab.
  useEffect(() => {
    const storedId = storage.getActiveSessionId();
    if (!storedId) return;
    if (isFirebaseConfigured()) {
      const todayId = deterministicSessionId(getStoreNumber(), todayISO());
      const validIdRe = /^\d+-\d{4}-\d{2}-\d{2}$/;
      // If stored id is invalid OR doesn't match today, replace with today's.
      if (!validIdRe.test(storedId) || storedId !== todayId) {
        storage.setActiveSessionId(todayId);
        const local = storage.getSession(todayId);
        if (local) {
          const blank = blankTasks();
          local.tasks = { ...blank, ...(local.tasks || {}) };
          dispatch({ type: 'load', session: local });
        } else {
          const seed = makeBlankSession({ storeNumber: getStoreNumber(), sessionId: todayId });
          dispatch({ type: 'load', session: seed });
        }
        return;
      }
      // Stored id IS today's — load from local cache if present, otherwise seed
      // and let sync hydrate from Firestore.
      const local = storage.getSession(storedId);
      if (local) {
        const blank = blankTasks();
        local.tasks = { ...blank, ...(local.tasks || {}) };
        dispatch({ type: 'load', session: local });
        return;
      }
      const seed = makeBlankSession({ storeNumber: getStoreNumber(), sessionId: storedId });
      dispatch({ type: 'load', session: seed });
      return;
    }
    // Local-only mode: load whatever local has stored.
    const s = storage.getSession(storedId);
    if (s) {
      const blank = blankTasks();
      s.tasks = { ...blank, ...(s.tasks || {}) };
      dispatch({ type: 'load', session: s });
    }
  }, []);

  // Local autosave (always — runs alongside cloud sync as the offline cache).
  useEffect(() => {
    if (!session) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      storage.saveSession(session);
    }, 250);
    return () => clearTimeout(saveTimer.current);
  }, [session]);

  // Cloud sync: when a session exists and Firebase is ready, attach a sync
  // engine that mirrors the doc both ways.
  useEffect(() => {
    if (!session?.id) return;
    if (mode !== 'cloud') { setSyncStatus('local'); return; }
    let cancelled = false;
    let sync;

    (async () => {
      const fb = await fbReadyRef.current;
      if (cancelled || !fb) return;
      sync = createSessionSync({
        db: fb.db,
        sessionId: session.id,
        getSession: () => sessionRef.current,
        applyRemote: (remote) => dispatch({ type: 'applyRemote', remote, sessionId: session.id }),
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
  }, [session?.id, mode]);

  // Push any state change to the sync engine (debounced internally).
  useEffect(() => {
    if (!session || !syncRef.current) return;
    syncRef.current.schedulePush();
  }, [session]);

  // Presence heartbeat (also pushes through sync so the other manager sees us).
  useEffect(() => {
    if (!session || session.status === 'submitted') return;
    const tick = () => dispatch({ type: 'presence', manager: activeManager });
    tick();
    const iv = setInterval(tick, 30000);
    return () => clearInterval(iv);
  }, [session?.id, activeManager, session?.status]);

  // ----- actions -----
  const createSession = useCallback((opts = {}) => {
    const storeNumber = opts.storeNumber || getStoreNumber();
    const sessionId = isFirebaseConfigured()
      ? deterministicSessionId(storeNumber, todayISO())
      : undefined;
    const s = makeBlankSession({ ...opts, storeNumber, sessionId });
    storage.setActiveSessionId(s.id);
    dispatch({ type: 'load', session: s });
    return s;
  }, []);

  const joinSession = useCallback((code) => {
    // Local-only path: resolve by join code in localStorage index.
    if (!isFirebaseConfigured()) {
      const s = storage.findSessionByJoinCode(code);
      if (!s) return { ok: false, error: 'No session found for that code on this device.' };
      storage.setActiveSessionId(s.id);
      const blank = blankTasks();
      s.tasks = { ...blank, ...(s.tasks || {}) };
      dispatch({ type: 'load', session: s });
      return { ok: true, session: s };
    }
    // Cloud path: today's deterministic doc — code is informational for now.
    const sid = deterministicSessionId(getStoreNumber(), todayISO());
    storage.setActiveSessionId(sid);
    // Seed with a minimal local session so the UI mounts; the sync engine
    // will hydrate it from Firestore on init.
    const seed = makeBlankSession({ storeNumber: getStoreNumber(), sessionId: sid });
    dispatch({ type: 'load', session: seed });
    return { ok: true, session: seed };
  }, []);

  const exitSession = useCallback(() => {
    storage.setActiveSessionId(null);
    dispatch({ type: 'load', session: null });
  }, []);

  // Open a session for a specific past (or future) date. Only meaningful in
  // cloud mode — the doc may not exist locally; sync hydrates it from Firestore.
  // dateISO is an ISO date string (e.g., "2026-06-09").
  const openSessionForDate = useCallback((dateISO) => {
    if (!isFirebaseConfigured()) return { ok: false, error: 'Cloud sync not configured.' };
    const m = String(dateISO).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return { ok: false, error: 'Bad date.' };
    const sid = `${getStoreNumber()}-${m[1]}-${m[2]}-${m[3]}`;
    storage.setActiveSessionId(sid);
    const seed = makeBlankSession({ storeNumber: getStoreNumber(), sessionId: sid });
    seed.date = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`).toISOString();
    dispatch({ type: 'load', session: seed });
    return { ok: true };
  }, []);

  const setActiveManager = useCallback((m) => {
    storage.setActiveManager(m);
    setActiveManagerState(m);
  }, []);

  const patchSession = useCallback((patch) => dispatch({ type: 'patch', patch }), []);
  const updateTask = useCallback((taskId, patch) => dispatch({ type: 'updateTask', taskId, patch, by: activeManager }), [activeManager]);
  const completeTask = useCallback((taskId, complete) => dispatch({ type: 'completeTask', taskId, complete, by: activeManager }), [activeManager]);
  const addPhoto = useCallback((taskId, photo) => dispatch({ type: 'addPhoto', taskId, photo, by: activeManager }), [activeManager]);
  const removePhoto = useCallback((taskId, photoId) => dispatch({ type: 'removePhoto', taskId, photoId, by: activeManager }), [activeManager]);
  const updatePhotoCaption = useCallback((taskId, photoId, caption) =>
    dispatch({ type: 'updatePhotoCaption', taskId, photoId, caption, by: activeManager }), [activeManager]);
  const patchPhoto = useCallback((taskId, photoId, patch) =>
    dispatch({ type: 'patchPhoto', taskId, photoId, patch }), []);

  const setAssociates = useCallback((arr) => dispatch({ type: 'setAssociates', associates: arr }), []);
  const updateAssociate = useCallback((id, patch) => dispatch({ type: 'updateAssociate', id, patch }), []);
  const addAssociate = useCallback((a) => dispatch({ type: 'addAssociate', associate: a }), []);
  const removeAssociate = useCallback((id) => dispatch({ type: 'removeAssociate', id }), []);

  const submitSession = useCallback(() => dispatch({ type: 'submit' }), []);

  const value = useMemo(() => ({
    session, activeManager, syncStatus, mode,
    createSession, joinSession, exitSession, openSessionForDate,
    setActiveManager, patchSession,
    updateTask, completeTask,
    addPhoto, removePhoto, updatePhotoCaption, patchPhoto,
    setAssociates, updateAssociate, addAssociate, removeAssociate,
    submitSession,
  }), [session, activeManager, syncStatus, mode,
    createSession, joinSession, exitSession, openSessionForDate,
    setActiveManager, patchSession,
    updateTask, completeTask,
    addPhoto, removePhoto, updatePhotoCaption, patchPhoto,
    setAssociates, updateAssociate, addAssociate, removeAssociate,
    submitSession]);

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const v = useContext(SessionCtx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}

export function managerLabel(session, manager) {
  if (!session) return '';
  const name = session.managers?.[manager]?.name?.trim();
  if (name) return name;
  return manager === 'manager1' ? 'Manager 1' : 'Manager 2';
}
