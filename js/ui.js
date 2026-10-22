// UI primitives: modal dialogs, side drawer, toasts, confirm.

import { esc } from './util.js';

const NAME_KEY = 'equipment-tracker.name';
// Field and procurement share one view until logins are added; roles will gate editing then.
export const canEdit = () => true;

export function getUserName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; }
}
export function setUserName(n) {
  try { localStorage.setItem(NAME_KEY, n); } catch (e) { /* ignore */ }
}

export const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  dollar: '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  chevD: '<path d="m6 9 6 6 6-6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  truck: '<path d="M10 17h4V5H2v12h3"/><path d="M14 8h4l4 4v5h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
};

export function icon(name, size = 16) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
}

// Modal: returns { el, close }. onMount receives the dialog body element.
export function openModal({ title, subtitle = '', body, footer = '', size = 'md', onMount }) {
  const root = document.getElementById('overlay-root');
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = `
    <div class="modal modal-${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <div><h2>${esc(title)}</h2>${subtitle ? `<p class="muted">${subtitle}</p>` : ''}</div>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 18)}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  root.appendChild(wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  wrap.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
  requestAnimationFrame(() => wrap.classList.add('open'));
  const api = { el: wrap.querySelector('.modal'), close };
  onMount?.(api.el, api);
  const first = wrap.querySelector('input:not([type=hidden]),select,textarea');
  first?.focus();
  return api;
}

// Side drawer for equipment detail.
export function openDrawer({ render, onClose }) {
  const root = document.getElementById('overlay-root');
  const wrap = document.createElement('div');
  wrap.className = 'overlay overlay-drawer';
  wrap.innerHTML = '<aside class="drawer" role="dialog" aria-modal="true"></aside>';
  root.appendChild(wrap);
  const panel = wrap.querySelector('.drawer');
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 180); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.overlay:not(.overlay-drawer)')) close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  requestAnimationFrame(() => wrap.classList.add('open'));
  const api = { panel, close, rerender: () => render(panel, api) };
  render(panel, api);
  return api;
}

export function toast(message, kind = 'success') {
  const root = document.getElementById('toast-root');
  const t = document.createElement('div');
  t.className = `toast toast-${kind}`;
  t.innerHTML = `${icon(kind === 'success' ? 'check' : 'x', 16)}<span>${esc(message)}</span>`;
  root.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, 3200);
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    let done = false;
    const m = openModal({
      title, size: 'sm',
      body: `<p>${message}</p>`,
      footer: `<button class="btn btn-ghost" data-close>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(confirmLabel)}</button>`,
      onMount: el => el.querySelector('[data-ok]').addEventListener('click', () => { done = true; m.close(); resolve(true); }),
    });
    const obs = new MutationObserver(() => { if (!m.el.isConnected) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.getElementById('overlay-root'), { childList: true });
  });
}

// Reads all [name] fields of a form into an object (checkboxes -> boolean).
export function readForm(form) {
  const out = {};
  form.querySelectorAll('[name]').forEach(f => {
    if (f.type === 'checkbox') out[f.name] = f.checked;
    else if (f.type === 'radio') { if (f.checked) out[f.name] = f.value; }
    else out[f.name] = f.value.trim();
  });
  return out;
}

export function validate(form) {
  let ok = true;
  form.querySelectorAll('[required]').forEach(f => {
    const bad = !String(f.value).trim();
    f.closest('.field')?.classList.toggle('invalid', bad);
    if (bad && ok) { f.focus(); ok = false; }
  });
  return ok;
}

export function statusPill(status) {
  const map = { on: ['On rent', 'pill-green'], off: ['Off rent', 'pill-gray'], forecast: ['Forecasted', 'pill-blue'] };
  const [label, cls] = map[status] || [status, 'pill-gray'];
  return `<span class="pill ${cls}"><i></i>${label}</span>`;
}
