// Job workspace: summary KPIs and tabs for equipment, COE, calendar, requests, details and activity.

import * as store from '../store.js';
import { jobMetrics, equipmentMetrics, combinedSchedule, dailySchedule } from '../calc.js';
import { esc, money, compactMoney, fmtDate, pct, today, addDays, debounce } from '../util.js';
import { icon, canEdit, statusPill, openModal, help } from '../ui.js';
import { openJobForm } from './jobForm.js';
import { openEquipment } from './equipment.js';
import { openRequestForm, renderRequestsTab } from './requests.js';
import { renderCalendar } from './calendar.js';
import { wireMenu } from './jobs.js';
import { exportJobExcel, exportJobPdf } from '../export.js';

const states = {};
const jobState = id => (states[id] ||= {
  equipment: { q: '', status: 'active', vendor: '', costCode: '', fuel: '', soon: false, sort: 'equipNo', dir: 1 },
  coe: { q: '', status: 'active', vendor: '', costCode: '', fuel: '', soon: false, sort: 'equipNo', dir: 1 },
  cal: {}, calScope: 'all', reqFilter: 'pending', reqType: 'all',
});

export function renderJob(app, jobId, tab) {
  const job = store.job(jobId);
  const st = jobState(jobId);
  const all = store.equipmentForJob(jobId);
  const rentals = all.filter(e => !e.coe);
  const coe = all.filter(e => e.coe);
  const m = jobMetrics(all);
  const pending = store.requestsForJob(jobId).filter(r => r.status === 'pending').length;

  const tabs = [
    ['equipment', 'Equipment', rentals.length],
    ['coe', 'COE', coe.length],
    ['calendar', 'Job calendar'],
    ['requests', 'Requests', pending, true],
    ['details', 'Job details'],
    ['activity', 'Activity'],
  ];

  app.innerHTML = `
    <div class="page">
      <div class="crumbs"><a href="#/jobs">Jobs</a>${icon('chevR', 12)}<span>${esc(job.number)}</span></div>
      <div class="page-head hero hero-slim">
        <div>
          <h1><span class="job-chip">${esc(job.number)}</span>${esc(job.name)}</h1>
          <div class="sub">
            <span>${icon('building', 14)} ${esc(job.clientName || '—')}</span>
            <span>PM: ${esc(job.pm || '—')}</span>
            <span>${esc(job.contractType || '')}</span>
            <span>JDE ID ${esc(job.jdeId || '—')}</span>
          </div>
        </div>
        <div class="actions">
          <div class="menu-wrap">
            <button class="btn" data-menu>${icon('download', 15)} Export ${icon('chevD', 14)}</button>
            <div class="menu">
              <button data-export="xlsx">${icon('sheet', 16)}<span>Excel workbook<small>Summary, equipment, COE, daily costs, requests</small></span></button>
              <button data-export="pdf">${icon('file', 16)}<span>PDF cost report<small>Job summary with equipment and COE</small></span></button>
            </div>
          </div>
          ${canEdit() ? `<button class="btn" data-edit-job>${icon('edit', 15)} Edit job</button>
          <button class="btn btn-primary" data-add>${icon('plus', 15)} Add ${tab === 'coe' ? 'COE' : 'equipment'}</button>` : ''}
        </div>
        <a class="hero-credit" href="https://unsplash.com/photos/industrial-refinery-towers-and-crane-eXblvZg_ulc" target="_blank" rel="noopener">Photo: Red Shuheart / Unsplash</a>
      </div>

      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Total EAC days${help('Estimate at completion: days from the first on-rent date to the latest off-rent date (actual or forecast).')}</div><div class="kpi-value">${m.eacDays.toLocaleString()}</div>
          <div class="kpi-foot">${m.start ? `${fmtDate(m.start)} – ${fmtDate(m.end)}` : 'No equipment yet'}</div></div>
        <div class="kpi"><div class="kpi-label">Total ITD days${help('Inception to date: days from the first on-rent date through today.')}</div><div class="kpi-value">${m.itdDays.toLocaleString()}</div>
          <div class="kpi-foot">${m.itdEnd ? `${fmtDate(m.start)} – ${fmtDate(m.itdEnd)}` : m.start ? `Starts ${fmtDate(m.start)}` : '—'}</div>
          <div class="meter" title="${m.eacDays ? Math.round(m.itdDays / m.eacDays * 100) : 0}% of EAC days elapsed"><i style="width:${m.eacDays ? Math.min(100, m.itdDays / m.eacDays * 100).toFixed(1) : 0}%"></i></div></div>
        <div class="kpi"><div class="kpi-label">Total EAC cost${help('Estimate at completion: full expected cost of every rental on this job through its off-rent date, including taxes, mob/demob and one-time costs.')}</div><div class="kpi-value" title="${money(m.eacCost)}">${compactMoney(m.eacCost)}</div>
          <div class="kpi-foot"><span class="pos">${money(m.eacProfit, true)}</span> EAC profit</div></div>
        <div class="kpi"><div class="kpi-label">Total ITD cost${help('Inception to date: cost incurred from the first on-rent date through today.')}</div><div class="kpi-value" title="${money(m.itdCost)}">${compactMoney(m.itdCost)}</div>
          <div class="kpi-foot"><span class="pos">${money(m.itdProfit, true)}</span> ITD profit</div>
          <div class="meter" title="${m.eacCost ? Math.round(m.itdCost / m.eacCost * 100) : 0}% of EAC cost incurred"><i style="width:${m.eacCost ? Math.min(100, m.itdCost / m.eacCost * 100).toFixed(1) : 0}%"></i></div></div>
        <div class="kpi"><div class="kpi-label">On rent equipment${help('Units currently on rent (quantity counted), and how many are due off rent in the next 7 days.')}</div><div class="kpi-value">${m.onRent}</div>
          <div class="kpi-foot">${m.offSoon ? `<span class="warn">${m.offSoon}</span> coming off rent within 7 days` : 'None coming off within 7 days'}</div></div>
        <div class="kpi"><div class="kpi-label">Monthly cost${help('Cost incurred over the last 30 days.')}</div><div class="kpi-value" title="${money(m.monthlyCost)}">${compactMoney(m.monthlyCost)}</div>
          <div class="kpi-foot">Last 30 days · <span class="pos">${money(m.monthlyProfit, true)}</span> profit</div></div>
      </div>

      <nav class="tabs">
        ${tabs.map(([k, l, n, alert]) => `<a href="#/job/${job.id}/${k}" class="${tab === k ? 'active' : ''}">${l}${n !== undefined && (n || !alert) ? ` <span class="badge ${alert && n ? 'badge-alert' : ''}">${n}</span>` : ''}</a>`).join('')}
      </nav>
      <section id="tab-body"></section>
    </div>`;

  wireMenu(app);
  app.querySelector('[data-export="xlsx"]').addEventListener('click', () => exportJobExcel(job));
  app.querySelector('[data-export="pdf"]').addEventListener('click', () => exportJobPdf(job));
  app.querySelector('[data-edit-job]')?.addEventListener('click', () => openJobForm(job));
  app.querySelector('[data-add]')?.addEventListener('click', () => openEquipment(job.id, null, { coe: tab === 'coe' }));

  const body = app.querySelector('#tab-body');
  const openEq = id => openEquipment(job.id, id);
  if (tab === 'coe') renderEquipmentTable(body, job, coe, st.coe, { coe: true, onOpen: openEq });
  else if (tab === 'calendar') renderJobCalendar(body, job, all, st);
  else if (tab === 'requests') renderRequestsTab(body, job, st, openEq);
  else if (tab === 'details') renderDetails(body, job);
  else if (tab === 'activity') renderActivity(body, job);
  else renderEquipmentTable(body, job, rentals, st.equipment, { onOpen: openEq });
}

