// Data layer. Everything is kept in one in-memory database that is persisted to localStorage.
// To move to a shared backend (e.g. Supabase), replace load/persist and keep this module's API.

import { uid, today, addDays } from './util.js';

const KEY = 'equipment-tracker.v1';
// Bump when the sample data changes. Browsers still holding an untouched older sample set get the new one.
const DEMO_VERSION = 3;
const OLD_DEMO_JOBS = ['24-1187', '25-0214'];
// Sample job numbers moved to the 1000XXX format. Saved data still using the old numbers is renamed on load.
const RENAMED_JOBS = { '24-1187': '1000482', '25-0214': '1000639', '25-0388': '1000715', '25-0412': '1000758', '26-0031': '1000893', '24-1302': '1000517' };
const listeners = new Set();
let db = load();

function blank() {
  return { jobs: [], equipment: [], requests: [], activity: [] };
}

function load() {
  let data = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = { ...blank(), ...JSON.parse(raw) };
  } catch (e) { /* storage unavailable */ }
  const untouchedOldDemo = data && !data.demoVersion && !data.activity.length && data.jobs.length
    && data.jobs.every(j => OLD_DEMO_JOBS.includes(j.number));
  if (!data || untouchedOldDemo || (data.demoVersion && data.demoVersion < DEMO_VERSION && !data.activity.length)) {
    data = seed();
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  } else if (renameOldJobNumbers(data)) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  }
  return data;
}

function renameOldJobNumbers(data) {
  const old = Object.keys(RENAMED_JOBS);
  if (!data.jobs.some(j => old.includes(j.number))) return false;
  const swap = t => typeof t === 'string' ? t.replace(/\b(24-1187|25-0214|25-0388|25-0412|26-0031|24-1302)\b/g, n => RENAMED_JOBS[n]) : t;
  data.jobs.forEach(j => { if (RENAMED_JOBS[j.number]) j.number = RENAMED_JOBS[j.number]; });
  data.equipment.forEach(e => { e.notes = swap(e.notes); });
  data.requests.forEach(r => { r.notes = swap(r.notes); r.completionNotes = swap(r.completionNotes); });
  data.activity.forEach(a => { a.text = swap(a.text); });
  return true;
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
export const allRequests = () => db.requests.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  db = { ...blank(), demoVersion: DEMO_VERSION };
  persist();
}

