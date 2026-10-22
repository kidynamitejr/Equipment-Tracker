// Equipment detail drawer: edit form with live cost preview, equipment cost calendar, request history.

import * as store from '../store.js';
import { equipmentMetrics, dailySchedule, fuelMarkupForJob } from '../calc.js';
import { esc, money, fmtDate, today, num } from '../util.js';
import { openDrawer, readForm, validate, toast, confirmDialog, icon, canEdit, statusPill, help } from '../ui.js';
import { renderCalendar } from './calendar.js';
import { openRequestForm, requestCard } from './requests.js';

const NUMERIC = ['qty', 'rateDaily', 'rateWeekly', 'rateMonthly', 'mobCost', 'demobCost', 'oneTimeCost',
  'equipMarkup', 'fuelMarkup', 'envTax', 'dieselTax', 'propertyTax', 'taxRate', 'poAmount'];

export function newEquipmentDefaults(job, coe = false) {
  return {
    jobId: job.id, qty: 1, status: 'on', fuelType: 'none', coe, onRentDate: today(),
    equipMarkup: job.markupEquipment ?? 0, fuelMarkup: job.markupNoFuel ?? 0, taxRate: job.salesTax ?? 0,
    envTax: 0, dieselTax: 0, propertyTax: 0, mobCost: 0, demobCost: 0, oneTimeCost: 0,
  };
}

