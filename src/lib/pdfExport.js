import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';

// Renders the ReportPreview DOM node into a multi-page A4 PDF.
// We snapshot at 2x scale for clarity, then slice into page-sized chunks.

export async function exportReportToPdf(node, filename = 'closing-report.pdf') {
  if (!node) throw new Error('No report node to export');

  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: Math.max(node.scrollWidth, 860),
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const usableW = pageW - margin * 2;
  const ratio = usableW / canvas.width;
  const slicePxPerPage = Math.floor((pageH - margin * 2) / ratio);

  let y = 0;
  let page = 0;
  while (y < canvas.height) {
    const sliceH = Math.min(slicePxPerPage, canvas.height - y);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
    const img = slice.toDataURL('image/jpeg', 0.92);
    if (page > 0) pdf.addPage();
    pdf.addImage(img, 'JPEG', margin, margin, usableW, sliceH * ratio);
    y += sliceH;
    page++;
  }

  pdf.save(filename);
  return { pages: page };
}

export function defaultPdfFilename(session) {
  if (!session) return 'closing-report.pdf';
  const d = new Date(session.date);
  const yyyy = d.getFullYear();
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `closing-${session.storeNumber}-${yyyy}${mm}${dd}.pdf`;
}
