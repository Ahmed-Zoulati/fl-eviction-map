# Florida Eviction & Payday Maps (ZIP level)

**Live eviction map:** https://ahmed-zoulati.github.io/fl-eviction-map/  
**Payday map (inside the same site):** `…/payday/` → https://ahmed-zoulati.github.io/fl-eviction-map/payday/

This repo hosts two interactive MapLibre maps of Florida ZIP Code Tabulation Areas (ZCTAs):

- **Evictions (2004–2016):** renter households (choropleth) + filing/eviction rates (circle layer) + storm treatments.
- **Payday loans (2004–2018):** renter households (choropleth) + transactions / default rate (circle layer) + storm treatments.

Both maps let you step through time and toggle storm cones and treatment outlines.

---

## What the maps show

### Choropleth (polygons)
- **Color:** renter households (renter-occupied units).  
  Darker purple ⇒ more renter households.

### Circles (optional)
- **Eviction map:**  
  - *Filing rate (%):* `filings / households × 100`  
  - *Eviction rate (%):* `evictions / households × 100`
- **Payday map:**  
  - *Transactions (count)*  
  - *Default rate (%):* **stored as 0–1 in raw data, rendered as 0–100%**
- Use the **Circle metric** dropdown to switch (Payday defaults to *Default rate (%)*).

### Storm overlays (optional)
- **Outlines:**  
  - Orange solid = hurricane-treated ZIPs (that year)  
  - Blue dashed = tropical-storm-treated ZIPs (that year)
- **Cones:** year-specific hurricane / tropical storm forecast cones (select individual storms or all/none).

---

## How to use

- **Year slider:** Select a year (Eviction: 2004–2016; Payday: 2004–2018).  
- **Circle metric:** Choose which circle variable to show/scale.  
- **Show circles:** Toggle the circle layer on/off.  
- **Storm outlines:** Toggle hurricane / tropical independently.  
- **Per-storm list:** Enable specific cones for the selected year (Select all / Select none).  
- **ZIP search:** Enter a 5-digit ZIP (e.g., 33139) → **Go**.  
- **Reset:** Recenter on Florida.  
- **Hover:** Tooltip shows ZIP, year, metrics, counts, households, storm treatment.

> **Florida filter:** rendering restricts to Florida ZIPs (32000–34999) and excludes `340xx` (overseas).


## Data & methodology

**Evictions (2004–2016)**

- Inputs (aggregated to ZCTA × year):
- `filings`, `evict` (counts), households (renter-occupied units).

- Rates:
  - `filing_rate = filings / households × 100`
  - `evict_rate = evict / households × 100`

- Storm treatment flags:
- `treated_hurr` (1/0), `treated_ts` (1/0), optional name per cone feature.

- Boundaries: 2022 TIGER/Line ZCTAs (approximate USPS ZIPs).

**Payday (2004–2018)**

- Inputs (ZCTA × year):
- `transactions`, `defaults`, `default_rate` (0–1 fraction), optional amt_sum/fees.

- Rendering: `default_rate is multiplied by 100 for display/sizing.`

- Households 2017–2018: fallback to 2016 renter households.

- Storms: cones extended to 2017–2018; same treatment flags scheme.

- Cones are simplified for web (small file size) while preserving shape.  

## Tech stack

- **Frontend:** MapLibre GL JS (renders a static GeoJSON)
- **Data prep:** Python (`pandas`, `geopandas`, `shapely`, `pyogrio`)
- **Hosting:** GitHub Pages (site in `/docs`)

## Repo layout

