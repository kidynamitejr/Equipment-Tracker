import * as store from './store.js';
import { icon } from './ui.js';
import { renderJobs } from './views/jobs.js';
import { renderJob } from './views/job.js';
import { renderSettings } from './views/settings.js';

const app = document.getElementById('app');

function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'jobs').split('/');
  return { name: parts[0], params: parts.slice(1).map(decodeURIComponent) };
}

function renderNav(r) {
  const openReqs = store.jobs().reduce((n, j) => n + store.requestsForJob(j.id).filter(q => q.status === 'pending').length, 0);
  document.getElementById('topnav').innerHTML = `
    <a href="#/jobs" class="${r.name === 'jobs' || r.name === 'job' ? 'active' : ''}">Jobs</a>
    <a href="#/settings" class="${r.name === 'settings' ? 'active' : ''}">Data &amp; settings</a>
    ${openReqs ? `<a href="#/jobs" title="Open field requests across all jobs"><span class="badge badge-alert">${openReqs}</span> open requests</a>` : ''}`;
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

document.getElementById('settings-link').innerHTML = icon('settings', 18);
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
store.subscribe(render);
render();
