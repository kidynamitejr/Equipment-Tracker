import * as store from '../store.js';
import { openModal, readForm, validate, toast, confirmDialog, icon } from '../ui.js';
import { esc } from '../util.js';

const field = (name, label, v, { type = 'text', req = false, span = '', pre = '', post = '', hint = '', step = 'any' } = {}) => `
  <div class="field ${span}">
    <label for="f-${name}">${label}${req ? ' <span class="reqd">*</span>' : ''}</label>
    ${pre || post ? '<div class="affix">' : ''}
    ${pre ? `<span class="pre">${pre}</span>` : ''}
    <input id="f-${name}" name="${name}" type="${type}" value="${esc(v ?? '')}" ${req ? 'required' : ''} ${type === 'number' ? `step="${step}" min="0"` : ''}>
    ${post ? `<span class="post">${post}</span>` : ''}
    ${pre || post ? '</div>' : ''}
    ${hint ? `<div class="hint">${hint}</div>` : ''}
  </div>`;

export function openJobForm(existing) {
  const j = existing || { contractType: 'Cost Plus', markupNoFuel: 0 };
  const contractTypes = ['Cost Plus', 'Lump Sum', 'T&M', 'Unit Price', 'GMP', 'Other'];
  const body = `
    <form id="job-form" novalidate data-track>
      <div class="form-section">
        <h4>Job identification</h4>
        <div class="grid g3">
          ${field('number', 'Job number', j.number, { req: true })}
          ${field('jdeId', 'JDE ID', j.jdeId)}
          ${field('companyId', 'Company ID', j.companyId)}
          ${field('name', 'Job name', j.name, { req: true, span: 'span2' })}
          <div class="field">
            <label for="f-contractType">Contract type</label>
            <select id="f-contractType" name="contractType">
              ${contractTypes.map(c => `<option ${c === j.contractType ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div class="form-section">
        <h4>Client</h4>
        <div class="grid g3">
          ${field('clientId', 'Client ID', j.clientId)}
          ${field('clientName', 'Client name', j.clientName, { req: true, span: 'span2' })}
          ${field('address', 'Job address', j.address, { span: 'span-all' })}
        </div>
      </div>
      <div class="form-section">
        <h4>Team &amp; contacts</h4>
        <div class="grid g2">
          ${field('pm', 'Project manager', j.pm)}
          ${field('pa', 'Project accountant', j.pa)}
          ${field('equipContact', 'Equipment contact', j.equipContact, { hint: 'Shown as the pickup contact on off-rent requests.' })}
          ${field('procurementEmail', 'Procurement contact email', j.procurementEmail, { type: 'email' })}
          ${field('projectEmail', 'Project contact email', j.projectEmail, { type: 'email' })}
        </div>
      </div>
      <div class="form-section">
        <h4>Markups &amp; tax</h4>
        <div class="grid g3">
          ${field('markupEquipment', 'Equipment markup', j.markupEquipment, { type: 'number', post: '%' })}
          ${field('markupNoFuel', 'No fuel markup', j.markupNoFuel, { type: 'number', post: '%' })}
          ${field('markupStdFuel', 'Standard fuel markup', j.markupStdFuel, { type: 'number', post: '%' })}
          ${field('markupHighFuel', 'High fuel markup', j.markupHighFuel, { type: 'number', post: '%' })}
          ${field('salesTax', 'Sales tax', j.salesTax, { type: 'number', post: '%' })}
        </div>
        <p class="hint muted" style="font-size:12px;margin-top:8px">These are the defaults for new equipment on this job. Each piece of equipment can override them.</p>
      </div>
      <div class="form-section" style="margin-bottom:0">
        <h4>Description</h4>
        <div class="field"><textarea name="description" aria-label="Job description">${esc(j.description || '')}</textarea></div>
      </div>
    </form>`;
  const footer = `
    ${existing ? `<button class="btn btn-ghost btn-danger-text left" data-delete>${icon('trash', 15)} Delete job</button>` : ''}
    <button class="btn btn-ghost" data-close>Cancel</button>
    <button class="btn btn-primary" data-save>${existing ? 'Save changes' : 'Create job'}</button>`;
  openModal({
    title: existing ? `Edit job ${existing.number}` : 'New job',
    subtitle: existing ? esc(existing.name) : 'Set up a job to start tracking rented equipment against it.',
    body, footer, size: 'lg',
    onMount: (el, m) => {
      const form = el.querySelector('#job-form');
      el.querySelector('[data-save]').addEventListener('click', () => {
        if (!validate(form)) return;
        const data = readForm(form);
        const dupe = store.jobs().find(x => x.number === data.number && x.id !== existing?.id);
        if (dupe) { toast(`Job number ${data.number} already exists`, 'error'); return; }
        const id = store.saveJob(existing ? { ...existing, ...data } : data);
        m.close();
        toast(existing ? 'Job updated' : `Job ${data.number} created`);
        if (!existing) location.hash = `#/job/${id}`;
      });
      el.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const n = store.equipmentForJob(existing.id).length;
        const ok = await confirmDialog({
          title: 'Delete job?', danger: true, confirmLabel: 'Delete job',
          message: `This permanently removes job <strong>${esc(existing.number)}</strong> and its ${n} equipment records and requests.`,
        });
        if (!ok) return;
        m.close();
        store.deleteJob(existing.id);
        location.hash = '#/jobs';
        toast('Job deleted');
      });
    },
  });
}
