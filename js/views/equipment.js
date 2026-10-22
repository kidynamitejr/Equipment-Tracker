// Equipment detail drawer: edit form with live cost preview, equipment cost calendar, request history.

import * as store from '../store.js';
import { equipmentMetrics, dailySchedule, fuelMarkupForJob, unitsOf } from '../calc.js';
import { esc, money, fmtDate, today, num, uid } from '../util.js';
import { openDrawer, readForm, validate, toast, confirmDialog, icon, canEdit, statusPill, help } from '../ui.js';
import { renderCalendar } from './calendar.js';
import { openRequestForm, requestCard } from './requests.js';

const NUMERIC = ['rateDaily', 'rateWeekly', 'rateMonthly', 'mobCost', 'demobCost', 'oneTimeCost',
  'equipMarkup', 'fuelMarkup', 'envTax', 'dieselTax', 'propertyTax', 'taxRate', 'poAmount'];

export function newEquipmentDefaults(job, coe = false) {
  return {
    jobId: job.id, qty: 1, units: [blankUnit()], status: 'on', fuelType: 'none', coe, onRentDate: today(),
    equipMarkup: job.markupEquipment ?? 0, fuelMarkup: job.markupNoFuel ?? 0, taxRate: job.salesTax ?? 0,
    envTax: 0, dieselTax: 0, propertyTax: 0, mobCost: 0, demobCost: 0, oneTimeCost: 0,
  };
}

