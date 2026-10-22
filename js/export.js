// Excel (SheetJS) and PDF (jsPDF + AutoTable) exports.

import * as store from './store.js';
import { equipmentMetrics, jobMetrics, combinedSchedule } from './calc.js';
import { fmtDate, money, today, pct } from './util.js';
import { toast } from './ui.js';

const COMPANY = 'Halvorsen Industrial';
const PRODUCT = 'FleetLedger';
const STATUS = { on: 'On rent', off: 'Off rent', forecast: 'Forecasted' };
const FUEL = { none: 'None', standard: 'Standard', high: 'High' };
const CUR = '"$"#,##0.00';

function libsReady(kind) {
  const ok = kind === 'xlsx' ? !!window.XLSX : !!(window.jspdf && window.jspdf.jsPDF);
  if (!ok) toast('Export library is still loading. Try again in a moment.', 'error');
  return ok;
}

const fileSafe = s => String(s || '').replace(/[^\w.-]+/g, '_');

// ---------- Excel ----------

function sheet(rows, { widths = [], money = [], header = 0, pctCols = [] } = {}) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map(w => ({ wch: w }));
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let r = header + 1; r <= range.e.r; r++) {
    for (const c of money) { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (cell && cell.t === 'n') cell.z = CUR; }
    for (const c of pctCols) { const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (cell && cell.t === 'n') cell.z = '0.00"%"'; }
  }
  if (header !== null && rows.length > header + 1) {
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: header, c: 0 }, e: { r: range.e.r, c: range.e.c } }) };
  }
  ws['!freeze'] = { xSplit: 0, ySplit: header + 1 };
  return ws;
}

const EQ_HEAD = ['Equipment #', 'Description', 'Status', 'COE', 'Vendor', 'PO #', 'PO amount', 'Cost code', 'Qty', 'Manufacturer', 'Model #', 'Serial #',
  'On rent', 'Forecast off rent', 'Actual off rent', 'EAC days', 'ITD days', 'Daily rate', 'Weekly rate', 'Monthly rate', 'Mobilization', 'Demobilization', 'One-time',
  'Fuel type', 'Equip markup %', 'Fuel markup %', 'Environmental tax %', 'Diesel tax %', 'Property tax %', 'Tax rate %',
  'Monthly cost (30 days)', 'Rental cost ITD', 'Rental cost EAC', 'Profit to date', 'EAC profit', 'Notes'];

function eqRow(e) {
  const m = equipmentMetrics(e);
  const n = v => (v === '' || v == null ? '' : Number(v));
  return [e.equipNo || '', e.description || '', STATUS[e.status] || e.status, e.coe ? 'Yes' : 'No', e.vendor || '', e.po || '', n(e.poAmount), e.costCode || '', n(e.qty),
    e.manufacturer || '', e.model || '', e.serial || '', e.onRentDate || '', e.forecastOffDate || '', e.offRentDate || '', m.eacDays, m.itdDays,
    n(e.rateDaily), n(e.rateWeekly), n(e.rateMonthly), n(e.mobCost), n(e.demobCost), n(e.oneTimeCost),
    FUEL[e.fuelType] || 'None', n(e.equipMarkup), n(e.fuelMarkup), n(e.envTax), n(e.dieselTax), n(e.propertyTax), n(e.taxRate),
    round(m.monthlyCost), round(m.itdCost), round(m.eacCost), round(m.itdProfit), round(m.eacProfit), e.notes || ''];
}
const round = v => Math.round(v * 100) / 100;

function eqSheet(list) {
  const rows = [EQ_HEAD, ...list.map(eqRow)];
  const tot = (c) => round(list.reduce((s, e) => s + (eqRow(e)[c] || 0), 0));
  rows.push(['Total', '', '', '', '', '', '', '', list.reduce((s, e) => s + (Number(e.qty) || 0), 0), '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
    tot(30), tot(31), tot(32), tot(33), tot(34), '']);
  return sheet(rows, {
    widths: [13, 32, 11, 6, 20, 13, 13, 13, 6, 16, 14, 18, 12, 14, 14, 9, 9, 11, 11, 12, 12, 13, 11, 10, 9, 9, 10, 9, 10, 9, 16, 15, 15, 14, 13, 40],
    money: [6, 17, 18, 19, 20, 21, 22, 30, 31, 32, 33, 34], pctCols: [24, 25, 26, 27, 28, 29],
  });
}

