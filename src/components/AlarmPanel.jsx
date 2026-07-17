import { useEffect, useState } from 'react';
import { useSession } from '../store/sessionStore';
import { checklistConfig, getAllTasks } from '../config/checklistConfig';
import { computeStatus, STATUS, formatTime, parseDueTime } from '../lib/timeUtils';
import TaskStatusBadge from './TaskStatusBadge';

export default function AlarmPanel({ onOpenTask }) {
  const { session } = useSession();
  const [, force] = useState(0);

  // tick every 20s so badges flip from due_soon → overdue without manual refresh
  useEffect(() => {
    const iv = setInterval(() => force(x => x + 1), 20000);
    return () => clearInterval(iv);
  }, []);

  if (!session) return null;

  const now = new Date();
  const items = getAllTasks(checklistConfig)
    .filter(t => !!t.dueTime)
    .map(t => {
      const state = session.tasks[t.id] || {};
      const status = computeStatus(t, state, session.date, now);
      const due = parseDueTime(t.dueTime, session.date);
      return { task: t, state, status, due };
    })
    .filter(x => x.status !== STATUS.COMPLETE)
    .sort((a, b) => {
      const order = { [STATUS.OVERDUE]: 0, [STATUS.DUE_SOON]: 1, [STATUS.IN_PROGRESS]: 2, [STATUS.NOT_STARTED]: 3 };
      const so = (order[a.status] ?? 9) - (order[b.status] ?? 9);
      if (so !== 0) return so;
      return (a.due?.getTime() || 0) - (b.due?.getTime() || 0);
    });

  if (items.length === 0) {
    return (
      <div className="bg-emerald-50 ring-1 ring-emerald-200 text-emerald-900 rounded-2xl p-4 text-sm font-medium text-center">
        ✓ All timed tasks complete.
      </div>
    );
  }

  return (
    <section className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Upcoming deadlines</h3>
        <span className="text-xs text-slate-500">{items.length} open</span>
      </header>
      <ul className="divide-y divide-slate-100">
        {items.slice(0, 6).map(({ task, status, due }) => (
          <li key={task.id}>
            <button
              onClick={() => onOpenTask?.(task)}
              className="w-full text-left px-4 py-3 active:bg-slate-50 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{task.title}</div>
                <div className="text-xs text-slate-500 truncate">
                  {task.sectionTitle} · due {formatTime(due)}
                </div>
              </div>
              <TaskStatusBadge status={status} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