const blankUnit = (from = {}) => ({ id: uid('unit'), equipNo: '', model: from.model || '', serial: '', status: 'on', offRentDate: '', forecastOffDate: '' });

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
              <h2>${eq ? `${eq.qty > 1 ? `${eq.qty} ×` : esc(eq.equipNo || 'No equipment #') + ' ·'} ${esc(eq.description)}` : `Add ${coe ? 'COE' : 'rental'} equipment`}</h2>
              <div class="meta">
                ${eq ? `${statusPill(eq.status)}${m.units.total > 1 && eq.status !== 'forecast' ? `<span>${m.units.on} of ${m.units.total} units on rent</span>` : ''}${eq.coe ? '<span class="tag">COE</span>' : ''}
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
          ${eq && store.requestableUnits(eq).length ? `<button class="btn ${editable ? '' : 'btn-primary'}" data-request>${icon('swap', 15)} Request change</button>` : ''}
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
          const units = readUnits(form);
          if (!units) return;
          const v = readForm(form);
          Object.keys(v).filter(k => k.startsWith('u-')).forEach(k => delete v[k]);
          v.units = units;
          NUMERIC.forEach(k => { if (k in v) v[k] = v[k] === '' ? '' : num(v[k]); });
          // Line status follows its units: Off rent takes every unit off; any unit on puts the line back on.
          if (v.status === 'off') units.forEach(u => { if (u.status !== 'off') Object.assign(u, { status: 'off', offRentDate: v.offRentDate || v.forecastOffDate || today() }); });
          else if (units.every(u => u.status === 'off')) v.status = 'off';
          if (v.status !== 'off') v.offRentDate = '';
          if (v.status === 'off' && !v.offRentDate) v.offRentDate = units.reduce((d, u) => (u.offRentDate > d ? u.offRentDate : d), '') || v.forecastOffDate || today();
          if (units.some(u => u.status === 'off' && u.offRentDate && u.offRentDate < v.onRentDate)) { toast('A unit\'s off-rent date is before the on-rent date', 'error'); return; }
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
          ${inp('description', 'Description', d.description, { req: true, span: 'span2' })}
          ${inp('vendor', 'Vendor', d.vendor, { req: true, list: 'dl-vendors' })}
          ${inp('po', 'PO #', d.po)}
          ${inp('poAmount', 'PO amount', d.poAmount, { type: 'number', pre: '$' })}
          ${inp('costCode', 'Cost code', d.costCode, { list: 'dl-codes' })}
          ${inp('manufacturer', 'Manufacturer', d.manufacturer)}
          <div class="span-all">
            <label class="switch"><input type="checkbox" name="coe" ${d.coe ? 'checked' : ''}>
              <span><strong>COE</strong><small>Shown on the COE tab instead of the Equipment tab.</small></span></label>
          </div>
        </div>
        <datalist id="dl-vendors">${vendors.map(v => `<option value="${esc(v)}">`).join('')}</datalist>
        <datalist id="dl-codes">${codes.map(v => `<option value="${esc(v)}">`).join('')}</datalist>
      </div>
      <div class="form-section">
        <div class="section-head"><h4>Units${help('One row per piece of equipment on this PO line. Each unit has its own equipment #, model # and serial #, and can come off rent on its own date while the others keep billing.')}</h4>
          <span class="muted" data-unit-count></span></div>
        ${unitsHtml(unitsOf(d), dis)}
      </div>
      <div class="form-section">
        <h4>Rental period</h4>
        <div class="field" style="margin-bottom:12px"><label>Status</label>${seg('status', d.status, [['on', 'On rent'], ['off', 'Off rent'], ['forecast', 'Forecasted']], dis)}</div>
        <div class="grid g3">
          ${inp('onRentDate', 'On rent date', d.onRentDate, { type: 'date', req: true })}
          ${inp('forecastOffDate', 'Forecast off rent date', d.forecastOffDate, { type: 'date', hint: 'For every unit without its own date.' })}
          ${inp('offRentDate', 'Actual off rent date', d.offRentDate, { type: 'date', dis: d.status !== 'off', hint: 'Off rent takes every unit off on this date.' })}
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

function unitRow(u, i, dis) {
  const d = dis ? 'disabled' : '';
  return `<tr data-unit="${esc(u.id)}">
    <td class="unit-no">${i + 1}</td>
    <td><input name="u-equipNo-${i}" value="${esc(u.equipNo || '')}" aria-label="Unit ${i + 1} equipment #" placeholder="Equip #" ${d}></td>
    <td><input name="u-model-${i}" value="${esc(u.model || '')}" aria-label="Unit ${i + 1} model #" placeholder="Model #" ${d}></td>
    <td><input name="u-serial-${i}" value="${esc(u.serial || '')}" aria-label="Unit ${i + 1} serial #" placeholder="Serial #" ${d}></td>
    <td><select name="u-status-${i}" aria-label="Unit ${i + 1} status" ${d}><option value="on" ${u.status !== 'off' ? 'selected' : ''}>On rent</option><option value="off" ${u.status === 'off' ? 'selected' : ''}>Off rent</option></select></td>
    <td><input type="date" name="u-offRentDate-${i}" value="${esc(u.offRentDate || '')}" aria-label="Unit ${i + 1} off rent date" ${u.status === 'off' ? '' : 'hidden'} ${d}>
      <input type="date" name="u-forecastOffDate-${i}" value="${esc(u.forecastOffDate || '')}" aria-label="Unit ${i + 1} forecast off rent date" title="Own forecast (optional)" ${u.status === 'off' ? 'hidden' : ''} ${d}></td>
    <td>${dis ? '' : `<button type="button" class="icon-btn" data-remove-unit aria-label="Remove unit ${i + 1}">${icon('x', 15)}</button>`}</td>
  </tr>`;
}

function unitsHtml(units, dis) {
  return `<div class="units-wrap"><table class="units">
      <thead><tr><th>#</th><th>Equipment #</th><th>Model #</th><th>Serial #</th><th>Status</th><th>Off rent date${help('For an off-rent unit, the date it came off. For an on-rent unit, an optional forecast that overrides the line forecast.')}</th><th></th></tr></thead>
      <tbody>${units.map((u, i) => unitRow(u, i, dis)).join('')}</tbody>
    </table></div>
    ${dis ? '' : `<div class="units-actions">
      <button type="button" class="btn btn-sm" data-add-unit>${icon('plus', 14)} Add unit</button>
      <label class="units-bulk">Add <input type="number" min="1" max="100" value="1" data-add-count aria-label="Number of units to add"> more</label>
      <button type="button" class="btn btn-sm btn-ghost" data-fill-model>Copy first model # to all</button>
    </div>`}`;
}

// Reads the unit rows. Returns null (after flagging) if a row is invalid.
function readUnits(form) {
  const rows = [...form.querySelectorAll('tr[data-unit]')];
  if (!rows.length) { toast('Add at least one unit.', 'error'); return null; }
  return rows.map((tr, i) => {
    const val = k => tr.querySelector(`[name="u-${k}-${i}"]`)?.value.trim() || '';
    const status = val('status');
    return { id: tr.dataset.unit, equipNo: val('equipNo'), model: val('model'), serial: val('serial'), status,
      offRentDate: status === 'off' ? val('offRentDate') || today() : '', forecastOffDate: status === 'off' ? '' : val('forecastOffDate') };
  });
}

function wireForm(body, job, data, editable) {
  const form = body.querySelector('form');
  const tbody = form.querySelector('table.units tbody');
  // Renumbers rows so input names stay in order after adds and removals.
  const renumber = () => {
    [...tbody.rows].forEach((tr, i) => {
      tr.querySelector('.unit-no').textContent = i + 1;
      tr.querySelectorAll('[name^="u-"]').forEach(f => { f.name = f.name.replace(/-\d+$/, `-${i}`); });
    });
    const units = readUnits(form) || [];
    const off = units.filter(u => u.status === 'off').length;
    body.querySelector('[data-unit-count]').textContent = `${units.length} unit${units.length === 1 ? '' : 's'}${off ? ` · ${units.length - off} on rent, ${off} off` : ''}`;
  };
  const preview = () => {
    const v = readForm(form);
    const units = [...tbody.rows].length ? readUnits(form) : [];
    const m = equipmentMetrics({ ...data, ...v, units, qty: units.length });
    body.querySelector('#preview').innerHTML = `
      <div class="row"><span>Rental days (EAC / ITD)</span><span>${m.eacDays} / ${m.itdDays}</span></div>
      <div class="row"><span>Rates used (day / week / month)</span><span>${money(m.rates.d)} / ${money(m.rates.w)} / ${money(m.rates.m)}</span></div>
      <div class="row"><span>Rental cost EAC</span><strong>${money(m.eacCost)}</strong></div>
      <div class="row"><span>Rental cost ITD</span><strong>${money(m.itdCost)}</strong></div>
      <div class="row"><span>EAC profit / profit to date</span><span class="profit">${money(m.eacProfit)} / ${money(m.itdProfit)}</span></div>
      <div class="row"><span>Monthly rental cost (last 30 days)</span><span>${money(m.monthlyCost)}</span></div>
      ${num(v.poAmount) ? `<div class="row"><span>EAC vs PO amount</span><span class="${m.eacCost > num(v.poAmount) ? 'loss' : 'profit'}">${money(num(v.poAmount) - m.eacCost)} ${m.eacCost > num(v.poAmount) ? 'over' : 'remaining'}</span></div>` : ''}`;
  };
  renumber();
  preview();
  if (!editable) return;
  const addUnits = n => {
    const first = tbody.rows[0];
    const model = first?.querySelector('[name^="u-model-"]')?.value || '';
    for (let k = 0; k < n; k++) tbody.insertAdjacentHTML('beforeend', unitRow(blankUnit({ model }), tbody.rows.length, false));
    renumber(); preview(); form.dispatchEvent(new Event('input', { bubbles: true }));
  };
  form.querySelector('[data-add-unit]').addEventListener('click', () => addUnits(Math.min(100, Math.max(1, num(form.querySelector('[data-add-count]').value) || 1))));
  form.querySelector('[data-fill-model]').addEventListener('click', () => {
    const model = tbody.querySelector('[name^="u-model-"]')?.value || '';
    tbody.querySelectorAll('[name^="u-model-"]').forEach(f => { if (!f.value) f.value = model; });
    form.dispatchEvent(new Event('input', { bubbles: true }));
  });
  tbody.addEventListener('click', e => {
    const b = e.target.closest('[data-remove-unit]');
    if (!b) return;
    if (tbody.rows.length === 1) { toast('A line needs at least one unit.', 'error'); return; }
    b.closest('tr').remove();
    renumber(); preview(); form.dispatchEvent(new Event('input', { bubbles: true }));
  });
  tbody.addEventListener('change', e => {
    if (!e.target.name?.startsWith('u-status-')) return;
    const tr = e.target.closest('tr'), off = e.target.value === 'off';
    const offDate = tr.querySelector('[name^="u-offRentDate-"]');
    offDate.hidden = !off;
    tr.querySelector('[name^="u-forecastOffDate-"]').hidden = off;
    if (off && !offDate.value) offDate.value = today();
    renumber();
  });
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

