// Requests inbox: every job's field requests in one place for procurement.
import * as store from '../store.js';
import { renderRequestsTab } from './requests.js';
import { openEquipment } from './equipment.js';

const state = { reqFilter: 'pending', reqType: 'all' };

export function renderInbox(app) {
  const pending = store.allRequests().filter(r => r.status === 'pending').length;
  app.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Requests</h1>
          <div class="sub"><span>${pending} waiting on procurement</span><span>All jobs</span></div>
        </div>
      </div>
      <p class="lead">Field requests to off rent, change a forecast date, or transfer equipment. Call the vendor, then click <strong>Complete request</strong> to apply the change to the equipment.</p>
      <section id="inbox-body"></section>
    </div>`;
  renderRequestsTab(app.querySelector('#inbox-body'), null, state, id => {
    const eq = store.equipment(id);
    if (eq) openEquipment(eq.jobId, id);
  });
}
