import * as store from '../store.js';
import { jobMetrics } from '../calc.js';
import { esc, money, compactMoney, fmtDate, debounce } from '../util.js';
import { icon, canEdit } from '../ui.js';
import { openJobForm } from './jobForm.js';
import { exportPortfolioExcel, exportPortfolioPdf } from '../export.js';

const state = { q: '', sort: 'number', dir: 1 };

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
  const rows = all.filter(r => !q || [r.job.number, r.job.name, r.job.clientName, r.job.pm, r.job.jdeId].join(' ').toLowerCase().includes(q));
  const key = {
    number: r => r.job.number, name: r => r.job.name, client: r => r.job.clientName, pm: r => r.job.pm,
    on: r => r.m.onRent, eac: r => r.m.eacCost, itd: r => r.m.itdCost, mo: r => r.m.monthlyCost, reqs: r => r.openReqs,
  }[state.sort];
  rows.sort((a, b) => {
    const x = key(a), y = key(b);
    return (typeof x === 'number' ? x - y : String(x || '').localeCompare(String(y || ''))) * state.dir;
  });
  const th = (k, label, cls = '') => `<th class="sortable ${cls}" data-sort="${k}">${label}<span class="sort">${state.sort === k ? (state.dir > 0 ? '▲' : '▼') : ''}</span></th>`;

  app.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Jobs</h1>
          <div class="sub"><span>${all.length} active job${all.length === 1 ? '' : 's'}</span><span>As of ${fmtDate(new Date().toISOString().slice(0, 10))}</span></div>
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
      </div>

      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Total EAC cost</div><div class="kpi-value">${compactMoney(tot.eac)}</div><div class="kpi-foot"><span class="pos">${compactMoney(tot.eacP)}</span> EAC profit</div></div>
        <div class="kpi"><div class="kpi-label">Total ITD cost</div><div class="kpi-value">${compactMoney(tot.itd)}</div><div class="kpi-foot"><span class="pos">${compactMoney(tot.itdP)}</span> profit to date</div></div>
        <div class="kpi"><div class="kpi-label">Monthly cost</div><div class="kpi-value">${compactMoney(tot.mo)}</div><div class="kpi-foot"><span class="pos">${compactMoney(tot.moP)}</span> profit · last 30 days</div></div>
        <div class="kpi"><div class="kpi-label">On rent</div><div class="kpi-value">${tot.on}</div><div class="kpi-foot">${tot.soon ? `<span class="warn">${tot.soon}</span> off rent within 7 days` : 'None due off within 7 days'}</div></div>
        <div class="kpi"><div class="kpi-label">Open field requests</div><div class="kpi-value">${tot.reqs}</div><div class="kpi-foot">Awaiting procurement</div></div>
        <div class="kpi"><div class="kpi-label">Active jobs</div><div class="kpi-value">${all.length}</div><div class="kpi-foot">${all.reduce((n, r) => n + r.m.lines, 0)} equipment lines</div></div>
      </div>

      <div class="card">
        <div class="toolbar">
          <div class="search">${icon('search', 15)}<input type="search" placeholder="Search job number, name, client, PM…" value="${esc(state.q)}" data-q aria-label="Search jobs"></div>
          <span class="spacer"></span>
          <span class="result-count">${rows.length} of ${all.length} jobs</span>
        </div>
        ${rows.length ? `
        <div class="table-wrap"><table class="data">
          <thead><tr>
            ${th('number', 'Job')}${th('client', 'Client')}${th('pm', 'Project manager')}
            ${th('on', 'On rent', 'num')}${th('mo', 'Monthly cost', 'num')}${th('itd', 'ITD cost', 'num')}${th('eac', 'EAC cost', 'num')}${th('reqs', 'Requests', 'num')}
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr data-job="${r.job.id}">
                <td><div class="cell-stack"><span class="primary">${esc(r.job.number)}</span><span class="secondary">${esc(r.job.name)}</span></div></td>
                <td><div class="cell-stack"><span>${esc(r.job.clientName || '—')}</span><span class="secondary">${esc(r.job.contractType || '')}</span></div></td>
                <td>${esc(r.job.pm || '—')}</td>
                <td class="num">${r.m.onRent}${r.m.offSoon ? `<span class="tag tag-warn">${r.m.offSoon} soon</span>` : ''}</td>
                <td class="num">${money(r.m.monthlyCost)}</td>
                <td class="num"><div class="cell-stack"><span>${money(r.m.itdCost)}</span><span class="secondary profit">${money(r.m.itdProfit)} profit</span></div></td>
                <td class="num"><div class="cell-stack"><span>${money(r.m.eacCost)}</span><span class="secondary profit">${money(r.m.eacProfit)} profit</span></div></td>
                <td class="num">${r.openReqs ? `<span class="badge badge-alert">${r.openReqs}</span>` : '<span class="muted">—</span>'}</td>
              </tr>`).join('')}
          </tbody>
        </table></div>` : `
        <div class="empty">${icon('building', 36)}<h4>${all.length ? 'No jobs match your search' : 'No jobs yet'}</h4>
          <p>${all.length ? 'Try a different search term.' : canEdit() ? 'Create your first job to start tracking rented equipment.' : 'Procurement has not created any jobs yet.'}</p></div>`}
      </div>
      <p class="footer-note">Data is stored in this browser. Use Data &amp; settings to back it up or move it to another computer.</p>
    </div>`;

  app.querySelector('[data-new]')?.addEventListener('click', () => openJobForm());
  const qi = app.querySelector('[data-q]');
  qi.addEventListener('input', debounce(() => {
    state.q = qi.value;
    renderJobs(app);
    const n = app.querySelector('[data-q]');
    n.focus(); n.setSelectionRange(n.value.length, n.value.length);
  }, 150));
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
