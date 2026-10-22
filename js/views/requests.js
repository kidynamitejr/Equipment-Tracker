// Field requests (off rent / forecast change / transfer) and the procurement request queue.

import * as store from '../store.js';
import { equipmentMetrics } from '../calc.js';
import { esc, money, fmtDate, today, addDays, num } from '../util.js';
import { openModal, readForm, validate, toast, icon, canEdit, getUserName, setUserName, statusPill, confirmDialog } from '../ui.js';

const TYPE_ICON = { offrent: 'truck', forecast: 'calendar', transfer: 'swap' };

export function openRequestForm(eq) {
  const job = store.job(eq.jobId);
  const otherJobs = store.jobs().filter(j => j.id !== eq.jobId);
  const body = `
    <div class="info-box">
      <div class="row"><span>Equipment</span><strong>${esc(eq.equipNo || '—')} · ${esc(eq.description)}</strong></div>
      <div class="row"><span>Vendor / PO</span><span>${esc(eq.vendor || '—')} · ${esc(eq.po || '—')}</span></div>
      <div class="row"><span>On rent since</span><span>${fmtDate(eq.onRentDate)}</span></div>
      <div class="row"><span>Current forecast off rent</span><span>${fmtDate(eq.forecastOffDate)}</span></div>
    </div>
    <form id="req-form" novalidate data-track>
      <div class="field" style="margin-bottom:14px">
        <label>Request type</label>
        <div class="type-cards">
          <label class="type-card"><input type="radio" name="type" value="offrent" checked><strong>${icon('truck', 16)} Off rent</strong><small>Equipment is no longer needed. Procurement calls the vendor for pickup.</small></label>
          <label class="type-card"><input type="radio" name="type" value="forecast"><strong>${icon('calendar', 16)} Change forecast</strong><small>Keep it, but the expected off rent date has moved.</small></label>
          <label class="type-card ${otherJobs.length ? '' : 'disabled'}"><input type="radio" name="type" value="transfer" ${otherJobs.length ? '' : 'disabled'}><strong>${icon('swap', 16)} Transfer</strong><small>Off rent here and put it on rent at another job.</small></label>
        </div>
      </div>
      <div class="grid g2">
        <div class="field"><label for="r-date" id="r-date-label">Requested off rent date <span class="reqd">*</span></label><input id="r-date" type="date" name="requestedDate" value="${today()}" required></div>
        <div class="field"><label for="r-by">Requested by <span class="reqd">*</span></label><input id="r-by" name="requestedBy" value="${esc(getUserName())}" required placeholder="Your name"></div>
        <div class="field" data-transfer hidden><label for="r-job">Transfer to job <span class="reqd">*</span></label>
          <select id="r-job" name="targetJobId">${otherJobs.map(j => `<option value="${j.id}">${esc(j.number)} · ${esc(j.name)}</option>`).join('')}</select></div>
        <div class="field" data-transfer hidden><label for="r-tf">Forecast off rent at new job</label><input id="r-tf" type="date" name="targetForecastDate"></div>
        <div class="field span-all"><label for="r-reason">Reason / notes for procurement</label><textarea id="r-reason" name="reason" placeholder="e.g. Work complete, unit is staged at laydown yard B, keys in the cab."></textarea></div>
      </div>
      <p class="muted" style="font-size:12.5px;margin:12px 0 0">Pickup contact: <strong>${esc(job.equipContact || 'not set on job')}</strong></p>
    </form>`;
  openModal({
    title: 'Request equipment change', subtitle: `Job ${esc(job.number)} · ${esc(job.name)}`, body, size: 'md',
    footer: '<button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" data-submit>Submit request</button>',
    onMount: (el, m) => {
      const form = el.querySelector('#req-form');
      const sync = () => {
        const type = form.querySelector('[name=type]:checked').value;
        form.querySelectorAll('[data-transfer]').forEach(f => { f.hidden = type !== 'transfer'; });
        el.querySelector('#r-date-label').innerHTML = (type === 'forecast' ? 'New forecast off rent date' : type === 'transfer' ? 'Transfer date' : 'Requested off rent date') + ' <span class="reqd">*</span>';
        const d = form.querySelector('[name=requestedDate]');
        if (type === 'forecast' && d.value === today()) d.value = eq.forecastOffDate ? addDays(eq.forecastOffDate, 7) : addDays(today(), 7);
        if (type !== 'forecast' && d.value !== today() && d.dataset.touched !== '1') d.value = today();
      };
      form.querySelector('[name=requestedDate]').addEventListener('input', e => { e.target.dataset.touched = '1'; });
      form.addEventListener('change', e => { if (e.target.name === 'type') sync(); });
      el.querySelector('[data-submit]').addEventListener('click', () => {
        if (!validate(form)) return;
        const v = readForm(form);
        if (v.type !== 'transfer') { delete v.targetJobId; delete v.targetForecastDate; }
        if (v.requestedDate < eq.onRentDate) { toast('Date is before the on-rent date', 'error'); return; }
        setUserName(v.requestedBy);
        store.createRequest({ ...v, jobId: eq.jobId, equipmentId: eq.id });
        m.close();
        toast('Request sent. Procurement will see it under Requests.');
      });
    },
  });
}

