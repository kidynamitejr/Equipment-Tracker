# FleetLedger — Equipment Rental Control

Multi-job equipment rental tracking for Halvorsen Industrial (demo brand). Procurement sets up jobs, logs rented
equipment against vendor POs, and tracks cost and profit per piece and per job. Field crews request off rents,
forecast date changes, and transfers; procurement completes them after contacting the vendor.

## Features

- **Jobs**: job number, name, JDE ID, company/client IDs, contract type, PM, PA, equipment pickup contact, address,
  markups (equipment, no fuel, standard fuel, high fuel), sales tax, contact emails, description. Editable.
- **Equipment**: PO # and amount, description, equipment #, daily/weekly/monthly rates, on rent / forecast off / actual
  off dates, vendor, mob/demob, one-time costs, status (on rent / off rent / forecasted), quantity, cost code, markups,
  environmental/diesel/property tax, tax rate, fuel type, serial, model, manufacturer, COE flag, notes.
- **Cost tracking** per equipment (rental cost EAC, ITD, profit to date, monthly cost) and per job (EAC and ITD days
  with dates, EAC and ITD cost with profit, on-rent count with how many come off within 7 days, monthly cost and profit).
- **Calendars**: job calendar and per-equipment calendar of daily cost; click a day for the breakdown.
- **Requests**: off rent, forecast date change, or transfer to another job. Procurement completes them to apply changes.
- **COE tab**: company-owned equipment is kept off the Equipment tab.
- **Exports**: Excel workbook (summary, equipment, COE, daily costs, requests) and PDF cost report, per job or for all jobs.
- **Sort and filter** by search, status, vendor, cost code, fuel type, and "off rent within 7 days".

## Cost rules

All formulas live in [`js/calc.js`](js/calc.js) and are explained on the **Data & settings** page.

- Full 28-day billing months bill at the monthly rate. For the remaining days, more than 3 weeks bills one monthly
  rate; otherwise each full week bills the weekly rate, and leftover days bill a week if more than 3 days, else daily.
- Base = rental × qty + mob + demob + one-time. Taxes = base × (env % + diesel % + property % + tax rate %).
  Cost = base + taxes. Profit = base × (equipment markup % + fuel markup %).
- Monthly cost = cost accrued over the past 30 days.

## Running it

It is a static site with no build step. Serve the folder with any web server, for example:

```
python3 -m http.server 8000
```

then open http://localhost:8000. Opening `index.html` directly from disk will not work because browsers block
JavaScript modules on `file://` URLs.

### GitHub Pages

In the repository, go to **Settings → Pages**, set **Source** to "Deploy from a branch", choose `main` and `/ (root)`,
and save. The site is published at `https://<owner>.github.io/<repo>/`.

## Data storage

Data is currently saved in each user's browser (localStorage), so each person sees their own copy. Use
**Data & settings → Download backup / Restore** to move data between computers. To share one set of data across
field and procurement, the data layer in [`js/store.js`](js/store.js) is written so it can be swapped for a hosted
database (for example Supabase) without changing the screens.

## Libraries

Vendored in `vendor/`: SheetJS 0.18.5 (Excel), jsPDF 2.5.1 and jsPDF-AutoTable 3.8.2 (PDF).