export function openEquipment(jobId, equipmentId, { coe = false, tab = 'details' } = {}) {
  const job = store.job(jobId);
  const st = { id: equipmentId, tab, cal: {} };
  let unsub;
  const drawer = openDrawer({
    onClose: () => unsub?.(),
    render: (panel, api) => {
      const eq = st.id ? store.equipment(st.id) : null;
      if (st.id && !eq) { api.forceClose(); return; }
      const data = eq || newEquipmentDefaults(job, coe);
      const m = eq ? equipmentMetrics(eq) : null;
      const editable = canEdit();
      const pending = eq ? store.openRequestFor(eq.id) : null;
      const reqs = eq ? store.requestsForJob(jobId).filter(r => r.equipmentId === eq.id) : [];
      const tabs = eq ? [['details', 'Details'], ['calendar', 'Cost calendar'], ['requests', `Requests${reqs.length ? ` <span class="badge">${reqs.length}</span>` : ''}`]] : [];

      panel.innerHTML = `
        <div class="drawer-head">
          <div class="drawer-title">
            <div>
              <h2>${eq ? `${esc(eq.equipNo || 'No equipment #')} · ${esc(eq.description)}` : `Add ${coe ? 'COE' : 'rental'} equipment`}</h2>
              <div class="meta">
                ${eq ? `${statusPill(eq.status)}${eq.coe ? '<span class="tag">COE</span>' : ''}
                  <span>${esc(eq.vendor || 'No vendor')}</span><span>PO ${esc(eq.po || '—')}</span>
                  ${pending ? `<span class="tag tag-req">${store.REQUEST_LABELS[pending.type]} requested</span>` : ''}`
                  : `<span>Job ${esc(job.number)} · ${esc(job.name)}</span>`}
              </div>
            </div>
            <button class="icon-btn" data-x aria-label="Close">${icon('x', 18)}</button>
          </div>
          ${m ? `<div class="drawer-kpis">
            <div class="kpi"><div class="kpi-label">Rental cost EAC${help('Full expected cost of this line through its off-rent date.')}</div><div class="kpi-value">${money(m.eacCost)}</div><div class="kpi-foot">${m.eacDays} days · <span class="pos">${money(m.eacProfit)}</span></div></div>
            <div class="kpi"><div class="kpi-label">Rental cost ITD${help('Cost incurred from the on-rent date through today.')}</div><div class="kpi-value">${money(m.itdCost)}</div><div class="kpi-foot">${m.itdDays} days to date</div></div>
            <div class="kpi"><div class="kpi-label">Profit to date${help('Markup earned so far: base cost to date times equipment markup plus fuel markup.')}</div><div class="kpi-value profit">${money(m.itdProfit)}</div><div class="kpi-foot">${num(eq.equipMarkup) + num(eq.fuelMarkup)}% total markup</div></div>
            <div class="kpi"><div class="kpi-label">Monthly rental cost${help('Cost incurred over the last 30 days.')}</div><div class="kpi-value">${money(m.monthlyCost)}</div><div class="kpi-foot">Last 30 days · <span class="pos">${money(m.monthlyProfit)}</span></div></div>
          </div>` : '<div style="height:14px"></div>'}
          ${tabs.length ? `<nav class="tabs">${tabs.map(([k, l]) => `<a href="javascript:void 0" data-tab="${k}" class="${st.tab === k ? 'active' : ''}">${l}</a>`).join('')}</nav>` : ''}
        </div>
        <div class="drawer-body" id="drawer-body"></div>
        <div class="drawer-foot">
          ${eq && editable ? `<button class="btn btn-ghost btn-danger-text left" data-delete>${icon('trash', 15)} Delete</button>` : ''}
          ${eq && eq.status !== 'off' && !pending ? `<button class="btn ${editable ? '' : 'btn-primary'}" data-request>${icon('swap', 15)} Request change</button>` : ''}
          <button class="btn btn-ghost" data-x>${editable && st.tab === 'details' ? 'Cancel' : 'Close'}</button>
          ${editable && st.tab === 'details' ? `<button class="btn btn-primary" data-save>${eq ? 'Save changes' : 'Add equipment'}</button>` : ''}
        </div>`;

      panel.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', api.close));
      panel.querySelectorAll('[data-tab]').forEach(a => a.addEventListener('click', () => { st.tab = a.dataset.tab; api.rerender(); }));
      panel.querySelector('[data-request]')?.addEventListener('click', () => openRequestForm(eq));
      panel.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: 'Delete equipment?', danger: true, confirmLabel: 'Delete',
          message: `This permanently removes <strong>${esc(eq.equipNo || eq.description)}</strong> and its requests from job ${esc(job.number)}.` });
        if (!ok) return;
        api.forceClose();
        store.deleteEquipment(eq.id);
        toast('Equipment deleted');
      });

      const body = panel.querySelector('#drawer-body');
      if (st.tab === 'calendar' && eq) {
        renderCalendar(body, dailySchedule(eq), st.cal, { title: `${eq.qty} × ${esc(eq.description)}` });
      } else if (st.tab === 'requests' && eq) {
        body.innerHTML = reqs.length ? `<div class="card"><div class="req-list">${reqs.map(r => requestCard(r, { compact: true })).join('')}</div></div>`
          : `<div class="card"><div class="empty">${icon('inbox', 36)}<h4>No requests</h4><p>Field requests for this equipment will appear here.</p></div></div>`;
      } else {
        body.innerHTML = formHtml(job, data, editable);
        wireForm(body, job, data, editable);
        panel.querySelector('[data-save]')?.addEventListener('click', () => {
          const form = body.querySelector('form');
          if (!validate(form)) return;
          const v = readForm(form);
          NUMERIC.forEach(k => { if (k in v) v[k] = v[k] === '' ? '' : num(v[k]); });
          if (!v.qty) v.qty = 1;
          if (v.status !== 'off') v.offRentDate = '';
          if (v.status === 'off' && !v.offRentDate) v.offRentDate = v.forecastOffDate || today();
          if (v.forecastOffDate && v.forecastOffDate < v.onRentDate) { toast('Forecast off-rent date is before the on-rent date', 'error'); return; }
          const id = store.saveEquipment(eq ? { ...eq, ...v } : { ...data, ...v });
          toast(eq ? 'Equipment updated' : 'Equipment added');
          if (!eq) { st.id = id; api.rerender(); }
        });
      }
    },
  });
  unsub = store.subscribe(() => drawer.panel.isConnected && drawer.rerender());
  return drawer;
}

