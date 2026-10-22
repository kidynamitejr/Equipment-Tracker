import * as store from '../store.js';
import { jobMetrics } from '../calc.js';
import { esc, money, compactMoney, fmtDate, debounce } from '../util.js';
import { icon, canEdit, help } from '../ui.js';
import { openJobForm } from './jobForm.js';
import { exportPortfolioExcel, exportPortfolioPdf } from '../export.js';

const FILTERS = { client: '', pm: '', contract: '', company: '', flag: '' };
const state = { q: '', sort: 'number', dir: 1, ...FILTERS };
const SORTS = [
  ['number', 1, 'Job number (A–Z)'], ['number', -1, 'Job number (Z–A)'], ['name', 1, 'Job name (A–Z)'],
  ['client', 1, 'Client (A–Z)'], ['pm', 1, 'Project manager (A–Z)'], ['start', -1, 'Newest start date'], ['start', 1, 'Oldest start date'],
  ['eac', -1, 'EAC cost (high–low)'], ['itd', -1, 'ITD cost (high–low)'], ['mo', -1, 'Monthly cost (high–low)'],
  ['on', -1, 'Most on rent'], ['reqs', -1, 'Most open requests'],
];
const uniq = (rows, f) => [...new Set(rows.map(f).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
const GUIDE_KEY = 'equipment-tracker.guide-hidden';
function showGuide() {
  try { return localStorage.getItem(GUIDE_KEY) !== '1'; } catch (e) { return true; }
}

export function jobRows() {
  return store.jobs().map(j => {
    const eq = store.equipmentForJob(j.id);
    return { job: j, m: jobMetrics(eq), openReqs: store.requestsForJob(j.id).filter(r => r.status === 'pending').length };
  });
}

export function renderJobs(app) {
  const all = jobRows();
  const tot = all.reduce((t, r) => {
    t.eac += r.m.eacCost; t.eacP += r.m.eacProfit; t.itd += r.m.itdCost; t.itdP += r.m.itdProfit;
    t.mo += r.m.monthlyCost; t.moP += r.m.monthlyProfit; t.on += r.m.onRent; t.soon += r.m.offSoon; t.reqs += r.openReqs;
    return t;
  }, { eac: 0, eacP: 0, itd: 0, itdP: 0, mo: 0, moP: 0, on: 0, soon: 0, reqs: 0 });

  const q = state.q.toLowerCase();
  const rows = all.filter(({ job: j, m, openReqs }) => {
    if (q && ![j.number, j.name, j.clientName, j.clientId, j.pm, j.pa, j.jdeId, j.companyId, j.contractType, j.address, j.equipContact, j.description]
      .join(' ').toLowerCase().includes(q)) return false;
    if (state.client && j.clientName !== state.client) return false;
    if (state.pm && j.pm !== state.pm) return false;
    if (state.contract && j.contractType !== state.contract) return false;
    if (state.company && j.companyId !== state.company) return false;
    if (state.flag === 'requests' && !openReqs) return false;
    if (state.flag === 'soon' && !m.offSoon) return false;
    if (state.flag === 'onrent' && !m.onRent) return false;
    if (state.flag === 'idle' && m.onRent) return false;
    return true;
  });
  const filtered = Object.keys(FILTERS).some(k => state[k]) || state.q;
  const key = {
    number: r => r.job.number, name: r => r.job.name, client: r => r.job.clientName, pm: r => r.job.pm,
    start: r => r.m.start || '', on: r => r.m.onRent, eac: r => r.m.eacCost, itd: r => r.m.itdCost, mo: r => r.m.monthlyCost, reqs: r => r.openReqs,
  }[state.sort];
  rows.sort((a, b) => {
    const x = key(a), y = key(b);
    return (typeof x === 'number' ? x - y : String(x || '').localeCompare(String(y || ''))) * state.dir;
  });
  const th = (k, label, cls = '') => `<th class="sortable ${cls}" data-sort="${k}">${label}<span class="sort">${state.sort === k ? (state.dir > 0 ? '▲' : '▼') : ''}</span></th>`;

  app.innerHTML = `
    <div class="page page-portfolio">
      <div class="page-head hero">
        <div>
          <div class="hero-eyebrow">${icon('grid', 14)} Portfolio view · Halvorsen Industrial</div>
          <h1>All jobs</h1>
          <p class="hero-tag">Every rental across every job, in one ledger.</p>
          <div class="sub"><span>${all.length} job${all.length === 1 ? '' : 's'}</span><span>As of ${fmtDate(new Date().toISOString().slice(0, 10))}</span></div>
        </div>
        <div class="actions">
          <div class="menu-wrap">
            <button class="btn" data-menu>${icon('download', 15)} Export ${icon('chevD', 14)}</button>
            <div class="menu">
              <button data-export="xlsx">${icon('sheet', 16)}<span>Excel workbook<small>All jobs summary (.xlsx)</small></span></button>
              <button data-export="pdf">${icon('file', 16)}<span>PDF report<small>Portfolio summary (.pdf)</small></span></button>
            </div>
          </div>
          ${canEdit() ? `<button class="btn btn-primary" data-new>${icon('plus', 15)} New job</button>` : ''}
        </div>
        <a class="hero-credit" href="https://unsplash.com/photos/industrial-refinery-towers-and-crane-eXblvZg_ulc" target="_blank" rel="noopener">Photo: Red Shuheart / Unsplash</a>
      </div>

      ${showGuide() ? `
      <div class="guide card">
        <div class="guide-head">
          <div><h3>How FleetLedger works</h3><p class="muted">Four steps from vendor PO to off rent.</p></div>
          <button class="btn btn-sm btn-ghost" data-hide-guide>Hide</button>
        </div>
        <ol class="guide-steps">
          <li><strong>Set up the job</strong><span>Click <em>New job</em> and enter the job number, client, markups and sales tax. Every piece of equipment on the job uses these as its defaults.</span></li>
          <li><strong>Add rented equipment</strong><span>After issuing the vendor PO, open the job and click <em>Add equipment</em>. Enter the PO, rates and on-rent date, and the costs calculate automatically.</span></li>
          <li><strong>Field requests changes</strong><span>When a unit is no longer needed, or its date moves, anyone can click <em>Request</em> on that line to ask for an off rent, a new forecast date, or a transfer.</span></li>
          <li><strong>Procurement completes it</strong><span>Open <a href="#/requests">Requests</a>, call the vendor, then click <em>Complete request</em>. The equipment updates on its own.</span></li>
        </ol>
      </div>` : ''}
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Total EAC cost${help('Estimate at completion: full expected cost of every rental on this job through its off-rent date, including taxes, mob/demob and one-time costs.')}</div><div class="kpi-value">${compactMoney(tot.eac)}</div><div class="kpi-foot"><span class="pos">${compactMoney(tot.eacP)}</span> EAC profit</div></div>
        <div class="kpi"><div class="kpi-label">Total ITD cost${help('Inception to date: cost incurred from the first on-rent date through today.')}</div><div class="kpi-value">${compactMoney(tot.itd)}</div><div class="kpi-foot"><span class="pos">${compactMoney(tot.itdP)}</span> profit to date</div></div>
        <div class="kpi"><div class="kpi-label">Monthly cost${help('Cost incurred over the last 30 days.')}</div><div class="kpi-value">${compactMoney(tot.mo)}</div><div class="kpi-foot"><span class="pos">${compactMoney(tot.moP)}</span> profit · last 30 days</div></div>
        <div class="kpi"><div class="kpi-label">On rent${help('Units currently on rent across all jobs.')}</div><div class="kpi-value">${tot.on}</div><div class="kpi-foot">${tot.soon ? `<span class="warn">${tot.soon}</span> off rent within 7 days` : 'None due off within 7 days'}</div></div>
        <div class="kpi"><div class="kpi-label">Open field requests${help('Requests from the field waiting for procurement to call the vendor and complete them.')}</div><div class="kpi-value">${tot.reqs}</div><div class="kpi-foot"><a href="#/requests">${tot.reqs ? 'Review requests →' : 'View request history →'}</a></div></div>
        <div class="kpi"><div class="kpi-label">Active jobs</div><div class="kpi-value">${all.length}</div><div class="kpi-foot">${all.reduce((n, r) => n + r.m.lines, 0)} equipment lines</div></div>
      </div>

      <div class="card">
        <div class="toolbar">
          <div class="search">${icon('search', 15)}<input type="search" placeholder="Search job #, name, client, PM, JDE ID, address…" value="${esc(state.q)}" data-q aria-label="Search jobs"></div>
          <select data-jf="client" aria-label="Client"><option value="">All clients</option>${uniq(all, r => r.job.clientName).map(v => `<option ${state.client === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
          <select data-jf="pm" aria-label="Project manager"><option value="">All project managers</option>${uniq(all, r => r.job.pm).map(v => `<option ${state.pm === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
          <select data-jf="contract" aria-label="Contract type"><option value="">All contract types</option>${uniq(all, r => r.job.contractType).map(v => `<option ${state.contract === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
          <select data-jf="company" aria-label="Company ID"><option value="">All company IDs</option>${uniq(all, r => r.job.companyId).map(v => `<option value="${esc(v)}" ${state.company === v ? 'selected' : ''}>Company ${esc(v)}</option>`).join('')}</select>
          <select data-jf="flag" aria-label="Show">
            ${[['', 'All jobs'], ['requests', 'Has open requests'], ['soon', 'Equipment off rent ≤ 7 days'], ['onrent', 'Has equipment on rent'], ['idle', 'Nothing on rent']]
    .map(([v, l]) => `<option value="${v}" ${state.flag === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          ${filtered ? '<button class="btn btn-sm btn-ghost" data-clear-jobs>Clear filters</button>' : ''}
          <span class="spacer"></span>
          <label class="sort-by"><span>Sort</span><select data-sortby aria-label="Sort jobs">
            ${SORTS.map(([k, d, l]) => `<option value="${k}:${d}" ${state.sort === k && state.dir === d ? 'selected' : ''}>${l}</option>`).join('')}
            ${SORTS.some(([k, d]) => state.sort === k && state.dir === d) ? '' : '<option selected>Custom (column)</option>'}
          </select></label>
          <span class="result-count">${rows.length} of ${all.length} jobs</span>
        </div>
        ${rows.length ? `
        <div class="table-wrap"><table class="data cards fit">
          <thead><tr>
            ${th('number', 'Job')}${th('client', 'Client')}${th('pm', 'Project manager')}
            ${th('on', 'On rent', 'num')}${th('mo', 'Monthly cost', 'num')}${th('itd', 'ITD cost', 'num')}${th('eac', 'EAC cost', 'num')}${th('reqs', 'Requests', 'num')}
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr data-job="${r.job.id}">
                <td data-label="Job"><div class="cell-stack"><span class="primary">${esc(r.job.number)}</span><span class="secondary">${esc(r.job.name)}</span></div></td>
                <td data-label="Client"><div class="cell-stack"><span>${esc(r.job.clientName || '—')}</span><span class="secondary">${esc(r.job.contractType || '')}</span></div></td>
                <td data-label="Project manager">${esc(r.job.pm || '—')}</td>
                <td data-label="On rent" class="num"><span>${r.m.onRent}${r.m.offSoon ? `<span class="tag tag-warn">${r.m.offSoon} soon</span>` : ''}</span></td>
                <td data-label="Monthly cost" class="num">${money(r.m.monthlyCost, true)}</td>
                <td data-label="ITD cost" class="num"><div class="cell-stack"><span>${money(r.m.itdCost, true)}</span><span class="secondary profit">${money(r.m.itdProfit, true)} profit</span></div></td>
                <td data-label="EAC cost" class="num"><div class="cell-stack"><span>${money(r.m.eacCost, true)}</span><span class="secondary profit">${money(r.m.eacProfit, true)} profit</span></div></td>
                <td data-label="Requests" class="num">${r.openReqs ? `<span class="badge badge-alert">${r.openReqs}</span>` : '<span class="muted">—</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>` : `
        <div class="empty">${icon('building', 36)}<h4>${all.length ? 'No jobs match these filters' : 'No jobs yet'}</h4>
          <p>${all.length ? 'Try a different search, or clear the filters to see every job.' : canEdit() ? 'Create your first job to start tracking rented equipment.' : 'Procurement has not created any jobs yet.'}</p></div>`}
      </div>
      <p class="footer-note">Data is stored in this browser. Use Data &amp; settings to back it up or move it to another computer.</p>
    </div>`;

  app.querySelector('[data-new]')?.addEventListener('click', () => openJobForm());
  app.querySelector('[data-hide-guide]')?.addEventListener('click', () => { try { localStorage.setItem(GUIDE_KEY, '1'); } catch (e) { /* ignore */ } renderJobs(app); });
  const qi = app.querySelector('[data-q]');
  qi.addEventListener('input', debounce(() => {
    state.q = qi.value;
    renderJobs(app);
    const n = app.querySelector('[data-q]');
    n.focus(); n.setSelectionRange(n.value.length, n.value.length);
  }, 150));
  app.querySelectorAll('select[data-jf]').forEach(sel => sel.addEventListener('change', () => { state[sel.dataset.jf] = sel.value; renderJobs(app); }));
  app.querySelector('[data-clear-jobs]')?.addEventListener('click', () => { Object.assign(state, FILTERS, { q: '' }); renderJobs(app); });
  app.querySelector('[data-sortby]').addEventListener('change', e => {
    const [k, d] = e.target.value.split(':');
    if (d) { state.sort = k; state.dir = Number(d); renderJobs(app); }
  });
  app.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
    const k = th.dataset.sort;
    state.dir = state.sort === k ? -state.dir : 1;
    state.sort = k;
    renderJobs(app);
  }));
  app.querySelectorAll('tr[data-job]').forEach(tr => tr.addEventListener('click', () => { location.hash = `#/job/${tr.dataset.job}`; }));
  wireMenu(app);
  app.querySelector('[data-export="xlsx"]').addEventListener('click', () => exportPortfolioExcel(all));
  app.querySelector('[data-export="pdf"]').addEventListener('click', () => exportPortfolioPdf(all));
}

export function wireMenu(root) {
  root.querySelectorAll('[data-menu]').forEach(btn => {
    const menu = btn.nextElementSibling;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll('.menu.open').forEach(m => m !== menu && m.classList.remove('open'));
      menu.classList.toggle('open');
    });
    menu.addEventListener('click', () => menu.classList.remove('open'));
  });
}
document.addEventListener('click', () => document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open')));