const COLUMNS = [
  ['equipNo', 'Equip #', e => e.equipNo || '', 'col-eqno'],
  ['description', 'Description', e => e.description || ''],
  ['po', 'PO #', e => e.po || ''],
  ['costCode', 'Cost code', e => e.costCode || ''],
  ['vendor', 'Vendor', e => e.vendor || ''],
  ['qty', 'Qty', e => +e.qty || 0, 'num'],
  ['status', 'Status', e => e.status],
  ['onRentDate', 'On rent', e => e.onRentDate || ''],
  ['end', 'Off rent', (e, m) => m.end],
  ['days', 'Days', (e, m) => m.eacDays, 'num'],
  ['monthly', 'Monthly cost', (e, m) => m.monthlyCost, 'num'],
  ['itd', 'Rental cost ITD', (e, m) => m.itdCost, 'num'],
  ['eac', 'Rental cost EAC', (e, m) => m.eacCost, 'num'],
  ['profit', 'Profit to date', (e, m) => m.itdProfit, 'num'],
];

export function filterEquipment(list, f) {
  const t = today(), soon = addDays(t, 7);
  const q = f.q.toLowerCase();
  return list.map(e => ({ e, m: equipmentMetrics(e) })).filter(({ e, m }) => {
    if (q && ![e.equipNo, e.description, e.vendor, e.po, e.serial, e.model, e.manufacturer, e.costCode, e.notes].join(' ').toLowerCase().includes(q)) return false;
    if (f.status === 'active' && e.status === 'off') return false;
    if (['on', 'off', 'forecast'].includes(f.status) && e.status !== f.status) return false;
    if (f.vendor && e.vendor !== f.vendor) return false;
    if (f.costCode && e.costCode !== f.costCode) return false;
    if (f.fuel && (e.fuelType || 'none') !== f.fuel) return false;
    if (f.soon && !(e.status === 'on' && m.end >= t && m.end <= soon)) return false;
    return true;
  });
}

