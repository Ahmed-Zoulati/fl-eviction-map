import geopandas as gpd
import pandas as pd
from pathlib import Path

SRC = Path(r"data\fl_zip_evictions.geojson")          # big file you built
OUT = Path(r"docs\data\fl_zip_evictions.min.geojson") # small web copy

# Columns we actually need on the map
KEEP_COLS = [
    "zip","year","filings","evict","households",
    "filing_rate","evict_rate",
    "treated_hurr","treated_ts","storm_name"
]

print("Reading:", SRC)
gdf = gpd.read_file(SRC)

# Keep only needed columns that exist
cols = [c for c in KEEP_COLS if c in gdf.columns]
gdf = gdf[cols + ["geometry"]]

# Simplify geometry: tolerance in degrees (0.0005 ≈ ~55 m)
# Increase to 0.001 (~110 m) if you still need to cut size more.
print("Simplifying geometry (tolerance=0.0005, preserve_topology=True)...")
gdf["geometry"] = gdf.geometry.simplify(0.0005, preserve_topology=True)

# OPTIONAL: drop any empty geometries that might result from heavy simplify
gdf = gdf[~gdf.geometry.is_empty & gdf.geometry.notnull()]

OUT.parent.mkdir(parents=True, exist_ok=True)
gdf.to_file(OUT, driver="GeoJSON")
print("Wrote:", OUT)
