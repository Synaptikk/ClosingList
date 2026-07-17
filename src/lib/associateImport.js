// Parse pasted associate text. Accepts:
//   - APAISuite ClosingList email output ("Closing List — Store … — …")
//   - JSON array of objects with name/shift/area/accomplishment/notes/manager
//   - JSON dump from APAISuite's Parse.build model: { associates: [{ name, start, end, jobLabel, calledOff }] }
//   - CSV-ish lines: name, shift, area, accomplishment, notes, manager
//   - One name per line (fallback)
// Always returns an array (possibly empty) and never throws.

const HEADER_HINTS = ['name', 'associate', 'shift', 'area', 'accomplishment', 'note', 'manager'];
const CLOSINGLIST_HEADER_RE = /^closing list\s*[—-]/i;

export function parseAssociates(input) {
  if (!input || typeof input !== 'string') return [];
  const trimmed = input.trim();
  if (!trimmed) return [];

  // APAISuite ClosingList rendered email — highest priority because its
  // shape is unambiguous and overlaps with line-list fallback.
  if (CLOSINGLIST_HEADER_RE.test(trimmed.split('\n', 1)[0] || '')) {
    return parseClosingListEmail(trimmed);
  }

  // Try JSON first.
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      // APAISuite Parse.build() model shape — associates have start/end Dates + jobLabel + calledOff
      if (data && Array.isArray(data.associates) && data.associates.some(a => 'jobLabel' in a || 'calledOff' in a || 'start' in a)) {
        return data.associates.map(normalizeClosingListAssociate).filter(Boolean);
      }
      const arr = Array.isArray(data) ? data : Array.isArray(data?.associates) ? data.associates : [];
      return arr.map(normalizeAssociate).filter(Boolean);
    } catch { /* fall through */ }
  }

  // CSV-ish.
  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  // Detect header.
  const first = lines[0].toLowerCase();
  let cols = ['name', 'shift', 'area', 'accomplishment', 'notes', 'manager'];
  let body = lines;
  if (HEADER_HINTS.some(h => first.includes(h))) {
    cols = splitRow(lines[0]).map(c => normalizeColumn(c));
    body = lines.slice(1);
  }

  return body.map(line => {
    const parts = splitRow(line);
    // Single-token line → just a name
    if (parts.length === 1) return normalizeAssociate({ name: parts[0] });
    const obj = {};
    cols.forEach((c, i) => obj[c] = parts[i] || '');
    return normalizeAssociate(obj);
  }).filter(Boolean);
}

function splitRow(line) {
  // Split on tab if present, else comma, else multi-space.
  if (line.includes('\t')) return line.split('\t').map(s => s.trim());
  if (line.includes(',')) return splitCsv(line);
  return line.split(/\s{2,}/).map(s => s.trim());
}