export function requestCard(r, { compact = false, showJob = false } = {}) {
  const job = store.job(r.jobId);
  const eq = store.equipment(r.equipmentId);
  const target = r.targetJobId ? store.job(r.targetJobId) : null;
  const m = eq ? equipmentMetrics(eq) : null;
  const done = r.status !== 'pending';
  const change = r.type === 'offrent' ? `Off rent on ${fmtDate(r.requestedDate)}`
    : r.type === 'forecast' ? `Forecast ${fmtDate(eq?.forecastOffDate && !done ? eq.forecastOffDate : r.previousForecast)} → ${fmtDate(r.requestedDate)}`.replace('— →', '→')
      : `Transfer to ${esc(target ? `${target.number} · ${target.name}` : 'deleted job')} on ${fmtDate(r.requestedDate)}`;
  const statusTag = r.status === 'pending' ? '<span class="pill pill-amber"><i></i>Pending</span>'
    : r.status === 'completed' ? '<span class="pill pill-green"><i></i>Completed</span>' : '<span class="pill pill-gray"><i></i>Cancelled</span>';
  return `
    <div class="req type-${r.type} ${done ? 'done' : ''}" data-req="${r.id}">
      <div class="req-head">
        <div>
          <h4><span class="pill type-pill-${r.type}">${icon(TYPE_ICON[r.type], 13)} ${store.REQUEST_LABELS[r.type]}</span>
            ${eq ? `<a href="javascript:void 0" data-open-eq="${eq.id}">${esc(eq.equipNo || '—')} · ${esc(eq.description)}</a>` : '<span class="muted">Equipment deleted</span>'} ${statusTag}</h4>
          <div class="meta">${showJob && job ? `<a href="#/job/${job.id}/requests" class="job-link">Job ${esc(job.number)} · ${esc(job.name)}</a> · ` : ''}Requested by ${esc(r.requestedBy)} · ${new Date(r.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
            ${done ? ` · ${r.status === 'completed' ? 'Completed' : 'Cancelled'} by ${esc(r.completedBy || '—')} ${new Date(r.completedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}` : ''}</div>
        </div>
        ${!done && canEdit() && !compact ? `<div class="actions">
          <button class="btn btn-sm btn-ghost" data-cancel="${r.id}">Cancel</button>
          <button class="btn btn-sm btn-primary" data-complete="${r.id}">${icon('check', 14)} Complete request</button></div>` : ''}
      </div>
      <div class="req-grid" style="padding-bottom:6px"><div class="span-all" style="grid-column:1/-1"><dd class="req-change">${change}</dd></div></div>
      ${eq && !compact ? `<dl class="req-grid">
        <div><dt>Vendor</dt><dd>${esc(eq.vendor || '—')}</dd></div>
        <div><dt>PO #</dt><dd>${esc(eq.po || '—')}${eq.poAmount ? ` · ${money(eq.poAmount)}` : ''}</dd></div>
        <div><dt>Qty / cost code</dt><dd>${esc(eq.qty)} · ${esc(eq.costCode || '—')}</dd></div>
        <div><dt>Status</dt><dd>${statusPill(eq.status)}</dd></div>
        <div><dt>Make / model</dt><dd>${esc([eq.manufacturer, eq.model].filter(Boolean).join(' ') || '—')}</dd></div>
        <div><dt>Serial #</dt><dd>${esc(eq.serial || '—')}</dd></div>
        <div><dt>On rent</dt><dd>${fmtDate(eq.onRentDate)}</dd></div>
        <div><dt>Current forecast off</dt><dd>${fmtDate(eq.forecastOffDate)}</dd></div>
        <div><dt>Rates (D / W / M)</dt><dd>${money(eq.rateDaily)} / ${money(eq.rateWeekly)} / ${money(eq.rateMonthly)}</dd></div>
        <div><dt>Cost ITD / EAC</dt><dd>${money(m.itdCost)} / ${money(m.eacCost)}</dd></div>
        <div><dt>Pickup contact</dt><dd>${esc(job?.equipContact || '—')}</dd></div>
        <div><dt>Job address</dt><dd>${esc(job?.address || '—')}</dd></div>
      </dl>` : ''}
      ${r.reason ? `<div class="req-reason">${esc(r.reason)}</div>` : ''}
      ${r.completionNote ? `<div class="req-reason"><strong>Procurement note:</strong> ${esc(r.completionNote)}</div>` : ''}
    </div>`;
}

export function wireRequestCards(root, onOpenEquipment) {
  root.querySelectorAll('[data-complete]').forEach(b => b.addEventListener('click', () => openCompleteForm(store.request(b.dataset.complete))));
  root.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Cancel request?', message: 'The request will be closed without changing the equipment.', confirmLabel: 'Cancel request', danger: true });
    if (ok) { store.cancelRequest(b.dataset.cancel, getUserName() || 'Procurement'); toast('Request cancelled'); }
  }));
  root.querySelectorAll('[data-open-eq]').forEach(a => a.addEventListener('click', () => onOpenEquipment?.(a.dataset.openEq)));
}

