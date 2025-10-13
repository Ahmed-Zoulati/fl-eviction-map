# Florida Eviction Map (ZIP level, 2004–2016)

**Live map:** https://ahmed-zoulati.github.io/fl-eviction-map/

This interactive map visualizes eviction dynamics across Florida ZIP codes (ZCTAs) from **2004–2016**. It combines renter population, eviction filings, and hurricane/tropical-storm treatment flags so you can explore patterns year by year.

## What the map shows

- **Choropleth (polygons):** ZIPs colored by **renter households** (renter-occupied units).  
  Darker purple = more renter households.

- **Red circles (optional):** One per ZIP, sized by a **rate**:
  - **Filing rate (%)** = filings / renter households × 100  
  - **Eviction rate (%)** = evictions / renter households × 100  
  Use the “Circle metric” dropdown to switch.

- **Storm outlines (optional):**
  - **Orange solid** = ZIP treated by a **hurricane** that year  
  - **Blue dashed** = ZIP treated by a **tropical storm** that year  
  Toggle each in the panel.

## How to use it

- **Year slider**: switch between 2004–2016; all layers update.  
- **Circle metric**: choose *Filing rate* or *Eviction rate*.  
- **Show circles**: show/hide the red circles.  
- **ZIP search**: type a 5-digit ZIP (e.g., `33139`) and press **Go**.  
- **Reset**: recenter on Florida.  
- **Hover**: see ZIP, year, rates, counts, households, and storm treatment.

## Data & methodology

- **Inputs (weekly → yearly):**
  - `filings`, `evict` aggregated to **ZIP × Year**
  - `RenterOccupiedUnits` averaged within the year → **households**
  - Rates:
    - `filing_rate = filings / households × 100`
    - `evict_rate  = evict / households × 100`
- **Storm treatment (optional):** ZIP × Year flags:
  - `treated_hurr` (1/0), `treated_ts` (1/0), optional `storm_name`
- **Boundaries:** ZCTAs (Census TIGER/Line, 2022).  
  *Note:* ZCTAs approximate USPS ZIP codes; small differences are normal.

## Tech stack

- **Frontend:** MapLibre GL JS (renders a static GeoJSON)
- **Data prep:** Python (`pandas`, `geopandas`, `shapely`, `pyogrio`)
- **Hosting:** GitHub Pages (site in `/docs`)

## Repo layout