function seed() {
  const t = today();
  const d = n => addDays(t, n);
  const j1 = {
    id: uid('job'), number: '1000482', name: 'Gulf Coast Ethylene Cracker Expansion', jdeId: 'JDE-40871', companyId: '100',
    clientId: 'C-2291', clientName: 'Meridian Petrochemical', contractType: 'Cost Plus', pm: 'Daniel Reyes',
    pa: 'Priya Natarajan', equipContact: 'Marcus Hale (281) 555-0142', address: '4100 Refinery Rd, Baytown, TX 77520',
    markupEquipment: 12, markupNoFuel: 0, markupStdFuel: 4, markupHighFuel: 7, salesTax: 8.25,
    procurementEmail: 'procurement@example.com', projectEmail: 'gc-ethylene@example.com',
    description: 'Mechanical, piping and structural steel installation for the furnace and quench sections.',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const j2 = {
    id: uid('job'), number: '1000639', name: 'Lake Charles LNG Train 3 Turnaround', jdeId: 'JDE-41502', companyId: '100',
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
  const j3 = {
    id: uid('job'), number: '1000715', name: 'Port Arthur Hydrocracker Revamp', jdeId: 'JDE-41966', companyId: '100',
    clientId: 'C-3307', clientName: 'Sabine Gulf Refining', contractType: 'Lump Sum', pm: 'Kevin Marsh',
    pa: 'Alicia Gómez', equipContact: 'Darnell Price (409) 555-0119', address: '1801 Savannah Ave, Port Arthur, TX 77640',
    markupEquipment: 15, markupNoFuel: 0, markupStdFuel: 5, markupHighFuel: 9, salesTax: 8.25,
    procurementEmail: 'procurement@example.com', projectEmail: 'pa-hydrocracker@example.com',
    description: 'Reactor internals replacement, new charge heater, and piping modifications during a 45-day outage.',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const j4 = {
    id: uid('job'), number: '1000758', name: 'Corpus Christi Polyethylene Tie-ins', jdeId: 'JDE-42013', companyId: '110',
    clientId: 'C-2875', clientName: 'Nueces Polymers LLC', contractType: 'Cost Plus', pm: 'Samantha Lee',
    pa: 'Jordan Whitfield', equipContact: 'Ray Delgado (361) 555-0164', address: '7200 Up River Rd, Corpus Christi, TX 78409',
    markupEquipment: 12, markupNoFuel: 0, markupStdFuel: 4, markupHighFuel: 6, salesTax: 8.25,
    procurementEmail: 'procurement@example.com', projectEmail: 'cc-pe@example.com',
    description: 'Hot tap and tie-in work for the new PE line, including pipe rack extension and electrical.',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const j5 = {
    id: uid('job'), number: '1000893', name: 'Freeport Chlor-Alkali Unit Expansion', jdeId: 'JDE-42780', companyId: '100',
    clientId: 'C-1952', clientName: 'Brazosport Chemical Co.', contractType: 'T&M', pm: 'Daniel Reyes',
    pa: 'Priya Natarajan', equipContact: 'Hector Vela (979) 555-0108', address: '2301 N Brazosport Blvd, Freeport, TX 77541',
    markupEquipment: 10, markupNoFuel: 0, markupStdFuel: 3, markupHighFuel: 6, salesTax: 8.25,
    procurementEmail: 'procurement@example.com', projectEmail: 'fp-chloralkali@example.com',
    description: 'Civil, foundations, and structural steel for the new cell room; mobilizing ahead of mechanical.',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const j6 = {
    id: uid('job'), number: '1000517', name: 'Beaumont Tank Farm Expansion', jdeId: 'JDE-40995', companyId: '110',
    clientId: 'C-2291', clientName: 'Meridian Petrochemical', contractType: 'Unit Price', pm: 'Rachel Okafor',
    pa: 'Tom Brennan', equipContact: 'Curtis Boone (409) 555-0177', address: '3300 Gulf St, Beaumont, TX 77701',
    markupEquipment: 11, markupNoFuel: 0, markupStdFuel: 4, markupHighFuel: 7, salesTax: 8.25,
    procurementEmail: 'procurement@example.com', projectEmail: 'bmt-tankfarm@example.com',
    description: 'Four new 150,000 bbl floating-roof tanks with containment and transfer piping. Wrapping up punch list.',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  equipment.push(
    base(j3, { po: 'PO-121104', description: '250T Crawler Crane', equipNo: 'CC-2501', vendor: 'Maxim Crane Works', rateDaily: 5800, rateWeekly: 17400, rateMonthly: 48500, onRentDate: d(-25), forecastOffDate: d(20), mobCost: 28000, demobCost: 24000, costCode: '03-510-200', fuelType: 'high', fuelMarkup: 9, manufacturer: 'Manitowoc', model: 'MLC300', serial: 'MLC300-1187', poAmount: 160000 }),
    base(j3, { po: 'PO-121110', description: 'Hydraulic Torque Wrench Kit', equipNo: 'TW-0412', vendor: 'Hydratight', qty: 3, rateDaily: 210, rateWeekly: 620, rateMonthly: 1650, onRentDate: d(-22), forecastOffDate: d(18), costCode: '03-520-310', fuelType: 'none', fuelMarkup: 0, poAmount: 9000 }),
    base(j3, { po: 'PO-121118', description: '1600 CFM Air Compressor', equipNo: 'AC-1601', vendor: 'Atlas Copco Rental', rateDaily: 950, rateWeekly: 2800, rateMonthly: 7400, onRentDate: d(-21), forecastOffDate: d(4), mobCost: 1200, demobCost: 1200, costCode: '03-520-140', fuelType: 'high', fuelMarkup: 9, dieselTax: 0.5, manufacturer: 'Atlas Copco', model: 'XRVS 1600', poAmount: 14000 }),
    base(j3, { po: 'PO-121125', description: 'Scaffold Package (Tower)', equipNo: 'SC-0900', vendor: 'BrandSafway', qty: 2, rateDaily: 400, rateWeekly: 1150, rateMonthly: 3000, onRentDate: d(-30), forecastOffDate: d(16), mobCost: 6500, demobCost: 4500, costCode: '03-540-100', fuelType: 'none', fuelMarkup: 0, poAmount: 24000 }),
    base(j3, { po: 'PO-121131', description: '60 ft Telescopic Boom Lift', equipNo: 'BL-6004', vendor: 'Sunbelt Rentals', qty: 3, rateDaily: 520, rateWeekly: 1350, rateMonthly: 3300, onRentDate: d(-18), forecastOffDate: d(2), mobCost: 450, demobCost: 450, costCode: '03-510-210', manufacturer: 'JLG', model: '600S', poAmount: 15000 }),
    base(j3, { po: 'COE-0057', description: 'Company Welding Rig Truck', equipNo: 'CO-WR11', vendor: 'Company Fleet', rateDaily: 150, rateWeekly: 600, rateMonthly: 1900, onRentDate: d(-25), forecastOffDate: d(20), costCode: '03-530-100', coe: true, fuelType: 'high', fuelMarkup: 9, manufacturer: 'Ford', model: 'F-550' }),
    base(j4, { po: 'PO-121402', description: 'Hot Tap Machine', equipNo: 'HT-1203', vendor: 'TDW Services', rateDaily: 1200, rateWeekly: 3600, rateMonthly: 9500, onRentDate: d(-8), forecastOffDate: d(10), mobCost: 800, demobCost: 800, costCode: '04-520-330', fuelType: 'none', fuelMarkup: 0, manufacturer: 'T.D. Williamson', model: 'T-760', poAmount: 18000 }),
    base(j4, { po: 'PO-121409', description: '30T Rough Terrain Crane', equipNo: 'RT-3008', vendor: 'United Rentals', rateDaily: 1400, rateWeekly: 4200, rateMonthly: 11500, onRentDate: d(-40), forecastOffDate: d(25), mobCost: 2500, demobCost: 2500, costCode: '04-510-200', fuelType: 'high', fuelMarkup: 6, manufacturer: 'Terex', model: 'RT 230', poAmount: 38000 }),
    base(j4, { po: 'PO-121415', description: '45 ft Articulating Boom Lift', equipNo: 'BL-4502', vendor: 'Herc Rentals', qty: 2, rateDaily: 380, rateWeekly: 950, rateMonthly: 2350, onRentDate: d(-35), forecastOffDate: d(30), mobCost: 350, demobCost: 350, costCode: '04-510-210', manufacturer: 'Genie', model: 'Z-45 XC', poAmount: 12000 }),
    base(j4, { po: 'PO-121420', description: 'Portable Generator 125 kVA', equipNo: 'GN-1250', vendor: 'Aggreko', rateDaily: 330, rateWeekly: 900, rateMonthly: 2300, onRentDate: d(-35), forecastOffDate: d(30), costCode: '04-520-150', fuelType: 'high', fuelMarkup: 6, dieselTax: 0.5, envTax: 1, manufacturer: 'Caterpillar', model: 'XQ125', poAmount: 6500 }),
    base(j4, { po: 'PO-121388', description: 'Mini Excavator', equipNo: 'EX-0305', vendor: 'Sunbelt Rentals', rateDaily: 340, rateWeekly: 950, rateMonthly: 2400, onRentDate: d(-60), forecastOffDate: d(-15), offRentDate: d(-15), status: 'off', mobCost: 300, demobCost: 300, costCode: '04-500-110', manufacturer: 'Kubota', model: 'KX057-5', poAmount: 4500 }),
    base(j5, { po: 'PO-122015', description: '330 Hydraulic Excavator', equipNo: 'EX-3302', vendor: 'Holt CAT', rateDaily: 1650, rateWeekly: 4950, rateMonthly: 13200, onRentDate: d(-12), forecastOffDate: d(75), mobCost: 2200, demobCost: 2200, costCode: '05-500-120', fuelType: 'high', fuelMarkup: 6, propertyTax: 0.75, manufacturer: 'Caterpillar', model: '330', serial: 'CAT0330GXYZ0042', poAmount: 62000 }),
    base(j5, { po: 'PO-122021', description: 'Pile Driving Rig', equipNo: 'PD-0701', vendor: 'Pileco', rateDaily: 3900, rateWeekly: 11700, rateMonthly: 31000, onRentDate: d(-5), forecastOffDate: d(50), mobCost: 15000, demobCost: 12000, costCode: '05-500-200', fuelType: 'high', fuelMarkup: 6, manufacturer: 'Liebherr', model: 'LRH 100', poAmount: 95000 }),
    base(j5, { po: 'PO-122030', description: '12 yd Concrete Pump Truck', equipNo: 'CP-3807', vendor: 'Brundage-Bone', rateDaily: 1100, rateWeekly: 3300, rateMonthly: 8800, onRentDate: d(14), forecastOffDate: d(45), status: 'forecast', mobCost: 900, costCode: '05-510-300', fuelType: 'high', fuelMarkup: 6, poAmount: 15000 }),
    base(j5, { po: 'PO-122034', description: 'Site Office Trailer 12x60', equipNo: 'OF-1260', vendor: 'WillScot', rateDaily: 45, rateWeekly: 150, rateMonthly: 480, onRentDate: d(-20), forecastOffDate: d(180), mobCost: 1800, demobCost: 1500, costCode: '05-900-100', fuelType: 'none', fuelMarkup: 0, poAmount: 6000 }),
    base(j5, { po: 'COE-0063', description: 'Company Skid Steer', equipNo: 'CO-SS22', vendor: 'Company Fleet', rateDaily: 180, rateWeekly: 540, rateMonthly: 1500, onRentDate: d(-12), forecastOffDate: d(75), costCode: '05-530-110', coe: true, fuelType: 'standard', fuelMarkup: 3, manufacturer: 'Bobcat', model: 'S650' }),
    base(j6, { po: 'PO-119740', description: '100T Crawler Crane', equipNo: 'CC-1003', vendor: 'ALL Erection & Crane', rateDaily: 3100, rateWeekly: 9300, rateMonthly: 25500, onRentDate: d(-150), forecastOffDate: d(-30), offRentDate: d(-30), status: 'off', mobCost: 14000, demobCost: 12000, costCode: '06-510-200', fuelType: 'high', fuelMarkup: 7, manufacturer: 'Link-Belt', model: '218 HSL', poAmount: 140000 }),
    base(j6, { po: 'PO-119755', description: 'Welding Machine (Engine Drive)', equipNo: 'WM-3001', vendor: 'Airgas', qty: 6, rateDaily: 95, rateWeekly: 260, rateMonthly: 690, onRentDate: d(-140), forecastOffDate: d(9), costCode: '06-520-110', fuelType: 'high', fuelMarkup: 7, poAmount: 22000 }),
    base(j6, { po: 'PO-119790', description: 'Light Tower (Diesel)', equipNo: 'LT-0810', vendor: 'United Rentals', qty: 4, rateDaily: 75, rateWeekly: 210, rateMonthly: 520, onRentDate: d(-120), forecastOffDate: d(5), costCode: '06-520-160', fuelType: 'standard', fuelMarkup: 4, poAmount: 9500 }),
    base(j6, { po: 'PO-119802', description: 'Vacuum Truck', equipNo: 'VT-2205', vendor: 'Clean Harbors', rateDaily: 1050, rateWeekly: 3150, rateMonthly: 8400, onRentDate: d(-9), forecastOffDate: d(12), mobCost: 600, demobCost: 600, costCode: '06-560-100', fuelType: 'high', fuelMarkup: 7, envTax: 2, poAmount: 9000 }),
  );
  const find = no => equipment.find(e => e.equipNo === no);
  const ago = h => new Date(Date.now() - 3600e3 * h).toISOString();
  requests.push(
    { id: uid('req'), jobId: j3.id, equipmentId: find('AC-1601').id, type: 'offrent', requestedBy: 'Darnell Price', requestedDate: d(1), reason: 'Air tool work in the reactor is complete. Unit is at the north gate.', status: 'pending', createdAt: ago(3) },
    { id: uid('req'), jobId: j3.id, equipmentId: find('BL-6004').id, type: 'transfer', targetJobId: j4.id, targetForecastDate: d(30), requestedBy: 'Darnell Price', requestedDate: d(3), reason: 'Corpus Christi needs two more lifts for the pipe rack.', status: 'pending', createdAt: ago(8) },
    { id: uid('req'), jobId: j4.id, equipmentId: find('RT-3008').id, type: 'forecast', requestedBy: 'Ray Delgado', requestedDate: d(40), reason: 'Rack steel delivery slipped two weeks.', status: 'pending', createdAt: ago(30) },
    { id: uid('req'), jobId: j4.id, equipmentId: find('EX-0305').id, type: 'offrent', requestedBy: 'Ray Delgado', requestedDate: d(-15), reason: 'Excavation for the rack foundations is done.', status: 'completed', completedBy: 'Jane Buyer', completedAt: ago(24 * 15), effectiveDate: d(-15), createdAt: ago(24 * 17) },
    { id: uid('req'), jobId: j6.id, equipmentId: find('LT-0810').id, type: 'offrent', requestedBy: 'Curtis Boone', requestedDate: d(5), reason: 'Night shift ends Friday.', status: 'pending', createdAt: ago(20) },
  );
  return { jobs: [j1, j2, j3, j4, j5, j6], equipment, requests, activity: [], demoVersion: DEMO_VERSION };
}