function openCompleteForm(r) {
  const eq = store.equipment(r.equipmentId);
  const target = r.targetJobId ? store.job(r.targetJobId) : null;
  const intro = {
    offrent: 'Confirm the vendor has been contacted and the equipment is off rent. The status changes to Off rent on the date below.',
    forecast: 'Update the PO with the vendor, then enter the new PO amount. The forecast off rent date changes to the date below.',
    transfer: `The equipment goes off rent on this job and on rent at job ${esc(target?.number || '')} on the date below, using that job's markup and tax.`,
  }[r.type];
  const body = `
    <p>${intro}</p>
    <form id="complete-form" novalidate>
      <div class="grid g2" style="margin-top:12px">
        <div class="field"><label for="c-date">${r.type === 'forecast' ? 'New forecast off rent date' : r.type === 'transfer' ? 'Transfer date' : 'Actual off rent date'} <span class="reqd">*</span></label>
          <input id="c-date" type="date" name="effectiveDate" value="${r.requestedDate}" required></div>
        <div class="field"><label for="c-by">Completed by <span class="reqd">*</span></label><input id="c-by" name="completedBy" value="${esc(getUserName())}" required></div>
        ${r.type !== 'offrent' ? `
          <div class="field"><label for="c-po">${r.type === 'transfer' ? 'New PO #' : 'PO #'}</label><input id="c-po" name="po" value="${esc(eq?.po || '')}"></div>
          <div class="field"><label for="c-amt">${r.type === 'transfer' ? 'PO amount at new job' : 'Updated PO amount'}</label>
            <div class="affix"><span class="pre">$</span><input id="c-amt" type="number" step="any" min="0" name="poAmount" value="${esc(eq?.poAmount ?? '')}"></div></div>` : ''}
        <div class="field span-all"><label for="c-note">Note (optional)</label><textarea id="c-note" name="note" style="min-height:64px" placeholder="e.g. Vendor confirmation #, pickup scheduled for Tuesday AM."></textarea></div>
      </div>
    </form>`;
  openModal({
    title: `Complete ${store.REQUEST_LABELS[r.type].toLowerCase()} request`,
    subtitle: eq ? `${esc(eq.equipNo || '—')} · ${esc(eq.description)} · ${esc(eq.vendor || '')}` : '',
    body, size: 'md',
    footer: `<button class="btn btn-ghost" data-close>Back</button><button class="btn btn-primary" data-ok>${icon('check', 15)} Complete &amp; apply changes</button>`,
    onMount: (el, m) => {
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const form = el.querySelector('#complete-form');
        if (!validate(form)) return;
        const v = readForm(form);
        if (eq && v.effectiveDate < eq.onRentDate) { toast('Date is before the on-rent date', 'error'); return; }
        if (v.poAmount !== undefined && v.poAmount !== '') v.poAmount = num(v.poAmount);
        setUserName(v.completedBy);
        if (r.type === 'forecast' && eq) r.previousForecast = eq.forecastOffDate;
        store.completeRequest(r.id, v);
        m.close();
        toast('Request completed and changes applied');
      });
    },
  });
}

