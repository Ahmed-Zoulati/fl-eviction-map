import pandas as pd
import geopandas as gpd

csv_path = r"data\fl_zip_year.csv"
shp_path = r"data\tl_2022_us_zcta520\tl_2022_us_zcta520.shp"  # change if your .shp has a different name

# --- CSV side ---
df = pd.read_csv(csv_path, dtype={"zip": str})
df["zip"] = df["zip"].astype(str).str.extract(r"(\d+)", expand=False).fillna("").str.zfill(5).str[:5]
csv_zips = set(df["zip"].dropna().unique())

print(f"CSV rows: {len(df):,}")
print(f"CSV unique ZIPs: {len(csv_zips):,}")
print("CSV sample ZIPs:", sorted(list(csv_zips))[:10])

# --- Shapefile side ---
zcta = gpd.read_file(shp_path)
cand_cols = [c for c in ["ZCTA5CE20","GEOID20","ZCTA5CE10","GEOID10","ZCTA5CE","GEOID"] if c in zcta.columns]
if not cand_cols:
    raise SystemExit(f"No ZIP/ZCTA column found in shapefile. Columns: {list(zcta.columns)}")
zcol = cand_cols[0]

zcta["zip"] = (
    zcta[zcol].astype(str)
    .str.extract(r"(\d+)", expand=False)
    .fillna("")
    .str.zfill(5)
    .str[:5]
)
shp_zips = set(zcta["zip"].dropna().unique())

print(f"Shapefile features: {len(zcta):,}")
print(f"Shapefile unique ZIPs: {len(shp_zips):,}")
print("Shapefile sample ZIPs:", sorted(list(shp_zips))[:10])

# --- Compare ---
inter = csv_zips & shp_zips
only_csv = sorted(list(csv_zips - shp_zips))[:20]
only_shp = sorted(list(shp_zips - csv_zips))[:20]

print(f"\nIntersection ZIPs count: {len(inter):,}")
print("First 20 ZIPs present in CSV but NOT in shapefile:", only_csv)
print("First 20 ZIPs present in shapefile but NOT in CSV:", only_shp)
