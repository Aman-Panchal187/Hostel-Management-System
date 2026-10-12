import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export interface PdfReport {
  title: string;
  /** e.g. hostel or platform name */
  subject: string;
  rangeLabel: string;
  kpis: { label: string; value: string }[];
  /** DOM element containing the charts to capture */
  element: HTMLElement;
  filename: string;
}

const PAGE = { w: 210, h: 297, margin: 12 };
const INK = { bg: [11, 17, 32] as const, text: [248, 250, 252] as const, muted: [148, 163, 184] as const, accent: [34, 211, 238] as const, card: [30, 41, 59] as const };

function fillPage(doc: jsPDF) {
  doc.setFillColor(...INK.bg);
  doc.rect(0, 0, PAGE.w, PAGE.h, 'F');
}

/** Builds a multi-page A4 report. Each [data-pdf-block] is captured whole and never split across pages. */
export async function buildReportPdf(report: PdfReport): Promise<jsPDF> {
  const blocks = Array.from(report.element.querySelectorAll<HTMLElement>('[data-pdf-block]'));
  const targets = blocks.length > 0 ? blocks : [report.element];
  const canvases: HTMLCanvasElement[] = [];
  report.element.classList.add('pdf-mode');
  try {
    for (const target of targets) {
      canvases.push(await html2canvas(target, { backgroundColor: '#0B1120', scale: 2, useCORS: true, logging: false }));
    }
  } finally {
    report.element.classList.remove('pdf-mode');
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  fillPage(doc);

  let y = PAGE.margin + 4;
  doc.setTextColor(...INK.text);
  doc.setFont('helvetica', 'bold').setFontSize(20).text(report.title, PAGE.margin, y);
  y += 8;
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(...INK.accent).text(report.subject, PAGE.margin, y);
  y += 6;
  doc.setTextColor(...INK.muted).setFontSize(9).text(`Period: ${report.rangeLabel}`, PAGE.margin, y);
  y += 8;

  // KPI grid: up to 4 per row
  const perRow = 4;
  const gap = 3;
  const cardW = (PAGE.w - PAGE.margin * 2 - gap * (perRow - 1)) / perRow;
  report.kpis.forEach((kpi, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const x = PAGE.margin + col * (cardW + gap);
    const top = y + row * (16 + gap);
    doc.setFillColor(...INK.card).roundedRect(x, top, cardW, 16, 2, 2, 'F');
    doc.setTextColor(...INK.muted).setFontSize(7.5).text(kpi.label.toUpperCase(), x + 3, top + 5.5);
    doc.setTextColor(...INK.text).setFont('helvetica', 'bold').setFontSize(13).text(kpi.value, x + 3, top + 12.5);
    doc.setFont('helvetica', 'normal');
  });
  y += Math.ceil(report.kpis.length / perRow) * (16 + gap) + 4;

  const usableW = PAGE.w - PAGE.margin * 2;
  const maxY = PAGE.h - PAGE.margin - 8;
  for (const canvas of canvases) {
    let w = usableW;
    let h = (canvas.height * w) / canvas.width;
    if (h > maxY - PAGE.margin) {
      h = maxY - PAGE.margin; // block taller than a page: scale down instead of cropping
      w = (canvas.width * h) / canvas.height;
    }
    if (y + h > maxY) {
      doc.addPage();
      fillPage(doc);
      y = PAGE.margin;
    }
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', PAGE.margin, y, w, h);
    y += h + 4;
  }

  const pages = doc.getNumberOfPages();
  const generated = `Generated ${new Date().toLocaleString('en-IN')}`;
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setTextColor(...INK.muted).setFontSize(8);
    doc.text(generated, PAGE.margin, PAGE.h - 6);
    doc.text(`Page ${p} of ${pages}`, PAGE.w - PAGE.margin, PAGE.h - 6, { align: 'right' });
  }
  return doc;
}

export async function exportReportPdf(report: PdfReport): Promise<void> {
  const doc = await buildReportPdf(report);
  doc.save(report.filename);
}
