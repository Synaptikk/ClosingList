// Time helpers for due-soon / overdue logic.
// dueTime is "HH:MM" 24h local. Computed against the session's date.

const DUE_SOON_MIN = 30; // minutes
const OVERDUE_GRACE_MIN = 0;

export const STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  DUE_SOON: 'due_soon',
  OVERDUE: 'overdue',
  COMPLETE: 'complete',
};

export function parseDueTime(dueTime, sessionDateISO) {
  if (!dueTime) return null;
  const [h, m] = dueTime.split(':').map(Number);
  const base = sessionDateISO ? new Date(sessionDateISO) : new Date();
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
  return d;
}

export function formatTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function formatDate(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// Compute a task's effective status given its taskState + config + sessionDate + "now".
export function computeStatus(taskConfig, taskState, sessionDateISO, now = new Date()) {
  if (taskState?.completedAt) return STATUS.COMPLETE;

  const hasContent =
    !!taskState?.notes ||
    (taskState?.photos && taskState.photos.length > 0) ||
    taskState?.value !== undefined && taskState?.value !== null && taskState?.value !== '';

  if (taskConfig.dueTime) {
    const due = parseDueTime(taskConfig.dueTime, sessionDateISO);
    if (due) {
      const diffMin = (due - now) / 60000;
      if (diffMin < -OVERDUE_GRACE_MIN) return STATUS.OVERDUE;
      if (diffMin < DUE_SOON_MIN) return STATUS.DUE_SOON;
    }
  }
  return hasContent ? STATUS.IN_PROGRESS : STATUS.NOT_STARTED;
}

export function statusLabel(status) {
  return {
    [STATUS.NOT_STARTED]: 'Not started',
    [STATUS.IN_PROGRESS]: 'In progress',
    [STATUS.DUE_SOON]: 'Due soon',
    [STATUS.OVERDUE]: 'Overdue',
    [STATUS.COMPLETE]: 'Complete',
  }[status] || status;
}

export function statusColor(status) {
  return {
    [STATUS.NOT_STARTED]: 'bg-slate-100 text-slate-700 ring-slate-200',
    [STATUS.IN_PROGRESS]: 'bg-sky-100 text-sky-800 ring-sky-200',
    [STATUS.DUE_SOON]:    'bg-amber-100 text-amber-900 ring-amber-300',
    [STATUS.OVERDUE]:     'bg-rose-100 text-rose-900 ring-rose-300',
    [STATUS.COMPLETE]:    'bg-emerald-100 text-emerald-900 ring-emerald-300',
  }[status] || 'bg-slate-100 text-slate-700 ring-slate-200';
}

// "5 min ago", "in 12 min", "2 h ago" etc.
export function relTime(target, now = new Date()) {
  if (!target) return '';
  const d = target instanceof Date ? target : new Date(target);
  if (isNaN(d.getTime())) return '';
  const diffMs = d - now;
  const abs = Math.abs(diffMs);
  const min = Math.round(abs / 60000);
  if (min < 1) return diffMs < 0 ? 'just now' : 'in <1 min';
  if (min < 60) return diffMs < 0 ? `${min} min ago` : `in ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return diffMs < 0 ? `${hr} h ago` : `in ${hr} h`;
  const day = Math.round(hr / 24);
  return diffMs < 0 ? `${day} d ago` : `in ${day} d`;
}

export function todayISO() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}
