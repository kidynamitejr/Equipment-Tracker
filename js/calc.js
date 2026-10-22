// Cost engine. Every formula the tracker uses lives here so it can be adjusted in one place.
//
// Rental billing (per unit):
//   Days are counted from the on-rent date to the off-rent date (actual if off rent, otherwise forecast).
//   Full 28-day billing months are charged at the monthly rate. For the remaining days:
//     more than 3 weeks (22+ days)      -> one monthly rate
//     otherwise each full week          -> weekly rate
//     leftover days: more than 3 days   -> one more weekly rate; 1-3 days -> daily rate each
//   Missing rates are derived from the others (weekly = 5 x daily, monthly = 4 x weekly).
// Line cost:
//   base   = rental x qty + mobilization + demobilization + one-time costs
//   taxes  = base x (environmental % + diesel % + property % + tax rate %)
//   cost   = base + taxes
//   profit = base x (equipment markup % + fuel markup %)
//   billed = cost + profit
// Monthly cost: cost (and profit) accrued over the last 30 days, through today.
// Daily accrual (for ITD and the calendars): each 28-day billing cycle's cost is spread evenly over the
//   days in that cycle. Mobilization and one-time costs land on the on-rent date, demobilization on the
//   off-rent date.

import { addDays, diffDays, today, maxDate, minDate, num } from './util.js';

export const BILLING_MONTH_DAYS = 28;
export const BILLING_WEEK_DAYS = 7;
export const WEEK_THRESHOLD_DAYS = 3;   // more than 3 days bills a week
export const MONTH_THRESHOLD_DAYS = 21; // more than 3 weeks bills a month
export const MONTHLY_WINDOW_DAYS = 30;  // "monthly cost" = cost incurred over the past 30 days

export function effectiveRates(eq) {
  let d = num(eq.rateDaily), w = num(eq.rateWeekly), m = num(eq.rateMonthly);
  if (!w && d) w = d * 5;
  if (!m && w) m = w * 4;
  if (!w && m) w = m / 4;
  if (!d && w) d = w / 5;
  return { d, w, m };
}

export function rentalForDays(n, r) {
  if (n <= 0) return 0;
  const months = Math.floor(n / BILLING_MONTH_DAYS);
  const rem = n - months * BILLING_MONTH_DAYS;
  if (rem > MONTH_THRESHOLD_DAYS) return (months + 1) * r.m;
  let weeks = Math.floor(rem / BILLING_WEEK_DAYS);
  let days = rem - weeks * BILLING_WEEK_DAYS;
  if (days > WEEK_THRESHOLD_DAYS) { weeks += 1; days = 0; }
  return months * r.m + weeks * r.w + days * r.d;
}

export function taxPct(eq) {
  return (num(eq.envTax) + num(eq.dieselTax) + num(eq.propertyTax) + num(eq.taxRate)) / 100;
}

export function markupPct(eq) {
  return (num(eq.equipMarkup) + num(eq.fuelMarkup)) / 100;
}

export function fuelMarkupForJob(job, fuelType) {
  if (fuelType === 'high') return num(job.markupHighFuel);
  if (fuelType === 'standard') return num(job.markupStdFuel);
  return num(job.markupNoFuel);
}

// Off-rent date used for costing: actual when off rent, otherwise the forecast; today if neither is set.
export function endDate(eq) {
  const end = (eq.status === 'off' ? (eq.offRentDate || eq.forecastOffDate) : eq.forecastOffDate) || today();
  return maxDate(end, eq.onRentDate);
}

export function rentalDays(eq) {
  if (!eq.onRentDate) return 0;
  return Math.max(1, diffDays(eq.onRentDate, endDate(eq)));
}

