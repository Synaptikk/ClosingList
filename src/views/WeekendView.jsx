import { useRef, useState, useCallback } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { WEEKEND_SECTIONS, SLOTS } from '../config/weekendConfig';
import { useWeekend } from '../store/weekendStore';

const DAYS = [
  { id: 'saturday', label: 'Saturday' },
  { id: 'sunday',   label: 'Sunday' },
];

export default function WeekendView() {
  const [day, setDay] = useState('saturday');
  const [exporting, setExporting] = useState(false);
  const printRef = useRef(null);
  const { resetDay, storeNumber } = useWeekend();

  async function handleExportPdf() {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const node = printRef.current;
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: Math.max(node.scrollWidth, 900),
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const usableW = pageW - margin * 2;
      const ratio = usableW / canvas.width;
      const slicePx = Math.floor((pageH - margin * 2) / ratio);
      let y = 0, page = 0;
      while (y < canvas.height) {
        const h = Math.min(slicePx, canvas.height - y);
        const slice = document.createElement('canvas');
        slice.width = canvas.width; slice.height = h;
        const ctx = slice.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, slice.width, h);
        ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        const img = slice.toDataURL('image/jpeg', 0.92);
        if (page > 0) pdf.addPage();
        pdf.addImage(img, 'JPEG', margin, margin, usableW, h * ratio);
        y += h; page++;
      }
      const label = DAYS.find(d => d.id === day)?.label ?? day;
      pdf.save(`weekend-firstpick-${label.toLowerCase()}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="px-3 pt-4 pb-32">
      {/* Day tabs */}
      <div className="flex gap-2 mb-4 no-print">
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
      <div className="flex items-center justify-between mb-4 no-print">
        <span className="text-xs text-slate-500 font-medium">
          {DAYS.find(d => d.id === day)?.label} · First Pick Checklist
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => { if (window.confirm('Reset all data for this day?')) resetDay(day); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700"
          >Reset</button>
          <button
            onClick={handleExportPdf}
            disabled={exporting}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0071CE] hover:bg-[#005fae] text-white disabled:opacity-60"
          >{exporting ? 'Exporting…' : 'Export PDF'}</button>
        </div>
      </div>

      {/* Printable area */}
      <div ref={printRef} className="bg-white rounded-2xl ring-1 ring-slate-200 overflow-hidden">
        {/* Print header */}
        <div className="bg-[#0071CE] px-4 py-3">
          <div className="text-white font-bold text-base">
            {storeNumber ? `Store ${storeNumber} — ` : ''}{DAYS.find(d => d.id === day)?.label} · First Pick Checklist
          </div>
          <div className="text-blue-100 text-xs mt-0.5">Areas with first-time pick issues</div>
        </div>

        {/* Column headers + name inputs */}
        <div className="grid grid-cols-[1fr_1fr] border-b border-slate-200">
          {/* item label column spacer */}
          <div />
          {/* This will overlap — we build the two-column table below */}
        </div>

        <DayGrid day={day} />
      </div>
    </div>
  );
}

function DayGrid({ day }) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="bg-slate-50">
          <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[40%]">Item</th>
          {SLOTS.map(slot => (
            <th key={slot.id} className="px-2 py-2.5 text-center w-[30%]">
              <div className="text-xs font-bold text-slate-800">{slot.label}</div>
              <NameInput day={day} slotId={slot.id} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {WEEKEND_SECTIONS.map(sec => (
          <SectionRows key={sec.id} section={sec} day={day} />
        ))}
      </tbody>
    </table>
  );
}

function NameInput({ day, slotId }) {
  const { slotData, setName, userName } = useWeekend();
  const { name } = slotData(day, slotId);
  // On first render, if no name saved yet and this is slot_a, default to the logged-in user's name.
  const displayValue = name !== undefined ? name : '';
  return (
    <input
      value={displayValue || (slotId === 'slot_a' && !name ? (userName || '') : '')}
      onChange={e => setName(day, slotId, e.target.value)}
      placeholder="Name…"
      className="mt-1 block w-full text-center text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:border-[#0071CE]"
    />
  );
}

function SectionRows({ section, day }) {
  return (
    <>
      <tr>
        <td
          colSpan={3}
          className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white"
          style={{ backgroundColor: section.color }}
        >{section.title}</td>
      </tr>
      {section.items.map((item, idx) => (
        <ItemRow key={item.id} item={item} day={day} zebra={idx % 2 === 1} />
      ))}
    </>
  );
}

function ItemRow({ item, day, zebra }) {
  return (
    <tr className={zebra ? 'bg-slate-50/60' : 'bg-white'}>
      <td className="px-3 py-2 text-[13px] text-slate-800 border-b border-slate-100 align-top">{item.label}</td>
      {SLOTS.map(slot => (
        <td key={slot.id} className="px-2 py-2 border-b border-slate-100 align-top">
          <SlotCell day={day} slotId={slot.id} itemId={item.id} />
        </td>
      ))}
    </tr>
  );
}

function SlotCell({ day, slotId, itemId }) {
  const { slotData, toggle, addPhoto, removePhoto } = useWeekend();
  const { checks, photos } = slotData(day, slotId);
  const checked = !!checks[itemId];
  const itemPhotos = photos[itemId] || [];

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Large checkbox */}
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

      {/* Thumbnails */}
      {itemPhotos.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center">
          {itemPhotos.map(p => (
            <div key={p.id} className="relative">
              <img
                src={p.dataUrl}
                alt="photo"
                className="w-10 h-10 object-cover rounded ring-1 ring-slate-200"
              />
              <button
                onClick={() => removePhoto(day, slotId, itemId, p.id)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center no-print"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Camera button */}
      <PhotoBtn day={day} slotId={slotId} itemId={itemId} />
    </div>
  );
}

function PhotoBtn({ day, slotId, itemId }) {
  const { addPhoto } = useWeekend();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const onFiles = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) {
        if (!f.type.startsWith('image/')) continue;
        const dataUrl = await compressImage(f);
        addPhoto(day, slotId, itemId, { id: cryptoId(), dataUrl, addedAt: new Date().toISOString() });
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [day, slotId, itemId, addPhoto]);

  return (
    <div className="no-print">
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

function CamIcon(p) {
  return (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h3l2-3h8l2 3h3v11H3z" /><circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function SpinIcon(p) {
  return (
    <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
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
  const MAX_DIM = 1600;
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
        resolve(c.toDataURL('image/jpeg', 0.82));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bad image')); };
    img.src = url;
  });
}
