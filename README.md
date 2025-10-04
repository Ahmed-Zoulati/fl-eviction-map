
# Florida ZIP Eviction Map — Starter Kit

This is a from-scratch, step-by-step starter to build an interactive map like Eviction Lab’s, but at ZIP code (ZCTA) level for Florida (2004–2016).

## Quick steps

1) Put your CSV at `data/fl_evictions_2004_2016.csv` with columns: `zip,year,filings,households`.
2) Download and place these in `data/`:
   - `cb_2010_us_zcta510_500k.zip` (ZCTA 2010)
   - `cb_2018_us_state_500k.zip` (US states)
3) Build GeoJSON:
   ```bash
   python scripts/build_geojson.py      --csv data/fl_evictions_2004_2016.csv      --zcta data/cb_2010_us_zcta510_500k.zip      --states data/cb_2018_us_state_500k.zip      --state_name "Florida"      --zip_col zip --year_col year --filings_col filings --households_col households      --out data/fl_zip_evictions.geojson
   ```
4) Make vector tiles (Tippecanoe):
   ```bash
   tippecanoe -o data/fl_zip_evictions.mbtiles -l zips -zg --drop-densest-as-needed      --read-parallel --force      --include=zip --include=year --include=filings --include=households --include=filing_rate      data/fl_zip_evictions.geojson
   ```
5) Serve tiles (Docker):
   ```bash
   docker run -it --rm -v $PWD:/data -p 8080:8080 maptiler/tileserver-gl
   ```
6) Edit `web/index.html` and set:
   ```js
   const TILE_URL_TEMPLATE = "http://localhost:8080/data/fl_zip_evictions/{z}/{x}/{y}.pbf";
   ```
7) Start the web app:
   ```bash
   cd web && python -m http.server 5500
   # open http://localhost:5500
   ```