const inp = (name, label, v, { type = 'text', req = false, pre = '', post = '', span = '', list = '', dis = false, hint = '' } = {}) => `
  <div class="field ${span}">
    <label for="e-${name}">${label}${req ? ' <span class="reqd">*</span>' : ''}</label>
    <div class="affix">
      ${pre ? `<span class="pre">${pre}</span>` : ''}
      <input id="e-${name}" name="${name}" type="${type}" value="${esc(v ?? '')}" ${req ? 'required' : ''} ${type === 'number' ? 'step="any" min="0"' : ''} ${list ? `list="${list}"` : ''} ${dis ? 'disabled' : ''}>
      ${post ? `<span class="post">${post}</span>` : ''}
    </div>
    ${hint ? `<div class="hint">${hint}</div>` : ''}
  </div>`;

const seg = (name, value, options, dis) => `<div class="seg">${options.map(([v, l]) => `
  <label><input type="radio" name="${name}" value="${v}" ${value === v ? 'checked' : ''} ${dis ? 'disabled' : ''}><span>${l}</span></label>`).join('')}</div>`;

function formHtml(job, d, editable) {
  const dis = !editable;
  const vendors = [...new Set(store.jobs().flatMap(j => store.equipmentForJob(j.id).map(e => e.vendor)).filter(Boolean))].sort();
  const codes = [...new Set(store.equipmentForJob(job.id).map(e => e.costCode).filter(Boolean))].sort();
  return `
    <form class="form-card" novalidate data-track ${dis ? 'inert' : ''}>
      <div class="form-section">
        <h4>Equipment</h4>
        <div class="grid g4">
          ${inp('equipNo', 'Equipment #', d.equipNo)}
          ${inp('description', 'Description', d.description, { req: true, span: 'span2' })}
          ${inp('qty', 'Quantity', d.qty, { type: 'number' })}
          ${inp('vendor', 'Vendor', d.vendor, { req: true, list: 'dl-vendors' })}
          ${inp('po', 'PO #', d.po)}
          ${inp('poAmount', 'PO amount', d.poAmount, { type: 'number', pre: '$' })}
          ${inp('costCode', 'Cost code', d.costCode, { list: 'dl-codes' })}
          ${inp('manufacturer', 'Manufacturer', d.manufacturer)}
          ${inp('model', 'Model #', d.model)}
          ${inp('serial', 'Serial #', d.serial, { span: 'span2' })}
          <div class="span-all">
            <label class="switch"><input type="checkbox" name="coe" ${d.coe ? 'checked' : ''}>
              <span><strong>COE</strong><small>Shown on the COE tab instead of the Equipment tab.</small></span></label>
          </div>
        </div>
        <datalist id="dl-vendors">${vendors.map(v => `<option value="${esc(v)}">`).join('')}</datalist>
        <datalist id="dl-codes">${codes.map(v => `<option value="${esc(v)}">`).join('')}</datalist>
      </div>
      <div class="form-section">
        <h4>Rental period</h4>
        <div class="field" style="margin-bottom:12px"><label>Status</label>${seg('status', d.status, [['on', 'On rent'], ['off', 'Off rent'], ['forecast', 'Forecasted']], dis)}</div>
        <div class="grid g3">
          ${inp('onRentDate', 'On rent date', d.onRentDate, { type: 'date', req: true })}
          ${inp('forecastOffDate', 'Forecast off rent date', d.forecastOffDate, { type: 'date' })}
          ${inp('offRentDate', 'Actual off rent date', d.offRentDate, { type: 'date', dis: d.status !== 'off', hint: 'Used when status is Off rent.' })}
        </div>
      </div>
      <div class="form-section">
        <h4>Rates &amp; one-time costs</h4>
        <div class="grid g3">
          ${inp('rateDaily', 'Daily rate', d.rateDaily, { type: 'number', pre: '$' })}
          ${inp('rateWeekly', 'Weekly rate', d.rateWeekly, { type: 'number', pre: '$', hint: 'Billed when more than 3 days' })}
          ${inp('rateMonthly', 'Monthly rate', d.rateMonthly, { type: 'number', pre: '$', hint: 'Billed when more than 3 weeks (28-day month)' })}
          ${inp('mobCost', 'Mobilization', d.mobCost, { type: 'number', pre: '$' })}
          ${inp('demobCost', 'Demobilization', d.demobCost, { type: 'number', pre: '$' })}
          ${inp('oneTimeCost', 'One-time costs', d.oneTimeCost, { type: 'number', pre: '$' })}
        </div>
      </div>
      <div class="form-section">
        <h4>Markups &amp; taxes</h4>
        <div class="field" style="margin-bottom:12px"><label>Fuel use type</label>${seg('fuelType', d.fuelType || 'none', [['none', 'None'], ['standard', 'Standard'], ['high', 'High']], dis)}
          <div class="hint">Changing fuel type fills in this job's fuel markup (${job.markupNoFuel || 0}% / ${job.markupStdFuel || 0}% / ${job.markupHighFuel || 0}%).</div></div>
        <div class="grid g3">
          ${inp('equipMarkup', 'Equipment markup', d.equipMarkup, { type: 'number', post: '%' })}
          ${inp('fuelMarkup', 'Fuel markup', d.fuelMarkup, { type: 'number', post: '%' })}
          ${inp('taxRate', 'Tax rate', d.taxRate, { type: 'number', post: '%' })}
          ${inp('envTax', 'Environmental tax', d.envTax, { type: 'number', post: '%' })}
          ${inp('dieselTax', 'Diesel tax', d.dieselTax, { type: 'number', post: '%' })}
          ${inp('propertyTax', 'Property tax', d.propertyTax, { type: 'number', post: '%' })}
        </div>
      </div>
      <div class="form-section">
        <h4>Cost preview</h4>
        <div class="info-box" id="preview" style="margin:0"></div>
      </div>
      <div class="form-section" style="margin-bottom:0">
        <h4>Notes</h4>
        <div class="field"><textarea name="notes" aria-label="Notes">${esc(d.notes || '')}</textarea></div>
      </div>
    </form>`;
}

