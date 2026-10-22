import * as store from './store.js';
import { icon } from './ui.js';
import { esc } from './util.js';
import { renderJobs } from './views/jobs.js';
import { renderJob } from './views/job.js';
import { renderSettings } from './views/settings.js';

const app = document.getElementById('app');

function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'jobs').split('/');
  return { name: parts[0], params: parts.slice(1).map(decodeURIComponent) };
}

function renderNav(r) {
  const current = r.name === 'job' ? r.params[0] : null;
  const jobs = store.jobs();
  const jobLinks = jobs.map(j => {
    const n = store.requestsForJob(j.id).filter(q => q.status === 'pending').length;
    return `<a href="#/job/${j.id}" class="nav-job ${current === j.id ? 'active' : ''}" title="${esc(j.number)} · ${esc(j.name)}">
      <span class="nav-job-no">${esc(j.number)}</span><span class="nav-job-name">${esc(j.name)}</span>${n ? `<span class="badge badge-alert">${n}</span>` : ''}</a>`;
  }).join('');
  document.getElementById('sidenav').innerHTML = `
    <a href="#/jobs" class="nav-item ${r.name === 'jobs' || (!['job', 'settings'].includes(r.name)) ? 'active' : ''}">${icon('grid', 17)}<span>All jobs</span></a>
    <a href="#/settings" class="nav-item ${r.name === 'settings' ? 'active' : ''}">${icon('settings', 17)}<span>Data &amp; settings</span></a>
    ${jobs.length ? `<div class="nav-section">Jobs</div><div class="nav-jobs">${jobLinks}</div>` : ''}`;
}

export function render() {
  const r = route();
  renderNav(r);
  const scroll = window.scrollY;
  if (r.name === 'job' && store.job(r.params[0])) renderJob(app, r.params[0], r.params[1] || 'equipment');
  else if (r.name === 'settings') renderSettings(app);
  else renderJobs(app);
  window.scrollTo(0, scroll);
}

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
store.subscribe(render);
render();
