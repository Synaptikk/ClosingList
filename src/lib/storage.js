// Persistence layer.
// Today: localStorage. Tomorrow: swap in Firestore behind the same async API.
// All reads/writes go through this module so the rest of the app is backend-agnostic.

const KEY_PREFIX = 'cmc:';

const SESSION_KEY = (id) => `${KEY_PREFIX}session:${id}`;
const SESSIONS_INDEX = `${KEY_PREFIX}sessions`;
const ACTIVE_SESSION = `${KEY_PREFIX}activeSession`;
const ACTIVE_MANAGER = `${KEY_PREFIX}activeManager`;
const SETTINGS_KEY = `${KEY_PREFIX}settings`;

function safeParse(json, fallback) {
  if (!json) return fallback;
  try { return JSON.parse(json); } catch { return fallback; }
}

export const storage = {
  // ---- sessions index ----
  listSessions() {
    return safeParse(localStorage.getItem(SESSIONS_INDEX), []);
  },
  upsertSessionIndex(meta) {
    const all = storage.listSessions().filter(s => s.id !== meta.id);
    all.unshift(meta);
    localStorage.setItem(SESSIONS_INDEX, JSON.stringify(all.slice(0, 50)));
  },
  // ---- session record ----
  getSession(id) {
    return safeParse(localStorage.getItem(SESSION_KEY(id)), null);
  },
  saveSession(session) {
    try {
      localStorage.setItem(SESSION_KEY(session.id), JSON.stringify(session));
      storage.upsertSessionIndex({
        id: session.id, date: session.date, storeNumber: session.storeNumber,
        joinCode: session.joinCode, status: session.status, submittedAt: session.submittedAt,
        updatedAt: session.updatedAt,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || 'storage full' };
    }
  },
  deleteSession(id) {
    localStorage.removeItem(SESSION_KEY(id));
    const remaining = storage.listSessions().filter(s => s.id !== id);
    localStorage.setItem(SESSIONS_INDEX, JSON.stringify(remaining));
  },
  // ---- active session pointer ----
  getActiveSessionId() {
    return localStorage.getItem(ACTIVE_SESSION) || null;
  },
  setActiveSessionId(id) {
    if (id) localStorage.setItem(ACTIVE_SESSION, id);
    else localStorage.removeItem(ACTIVE_SESSION);
  },
  // ---- active manager (which manager am I, this device) ----
  getActiveManager() {
    return localStorage.getItem(ACTIVE_MANAGER) || 'manager1';
  },
  setActiveManager(m) {
    localStorage.setItem(ACTIVE_MANAGER, m);
  },
  // ---- settings ----
  getSettings() {
    return safeParse(localStorage.getItem(SETTINGS_KEY), {
      storeNumber: '1458', marketNumber: '',
    });
  },
  saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  },
  // ---- find by join code ----
  findSessionByJoinCode(code) {
    if (!code) return null;
    const c = code.toUpperCase();
    const all = storage.listSessions();
    const meta = all.find(s => (s.joinCode || '').toUpperCase() === c);
    return meta ? storage.getSession(meta.id) : null;
  },
};
