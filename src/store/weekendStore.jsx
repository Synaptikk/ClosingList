import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { WEEKEND_DAYS, SLOTS, WEEKEND_SECTIONS } from '../config/weekendConfig';
import { storage } from '../lib/storage';

// Per-store persistence key. Different stores keep separate progress.
const STORAGE_KEY = (storeNumber) => `cmc:weekend:${storeNumber || 'unset'}`;

// Shape for one day+slot combo:
// {
//   name: string,                        // deprecated; kept for backwards compat with older localStorage payloads
//   assignees: { [sectionId]: string },  // per-section associate for THIS slot on THIS day
//   checks: { [itemId]: bool },
//   photos: { [itemId]: Photo[] },
//   notes:  { [itemId]: string },
// }
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
    // Defensive merge — ensure all days/slots exist even if the saved shape is stale.
    const merged = initState();
    for (const day of WEEKEND_DAYS) {
      if (!parsed[day]) continue;
      for (const slot of SLOTS) {
        if (parsed[day][slot.id]) {
          merged[day][slot.id] = {
            name:      parsed[day][slot.id].name      || '',
            assignees: parsed[day][slot.id].assignees || {},
            checks:    parsed[day][slot.id].checks    || {},
            photos:    parsed[day][slot.id].photos    || {},
            notes:     parsed[day][slot.id].notes     || {},
          };
        }
      }
    }
    return merged;
  } catch {
    return initState();
  }
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
  const saveTimer = useRef(null);

  // Watch settings changes (login screen, "Change store" flow, other tabs).
  // Poll on a short interval — settings are set from React, not via storage events.
  useEffect(() => {
    const check = () => {
      const s = storage.getSettings();
      const nextStore = s.storeNumber || '';
      const nextName  = s.userName    || '';
      if (nextStore !== storeNumber) {
        setStoreNumber(nextStore);
        dispatch({ type: 'HYDRATE', state: loadState(nextStore) });
      }
      if (nextName !== userName) setUserName(nextName);
    };
    const iv = setInterval(check, 1000);
    // Also re-check when other tabs write to localStorage.
    const onStorage = () => check();
    window.addEventListener('storage', onStorage);
    return () => { clearInterval(iv); window.removeEventListener('storage', onStorage); };
  }, [storeNumber, userName]);

  // Debounced persist on every state change.
  useEffect(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY(storeNumber), JSON.stringify(state));
      } catch (e) {
        console.warn('[weekend] failed to persist state', e);
      }
    }, 200);
    return () => clearTimeout(saveTimer.current);
  }, [state, storeNumber]);

  const setName     = useCallback((day, slot, value)                       => dispatch({ type: 'SET_NAME',     day, slot, value }),        []);
  const setAssignee = useCallback((day, slot, sectionId, value)            => dispatch({ type: 'SET_ASSIGNEE', day, slot, sectionId, value }), []);
  const setNote     = useCallback((day, slot, itemId, value)               => dispatch({ type: 'SET_NOTE',     day, slot, itemId, value }), []);
  const toggle      = useCallback((day, slot, itemId)                      => dispatch({ type: 'TOGGLE_CHECK', day, slot, itemId }),       []);
  const addPhoto    = useCallback((day, slot, itemId, photo)               => dispatch({ type: 'ADD_PHOTO',    day, slot, itemId, photo }), []);
  const removePhoto = useCallback((day, slot, itemId, photoId)             => dispatch({ type: 'REMOVE_PHOTO', day, slot, itemId, photoId }), []);
  const resetDay    = useCallback((day)                                    => dispatch({ type: 'RESET_DAY',    day, slot: null }),         []);

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
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWeekend() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWeekend must be inside WeekendProvider');
  return ctx;
}