function wireForm(body, job, data, editable) {
  const form = body.querySelector('form');
  const preview = () => {
    const v = readForm(form);
    const m = equipmentMetrics({ ...data, ...v, qty: num(v.qty) || 1 });
    body.querySelector('#preview').innerHTML = `
      <div class="row"><span>Rental days (EAC / ITD)</span><span>${m.eacDays} / ${m.itdDays}</span></div>
      <div class="row"><span>Rates used (day / week / month)</span><span>${money(m.rates.d)} / ${money(m.rates.w)} / ${money(m.rates.m)}</span></div>
      <div class="row"><span>Rental cost EAC</span><strong>${money(m.eacCost)}</strong></div>
      <div class="row"><span>Rental cost ITD</span><strong>${money(m.itdCost)}</strong></div>
      <div class="row"><span>EAC profit / profit to date</span><span class="profit">${money(m.eacProfit)} / ${money(m.itdProfit)}</span></div>
      <div class="row"><span>Monthly rental cost (last 30 days)</span><span>${money(m.monthlyCost)}</span></div>
      ${num(v.poAmount) ? `<div class="row"><span>EAC vs PO amount</span><span class="${m.eacCost > num(v.poAmount) ? 'loss' : 'profit'}">${money(num(v.poAmount) - m.eacCost)} ${m.eacCost > num(v.poAmount) ? 'over' : 'remaining'}</span></div>` : ''}`;
  };
  preview();
  if (!editable) return;
  form.addEventListener('input', preview);
  form.addEventListener('change', e => {
    if (e.target.name === 'fuelType') {
      form.querySelector('[name=fuelMarkup]').value = fuelMarkupForJob(job, e.target.value);
    }
    if (e.target.name === 'status') {
      const off = form.querySelector('[name=offRentDate]');
      off.disabled = e.target.value !== 'off';
      if (e.target.value === 'off' && !off.value) off.value = form.querySelector('[name=forecastOffDate]').value || today();
    }
    preview();
  });
}