// Map of ISO date -> { base, tax, cost, profit } for every day the line accrues cost.
export function dailySchedule(eq) {
  const out = new Map();
  if (!eq.onRentDate) return out;
  const r = effectiveRates(eq);
  const qty = num(eq.qty) || 1;
  const n = rentalDays(eq);
  const tp = taxPct(eq), mp = markupPct(eq);
  const add = (date, base) => {
    const e = out.get(date) || { base: 0, tax: 0, cost: 0, profit: 0 };
    e.base += base;
    e.tax += base * tp;
    e.cost += base * (1 + tp);
    e.profit += base * mp;
    out.set(date, e);
  };
  for (let start = 0; start < n; start += BILLING_MONTH_DAYS) {
    const len = Math.min(BILLING_MONTH_DAYS, n - start);
    const perDay = (rentalForDays(start + len, r) - rentalForDays(start, r)) / len * qty;
    for (let k = 0; k < len; k++) add(addDays(eq.onRentDate, start + k), perDay);
  }
  const once = num(eq.mobCost) + num(eq.oneTimeCost);
  if (once) add(eq.onRentDate, once);
  if (num(eq.demobCost)) add(endDate(eq), num(eq.demobCost));
  return out;
}

function sumSchedule(schedule, through, from) {
  const t = { base: 0, tax: 0, cost: 0, profit: 0 };
  for (const [date, e] of schedule) {
    if (through && date > through) continue;
    if (from && date < from) continue;
    t.base += e.base; t.tax += e.tax; t.cost += e.cost; t.profit += e.profit;
  }
  return t;
}

export function equipmentMetrics(eq, asOf = today()) {
  const schedule = dailySchedule(eq);
  const eac = sumSchedule(schedule);
  const itd = sumSchedule(schedule, asOf);
  const last30 = sumSchedule(schedule, asOf, addDays(asOf, -(MONTHLY_WINDOW_DAYS - 1)));
  const end = endDate(eq);
  const eacDays = rentalDays(eq);
  const itdDays = eq.onRentDate && eq.onRentDate <= asOf
    ? Math.min(eacDays, Math.max(1, diffDays(eq.onRentDate, asOf) + 1)) : 0;
  return {
    end,
    eacDays,
    itdDays,
    eacCost: eac.cost,
    eacProfit: eac.profit,
    itdCost: itd.cost,
    itdProfit: itd.profit,
    monthlyCost: last30.cost,
    monthlyProfit: last30.profit,
    rates: effectiveRates(eq),
  };
}

export function jobMetrics(equipment, asOf = today()) {
  const m = {
    start: null, end: null, eacDays: 0, itdDays: 0, itdEnd: null,
    eacCost: 0, eacProfit: 0, itdCost: 0, itdProfit: 0,
    monthlyCost: 0, monthlyProfit: 0, onRent: 0, offSoon: 0, lines: equipment.length,
  };
  const soon = addDays(asOf, 7);
  for (const eq of equipment) {
    const em = equipmentMetrics(eq, asOf);
    m.eacCost += em.eacCost; m.eacProfit += em.eacProfit;
    m.itdCost += em.itdCost; m.itdProfit += em.itdProfit;
    m.monthlyCost += em.monthlyCost; m.monthlyProfit += em.monthlyProfit;
    if (eq.onRentDate) {
      m.start = minDate(m.start, eq.onRentDate);
      m.end = maxDate(m.end, em.end);
    }
    if (eq.status === 'on') {
      m.onRent += num(eq.qty) || 1;
      if (em.end >= asOf && em.end <= soon) m.offSoon += num(eq.qty) || 1;
    }
  }
  if (m.start) {
    m.eacDays = Math.max(1, diffDays(m.start, m.end));
    if (m.start <= asOf) {
      m.itdEnd = minDate(asOf, m.end);
      m.itdDays = Math.max(1, diffDays(m.start, m.itdEnd) + (m.itdEnd === asOf ? 1 : 0));
    }
  }
  return m;
}

// Combined daily schedule for a set of equipment.
export function combinedSchedule(equipment) {
  const out = new Map();
  for (const eq of equipment) {
    for (const [date, e] of dailySchedule(eq)) {
      const t = out.get(date) || { base: 0, tax: 0, cost: 0, profit: 0, items: 0 };
      t.base += e.base; t.tax += e.tax; t.cost += e.cost; t.profit += e.profit; t.items += 1;
      out.set(date, t);
    }
  }
  return out;
}
