import { checklistConfig, TASK_TYPES } from '../config/checklistConfig';
import { computeStatus, STATUS, formatTime } from './timeUtils';
import { managerLabel } from '../store/sessionStore';

function pad(n) { return n.toString().padStart(2, '0'); }

export function buildEmailSubject(session) {
  const d = new Date(session.date);
  const mmddyyyy = `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  return `Store ${session.storeNumber} Closing Checklist - ${mmddyyyy}`;
}

export function buildEmailBody(session) {
  const now = new Date();
  const lines = [];
  lines.push(`Store ${session.storeNumber}${session.marketNumber ? ` (Market ${session.marketNumber})` : ''}`);
  lines.push(`Date: ${new Date(session.date).toLocaleDateString()}`);
  lines.push(`Managers: ${managerLabel(session, 'manager1')} & ${managerLabel(session, 'manager2')}`);
  lines.push('');

  // Summary counts.
  let total = 0, complete = 0, overdue = 0, dueSoon = 0, photos = 0;
  const sectionGroups = [];
  for (const sec of checklistConfig.sections) {
    const taskLines = [];
    let secComplete = 0;
    for (const t of sec.tasks) {
      const state = session.tasks[t.id] || {};
      const status = computeStatus(t, state, session.date, now);
      total++;
      if (status === STATUS.COMPLETE) { complete++; secComplete++; }
      if (status === STATUS.OVERDUE) overdue++;
      if (status === STATUS.DUE_SOON) dueSoon++;
      photos += state.photos?.length || 0;

      if (t.reportInclude === false) continue;
      const glyph = ({
        [STATUS.COMPLETE]: '[x]',
        [STATUS.OVERDUE]:  '[!]',
        [STATUS.DUE_SOON]: '[~]',
        [STATUS.IN_PROGRESS]: '[-]',
        [STATUS.NOT_STARTED]: '[ ]',
      })[status];

      const extras = [];
      const valueTypes = [TASK_TYPES.YES_NO, TASK_TYPES.CHECKBOX, TASK_TYPES.TIMED_CHECKBOX, TASK_TYPES.NUMERIC, TASK_TYPES.TIME, TASK_TYPES.MULTI_SELECT];
      if (state.value && valueTypes.includes(t.type)) {
        extras.push(state.value === 'no' ? 'NO' : state.value);
      }
      if (state.completedAt) extras.push(`done ${formatTime(state.completedAt)} (${managerLabel(session, state.completedBy)})`);
      else if (t.dueTime) extras.push(`due ${t.dueTime}`);
      if (state.notes?.trim() && t.type !== TASK_TYPES.NOTE) extras.push(`note: ${state.notes.trim()}`);
      else if (state.notes?.trim() && t.type === TASK_TYPES.NOTE) extras.push(state.notes.trim());
      if ((state.photos?.length || 0) > 0) extras.push(`${state.photos.length} photo${state.photos.length > 1 ? 's' : ''}`);

      taskLines.push(`  ${glyph} ${t.title}${extras.length ? ' — ' + extras.join(' · ') : ''}`);
    }
    if (taskLines.length) sectionGroups.push({ sec, taskLines, secComplete });
  }

  lines.push(`Summary: ${complete}/${total} complete · ${overdue} overdue · ${dueSoon} due soon · ${photos} photos`);
  if (session.shiftNotes?.trim()) {
    lines.push('');
    lines.push('Shift notes:');
    lines.push(session.shiftNotes.trim());
  }

  for (const { sec, taskLines } of sectionGroups) {
    lines.push('');
    lines.push(`== ${sec.title} ==`);
    lines.push(...taskLines);
  }

  if (session.associates.length) {
    lines.push('');
    lines.push('== Associates & accomplishments ==');
    for (const a of session.associates) {
      const meta = [a.shift, a.area].filter(Boolean).join(' / ');
      const acc = a.accomplishment ? ` — ${a.accomplishment}` : '';
      const note = a.notes ? ` (${a.notes})` : '';
      lines.push(`  • ${a.name}${meta ? ` (${meta})` : ''}${acc}${note}`);
    }
  }

  lines.push('');
  lines.push(`Generated ${new Date().toLocaleString()} by Closing Manager Checklist`);
  if (session.submittedAt) lines.push(`Submitted ${new Date(session.submittedAt).toLocaleString()}`);
  return lines.join('\n');
}

export function openMailto(session, to = '') {
  const subject = encodeURIComponent(buildEmailSubject(session));
  const body = encodeURIComponent(buildEmailBody(session));
  const href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
  window.location.href = href;
}

export async function copyEmailToClipboard(session) {
  const text = `Subject: ${buildEmailSubject(session)}\n\n${buildEmailBody(session)}`;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  // Fallback
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  return true;
}