export function exportJobExcel(job) {
  if (!libsReady('xlsx')) return;
  const all = store.equipmentForJob(job.id);
  const m = jobMetrics(all);
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: `Job ${job.number} Equipment Cost Report`, Company: COMPANY, Author: PRODUCT };

  const summary = [
    [`${COMPANY} · ${PRODUCT}`],
    [`Equipment Cost Report — Job ${job.number}`],
    [`Generated ${fmtDate(today())}`],
    [],
    ['Job information'],
    ['Job number', job.number], ['Job name', job.name], ['JDE ID', job.jdeId || ''], ['Company ID', job.companyId || ''],
    ['Client ID', job.clientId || ''], ['Client name', job.clientName || ''], ['Contract type', job.contractType || ''],
    ['Project manager', job.pm || ''], ['Project accountant', job.pa || ''], ['Equipment contact', job.equipContact || ''],
    ['Address', job.address || ''], ['Procurement contact', job.procurementEmail || ''], ['Project contact', job.projectEmail || ''],
    ['Equipment markup %', Number(job.markupEquipment) || 0], ['No fuel markup %', Number(job.markupNoFuel) || 0],
    ['Standard fuel markup %', Number(job.markupStdFuel) || 0], ['High fuel markup %', Number(job.markupHighFuel) || 0], ['Sales tax %', Number(job.salesTax) || 0],
    ['Description', job.description || ''],
    [],
    ['Cost summary', 'Value', 'Detail'],
    ['Total EAC days', m.eacDays, m.start ? `${fmtDate(m.start)} – ${fmtDate(m.end)}` : ''],
    ['Total ITD days', m.itdDays, m.itdEnd ? `${fmtDate(m.start)} – ${fmtDate(m.itdEnd)}` : ''],
    ['Total EAC cost', round(m.eacCost), ''], ['EAC profit', round(m.eacProfit), ''],
    ['Total ITD cost', round(m.itdCost), ''], ['ITD profit', round(m.itdProfit), ''],
    ['Monthly cost (last 30 days)', round(m.monthlyCost), ''], ['Monthly profit (last 30 days)', round(m.monthlyProfit), ''],
    ['On rent equipment', m.onRent, `${m.offSoon} coming off rent within 7 days`],
  ];
  const ws = XLSX.utils.aoa_to_sheet(summary);
  ws['!cols'] = [{ wch: 30 }, { wch: 44 }, { wch: 34 }];
  for (let r = 28; r < summary.length; r++) { const c = ws[XLSX.utils.encode_cell({ r, c: 1 })]; if (c && c.t === 'n' && !/days|equipment/i.test(summary[r][0])) c.z = CUR; }
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }];
  XLSX.utils.book_append_sheet(wb, ws, 'Summary');
  XLSX.utils.book_append_sheet(wb, eqSheet(all.filter(e => !e.coe)), 'Equipment');
  XLSX.utils.book_append_sheet(wb, eqSheet(all.filter(e => e.coe)), 'COE');

  const sched = [...combinedSchedule(all)].sort((a, b) => a[0].localeCompare(b[0]));
  const daily = [['Date', 'Cost', 'Profit', 'Items accruing', 'Type'], ...sched.map(([d, e]) => [d, round(e.cost), round(e.profit), e.items, d > today() ? 'Forecast' : 'Incurred'])];
  XLSX.utils.book_append_sheet(wb, sheet(daily, { widths: [12, 14, 14, 14, 10], money: [1, 2] }), 'Daily costs');

  const reqs = store.requestsForJob(job.id).map(r => {
    const e = store.equipment(r.equipmentId);
    return [store.REQUEST_LABELS[r.type], r.status, e?.equipNo || '', e?.description || '', e?.vendor || '', e?.po || '', r.requestedDate,
      r.targetJobId ? store.job(r.targetJobId)?.number || '' : '', r.requestedBy, r.createdAt.slice(0, 10), r.reason || '', r.completedBy || '', r.completedAt ? r.completedAt.slice(0, 10) : ''];
  });
  XLSX.utils.book_append_sheet(wb, sheet([['Type', 'Status', 'Equipment #', 'Description', 'Vendor', 'PO #', 'Requested date', 'Transfer to job', 'Requested by', 'Submitted', 'Reason', 'Closed by', 'Closed'], ...reqs],
    { widths: [20, 11, 13, 30, 20, 13, 14, 14, 18, 12, 44, 18, 12] }), 'Requests');

  XLSX.writeFile(wb, `Job_${fileSafe(job.number)}_Equipment_Report_${today()}.xlsx`);
  toast('Excel workbook downloaded');
}

