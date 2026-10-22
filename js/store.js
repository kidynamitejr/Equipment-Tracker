// Data layer. Everything is kept in one in-memory database that is persisted to localStorage.
// To move to a shared backend (e.g. Supabase), replace load/persist and keep this module's API.

import { uid, today, addDays } from './util.js';

const KEY = 'equipment-tracker.v1';
const listeners = new Set();
let db = load();

function blank() {
  return { jobs: [], equipment: [], requests: [], activity: [] };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw) };
  } catch (e) { /* storage unavailable */ }
  return seed();
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* storage unavailable */ }
  listeners.forEach(fn => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function log(jobId, text) {
  db.activity.unshift({ id: uid('act'), jobId, text, at: new Date().toISOString() });
  db.activity = db.activity.slice(0, 500);
}

// Jobs
export const jobs = () => db.jobs.slice().sort((a, b) => String(a.number).localeCompare(String(b.number)));
export const job = id => db.jobs.find(j => j.id === id);

export function saveJob(data) {
  const now = new Date().toISOString();
  if (data.id) {
    Object.assign(job(data.id), data, { updatedAt: now });
    log(data.id, 'Job details updated');
  } else {
    data = { ...data, id: uid('job'), createdAt: now, updatedAt: now };
    db.jobs.push(data);
    log(data.id, 'Job created');
  }
  persist();
  return data.id;
}

export function deleteJob(id) {
  db.jobs = db.jobs.filter(j => j.id !== id);
  db.equipment = db.equipment.filter(e => e.jobId !== id);
  db.requests = db.requests.filter(r => r.jobId !== id);
  persist();
}

// Equipment
export const equipmentForJob = jobId => db.equipment.filter(e => e.jobId === jobId);
export const equipment = id => db.equipment.find(e => e.id === id);

export function saveEquipment(data) {
  const now = new Date().toISOString();
  if (data.id) {
    Object.assign(equipment(data.id), data, { updatedAt: now });
    log(data.jobId, `Equipment ${data.equipNo || data.description} updated`);
  } else {
    data = { ...data, id: uid('eq'), createdAt: now, updatedAt: now };
    db.equipment.push(data);
    log(data.jobId, `Equipment ${data.equipNo || data.description} added`);
  }
  persist();
  return data.id;
}

export function deleteEquipment(id) {
  const eq = equipment(id);
  db.equipment = db.equipment.filter(e => e.id !== id);
  db.requests = db.requests.filter(r => r.equipmentId !== id);
  if (eq) log(eq.jobId, `Equipment ${eq.equipNo || eq.description} deleted`);
  persist();
}

// Requests
export const requestsForJob = jobId => db.requests.filter(r => r.jobId === jobId)
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const request = id => db.requests.find(r => r.id === id);
export const openRequestFor = equipmentId => db.requests.find(r => r.equipmentId === equipmentId && r.status === 'pending');

export function createRequest(data) {
  const r = { ...data, id: uid('req'), status: 'pending', createdAt: new Date().toISOString() };
  db.requests.push(r);
  const eq = equipment(r.equipmentId);
  log(r.jobId, `${REQUEST_LABELS[r.type]} requested for ${eq?.equipNo || eq?.description || 'equipment'} by ${r.requestedBy}`);
  persist();
  return r.id;
}

export const REQUEST_LABELS = { offrent: 'Off rent', forecast: 'Forecast date change', transfer: 'Transfer' };

// Applies a request's change to the equipment and closes it.
export function completeRequest(id, { completedBy, effectiveDate, poAmount, po, note }) {
  const r = request(id);
  const eq = equipment(r.equipmentId);
  const now = new Date().toISOString();
  if (eq) {
    if (r.type === 'offrent') {
      Object.assign(eq, { status: 'off', offRentDate: effectiveDate, forecastOffDate: effectiveDate, updatedAt: now });
    } else if (r.type === 'forecast') {
      Object.assign(eq, { forecastOffDate: effectiveDate, updatedAt: now });
      if (poAmount !== '' && poAmount != null) eq.poAmount = poAmount;
      if (po) eq.po = po;
    } else if (r.type === 'transfer') {
      // The unit moves rather than returning to the vendor: demobilization follows it to the new job.
      const demob = eq.demobCost;
      Object.assign(eq, { status: 'off', offRentDate: effectiveDate, forecastOffDate: effectiveDate, demobCost: 0, updatedAt: now });
      const target = job(r.targetJobId);
      const copy = {
        ...eq,
        id: uid('eq'),
        jobId: r.targetJobId,
        status: 'on',
        onRentDate: effectiveDate,
        offRentDate: '',
        forecastOffDate: r.targetForecastDate || '',
        mobCost: 0, oneTimeCost: 0, demobCost: demob,
        po: po || eq.po,
        poAmount: poAmount !== '' && poAmount != null ? poAmount : eq.poAmount,
        transferredFrom: eq.jobId,
        createdAt: now, updatedAt: now,
        notes: `Transferred from job ${job(eq.jobId)?.number || ''} on ${effectiveDate}.` + (eq.notes ? '\n' + eq.notes : ''),
      };
      if (target) {
        copy.equipMarkup = target.markupEquipment;
        copy.taxRate = target.salesTax;
      }
      db.equipment.push(copy);
      log(r.targetJobId, `Equipment ${eq.equipNo || eq.description} transferred in from job ${job(eq.jobId)?.number || ''}`);
    }
  }
  Object.assign(r, { status: 'completed', completedAt: now, completedBy, effectiveDate, completionNote: note || '' });
  log(r.jobId, `${REQUEST_LABELS[r.type]} request for ${eq?.equipNo || eq?.description || 'equipment'} completed`);
  persist();
}

export function cancelRequest(id, by) {
  const r = request(id);
  Object.assign(r, { status: 'cancelled', completedAt: new Date().toISOString(), completedBy: by });
  log(r.jobId, `${REQUEST_LABELS[r.type]} request cancelled`);
  persist();
}

export const activityForJob = jobId => db.activity.filter(a => a.jobId === jobId);

// Settings / maintenance
export function exportBackup() {
  return JSON.stringify(db, null, 2);
}

export function importBackup(json) {
  const data = JSON.parse(json);
  if (!Array.isArray(data.jobs) || !Array.isArray(data.equipment)) throw new Error('Not a tracker backup file');
  db = { ...blank(), ...data };
  persist();
}

export function resetDemo() {
  db = seed();
  persist();
}

export function clearAll() {
  db = blank();
  persist();
}

function seed() {
  const t = today();
  const d = n => addDays(t, n);
  const j1 = {
    id: uid('job'), number: '24-1187', name: 'Gulf Coast Ethylene Cracker Expansion', jdeId: 'JDE-40871', companyId: '100',
    clientId: 'C-2291', clientName: 'Meridian Petrochemical', contractType: 'Cost Plus', pm: 'Daniel Reyes',
    pa: 'Priya Natarajan', equipContact: 'Marcus Hale (281) 555-0142', address: '4100 Refinery Rd, Baytown, TX 77520',
    markupEquipment: 12, markupNoFuel: 0, markupStdFuel: 4, markupHighFuel: 7, salesTax: 8.25,
    procurementEmail: 'procurement@example.com', projectEmail: 'gc-ethylene@example.com',
    description: 'Mechanical, piping and structural steel installation for the furnace and quench sections.',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const j2 = {
    id: uid('job'), number: '25-0214', name: 'Lake Charles LNG Train 3 Turnaround', jdeId: 'JDE-41502', companyId: '100',
    clientId: 'C-1840', clientName: 'Calcasieu LNG Partners', contractType: 'T&M', pm: 'Rachel Okafor',
    pa: 'Tom Brennan', equipContact: 'Luis Ortega (337) 555-0187', address: '2200 Industrial Pkwy, Lake Charles, LA 70601',
    markupEquipment: 10, markupNoFuel: 0, markupStdFuel: 5, markupHighFuel: 8, salesTax: 9.75,
    procurementEmail: 'procurement@example.com', projectEmail: 'lng-t3@example.com',
    description: 'Planned turnaround: exchanger bundle pulls, valve replacement and scaffolding support.',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const base = (job, o) => ({
    id: uid('eq'), jobId: job.id, qty: 1, status: 'on', fuelType: 'standard', coe: false,
    equipMarkup: job.markupEquipment, fuelMarkup: fuelFor(job, o.fuelType || 'standard'), taxRate: job.salesTax,
    envTax: 0, dieselTax: 0, propertyTax: 0, mobCost: 0, demobCost: 0, oneTimeCost: 0,
    offRentDate: '', notes: '', poAmount: '', serial: '', model: '', manufacturer: '',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...o,
  });
  const fuelFor = (job, f) => f === 'high' ? job.markupHighFuel : f === 'standard' ? job.markupStdFuel : job.markupNoFuel;
  const equipment = [
    base(j1, { po: 'PO-118870', description: '60T Rough Terrain Crane', equipNo: 'RT-6012', vendor: 'Sunbelt Rentals', rateDaily: 2150, rateWeekly: 6400, rateMonthly: 17800, onRentDate: d(-74), forecastOffDate: d(40), mobCost: 3800, demobCost: 3800, costCode: '01-510-200', fuelType: 'high', fuelMarkup: 7, envTax: 1.5, manufacturer: 'Grove', model: 'RT9130E-2', serial: 'GRV9130-22871', poAmount: 92000 }),
    base(j1, { po: 'PO-118871', description: '125 ft Telescopic Boom Lift', equipNo: 'BL-1254', vendor: 'United Rentals', rateDaily: 980, rateWeekly: 2700, rateMonthly: 6900, onRentDate: d(-60), forecastOffDate: d(5), mobCost: 650, demobCost: 650, costCode: '01-510-210', fuelType: 'standard', manufacturer: 'JLG', model: '1250AJP', serial: 'JLG-0300219554', poAmount: 21000 }),
    base(j1, { po: 'PO-118902', description: '19 ft Scissor Lift (Electric)', equipNo: 'SL-1903', vendor: 'United Rentals', qty: 6, rateDaily: 145, rateWeekly: 320, rateMonthly: 640, onRentDate: d(-45), forecastOffDate: d(60), mobCost: 900, costCode: '01-510-210', fuelType: 'none', fuelMarkup: 0, manufacturer: 'Genie', model: 'GS-1930', poAmount: 26000 }),
    base(j1, { po: 'PO-118950', description: '400A Welding Machine (Diesel)', equipNo: 'WM-4007', vendor: 'Airgas', qty: 4, rateDaily: 110, rateWeekly: 300, rateMonthly: 780, onRentDate: d(-38), forecastOffDate: d(3), costCode: '01-520-110', fuelType: 'high', fuelMarkup: 7, dieselTax: 0.5, manufacturer: 'Lincoln Electric', model: 'Vantage 400', poAmount: 9800 }),
    base(j1, { po: 'PO-119012', description: '10K Telehandler', equipNo: 'TH-1009', vendor: 'Herc Rentals', rateDaily: 620, rateWeekly: 1650, rateMonthly: 4100, onRentDate: d(-90), forecastOffDate: d(-12), offRentDate: d(-12), status: 'off', mobCost: 450, demobCost: 450, costCode: '01-510-220', manufacturer: 'SkyTrak', model: '10054', serial: 'ST10054-7712', poAmount: 13500 }),
    base(j1, { po: 'PO-119100', description: '185 CFM Air Compressor', equipNo: 'AC-1855', vendor: 'Sunbelt Rentals', rateDaily: 140, rateWeekly: 390, rateMonthly: 950, onRentDate: d(10), forecastOffDate: d(70), status: 'forecast', mobCost: 250, demobCost: 250, costCode: '01-520-140', manufacturer: 'Doosan', model: 'P185', poAmount: 2800 }),
    base(j1, { po: 'COE-0041', description: 'Company Pickup Truck F-250', equipNo: 'CO-2504', vendor: 'Company Fleet', rateDaily: 95, rateWeekly: 380, rateMonthly: 1250, onRentDate: d(-74), forecastOffDate: d(40), costCode: '01-530-100', coe: true, manufacturer: 'Ford', model: 'F-250 XL', poAmount: '' }),
    base(j1, { po: 'COE-0042', description: 'Company Light Tower', equipNo: 'CO-LT18', vendor: 'Company Fleet', qty: 3, rateDaily: 60, rateWeekly: 180, rateMonthly: 520, onRentDate: d(-50), forecastOffDate: d(30), costCode: '01-530-120', coe: true, fuelType: 'standard', manufacturer: 'Wacker Neuson', model: 'LTV6', poAmount: '' }),
    base(j2, { po: 'PO-120411', description: '90T All Terrain Crane', equipNo: 'AT-9001', vendor: 'Maxim Crane Works', rateDaily: 3600, rateWeekly: 10800, rateMonthly: 29500, onRentDate: d(-20), forecastOffDate: d(15), mobCost: 6500, demobCost: 6500, costCode: '02-510-200', fuelType: 'high', fuelMarkup: 8, manufacturer: 'Liebherr', model: 'LTM 1090-4.2', poAmount: 61000 }),
    base(j2, { po: 'PO-120420', description: 'Bundle Extractor', equipNo: 'BX-3002', vendor: 'Mammoet', rateDaily: 4200, rateWeekly: 12500, rateMonthly: 0, onRentDate: d(-10), forecastOffDate: d(6), mobCost: 9000, demobCost: 9000, oneTimeCost: 1500, costCode: '02-520-300', fuelType: 'none', fuelMarkup: 0, poAmount: 48000 }),
    base(j2, { po: 'PO-120433', description: '80 ft Articulating Boom Lift', equipNo: 'BL-8006', vendor: 'United Rentals', qty: 2, rateDaily: 720, rateWeekly: 1900, rateMonthly: 4800, onRentDate: d(-14), forecastOffDate: d(21), mobCost: 500, demobCost: 500, costCode: '02-510-210', manufacturer: 'Genie', model: 'Z-80/60', poAmount: 17000 }),
  ];
  const requests = [
    { id: uid('req'), jobId: j1.id, equipmentId: equipment[1].id, type: 'offrent', requestedBy: 'Marcus Hale', requestedDate: d(2), reason: 'Steel erection at the quench tower is complete.', status: 'pending', createdAt: new Date(Date.now() - 3600e3 * 5).toISOString() },
    { id: uid('req'), jobId: j1.id, equipmentId: equipment[0].id, type: 'forecast', requestedBy: 'Marcus Hale', requestedDate: d(55), reason: 'Furnace module set delayed by two weeks.', status: 'pending', createdAt: new Date(Date.now() - 3600e3 * 26).toISOString() },
  ];
  return { jobs: [j1, j2], equipment, requests, activity: [] };
}