function splitCsv(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function normalizeColumn(name) {
  const n = name.toLowerCase().trim();
  if (n.startsWith('name') || n.startsWith('associate')) return 'name';
  if (n.startsWith('shift')) return 'shift';
  if (n.startsWith('area')) return 'area';
  if (n.startsWith('accomplish')) return 'accomplishment';
  if (n.startsWith('note')) return 'notes';
  if (n.startsWith('manager') || n.startsWith('owner')) return 'manager';
  return n.replace(/[^a-z0-9]+/g, '_') || 'col';
}

function normalizeAssociate(raw) {
  if (!raw) return null;
  const name = (raw.name || raw.Name || raw.associate || '').toString().trim();
  if (!name) return null;
  return {
    id: cryptoRandomId(),
    name,
    shift: (raw.shift || '').toString().trim(),
    area: (raw.area || '').toString().trim(),
    accomplishment: (raw.accomplishment || raw.accomplishments || '').toString().trim(),
    notes: (raw.notes || raw.note || '').toString().trim(),
    manager: (raw.manager || raw.owner || '').toString().trim(),
  };
}

function cryptoRandomId() {
  const a = new Uint8Array(6);
  (globalThis.crypto || window.crypto).getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

export function blankAssociate() {
  return { id: cryptoRandomId(), name: '', shift: '', area: '', accomplishment: '', notes: '', manager: '' };
}

// ---- APAISuite ClosingList email format -----------------------------------
// First line: "Closing List — Store {n} — {date}"
// Blank line
// Then alternating: job-group title (unindented) + indented "  Name: range[: CALLED OFF (reason)]" lines
// After all groups, optionally: "IVR absences with no scheduled match in CaseVisibility:"
// followed by indented "  RawName (reason)" lines for call-offs without a scheduled shift.
//
// Format reference: APAISuite/unified-extension-suite/modules/closinglist/lib/parse.js → render()
export function parseClosingListEmail(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let currentJob = '';
  let inIvrSection = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;

    // Skip the header line.
    if (CLOSINGLIST_HEADER_RE.test(line)) continue;

    // IVR section toggle.
    if (/^ivr absences with no scheduled match/i.test(line)) {
      inIvrSection = true;
      continue;
    }

    // Trailing diagnostic block from showJobTitles option — stop parsing.
    if (/^—\s*job titles seen/i.test(line)) break;

    // Indented lines (originals had 2-space indent) → associate row in current group / IVR.
    const isIndented = /^\s{2,}/.test(raw);

    if (inIvrSection && isIndented) {
      // "  Sam W. (Personal)" or "  Sam W."
      const m = line.match(/^(.+?)(?:\s*\(([^)]+)\))?$/);
      if (!m) continue;
      const name = m[1].trim();
      const reason = (m[2] || '').trim();
      out.push({
        id: cryptoRandomId(),
        name,
        shift: '',
        area: '',
        accomplishment: '',
        notes: reason ? `CALLED OFF (${reason}) — no scheduled shift` : 'CALLED OFF — no scheduled shift',
        manager: '',
      });
      continue;
    }

    if (isIndented) {
      // Format: "  name: range:suffix"
      //   - name has no ":" (e.g., "Maria G.")
      //   - range CAN contain ":" (e.g., "1:30-10:30pm")
      //   - trailing ":" always present (suffix may be empty)
      // Strategy: rightmost ":" splits "name+range" from suffix;
      //           first ":" inside "name+range" splits name from range.
      const lastColon = line.lastIndexOf(':');
      if (lastColon === -1) continue;
      const head = line.slice(0, lastColon);
      const tail = line.slice(lastColon + 1).trim();
      const firstColon = head.indexOf(':');
      if (firstColon === -1) continue;
      const name = head.slice(0, firstColon).trim();
      const shift = head.slice(firstColon + 1).trim();
      let notes = '';
      if (/^called off/i.test(tail)) {
        const rm = tail.match(/called off\s*(?:\(([^)]+)\))?/i);
        notes = rm && rm[1] ? `CALLED OFF (${rm[1].trim()})` : 'CALLED OFF';
      }
      out.push({
        id: cryptoRandomId(),
        name,
        shift,
        area: currentJob,
        accomplishment: '',
        notes,
        manager: '',
      });
      continue;
    }

    // Unindented, non-header → group title (job).
    currentJob = line;
  }

  return out;
}

function normalizeClosingListAssociate(a) {
  if (!a) return null;
  const name = (a.name || '').toString().trim();
  if (!name) return null;
  const shift = formatShiftRange(a.start, a.end);
  let notes = '';
  if (a.calledOff) {
    const reason = a.calledOff.reason && a.calledOff.reason !== 'None' ? ` (${a.calledOff.reason})` : '';
    notes = `CALLED OFF${reason}`;
  }
  return {
    id: cryptoRandomId(),
    name,
    shift,
    area: (a.jobLabel || '').toString().trim(),
    accomplishment: '',
    notes,
    manager: '',
  };
}

// Compact "8am-5pm" / "1:30-10:30pm" formatter — matches APAISuite's render style.
function formatShiftRange(start, end) {
  const s = part(start);
  const e = part(end);
  if (!s && !e) return '';
  if (!s || !e) return [s, e].filter(Boolean).join('-');
  if (s.ampm === e.ampm) return `${s.hm}-${e.hm}${e.ampm}`;
  return `${s.hm}${s.ampm}-${e.hm}${e.ampm}`;
}
function part(d) {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return null;
  const h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  const minutes = m === 0 ? '' : ':' + String(m).padStart(2, '0');
  return { hm: `${h12}${minutes}`, ampm };
}