export function exportPortfolioExcel(rows) {
  if (!libsReady('xlsx')) return;
  const wb = XLSX.utils.book_new();
  const data = [['Job number', 'Job name', 'Client', 'Contract type', 'Project manager', 'JDE ID', 'Start', 'Forecast end', 'EAC days', 'ITD days',
    'On rent', 'Off rent ≤ 7 days', 'Monthly cost (30 days)', 'Monthly profit', 'ITD cost', 'ITD profit', 'EAC cost', 'EAC profit', 'Open requests'],
  ...rows.map(({ job: j, m, openReqs }) => [j.number, j.name, j.clientName || '', j.contractType || '', j.pm || '', j.jdeId || '', m.start || '', m.end || '', m.eacDays, m.itdDays,
    m.onRent, m.offSoon, round(m.monthlyCost), round(m.monthlyProfit), round(m.itdCost), round(m.itdProfit), round(m.eacCost), round(m.eacProfit), openReqs])];
  XLSX.utils.book_append_sheet(wb, sheet(data, { widths: [12, 38, 26, 13, 18, 12, 12, 13, 9, 9, 8, 14, 18, 15, 15, 14, 15, 14, 13], money: [12, 13, 14, 15, 16, 17] }), 'Jobs');
  const allEq = rows.flatMap(r => store.equipmentForJob(r.job.id).map(e => [r.job.number, ...eqRow(e)]));
  const ws = sheet([['Job number', ...EQ_HEAD], ...allEq], { widths: [12, 13, 32, 11, 6, 20, 13, 13, 13, 6], money: [7, 18, 19, 20, 21, 22, 23, 31, 32, 33, 34, 35], pctCols: [25, 26, 27, 28, 29, 30] });
  XLSX.utils.book_append_sheet(wb, ws, 'All equipment');
  XLSX.writeFile(wb, `Equipment_Portfolio_${today()}.xlsx`);
  toast('Excel workbook downloaded');
}

// ---------- PDF ----------

const NAVY = [11, 37, 69], ORANGE = [242, 107, 29], GRAY = [100, 116, 139], LIGHT = [244, 246, 249], BORDER = [227, 232, 239];

function pdfDoc() {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
}

function pdfHeader(doc, title, subtitle) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY); doc.rect(0, 0, w, 58, 'F');
  doc.setFillColor(...ORANGE); doc.rect(0, 58, w, 3, 'F');
  doc.setFillColor(...ORANGE); doc.roundedRect(32, 15, 28, 28, 4, 4, 'F');
  doc.setFillColor(255, 255, 255);
  // I-beam mark
  doc.rect(39, 21, 14, 3.2, 'F'); doc.rect(44.4, 24, 3.2, 10, 'F'); doc.rect(39, 34, 14, 3.2, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(COMPANY, 70, 28);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(247, 162, 107);
  doc.text(`${PRODUCT} · Equipment Rental Control`, 70, 42);
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(title, w - 32, 28, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(196, 210, 230);
  doc.text(subtitle, w - 32, 42, { align: 'right' });
}

function pdfFooters(doc) {
  const n = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER); doc.line(32, h - 30, w - 32, h - 30);
    doc.setFontSize(8); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'normal');
    doc.text(`${COMPANY} · Confidential · Generated ${fmtDate(today())}`, 32, h - 18);
    doc.text(`Page ${i} of ${n}`, w - 32, h - 18, { align: 'right' });
  }
}

