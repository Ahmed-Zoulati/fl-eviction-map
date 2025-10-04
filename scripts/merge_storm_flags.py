import pandas as pd

# Paths
ZIP_YEAR_CSV = r"data\fl_zip_year.csv"
STORMS_CSV   = r"data\storm_treatments.csv"
OUT_CSV      = r"data\fl_zip_year_storms.csv"

# --- Load base ZIP×year table ---
df = pd.read_csv(ZIP_YEAR_CSV, dtype={"zip": str})
df["zip"] = df["zip"].astype(str).str.extract(r"(\d+)", expand=False).fillna("").str.zfill(5).str[:5]
df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")

# --- Load storm flags (auto-detect delimiter; drop stray index columns) ---
storms = pd.read_csv(STORMS_CSV, sep=None, engine="python")
# Normalize column names to lower
storms.columns = [c.strip().lower() for c in storms.columns]
# Drop unnamed index-ish columns if present
storms = storms.loc[:, ~storms.columns.str.match(r"^unnamed")]

# Expected columns (some optional)
# zip, year, treated_hurr, treated_ts, storm_name (optional)
required = {"zip", "year"}
missing = required - set(storms.columns)
if missing:
    raise SystemExit(f"storm_treatments.csv is missing required columns: {missing}. Found: {list(storms.columns)}")

# Clean fields
storms["zip"]  = storms["zip"].astype(str).str.extract(r"(\d+)", expand=False).fillna("").str.zfill(5).str[:5]
storms["year"] = pd.to_numeric(storms["year"], errors="coerce").astype("Int64")

# Coerce flags; if absent, create as 0
for col in ["treated_hurr", "treated_ts"]:
    if col not in storms.columns:
        storms[col] = 0
    storms[col] = pd.to_numeric(storms[col], errors="coerce").fillna(0).astype(int)

# Optional storm_name field
has_name = "storm_name" in storms.columns

# Keep only FL years we map
storms = storms[(storms["year"] >= 2004) & (storms["year"] <= 2016)]

# Collapse to one row per ZIP–year
agg_dict = {"treated_hurr": "max", "treated_ts": "max"}
if has_name:
    # concat unique names in a stable way
    storms["storm_name"] = storms["storm_name"].astype(str).str.strip()
    agg_dict["storm_name"] = lambda s: ";".join(sorted({x for x in s if x and x.lower() != "nan"})) or ""

st = storms.groupby(["zip", "year"], as_index=False).agg(agg_dict)

# --- Join to base table ---
out = df.merge(st, on=["zip", "year"], how="left")

# Fill missing flags with 0
for col in ["treated_hurr", "treated_ts"]:
    if col not in out.columns:
        out[col] = 0
    out[col] = out[col].fillna(0).astype(int)

# Ensure storm_name column exists
if "storm_name" not in out.columns:
    out["storm_name"] = ""

# Write
out.to_csv(OUT_CSV, index=False)

# Simple summary
n_rows = len(out)
any_hurr = (out["treated_hurr"] == 1).sum()
any_ts   = (out["treated_ts"] == 1).sum()
both     = ((out["treated_hurr"] == 1) & (out["treated_ts"] == 1)).sum()

print(f"Wrote {OUT_CSV} with {n_rows:,} rows.")
print(f"ZIP-years: hurricane={any_hurr:,}, tropical={any_ts:,}, both={both:,}")
print("Sample:")
print(out.head(8).to_string(index=False))
