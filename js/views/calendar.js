// Month calendar of daily accrued cost. Used for the job calendar and each equipment calendar.

import { money, compactMoney, today, toISO, parseDate } from '../util.js';
import { icon } from '../ui.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// state: { month: 'YYYY-MM' } (mutated on navigation). schedule: Map(date -> { cost, profit, items? }).
export function renderCalendar(el, schedule, state, { onDayClick, showItems = false, title = '' } = {}) {
  const t = today();
  if (!state.month) state.month = t.slice(0, 7);
  const [y, m] = state.month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const gridStart = new Date(first.getTime() - first.getUTCDay() * 86400000);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Math.ceil((first.getUTCDay() + daysInMonth) / 7) * 7;

  let monthCost = 0, monthProfit = 0, monthToDate = 0, max = 0;
  for (const [d, e] of schedule) {
    if (d.slice(0, 7) === state.month) {
      monthCost += e.cost; monthProfit += e.profit;
      if (d <= t) monthToDate += e.cost;
      max = Math.max(max, e.cost);
    }
  }
  const dates = [...schedule.keys()].sort();
  const range = dates.length ? [dates[0].slice(0, 7), dates[dates.length - 1].slice(0, 7)] : null;

  let grid = '';
  for (let i = 0; i < cells; i++) {
    const d = toISO(new Date(gridStart.getTime() + i * 86400000));
    const e = schedule.get(d);
    const out = d.slice(0, 7) !== state.month;
    const cls = ['cal-day', out && 'out', d === t && 'today', d > t && 'future', e && e.cost && 'has'].filter(Boolean).join(' ');
    grid += `<div class="${cls}" data-date="${d}" ${e ? `title="${money(e.cost)} cost · ${money(e.profit)} profit${d > t ? ' (forecast)' : ''}"` : ''}>
      <span class="d">${parseDate(d).getUTCDate()}</span>
      ${e && e.cost ? `<span class="cal-cost">${compactMoney(e.cost)}</span><span class="cal-profit">+${compactMoney(e.profit)}</span>${showItems && e.items ? `<span class="cal-items">${e.items} item${e.items > 1 ? 's' : ''}</span>` : ''}` : ''}
      ${e && e.cost && !out && max ? `<span class="cal-heat" style="opacity:${(0.15 + 0.85 * e.cost / max).toFixed(2)}"></span>` : ''}
    </div>`;
  }

  el.innerHTML = `
    <div class="card">
      <div class="card-head">
        <div class="cal-head">
          <button class="icon-btn" data-nav="-1" aria-label="Previous month">${icon('chevL', 18)}</button>
          <h3>${MONTHS[m - 1]} ${y}</h3>
          <button class="icon-btn" data-nav="1" aria-label="Next month">${icon('chevR', 18)}</button>
          <button class="btn btn-sm" data-nav="today">Today</button>
          ${range ? `<button class="btn btn-sm btn-ghost" data-nav="start">First rental</button><button class="btn btn-sm btn-ghost" data-nav="end">Last forecast</button>` : ''}
          ${title ? `<span class="muted" style="margin-left:8px">${title}</span>` : ''}
        </div>
        <div class="cal-totals">
          <div>Month cost<strong>${money(monthCost)}</strong></div>
          <div>Incurred to date<strong>${money(monthToDate)}</strong></div>
          <div>Month profit<strong class="profit">${money(monthProfit)}</strong></div>
        </div>
      </div>
      <div class="cal-grid">
        ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
        ${grid}
      </div>
      <div class="cal-legend">
        <span><i></i>Bar intensity shows relative daily cost</span>
        <span>Future days are forecast and shown in italics</span>
        <span>Mobilization and one-time costs post on the on-rent date; demobilization on the off-rent date</span>
      </div>
    </div>`;

  el.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.nav;
    if (v === 'today') state.month = t.slice(0, 7);
    else if (v === 'start') state.month = range[0];
    else if (v === 'end') state.month = range[1];
    else {
      const d = new Date(Date.UTC(y, m - 1 + Number(v), 1));
      state.month = toISO(d).slice(0, 7);
    }
    renderCalendar(el, schedule, state, { onDayClick, showItems, title });
  }));
  if (onDayClick) {
    el.querySelectorAll('.cal-day.has').forEach(c => c.addEventListener('click', () => onDayClick(c.dataset.date)));
  }
}