function kpiBoxes(doc, y, items) {
  const w = doc.internal.pageSize.getWidth() - 64;
  const gap = 8, bw = (w - gap * (items.length - 1)) / items.length;
  items.forEach(([label, value, foot], i) => {
    const x = 32 + i * (bw + gap);
    doc.setFillColor(...LIGHT); doc.setDrawColor(...BORDER); doc.roundedRect(x, y, bw, 54, 4, 4, 'FD');
    doc.setFontSize(7); doc.setTextColor(...GRAY); doc.setFont('helvetica', 'bold'); doc.text(label.toUpperCase(), x + 9, y + 14);
    doc.setFontSize(13); doc.setTextColor(...NAVY); doc.text(String(value), x + 9, y + 32);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...GRAY); doc.text(String(foot || ''), x + 9, y + 45, { maxWidth: bw - 14 });
  });
  return y + 54;
}

const tableStyle = {
  theme: 'grid',
  styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 4, lineColor: BORDER, lineWidth: 0.5, textColor: [15, 27, 45] },
  headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
  footStyles: { fillColor: LIGHT, textColor: NAVY, fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [250, 251, 253] },
  margin: { left: 32, right: 32, top: 76, bottom: 40 },
};

function eqTable(doc, startY, title, list) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY);
  doc.text(title, 32, startY);
  if (!list.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRAY);
    doc.text('None', 32, startY + 16);
    return startY + 30;
  }
  const t = { qty: 0, mo: 0, itd: 0, eac: 0, p: 0 };
  const body = list.map(e => {
    const m = equipmentMetrics(e);
    t.qty += Number(e.qty) || 0; t.mo += m.monthlyCost; t.itd += m.itdCost; t.eac += m.eacCost; t.p += m.itdProfit;
    return [e.equipNo || '', e.description || '', e.po || '', e.costCode || '', e.vendor || '', e.qty, STATUS[e.status], fmtDate(e.onRentDate), fmtDate(m.end), m.eacDays,
      money(m.monthlyCost), money(m.itdCost), money(m.eacCost), money(m.itdProfit)];
  });
  doc.autoTable({
    ...tableStyle, startY: startY + 6,
    head: [['Equip #', 'Description', 'PO #', 'Cost code', 'Vendor', 'Qty', 'Status', 'On rent', 'Off rent', 'Days', 'Monthly (30d)', 'Cost ITD', 'Cost EAC', 'Profit ITD']],
    body,
    foot: [['Total', '', '', '', '', t.qty, '', '', '', '', money(t.mo), money(t.itd), money(t.eac), money(t.p)]],
    columnStyles: { 1: { cellWidth: 118 }, 5: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' }, 11: { halign: 'right' }, 12: { halign: 'right' }, 13: { halign: 'right' } },
    didParseCell: d => { if (d.section === 'foot' && d.column.index >= 5) d.cell.styles.halign = 'right'; },
    didDrawPage: () => pdfHeader(doc, doc.__title, doc.__subtitle),
  });
  return doc.lastAutoTable.finalY + 24;
}