function renderEquipmentTable(el, job, list, f, { coe = false, onOpen }) {
  const rows = filterEquipment(list, f);
  const col = COLUMNS.find(c => c[0] === f.sort) || COLUMNS[0];
  rows.sort((a, b) => {
    const x = col[2](a.e, a.m), y = col[2](b.e, b.m);
    return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * f.dir;
  });
  const vendors = [...new Set(list.map(e => e.vendor).filter(Boolean))].sort();
  const codes = [...new Set(list.map(e => e.costCode).filter(Boolean))].sort();
  const tot = rows.reduce((t, { e, m }) => {
    t.qty += +e.qty || 0; t.mo += m.monthlyCost; t.itd += m.itdCost; t.eac += m.eacCost; t.p += m.itdProfit; return t;
  }, { qty: 0, mo: 0, itd: 0, eac: 0, p: 0 });
  const filtered = f.q || f.status !== 'active' || f.vendor || f.costCode || f.fuel || f.soon;
  const t = today(), soon = addDays(t, 7);

  el.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <div class="search">${icon('search', 15)}<input type="search" data-f="q" value="${esc(f.q)}" placeholder="Search equipment #, description, PO, serial…" aria-label="Search equipment"></div>
        <select data-f="status" aria-label="Status">
          ${[['active', 'On rent + forecasted'], ['all', 'All statuses'], ['on', 'On rent'], ['forecast', 'Forecasted'], ['off', 'Off rent']].map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <select data-f="vendor" aria-label="Vendor"><option value="">All vendors</option>${vendors.map(v => `<option ${f.vendor === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
        <select data-f="costCode" aria-label="Cost code"><option value="">All cost codes</option>${codes.map(v => `<option ${f.costCode === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
        <select data-f="fuel" aria-label="Fuel type">
          ${[['', 'All fuel types'], ['none', 'No fuel'], ['standard', 'Standard fuel'], ['high', 'High fuel']].map(([v, l]) => `<option value="${v}" ${f.fuel === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button class="chip-toggle ${f.soon ? 'on' : ''}" data-soon>${icon('clock', 14)} Off rent ≤ 7 days</button>
        ${filtered ? '<button class="btn btn-sm btn-ghost" data-clear>Clear filters</button>' : ''}
        <span class="spacer"></span>
        <span class="result-count">${rows.length} of ${list.length} line${list.length === 1 ? '' : 's'}</span>
      </div>
      ${rows.length ? `
      <div class="table-wrap"><table class="data cards">
        <thead><tr>
          <th class="col-req">Request</th>
          ${COLUMNS.map(([k, l, , cls]) => `<th class="sortable ${cls || ''}" data-sort="${k}">${l}<span class="sort">${f.sort === k ? (f.dir > 0 ? '▲' : '▼') : ''}</span></th>`).join('')}
        </tr></thead>
        <tbody>
          ${rows.map(({ e, m }) => {
    const req = store.openRequestFor(e.id);
    const dueSoon = e.status === 'on' && m.end >= t && m.end <= soon;
    const reqCell = req
      ? `<span class="tag tag-req" title="${store.REQUEST_LABELS[req.type]} requested">${req.type === 'offrent' ? 'Off rent' : req.type === 'forecast' ? 'Date change' : 'Transfer'} pending</span>`
      : e.status !== 'off'
        ? `<button class="btn btn-xs" data-request="${e.id}" title="Request off rent, forecast change, or transfer">${icon('swap', 13)} Request</button>`
        : '<span class="muted">—</span>';
    return `<tr data-eq="${e.id}">
              <td data-label="Request" class="col-req">${reqCell}</td>
              <td data-label="Equip #" class="col-eqno mono strong">${esc(e.equipNo || '—')}</td>
              <td data-label="Description" class="desc" title="${esc(e.description)}">${esc(e.description)}</td>
              <td data-label="PO #" class="mono">${esc(e.po || '—')}</td>
              <td data-label="Cost code" class="mono">${esc(e.costCode || '—')}</td>
              <td data-label="Vendor">${esc(e.vendor || '—')}</td>
              <td data-label="Qty" class="num">${esc(e.qty)}</td>
              <td data-label="Status">${statusPill(e.status)}</td>
              <td data-label="On rent">${fmtDate(e.onRentDate)}</td>
              <td data-label="Off rent"><div class="cell-stack"><span>${fmtDate(m.end)}${dueSoon ? '<span class="tag tag-warn">≤ 7 days</span>' : ''}</span><span class="secondary">${e.status === 'off' ? 'Actual' : e.forecastOffDate ? 'Forecast' : 'No forecast'}</span></div></td>
              <td data-label="Days" class="m-hide num">${m.eacDays}</td>
              <td data-label="Monthly cost" class="m-hide num">${money(m.monthlyCost)}</td>
              <td data-label="Rental cost ITD" class="num">${money(m.itdCost)}</td>
              <td data-label="Rental cost EAC" class="num">${money(m.eacCost)}</td>
              <td data-label="Profit to date" class="m-hide num profit">${money(m.itdProfit)}</td>
            </tr>`;
  }).join('')}
        </tbody>
        <tfoot><tr class="m-total">
          <td class="col-req">Total${filtered ? ' (filtered)' : ''}</td><td class="col-eqno"></td><td colspan="4"></td><td class="num">${tot.qty}</td><td colspan="4"></td>
          <td class="num">${money(tot.mo)}</td><td class="num">${money(tot.itd)}</td><td class="num">${money(tot.eac)}</td><td class="num profit">${money(tot.p)}</td>
        </tr></tfoot>
      </table></div>` : `
      <div class="empty">${icon(coe ? 'building' : 'truck', 36)}
        <h4>${list.length ? 'No equipment matches these filters' : coe ? 'No COE on this job' : 'No rental equipment yet'}</h4>
        <p>${list.length ? 'Adjust or clear the filters to see more.' : coe ? 'Add company-owned equipment, or mark a line as COE.' : 'Add equipment after issuing the vendor PO.'}</p>
        ${!list.length && canEdit() ? `<button class="btn btn-primary" data-add-empty>${icon('plus', 15)} Add ${coe ? 'COE' : 'equipment'}</button>` : ''}
      </div>`}
    </div>`;

  const rerender = () => renderEquipmentTable(el, job, list, f, { coe, onOpen });
  el.querySelectorAll('select[data-f]').forEach(s => s.addEventListener('change', () => { f[s.dataset.f] = s.value; rerender(); }));
  const qi = el.querySelector('input[data-f=q]');
  qi.addEventListener('input', debounce(() => {
    f.q = qi.value; rerender();
    const n = el.querySelector('input[data-f=q]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length);
  }, 150));
  el.querySelector('[data-soon]').addEventListener('click', () => { f.soon = !f.soon; if (f.soon && f.status === 'off') f.status = 'active'; rerender(); });
  el.querySelector('[data-clear]')?.addEventListener('click', () => { Object.assign(f, { q: '', status: 'active', vendor: '', costCode: '', fuel: '', soon: false }); rerender(); });
  el.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
    f.dir = f.sort === th.dataset.sort ? -f.dir : 1; f.sort = th.dataset.sort; rerender();
  }));
  el.querySelectorAll('tr[data-eq]').forEach(tr => tr.addEventListener('click', e => {
    if (e.target.closest('[data-request]')) return;
    onOpen(tr.dataset.eq);
  }));
  el.querySelectorAll('[data-request]').forEach(b => b.addEventListener('click', () => openRequestForm(store.equipment(b.dataset.request))));
  el.querySelector('[data-add-empty]')?.addEventListener('click', () => openEquipment(job.id, null, { coe }));
}

function renderJobCalendar(el, job, all, st) {
  const scoped = all.filter(e => st.calScope === 'all' || (st.calScope === 'coe' ? e.coe : !e.coe));
  el.innerHTML = `
    <div class="toolbar" style="border:0;padding:0 0 12px">
      <div class="seg">
        ${[['all', 'All equipment'], ['rental', 'Rental only'], ['coe', 'COE only']].map(([v, l]) => `<label><input type="radio" name="calscope" value="${v}" ${st.calScope === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div>
      <span class="result-count">Click a day to see the cost by equipment.</span>
    </div>
    <div id="cal"></div>`;
  el.querySelectorAll('[name=calscope]').forEach(i => i.addEventListener('change', () => { st.calScope = i.value; renderJobCalendar(el, job, all, st); }));
  renderCalendar(el.querySelector('#cal'), combinedSchedule(scoped), st.cal, {
    showItems: true,
    onDayClick: date => showDayBreakdown(job, scoped, date),
  });
}

function showDayBreakdown(job, list, date) {
  const rows = list.map(e => ({ e, d: dailySchedule(e).get(date) })).filter(r => r.d && r.d.cost)
    .sort((a, b) => b.d.cost - a.d.cost);
  const total = rows.reduce((t, r) => ({ cost: t.cost + r.d.cost, profit: t.profit + r.d.profit }), { cost: 0, profit: 0 });
  openModal({
    title: fmtDate(date), subtitle: `Job ${esc(job.number)} · ${rows.length} item${rows.length === 1 ? '' : 's'} accruing cost${date > today() ? ' (forecast)' : ''}`,
    size: 'lg',
    body: `<div class="table-wrap"><table class="data"><thead><tr><th>Equip #</th><th>Description</th><th>PO #</th><th>Cost code</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Profit</th></tr></thead>
      <tbody>${rows.map(({ e, d }) => `<tr data-eq="${e.id}"><td class="mono strong">${esc(e.equipNo || '—')}${e.coe ? '<span class="tag">COE</span>' : ''}</td><td class="desc">${esc(e.description)}</td>
        <td class="mono">${esc(e.po || '—')}</td><td class="mono">${esc(e.costCode || '—')}</td><td class="num">${esc(e.qty)}</td><td class="num">${money(d.cost)}</td><td class="num profit">${money(d.profit)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td colspan="4"></td><td class="num">${money(total.cost)}</td><td class="num profit">${money(total.profit)}</td></tr></tfoot></table></div>`,
    footer: '<button class="btn" data-close>Close</button>',
    onMount: (el, m) => el.querySelectorAll('tr[data-eq]').forEach(tr => tr.addEventListener('click', () => { m.close(); openEquipment(job.id, tr.dataset.eq, { tab: 'calendar' }); })),
  });
}

function renderDetails(el, job) {
  const item = (l, v) => `<div><dt>${l}</dt><dd>${v || '—'}</dd></div>`;
  const mail = v => v ? `<a href="mailto:${esc(v)}">${esc(v)}</a>` : '';
  el.innerHTML = `
    <div class="card">
      <div class="card-head"><h3>Job information</h3>${canEdit() ? `<button class="btn btn-sm" data-edit>${icon('edit', 14)} Edit</button>` : ''}</div>
      <div class="card-body">
        <dl class="dl">
          ${item('Job number', esc(job.number))}${item('Job name', esc(job.name))}${item('Contract type', esc(job.contractType))}
          ${item('JDE ID', esc(job.jdeId))}${item('Company ID', esc(job.companyId))}${item('Client ID', esc(job.clientId))}
          ${item('Client name', esc(job.clientName))}${item('Project manager', esc(job.pm))}${item('Project accountant', esc(job.pa))}
          ${item('Equipment contact', esc(job.equipContact))}${item('Procurement contact', mail(job.procurementEmail))}${item('Project contact', mail(job.projectEmail))}
          <div style="grid-column:1/-1"><dt>Address</dt><dd>${esc(job.address) || '—'}</dd></div>
        </dl>
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h3>Markups &amp; tax</h3><span class="muted" style="font-size:12.5px">Defaults applied to new equipment</span></div>
      <div class="card-body"><dl class="dl">
        ${item('Equipment markup', pct(job.markupEquipment))}${item('No fuel markup', pct(job.markupNoFuel))}${item('Standard fuel markup', pct(job.markupStdFuel))}
        ${item('High fuel markup', pct(job.markupHighFuel))}${item('Sales tax', pct(job.salesTax))}
      </dl></div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="card-head"><h3>Description</h3></div>
      <div class="card-body" style="white-space:pre-wrap">${esc(job.description) || '<span class="muted">No description</span>'}</div>
    </div>`;
  el.querySelector('[data-edit]')?.addEventListener('click', () => openJobForm(job));
}

function renderActivity(el, job) {
  const items = store.activityForJob(job.id);
  el.innerHTML = `<div class="card">${items.length ? `<ul class="activity">${items.map(a => `
    <li><time>${new Date(a.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</time><span>${esc(a.text)}</span></li>`).join('')}</ul>`
    : `<div class="empty">${icon('clock', 36)}<h4>No activity yet</h4><p>Changes to this job, its equipment, and requests are logged here.</p></div>`}</div>`;
}
