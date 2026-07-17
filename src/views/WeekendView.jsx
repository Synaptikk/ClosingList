import { useRef, useState, useCallback } from 'react';
import jsPDF from 'jspdf';
import { WEEKEND_SECTIONS, SLOTS } from '../config/weekendConfig';
import { useWeekend } from '../store/weekendStore';
import { storage } from '../lib/storage';

const DAYS = [
  { id: 'saturday', label: 'Saturday' },
  { id: 'sunday',   label: 'Sunday' },
];

export default function WeekendView() {
  const [day, setDay] = useState(() => defaultDay());
  const [exporting, setExporting] = useState(false);
  const [expandedSections, setExpandedSections] = useState(() => new Set());
  const [expandedItems, setExpandedItems]       = useState(() => new Set()); // "sectionId:itemId"
  const { resetDay, storeNumber, slotData } = useWeekend();

  function toggleSection(id) {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleItem(key) {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function handleEmail() {
    const label   = DAYS.find(d => d.id === day)?.label ?? day;
    const dateStr = new Date().toLocaleDateString();
    const subject = `${storeNumber ? `Store ${storeNumber} · ` : ''}${label} FTPR Checklist · ${dateStr}`;
    const body    = buildOverviewText({ day, storeNumber, slotData });
    const to      = storage.getSettings().emailRecipient || '';
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function handleExportPdf() {
    setExporting(true);
    try {
      await exportOverviewPdf({ day, storeNumber, slotData });
    } finally {
      setExporting(false);
    }
  }

  const dayLabel = DAYS.find(d => d.id === day)?.label ?? day;

  return (
    <div className="px-3 pt-4 pb-32">
      {/* Day tabs */}
      <div className="flex gap-2 mb-4">
        {DAYS.map(d => (
          <button
            key={d.id}
            onClick={() => setDay(d.id)}
            className={
              'flex-1 py-2 rounded-xl text-sm font-bold ring-1 transition-colors ' +
              (day === d.id
                ? 'bg-[#0071CE] text-white ring-[#0071CE]'
                : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')
            }
          >{d.label}</button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-slate-500 font-medium">
          {dayLabel} · FTPR Checklist
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => { if (window.confirm('Reset all data for this day?')) resetDay(day); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700"
          >Reset</button>
          <button
            onClick={handleEmail}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
          >Email</button>
          <button
            onClick={handleExportPdf}
            disabled={exporting}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0071CE] hover:bg-[#005fae] text-white disabled:opacity-60"
          >{exporting ? 'Exporting…' : 'Export PDF'}</button>
        </div>
      </div>

      {/* Header card */}
      <div className="bg-white rounded-2xl ring-1 ring-slate-200 overflow-hidden mb-3">
        <div className="bg-[#0071CE] px-4 py-3">
          <div className="text-white font-bold text-base">
            {storeNumber ? `Store ${storeNumber} — ` : ''}{dayLabel} · FTPR Checklist
          </div>
          <div className="text-blue-100 text-xs mt-0.5">Areas with first-time pick issues</div>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {WEEKEND_SECTIONS.map(section => (
          <SectionPanel
            key={section.id}
            section={section}
            day={day}
            expanded={expandedSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
            expandedItems={expandedItems}
            onToggleItem={toggleItem}
          />
        ))}
      </div>
    </div>
  );
}

// ── Section (collapsible) ──────────────────────────────────────────────────

function SectionPanel({ section, day, expanded, onToggle, expandedItems, onToggleItem }) {
  const { slotData } = useWeekend();

  let done = 0;
  const total = section.items.length * SLOTS.length;
  for (const slot of SLOTS) {
    const { checks } = slotData(day, slot.id);
    for (const item of section.items) if (checks[item.id]) done++;
  }
  const pct = total ? (done / total) * 100 : 0;

  return (
    <section className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <button onClick={onToggle} className="w-full text-left" aria-expanded={expanded}>
        <div className="flex items-stretch">
          <div className="w-1.5 shrink-0" style={{ backgroundColor: section.color }} />
          <div className="flex-1 px-3 py-3">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 text-[15px] flex-1 truncate">{section.title}</h3>
              <span className="text-[11px] font-semibold text-slate-500 shrink-0">{done}/{total}</span>
              <Chevron open={expanded} />
            </div>
            <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: section.color }} />
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100">
          {/* Per-section assignee inputs, one per slot */}
          <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-100 bg-slate-50">
            {SLOTS.map(slot => (
              <div key={slot.id} className="p-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                  {slot.label} Assignee
                </div>
                <AssigneeInput day={day} slotId={slot.id} sectionId={section.id} />
              </div>
            ))}
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide w-[32%]">Item</th>
                {SLOTS.map(slot => (
                  <th key={slot.id} className="px-2 py-2 text-center text-[10px] font-bold text-slate-700 w-[34%]">
                    {slot.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.items.map((item, idx) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  section={section}
                  day={day}
                  zebra={idx % 2 === 1}
                  expanded={expandedItems.has(`${section.id}:${item.id}`)}
                  onToggle={() => onToggleItem(`${section.id}:${item.id}`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Item row (clickable to expand notes) ───────────────────────────────────

function ItemRow({ item, section, day, zebra, expanded, onToggle }) {
  const { slotData } = useWeekend();
  const hasAnyNote = SLOTS.some(s => (slotData(day, s.id).notes[item.id] || '').trim().length > 0);

  return (
    <>
      <tr className={zebra ? 'bg-slate-50/60' : 'bg-white'}>
        <td className="border-b border-slate-100 align-top">
          <button
            onClick={onToggle}
            className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-center gap-1.5"
            aria-expanded={expanded}
          >
            <span className="text-[13px] text-slate-800 flex-1 truncate">{item.label}</span>
            {hasAnyNote && <NoteIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
            <Chevron open={expanded} small />
          </button>
        </td>
        {SLOTS.map(slot => (
          <td key={slot.id} className="px-2 py-2.5 border-b border-slate-100 align-middle">
            <SlotCell day={day} slotId={slot.id} itemId={item.id} sectionId={section.id} />
          </td>
        ))}
      </tr>
      {expanded && (
        <tr>
          <td colSpan={3} className="bg-slate-50 border-b border-slate-200 px-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              {SLOTS.map(slot => (
                <NoteInput key={slot.id} day={day} slotId={slot.id} itemId={item.id} slotLabel={slot.label} />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Slot cell (horizontal: check + camera + thumbs in one row) ─────────────

function SlotCell({ day, slotId, itemId, sectionId }) {
  const { slotData, toggle, removePhoto } = useWeekend();
  const { checks, photos } = slotData(day, slotId);
  const checked = !!checks[itemId];
  const itemPhotos = photos[itemId] || [];

  return (
    <div className="flex items-center justify-start gap-1.5 flex-wrap">
      <button
        onClick={() => toggle(day, slotId, itemId)}
        className={
          'w-7 h-7 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 ' +
          (checked
            ? 'bg-[#0071CE] border-[#0071CE]'
            : 'bg-white border-slate-300 hover:border-[#0071CE]')
        }
        aria-label={checked ? 'Uncheck' : 'Check'}
      >
        {checked && <CheckIcon />}
      </button>

      <PhotoBtn day={day} slotId={slotId} itemId={itemId} sectionId={sectionId} />

      {itemPhotos.map(p => (
        <div key={p.id} className="relative shrink-0">
          <img src={p.dataUrl} alt="" className="w-8 h-8 object-cover rounded ring-1 ring-slate-200" />
          <button
            onClick={() => removePhoto(day, slotId, itemId, p.id)}
            className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500 text-white text-[8px] flex items-center justify-center"
            aria-label="Remove"
          >×</button>
        </div>
      ))}
    </div>
  );
}

// ── Inputs ─────────────────────────────────────────────────────────────────

function AssigneeInput({ day, slotId, sectionId }) {
  const { slotData, setAssignee, userName } = useWeekend();
  const stored = slotData(day, slotId).assignees[sectionId] ?? undefined;
  // First-run default: show logged-in user's name in slot_a only if never set yet.
  const displayValue = stored !== undefined ? stored : (slotId === 'slot_a' ? (userName || '') : '');
  return (
    <input
      value={displayValue}
      onChange={e => setAssignee(day, slotId, sectionId, e.target.value)}
      placeholder="Assign associate…"
      className="mt-1 block w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-[#0071CE]"
    />
  );
}

function NoteInput({ day, slotId, itemId, slotLabel }) {
  const { slotData, setNote } = useWeekend();
  const value = slotData(day, slotId).notes[itemId] || '';
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
        {slotLabel} notes
      </span>
      <textarea
        value={value}
        onChange={e => setNote(day, slotId, itemId, e.target.value)}
        placeholder="Add notes for this slot…"
        rows={2}
        className="w-full text-[12px] border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-[#0071CE] resize-y"
      />
    </label>
  );
}

function PhotoBtn({ day, slotId, itemId, sectionId }) {
  const { addPhoto, userName } = useWeekend();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const onFiles = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    try {
      // Tag the photo with the actual person who took it (the logged-in user).
      // Section assignees are separate — they represent WHO OWNS the area, not WHO snapped the photo.
      const uploader = userName || 'Unknown';
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        const dataUrl = await compressImage(f);
        addPhoto(day, slotId, itemId, {
          id: cryptoId(),
          dataUrl,
          addedAt: new Date().toISOString(),
          addedBy: uploader,
        });
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [day, slotId, itemId, addPhoto, userName]);

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={onFiles}
        className="hidden"
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="w-7 h-7 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-40 flex items-center justify-center shrink-0"
        title="Add photo"
      >
        {busy ? <SpinIcon className="w-3.5 h-3.5 animate-spin" /> : <CamIcon className="w-3.5 h-3.5" />}
      </button>
    </>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function CamIcon(p)  { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h3l2-3h8l2 3h3v11H3z"/><circle cx="12" cy="13" r="3.5"/></svg>; }
function SpinIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>; }
function NoteIcon(p) { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/></svg>; }
function Chevron({ open, small }) {
  const cls = small ? 'w-4 h-4' : 'w-5 h-5';
  return (
    <svg className={`${cls} text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function cryptoId() {
  const a = new Uint8Array(6);
  (globalThis.crypto || window.crypto).getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

// Default the day tab to today when today IS Saturday or Sunday.
// Any other day of the week -> Saturday (crews are usually prepping ahead).
// Prevents "app opens on Sunday but shows Saturday's data" surprise.
function defaultDay() {
  const dow = new Date().getDay(); // 0 Sun, 6 Sat
  if (dow === 0) return 'sunday';
  return 'saturday';
}

// Weekend photos are for accountability (proof of work), not archival photography.
// A tiny thumbnail is enough to see "yes, wet wall was stocked" — keeps Firebase
// Storage cost near zero. ~30–70 KB per photo at these settings.
function compressImage(file) {
  const MAX_DIM = 800;
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const ratio = Math.min(1, MAX_DIM / Math.max(width, height));
        width = Math.round(width * ratio); height = Math.round(height * ratio);
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        c.getContext('2d').drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.65));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bad image')); };
    img.src = url;
  });
}

// ── Email body (plain-text overview) ───────────────────────────────────────

function buildOverviewText({ day, storeNumber, slotData }) {
  const dayLabel = DAYS.find(d => d.id === day)?.label ?? day;
  const dateStr  = new Date().toLocaleDateString();
  const lines = [];
  lines.push(`${storeNumber ? `Store ${storeNumber} — ` : ''}${dayLabel} FTPR Checklist`);
  lines.push(dateStr);
  lines.push('');

  const notAddressed = [];
  for (const section of WEEKEND_SECTIONS) {
    const rows = [];
    // Section header includes per-slot assignees so leadership sees who owned each shift.
    const assigneeLine = SLOTS.map(slot => {
      const assignee = slotData(day, slot.id).assignees[section.id] || '(unassigned)';
      return `${slot.label}: ${assignee}`;
    }).join('  ·  ');

    for (const item of section.items) {
      const activity = SLOTS
        .map(slot => {
          const s = slotData(day, slot.id);
          const checked  = !!s.checks[item.id];
          const nPhotos  = (s.photos[item.id] || []).length;
          const note     = (s.notes[item.id]  || '').trim();
          const assignee = s.assignees[section.id] || '';
          if (!checked && !nPhotos && !note) return null;
          const parts = [];
          if (checked) parts.push('✓');
          parts.push(slot.label);
          if (assignee) parts.push(`(${assignee})`);
          if (nPhotos)  parts.push(`${nPhotos} photo${nPhotos > 1 ? 's' : ''}`);
          if (note)     parts.push(`— "${note}"`);
          return `    ${parts.join(' ')}`;
        })
        .filter(Boolean);
      if (activity.length) {
        rows.push(`  ${item.label}`);
        rows.push(...activity);
      } else {
        notAddressed.push(`${section.title} / ${item.label}`);
      }
    }
    if (rows.length) {
      lines.push(`── ${section.title} ──`);
      lines.push(`   ${assigneeLine}`);
      lines.push(...rows);
      lines.push('');
    }
  }
  if (notAddressed.length) {
    lines.push('── Not addressed ──');
    lines.push(...notAddressed.map(x => `  • ${x}`));
    lines.push('');
  }
  lines.push(`Sent from Closing Manager Checklist · ${new Date().toLocaleString()}`);
  return lines.join('\n');
}

// ── PDF Export (Overview, not a checklist copy) ────────────────────────────

async function exportOverviewPdf({ day, storeNumber, slotData }) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 40;
  const usableW = pageW - M * 2;
  const PB = pageH - M - 20;

  const dayLabel = DAYS.find(d => d.id === day)?.label ?? day;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  let y = M;

  // Blue header band.
  pdf.setFillColor(0, 113, 206);
  pdf.rect(M, y, usableW, 60, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(`${storeNumber ? `Store ${storeNumber} — ` : ''}${dayLabel} FTPR Checklist`, M + 14, y + 24);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(dateStr, M + 14, y + 44);
  y += 84;

  // ── Only render items that have activity ─────────────────────────────
  const notAddressed = [];

  for (const section of WEEKEND_SECTIONS) {
    const activeItems = section.items.filter(item =>
      SLOTS.some(slot => {
        const s = slotData(day, slot.id);
        return s.checks[item.id] || (s.photos[item.id] || []).length > 0 || (s.notes[item.id] || '').trim();
      })
    );
    const inactiveItems = section.items.filter(item => !activeItems.includes(item));
    inactiveItems.forEach(i => notAddressed.push(`${section.title} / ${i.label}`));

    if (!activeItems.length) continue;

    // Section header.
    y = pageBreak(pdf, y, 46, M, PB);
    const rgb = hexToRgb(section.color);
    pdf.setFillColor(rgb.r, rgb.g, rgb.b);
    pdf.rect(M, y, usableW, 22, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(section.title.toUpperCase(), M + 10, y + 15);
    y += 22;

    // Per-slot assignee line under the section header.
    pdf.setFillColor(248, 248, 248);
    pdf.rect(M, y, usableW, 16, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 80);
    const slotColW = usableW / SLOTS.length;
    for (let i = 0; i < SLOTS.length; i++) {
      const slot = SLOTS[i];
      const assignee = slotData(day, slot.id).assignees[section.id] || '—';
      pdf.text(`${slot.label}: `, M + 10 + i * slotColW, y + 11);
      pdf.setFont('helvetica', 'bold');
      pdf.text(assignee, M + 10 + i * slotColW + pdf.getTextWidth(`${slot.label}: `), y + 11);
      pdf.setFont('helvetica', 'normal');
    }
    y += 20;

    // Each active item.
    for (const item of activeItems) {
      y = drawItemOverview({ pdf, item, section, day, slotData, y, M, usableW, PB });
    }
    y += 4;
  }

  // ── Not addressed section ────────────────────────────────────────────
  if (notAddressed.length) {
    y = pageBreak(pdf, y, 40, M, PB);
    pdf.setFillColor(245, 245, 245);
    pdf.rect(M, y, usableW, 22, 'F');
    pdf.setTextColor(120, 120, 120);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('NOT ADDRESSED', M + 10, y + 15);
    y += 30;
    pdf.setTextColor(80, 80, 80);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    for (const label of notAddressed) {
      y = pageBreak(pdf, y, 14, M, PB);
      pdf.text(`•  ${label}`, M + 12, y + 10);
      y += 14;
    }
  }

  // Footer on every page.
  const pageCount = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(
      `Closing Manager Checklist · Generated ${now.toLocaleString()} · Page ${i} of ${pageCount}`,
      pageW / 2, pageH - 20, { align: 'center' }
    );
  }

  pdf.save(`weekend-firstpick-${dayLabel.toLowerCase()}-${now.toISOString().slice(0, 10)}.pdf`);
}

// Renders one item as a mini-report with a two-column layout:
// item title spans full width, then 12-3pm on the left / 3-6pm on the right.
// Each column: status glyph + activity line + note + photos, scoped to that slot.
function drawItemOverview({ pdf, item, section, day, slotData, y, M, usableW, PB }) {
  // Item title (full width).
  y = pageBreak(pdf, y, 24, M, PB);
  pdf.setTextColor(20, 20, 20);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(item.label, M + 6, y + 12);
  y += 18;

  // Two-column layout.
  const GUTTER = 12;
  const colW   = (usableW - GUTTER) / 2;
  const colX   = [M, M + colW + GUTTER];
  const startY = y;

  // First-pass estimate to see if the tallest column will overflow the page.
  const estH = Math.max(
    estimateSlotBlockH(pdf, item, section, slotData(day, SLOTS[0].id), colW),
    estimateSlotBlockH(pdf, item, section, slotData(day, SLOTS[1].id), colW),
  );
  if (startY + estH > PB) {
    pdf.addPage();
    return drawItemOverview({ pdf, item, section, day, slotData, y: M + 6, M, usableW, PB });
  }

  const columnYs = SLOTS.map((slot, i) => {
    return drawSlotBlock({
      pdf,
      slot,
      section,
      slotState: slotData(day, slot.id),
      item,
      x: colX[i],
      y: startY,
      w: colW,
    });
  });

  y = Math.max(...columnYs) + 6;

  // Divider between items.
  pdf.setDrawColor(240, 240, 240);
  pdf.line(M, y, M + usableW, y);
  y += 6;
  return y;
}

// Renders one slot's block inside a column of width `w`. Returns final y.
function drawSlotBlock({ pdf, slot, section, slotState, item, x, y, w }) {
  const checked = !!slotState.checks[item.id];
  const photos  = slotState.photos[item.id] || [];
  const note    = (slotState.notes[item.id] || '').trim();
  const anyActivity = checked || photos.length || note;

  // Column header — slot label, always shown so both columns line up visually.
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);
  pdf.text(slot.label.toUpperCase(), x + 4, y + 8);

  if (!anyActivity) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9);
    pdf.setTextColor(180, 180, 180);
    pdf.text('— no activity —', x + 4, y + 22);
    return y + 30;
  }

  // Status glyph + assignee (if any) on the same row.
  const rgb = hexToRgb(section.color);
  const glyphY = y + 20;
  if (checked) {
    pdf.setFillColor(rgb.r, rgb.g, rgb.b);
    pdf.circle(x + 8, glyphY, 3, 'F');
  } else {
    pdf.setDrawColor(180, 180, 180);
    pdf.circle(x + 8, glyphY, 3, 'S');
  }
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(60, 60, 60);
  const assignee = slotState.assignees[section.id] || '';
  const parts = [checked ? 'Done' : 'Open'];
  if (assignee)      parts.push(`· ${assignee}`);
  if (photos.length) parts.push(`· ${photos.length} photo${photos.length > 1 ? 's' : ''}`);
  pdf.text(parts.join(' '), x + 16, y + 23);
  let curY = y + 32;

  // Note.
  if (note) {
    const wrapped = pdf.splitTextToSize(`"${note}"`, w - 12);
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9);
    pdf.setTextColor(90, 90, 90);
    pdf.text(wrapped, x + 6, curY);
    curY += wrapped.length * 11 + 2;
  }

    // Photos under this slot's activity line.
    if (photos.length) {
      curY = drawPhotosInBox({ pdf, photos, x: x + 4, y: curY, w: w - 8 });
    }

    return curY;
  }

// Estimates the vertical space one slot block needs, so we can decide whether
// to force a page break before starting the two-column layout.
function estimateSlotBlockH(pdf, item, section, slotState, w) {
  const checked = !!slotState.checks[item.id];
  const photos  = slotState.photos[item.id] || [];
  const note    = (slotState.notes[item.id] || '').trim();
  if (!checked && !photos.length && !note) return 30;
  let h = 32; // slot label + activity line
  if (note) {
    const wrapped = pdf.splitTextToSize(`"${note}"`, w - 12);
    h += wrapped.length * 11 + 2;
  }
  if (photos.length) {
    const PW = 76;
    const perRow = Math.max(1, Math.floor((w - 8) / (PW + 6)));
    const rows = Math.ceil(photos.length / perRow);
    h += rows * (PW + 6);
  }
  return h;
}

// Tile photos in a bounded box (single column). Wraps to new lines as needed.
// No captions — the photo IS the proof, no metadata clutter needed.
function drawPhotosInBox({ pdf, photos, x, y, w }) {
  const PW = 76, PH = 76, GAP = 6;
  const perRow = Math.max(1, Math.floor(w / (PW + GAP)));
  let col = 0;
  let rowY = y;

  for (const p of photos) {
    const px = x + col * (PW + GAP);
    try {
      pdf.addImage(p.dataUrl, 'JPEG', px, rowY, PW, PH, undefined, 'FAST');
    } catch {
      pdf.setDrawColor(200, 200, 200);
      pdf.rect(px, rowY, PW, PH, 'S');
    }
    col++;
    if (col >= perRow) {
      col = 0;
      rowY += PH + GAP;
    }
  }
  if (col > 0) rowY += PH + GAP;
  return rowY + 2;
}

function drawPhotoRow({ pdf, photos, y, M, usableW, PB }) {
  const PW = 90, PH = 90, GAP = 8, CAP = 22;
  const totalH = PH + CAP;
  let x = M + 22;
  let rowMaxY = y;

  for (const p of photos) {
    if (x + PW > M + usableW) {
      x = M + 22;
      y = rowMaxY + GAP;
    }
    y = pageBreak(pdf, y, totalH + 4, M, PB);
    if (y === M + 6) { x = M + 22; rowMaxY = y; }

    try {
      pdf.addImage(p.dataUrl, 'JPEG', x, y, PW, PH, undefined, 'FAST');
    } catch {
      pdf.setDrawColor(200, 200, 200);
      pdf.rect(x, y, PW, PH, 'S');
    }
    // Caption.
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(50, 50, 50);
    const who = p.addedBy || 'Unknown';
    pdf.text(who.slice(0, 16), x, y + PH + 10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(120, 120, 120);
    const time = p.addedAt ? new Date(p.addedAt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }) : '';
    pdf.text(`${p._slotLabel} · ${time}`, x, y + PH + 20);

    x += PW + GAP;
    rowMaxY = Math.max(rowMaxY, y + totalH);
  }
  return rowMaxY;
}

function pageBreak(pdf, y, blockH, M, PB) {
  if (y + blockH > PB) {
    pdf.addPage();
    return M + 6;
  }
  return y;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}
