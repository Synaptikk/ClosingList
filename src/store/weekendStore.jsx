import { createContext, useCallback, useContext, useReducer } from 'react';
import { WEEKEND_DAYS, SLOTS, WEEKEND_SECTIONS } from '../config/weekendConfig';
import { storage } from '../lib/storage';

// Shape for one day+slot combo:
// {
//   name: string,                       // manager name
//   checks: { [itemId]: boolean },      // checked state
//   photos: { [itemId]: Photo[] },      // per-item photos
// }
//
// Full state: { [day]: { [slotId]: SlotState } }

function initDay() {
  const day = {};
  for (const slot of SLOTS) {
    day[slot.id] = { name: '', checks: {}, photos: {} };
  }
  return day;
}

function initState() {
  const s = {};
  for (const day of WEEKEND_DAYS) s[day] = initDay();
  return s;
}

function reducer(state, action) {
  const { day, slot } = action;

  function withSlot(updater) {
    const prev = state[day][slot];
    return {
      ...state,
      [day]: { ...state[day], [slot]: updater(prev) },
    };
  }

  switch (action.type) {
    case 'SET_NAME':
      return withSlot(s => ({ ...s, name: action.value }));

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
        photos: {
          ...s.photos,
          [itemId]: [...(s.photos[itemId] || []), photo],
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
  const [state, dispatch] = useReducer(reducer, null, initState);

  // Always read store number fresh from settings so it reflects any login change.
  const storeNumber = storage.getSettings().storeNumber || '';
  const userName    = storage.getSettings().userName    || '';

  const setName  = useCallback((day, slot, value)         => dispatch({ type: 'SET_NAME',     day, slot, value }),       []);
  const toggle   = useCallback((day, slot, itemId)         => dispatch({ type: 'TOGGLE_CHECK', day, slot, itemId }),      []);
  const addPhoto = useCallback((day, slot, itemId, photo)  => dispatch({ type: 'ADD_PHOTO',    day, slot, itemId, photo }),[]);
  const removePhoto = useCallback((day, slot, itemId, photoId) =>
    dispatch({ type: 'REMOVE_PHOTO', day, slot, itemId, photoId }), []);
  const resetDay = useCallback((day)                       => dispatch({ type: 'RESET_DAY',    day, slot: null }),         []);

  const slotData = useCallback((day, slot) => state[day]?.[slot] ?? { name: '', checks: {}, photos: {} }, [state]);

  // Count checked items across all sections for a given day+slot
  const countChecked = useCallback((day, slot) => {
    const data = state[day]?.[slot]?.checks ?? {};
    return Object.values(data).filter(Boolean).length;
  }, [state]);

  const totalItems = WEEKEND_SECTIONS.reduce((n, s) => n + s.items.length, 0);

  return (
    <Ctx.Provider value={{ state, slotData, setName, toggle, addPhoto, removePhoto, resetDay, countChecked, totalItems, storeNumber, userName }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWeekend() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWeekend must be inside WeekendProvider');
  return ctx;
}