// Requests list. With a job, that job's requests; with job = null, every job's (the Requests inbox).
export function renderRequestsTab(el, job, state, onOpenEquipment) {
  const all = job ? store.requestsForJob(job.id) : store.allRequests();
  const counts = { pending: 0, completed: 0, cancelled: 0 };
  all.forEach(r => { counts[r.status]++; });
  const list = all.filter(r => state.reqFilter === 'all' || r.status === state.reqFilter)
    .filter(r => state.reqType === 'all' || r.type === state.reqType);
  el.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <div class="seg">
          ${[['pending', `Pending (${counts.pending})`], ['completed', `Completed (${counts.completed})`], ['cancelled', `Cancelled (${counts.cancelled})`], ['all', `All (${all.length})`]]
    .map(([k, l]) => `<label><input type="radio" name="reqf" value="${k}" ${state.reqFilter === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </div>
        <select data-rtype aria-label="Request type">
          <option value="all">All request types</option>
          ${Object.entries(store.REQUEST_LABELS).map(([k, l]) => `<option value="${k}" ${state.reqType === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <span class="spacer"></span>
        <span class="result-count">${canEdit() ? 'Contact the vendor, then complete the request to apply the change.' : 'Requests are reviewed by procurement.'}</span>
      </div>
      ${list.length ? `<div class="req-list">${list.map(r => requestCard(r, { showJob: !job })).join('')}</div>`
    : `<div class="empty">${icon('inbox', 36)}<h4>No ${state.reqFilter === 'all' ? '' : state.reqFilter} requests</h4><p>${state.reqFilter === 'pending' ? 'You are all caught up. ' : ''}When someone uses the <strong>Request</strong> button on a piece of equipment, it shows up here for procurement.</p></div>`}
    </div>`;
  el.querySelectorAll('[name=reqf]').forEach(i => i.addEventListener('change', () => { state.reqFilter = i.value; renderRequestsTab(el, job, state, onOpenEquipment); }));
  el.querySelector('[data-rtype]').addEventListener('change', e => { state.reqType = e.target.value; renderRequestsTab(el, job, state, onOpenEquipment); });
  wireRequestCards(el, onOpenEquipment);
}