export function exportJobPdf(job) {
  if (!libsReady('pdf')) return;
  const doc = pdfDoc();
  const all = store.equipmentForJob(job.id);
  const m = jobMetrics(all);
  doc.__title = `Equipment Cost Report · Job ${job.number}`;
  doc.__subtitle = `As of ${fmtDate(today())}`;
  pdfHeader(doc, doc.__title, doc.__subtitle);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...NAVY);
  doc.text(`${job.number}  ${job.name}`, 32, 92);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...GRAY);
  const info = [
    ['Client', `${job.clientName || '—'}${job.clientId ? ` (${job.clientId})` : ''}`], ['Contract', job.contractType || '—'], ['JDE ID', job.jdeId || '—'], ['Company ID', job.companyId || '—'],
    ['Project manager', job.pm || '—'], ['Project accountant', job.pa || '—'], ['Equipment contact', job.equipContact || '—'], ['Address', job.address || '—'],
    ['Markups', `Equip ${pct(job.markupEquipment)} · Fuel ${pct(job.markupNoFuel)} / ${pct(job.markupStdFuel)} / ${pct(job.markupHighFuel)}`], ['Sales tax', pct(job.salesTax)],
  ];
  const colW = (doc.internal.pageSize.getWidth() - 64) / 4;
  info.forEach(([k, v], i) => {
    const x = 32 + (i % 4) * colW, y = 110 + Math.floor(i / 4) * 22;
    doc.setFontSize(6.8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...GRAY); doc.text(k.toUpperCase(), x, y);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(15, 27, 45); doc.text(String(v), x, y + 10, { maxWidth: colW - 10 });
  });

  let y = kpiBoxes(doc, 186, [
    ['Total EAC days', m.eacDays, m.start ? `${fmtDate(m.start)} – ${fmtDate(m.end)}` : ''],
    ['Total ITD days', m.itdDays, m.itdEnd ? `${fmtDate(m.start)} – ${fmtDate(m.itdEnd)}` : ''],
    ['Total EAC cost', money(m.eacCost, true), `${money(m.eacProfit, true)} EAC profit`],
    ['Total ITD cost', money(m.itdCost, true), `${money(m.itdProfit, true)} ITD profit`],
    ['On rent', m.onRent, `${m.offSoon} off rent within 7 days`],
    ['Monthly cost', money(m.monthlyCost, true), `Last 30 days · ${money(m.monthlyProfit, true)} profit`],
  ]);
  y = eqTable(doc, y + 26, 'Rental equipment', all.filter(e => !e.coe));
  if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); pdfHeader(doc, doc.__title, doc.__subtitle); y = 92; }
  eqTable(doc, y, 'Company-owned equipment (COE)', all.filter(e => e.coe));
  pdfFooters(doc);
  doc.save(`Job_${fileSafe(job.number)}_Equipment_Report_${today()}.pdf`);
  toast('PDF report downloaded');
}

export function exportPortfolioPdf(rows) {
  if (!libsReady('pdf')) return;
  const doc = pdfDoc();
  doc.__title = 'Equipment Portfolio Summary';
  doc.__subtitle = `As of ${fmtDate(today())}`;
  pdfHeader(doc, doc.__title, doc.__subtitle);
  const t = rows.reduce((a, r) => ({ eac: a.eac + r.m.eacCost, itd: a.itd + r.m.itdCost, mo: a.mo + r.m.monthlyCost, on: a.on + r.m.onRent, p: a.p + r.m.itdProfit, ep: a.ep + r.m.eacProfit, reqs: a.reqs + r.openReqs }),
    { eac: 0, itd: 0, mo: 0, on: 0, p: 0, ep: 0, reqs: 0 });
  const y = kpiBoxes(doc, 84, [
    ['Active jobs', rows.length, ''], ['Total EAC cost', money(t.eac, true), `${money(t.ep, true)} EAC profit`],
    ['Total ITD cost', money(t.itd, true), `${money(t.p, true)} ITD profit`], ['Monthly cost', money(t.mo, true), 'Last 30 days'],
    ['On rent', t.on, ''], ['Open requests', t.reqs, 'Awaiting procurement'],
  ]);
  doc.autoTable({
    ...tableStyle, startY: y + 20,
    head: [['Job', 'Name', 'Client', 'PM', 'Start', 'Forecast end', 'On rent', 'Monthly (30d)', 'ITD cost', 'ITD profit', 'EAC cost', 'EAC profit', 'Requests']],
    body: rows.map(({ job: j, m, openReqs }) => [j.number, j.name, j.clientName || '', j.pm || '', fmtDate(m.start), fmtDate(m.end), m.onRent,
      money(m.monthlyCost), money(m.itdCost), money(m.itdProfit), money(m.eacCost), money(m.eacProfit), openReqs]),
    foot: [['Total', '', '', '', '', '', t.on, money(t.mo), money(t.itd), money(t.p), money(t.eac), money(t.ep), t.reqs]],
    columnStyles: { 1: { cellWidth: 150 }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' }, 11: { halign: 'right' }, 12: { halign: 'right' } },
    didParseCell: d => { if (d.section === 'foot' && d.column.index >= 6) d.cell.styles.halign = 'right'; },
    didDrawPage: () => pdfHeader(doc, doc.__title, doc.__subtitle),
  });
  pdfFooters(doc);
  doc.save(`Equipment_Portfolio_${today()}.pdf`);
  toast('PDF report downloaded');
}
