import * as store from '../store.js';
import { icon, toast, confirmDialog } from '../ui.js';
import { today } from '../util.js';

export function renderSettings(app) {
  app.innerHTML = `
    <div class="page" style="max-width:960px">
      <div class="page-head"><div><h1>Data &amp; settings</h1><div class="sub"><span>Backups, demo data, and how costs are calculated</span></div></div></div>

      <div class="card">
        <div class="card-head"><h3>Backup &amp; restore</h3></div>
        <div class="card-body">
          <p class="muted" style="margin-top:0">FleetLedger currently saves data in this browser. Download a backup regularly, and restore it to move data to another computer or browser.</p>
          <div class="actions">
            <button class="btn btn-primary" data-backup>${icon('download', 15)} Download backup</button>
            <label class="btn">${icon('file', 15)} Restore from backup<input type="file" accept="application/json,.json" data-restore hidden></label>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>Demo data</h3></div>
        <div class="card-body">
          <p class="muted" style="margin-top:0">Reload the two sample jobs to explore the system, or clear everything to start using it for real.</p>
          <div class="actions">
            <button class="btn" data-demo>Load demo data</button>
            <button class="btn btn-ghost btn-danger-text" data-clear>${icon('trash', 15)} Clear all data</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:16px">
        <div class="card-head"><h3>How costs are calculated</h3></div>
        <div class="card-body" style="color:var(--text-2)">
          <h4 style="color:var(--text);font-size:13.5px;margin-bottom:6px">Rental billing</h4>
          <ul style="margin:0 0 14px;padding-left:18px">
            <li>Rental days run from the on rent date to the off rent date (actual when off rent, otherwise the forecast).</li>
            <li>Each full 28-day billing month is charged at the monthly rate.</li>
            <li>For the remaining days, more than 3 weeks is charged one monthly rate. Otherwise each full week is charged the weekly rate.</li>
            <li>Leftover days: more than 3 days is charged one weekly rate; 1 to 3 days are charged the daily rate each.</li>
            <li>Rates are per unit. Each unit on a line bills its own days, so units taken off rent early stop billing while the rest continue.</li>
          </ul>
          <h4 style="color:var(--text);font-size:13.5px;margin-bottom:6px">Cost and profit</h4>
          <ul style="margin:0 0 14px;padding-left:18px">
            <li><strong>Base</strong> = rental + mobilization + demobilization + one-time costs.</li>
            <li><strong>Taxes</strong> = base × (environmental % + diesel % + property % + tax rate %).</li>
            <li><strong>Cost</strong> = base + taxes. <strong>Profit</strong> = base × (equipment markup % + fuel markup %).</li>
          </ul>
          <h4 style="color:var(--text);font-size:13.5px;margin-bottom:6px">Reporting</h4>
          <ul style="margin:0;padding-left:18px">
            <li><strong>EAC</strong> is the full cost through the off rent date. <strong>ITD</strong> is the cost accrued through today.</li>
            <li><strong>Monthly cost</strong> is the cost accrued over the past 30 days.</li>
            <li>For ITD and the calendars, each billing month's cost is spread evenly across its days. Mobilization and one-time costs post on the on rent date; demobilization posts on the off rent date.</li>
            <li>COE is costed the same way and appears only on the COE tab. Job totals include COE.</li>
          </ul>
        </div>
      </div>
    </div>`;

  app.querySelector('[data-backup]').addEventListener('click', () => {
    const blob = new Blob([store.exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fleetledger-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  app.querySelector('[data-restore]').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const ok = await confirmDialog({ title: 'Restore backup?', message: 'This replaces all data in this browser with the backup file.', confirmLabel: 'Restore', danger: true });
    if (!ok) return;
    try { store.importBackup(await file.text()); toast('Backup restored'); } catch (err) { toast(err.message || 'Could not read backup', 'error'); }
  });
  app.querySelector('[data-demo]').addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Load demo data?', message: 'This replaces all data in this browser with the sample jobs.', confirmLabel: 'Load demo data', danger: true })) {
      store.resetDemo(); toast('Demo data loaded');
    }
  });
  app.querySelector('[data-clear]').addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Clear all data?', message: 'This permanently deletes every job, equipment record, and request in this browser. Download a backup first if you need it.', confirmLabel: 'Clear all data', danger: true })) {
      store.clearAll(); toast('All data cleared');
    }
  });
}
