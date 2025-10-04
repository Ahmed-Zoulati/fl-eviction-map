import pandas as pd
import geopandas as gpd

CSV = r"data\fl_zip_year.csv"
SHP = r"data\tl_2022_us_zcta520\tl_2022_us_zcta520.shp"  # change if your .shp is named differently

# --- Load CSV and normalize ZIP / YEAR ---
df = pd.read_csv(CSV, dtype={"zip": str})
df["zip"] = df["zip"].astype(str).str.extract(r"(\d+)", expand=False).fillna("").str.zfill(5).str[:5]
df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")

print(f"CSV rows: {len(df):,}, unique ZIPs: {df['zip'].nunique():,}")

# --- Load ZCTA and normalize ZIP ---
zcta = gpd.read_file(SHP)
cand = [c for c in ["ZCTA5CE20","GEOID20","ZCTA5CE10","GEOID10","ZCTA5CE","GEOID"] if c in zcta.columns]
if not cand:
    raise SystemExit(f"No ZIP/ZCTA column found. Columns: {list(zcta.columns)}")
zcol = cand[0]
zcta["zip"] = zcta[zcol].astype(str).str.extract(r"(\d+)", expand=False).fillna("").str.zfill(5).str[:5]

print(f"Shapefile features: {len(zcta):,}, unique ZIPs: {zcta['zip'].nunique():,}")

# --- Reduce to one geometry per ZIP (to avoid duplicates) ---
zcta_zip = zcta[["zip", "geometry"]].dropna(subset=["zip"]).drop_duplicates(subset=["zip"])

print(f"Unique ZIP rows kept for join: {len(zcta_zip):,}")

# --- Merge and report ---
merged = df.merge(zcta_zip, on="zip", how="left")
matched = merged["geometry"].notna().sum()
missing = merged["geometry"].isna().sum()

print(f"After merge: matched rows with geometry = {matched:,}, missing = {missing:,} (of {len(merged):,})")

# Show a few missing (if any)
if missing:
    print("\nExamples missing geometry:")
    print(merged.loc[merged["geometry"].isna(), ["zip","year"]].head(10).to_string(index=False))
else:
    print("\nLooks good: all rows have geometry.")
