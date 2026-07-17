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
  const [day, setDay] = useState('saturday');
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set()); // section ids that are expanded
  const { resetDay, storeNumber, slotData, state } = useWeekend();

  function toggleSection(id) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleEmail() {
    const label   = DAYS.find(d => d.id === day)?.label ?? day;
    const dateStr = new Date().toLocaleDateString();
    const subject = `${storeNumber ? `Store ${storeNumber} · ` : ''}${label} First Pick Checklist · ${dateStr}`;

    const lines = [];
    lines.push(`${storeNumber ? `Store ${storeNumber} — ` : ''}${label} First Pick Checklist`);
    lines.push(`Date: ${dateStr}`);
    lines.push('');

    for (const slot of SLOTS) {
      const { name, checks, photos } = slotData(day, slot.id);
      lines.push(`── ${slot.label} · ${name || '(no name)'} ──`);
      for (const section of WEEKEND_SECTIONS) {
        const rows = section.items.map(item => {
          const done = !!checks[item.id];
          const nPhotos = (photos[item.id] || []).length;
          const glyph = done ? '[x]' : '[ ]';
          const extra = nPhotos ? ` (${nPhotos} photo${nPhotos > 1 ? 's' : ''})` : '';
          return `  ${glyph} ${item.label}${extra}`;
        });
        lines.push(`  ${section.title}:`);
        lines.push(...rows);
      }
      lines.push('');
    }
    lines.push(`Sent from Closing Manager Checklist · ${new Date().toLocaleString()}`);

    const settings = storage.getSettings();
    const to       = settings.emailRecipient || '';
    const href     = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
    window.location.href = href;
  }

  async function handleExportPdf() {
    setExporting(true);
    try {
      await exportProfessionalPdf({ day, storeNumber, slotData });
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
          {dayLabel} · First Pick Checklist
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

      {/* Header card with names */}
      <div className="bg-white rounded-2xl ring-1 ring-slate-200 overflow-hidden mb-3">
        <div className="bg-[#0071CE] px-4 py-3">
          <div className="text-white font-bold text-base">
            {storeNumber ? `Store ${storeNumber} — ` : ''}{dayLabel} · First Pick Checklist
          </div>
          <div className="text-blue-100 text-xs mt-0.5">Areas with first-time pick issues</div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-200 border-t border-slate-200">
          {SLOTS.map(slot => (
            <div key={slot.id} className="p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{slot.label}</div>
              <NameInput day={day} slotId={slot.id} />
            </div>
          ))}
        </div>
      </div>

      {/* Collapsible sections */}
      <div className="space-y-2">
        {WEEKEND_SECTIONS.map(section => (
          <SectionPanel
            key={section.id}
            section={section}
            day={day}
            expanded={expanded.has(section.id)}
            onToggle={() => toggleSection(section.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Section (collapsible) ──────────────────────────────────────────────────

function SectionPanel({ section, day, expanded, onToggle }) {
  const { slotData } = useWeekend();

  // Progress across both slots.
  let done = 0;
  const total = section.items.length * SLOTS.length;
  for (const slot of SLOTS) {
    const { checks } = slotData(day, slot.id);
    for (const item of section.items) if (checks[item.id]) done++;
  }
  const pct = total ? (done / total) * 100 : 0;

  return (
    <section className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-stretch">
          <div
            className="w-1.5 shrink-0"
            style={{ backgroundColor: section.color }}
          />
          <div className="flex-1 px-3 py-3">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 text-[15px] flex-1 truncate">{section.title}</h3>
              <span className="text-[11px] font-semibold text-slate-500 shrink-0">{done}/{total}</span>
              <Chevron open={expanded} />
            </div>
            <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: section.color }}
              />
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide w-[38%]">Item</th>
                {SLOTS.map(slot => (
                  <th key={slot.id} className="px-2 py-2 text-center text-[10px] font-bold text-slate-700 w-[31%]">
                    {slot.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.items.map((item, idx) => (
                <ItemRow key={item.id} item={item} day={day} zebra={idx % 2 === 1} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Rows ───────────────────────────────────────────────────────────────────

function ItemRow({ item, day, zebra }) {
  return (
    <tr className={zebra ? 'bg-slate-50/60' : 'bg-white'}>
      <td className="px-3 py-2.5 text-[13px] text-slate-800 border-b border-slate-100 align-top">{item.label}</td>
      {SLOTS.map(slot => (
        <td key={slot.id} className="px-2 py-2.5 border-b border-slate-100 align-top">
          <SlotCell day={day} slotId={slot.id} itemId={item.id} />
        </td>
      ))}
    </tr>
  );
}

function SlotCell({ day, slotId, itemId }) {
  const { slotData, toggle, removePhoto } = useWeekend();
  const { checks, photos } = slotData(day, slotId);
  const checked = !!checks[itemId];
  const itemPhotos = photos[itemId] || [];

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={() => toggle(day, slotId, itemId)}
        className={
          'w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-colors ' +
          (checked
            ? 'bg-[#0071CE] border-[#0071CE]'
            : 'bg-white border-slate-300 hover:border-[#0071CE]')
        }
        aria-label={checked ? 'Uncheck' : 'Check'}
      >
        {checked && <CheckIcon />}
      </button>

      {itemPhotos.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center">
          {itemPhotos.map(p => (
            <div key={p.id} className="relative" title={photoTitle(p)}>
              <img src={p.dataUrl} alt="photo" className="w-10 h-10 object-cover rounded ring-1 ring-slate-200" />
              <button
                onClick={() => removePhoto(day, slotId, itemId, p.id)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center"
                aria-label="Remove"
              >×</button>
            </div>
          ))}
        </div>
      )}

      <PhotoBtn day={day} slotId={slotId} itemId={itemId} />
    </div>
  );
}

function photoTitle(p) {
  const t = p.addedAt ? new Date(p.addedAt).toLocaleString() : '';
  return [p.addedBy, t].filter(Boolean).join(' · ');
}

// ── Inputs ─────────────────────────────────────────────────────────────────

function NameInput({ day, slotId }) {
  const { slotData, setName, userName } = useWeekend();
  const { name } = slotData(day, slotId);
  const displayValue = name || (slotId === 'slot_a' ? (userName || '') : '');
  return (
    <input
      value={displayValue}
      onChange={e => setName(day, slotId, e.target.value)}
      placeholder="Name…"
      className="mt-1 block w-full text-sm border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-[#0071CE]"
    />
  );
}

function PhotoBtn({ day, slotId, itemId }) {
  const { addPhoto, slotData, userName } = useWeekend();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const onFiles = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    try {
      const slotName = slotData(day, slotId).name || userName || 'Unknown';
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        const dataUrl = await compressImage(f);
        addPhoto(day, slotId, itemId, {
          id: cryptoId(),
          dataUrl,
          addedAt: new Date().toISOString(),
          addedBy: slotName,
        });
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [day, slotId, itemId, addPhoto, slotData, userName]);

  return (
    <div>
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
        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-40"
        title="Add photo"
      >
        {busy ? <SpinIcon className="w-4 h-4 animate-spin" /> : <CamIcon className="w-4 h-4" />}
      </button>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function CamIcon(p)   { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h3l2-3h8l2 3h3v11H3z"/><circle cx="12" cy="13" r="3.5"/></svg>; }
function SpinIcon(p)  { return <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>; }
function Chevron({ open }) {
  return (
    <svg className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

function compressImage(file) {
  const MAX_DIM = 1200;
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
        resolve(c.toDataURL('image/jpeg', 0.78));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bad image')); };
    img.src = url;
  });
}

// ── PDF Export ─────────────────────────────────────────────────────────────
// Renders a clean multi-page PDF using jsPDF's native text/rect primitives
// rather than an html2canvas snapshot. Result: crisp text, small file size,
// and embedded photos with captions.

async function exportProfessionalPdf({ day, storeNumber, slotData }) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 40;                    // page margin
  const usableW = pageW - M * 2;

  const dayLabel = DAYS.find(d => d.id === day)?.label ?? day;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  let y = M;

  // ── Header block ─────────────────────────────────────────────────────
  pdf.setFillColor(0, 113, 206); // #0071CE
  pdf.rect(M, y, usableW, 60, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(`${storeNumber ? `Store ${storeNumber} — ` : ''}${dayLabel} First Pick Checklist`, M + 14, y + 24);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(dateStr, M + 14, y + 44);
  y += 76;

  // ── Slot names row ───────────────────────────────────────────────────
  pdf.setTextColor(40, 40, 40);
  pdf.setDrawColor(220, 220, 220);
  pdf.setLineWidth(0.5);
  const slotColW = usableW / SLOTS.length;
  for (let i = 0; i < SLOTS.length; i++) {
    const slot = SLOTS[i];
    const x = M + i * slotColW;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(120, 120, 120);
    pdf.text(slot.label.toUpperCase(), x + 8, y + 12);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(30, 30, 30);
    const name = slotData(day, slot.id).name || '—';
    pdf.text(name, x + 8, y + 30);
  }
  pdf.setDrawColor(220, 220, 220);
  pdf.line(M, y + 40, M + usableW, y + 40);
  y += 56;

  // ── Sections ─────────────────────────────────────────────────────────
  for (const section of WEEKEND_SECTIONS) {
    y = drawSection({ pdf, section, day, slotData, y, M, usableW, pageH, pageW });
  }

  // ── Footer on every page ─────────────────────────────────────────────
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

function drawSection({ pdf, section, day, slotData, y, M, usableW, pageH, pageW }) {
  const PB = pageH - M - 20; // page bottom cutoff (leave room for footer)

  // Section header band.
  y = pageBreakIfNeeded(pdf, y, 30, M, PB);
  const rgb = hexToRgb(section.color);
  pdf.setFillColor(rgb.r, rgb.g, rgb.b);
  pdf.rect(M, y, usableW, 22, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(section.title.toUpperCase(), M + 10, y + 15);
  y += 30;

  // Items.
  for (const item of section.items) {
    y = drawItem({ pdf, item, section, day, slotData, y, M, usableW, PB });
  }
  y += 6;
  return y;
}

function drawItem({ pdf, item, section, day, slotData, y, M, usableW, PB }) {
  // Gather per-slot state.
  const slotStates = SLOTS.map(slot => {
    const { checks, photos } = slotData(day, slot.id);
    return {
      slot,
      checked: !!checks[item.id],
      photos: photos[item.id] || [],
      slotName: slotData(day, slot.id).name || '',
    };
  });

  const hasPhotos = slotStates.some(s => s.photos.length > 0);
  const rowH = 22;
  // Estimate photo block height (110pt tall if any photos, else 0).
  const photoBlockH = hasPhotos ? 130 : 0;
  y = pageBreakIfNeeded(pdf, y, rowH + photoBlockH + 6, M, PB);

  // Item label + checkboxes.
  pdf.setDrawColor(230, 230, 230);
  pdf.setLineWidth(0.4);
  pdf.line(M, y + rowH, M + usableW, y + rowH);

  pdf.setTextColor(30, 30, 30);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text(item.label, M + 6, y + 15);

  // Checkboxes and slot status on the right half.
  const slotColW = (usableW * 0.55) / SLOTS.length;
  const slotBaseX = M + usableW * 0.45;
  for (let i = 0; i < slotStates.length; i++) {
    const s = slotStates[i];
    const cx = slotBaseX + i * slotColW + slotColW / 2;
    const boxSize = 12;
    const boxX = cx - boxSize / 2;
    const boxY = y + 5;
    // Draw box.
    pdf.setDrawColor(160, 160, 160);
    pdf.setLineWidth(0.6);
    if (s.checked) {
      const rgb = hexToRgb(section.color);
      pdf.setFillColor(rgb.r, rgb.g, rgb.b);
      pdf.rect(boxX, boxY, boxSize, boxSize, 'FD');
      // Checkmark
      pdf.setDrawColor(255, 255, 255);
      pdf.setLineWidth(1.5);
      pdf.line(boxX + 3,  boxY + 6.5, boxX + 5.5, boxY + 9);
      pdf.line(boxX + 5.5, boxY + 9,   boxX + 10, boxY + 3.5);
    } else {
      pdf.rect(boxX, boxY, boxSize, boxSize, 'S');
    }
    // Slot label to the right of the box.
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text(s.slot.label, cx + boxSize / 2 + 6, y + 14);
  }
  y += rowH;

  // Photos block underneath the row (if any).
  if (hasPhotos) {
    y = drawPhotos({ pdf, slotStates, y, M, usableW, PB });
  }
  return y;
}

function drawPhotos({ pdf, slotStates, y, M, usableW, PB }) {
  const PHOTO_W = 100;   // 100pt ≈ 1.4"
  const PHOTO_H = 100;
  const GAP     = 8;
  const CAP_H   = 22;    // caption below photo
  const totalItemH = PHOTO_H + CAP_H;

  let x = M + 20;
  let maxY = y;

  for (const s of slotStates) {
    for (const p of s.photos) {
      // Wrap to next line if we'd exceed the right margin.
      if (x + PHOTO_W > M + usableW) {
        x = M + 20;
        y = maxY + GAP;
      }
      // Page break if we can't fit this photo.
      y = pageBreakIfNeeded(pdf, y, totalItemH + 6, M, PB);
      // Refresh x if we broke to a new page.
      if (y === M + 6) x = M + 20;

      try {
        pdf.addImage(p.dataUrl, 'JPEG', x, y, PHOTO_W, PHOTO_H, undefined, 'FAST');
      } catch (e) {
        // Skip broken image, don't blow up the whole export.
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(x, y, PHOTO_W, PHOTO_H, 'S');
      }
      // Caption.
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(60, 60, 60);
      const who = p.addedBy || s.slotName || 'Unknown';
      pdf.text(who, x, y + PHOTO_H + 10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(120, 120, 120);
      const time = p.addedAt ? new Date(p.addedAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      }) : '';
      pdf.text(`${s.slot.label} · ${time}`, x, y + PHOTO_H + 20);

      x += PHOTO_W + GAP;
      maxY = Math.max(maxY, y + totalItemH);
    }
  }
  return maxY + 8;
}

function pageBreakIfNeeded(pdf, y, blockH, M, PB) {
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
