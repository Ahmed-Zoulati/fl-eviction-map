#!/usr/bin/env python3
"""Join Florida ZCTA polygons to your ZIP-year eviction CSV and export a GeoJSON for tiling."""
import argparse, os, sys
import pandas as pd
import geopandas as gpd

def _is_zip_path(p):
    return str(p).lower().endswith(".zip")

def _read_vector(path):
    if _is_zip_path(path):
        return gpd.read_file(f"zip://{path}")
    return gpd.read_file(path)

def _ensure_zip_str(s):
    try:
        s = str(s)
    except Exception:
        return None
    s = "".join([c for c in s if c.isdigit()])
    if len(s) == 0:
        return None
    return s.zfill(5)[:5]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--zcta", required=True)
    ap.add_argument("--states", required=False, help="Path to cb_2018_us_state_500k (zip or folder)")
    ap.add_argument("--state_name", default="Florida")
    ap.add_argument("--zip_col", default="zip")
    ap.add_argument("--year_col", default="year")
    ap.add_argument("--filings_col", default="filings")
    ap.add_argument("--households_col", default="households")
    ap.add_argument("--rate_col", default=None)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    df = pd.read_csv(args.csv)
    if args.zip_col not in df.columns or args.year_col not in df.columns:
        print(f"ERROR: CSV must include at least {args.zip_col} and {args.year_col}", file=sys.stderr)
        sys.exit(1)

    df = df.copy()
    df["_zip"] = df[args.zip_col].apply(_ensure_zip_str)
    df["_year"] = df[args.year_col].astype(int)

    if args.rate_col and args.rate_col in df.columns:
        df["_filing_rate"] = pd.to_numeric(df[args.rate_col], errors="coerce")
    else:
        if args.filings_col in df.columns and args.households_col in df.columns:
            filings = pd.to_numeric(df[args.filings_col], errors="coerce")
            hh = pd.to_numeric(df[args.households_col], errors="coerce")
            df["_filing_rate"] = (100.0 * filings / hh).where(hh > 0)
        else:
            print("ERROR: Need rate_col or filings+households to compute filing_rate", file=sys.stderr)
            sys.exit(1)

    # Keep only needed columns (+ optional storm/extra fields if present)
    keep_cols = ["_zip", "_year"]
    if args.filings_col in df.columns: keep_cols.append(args.filings_col)
    if args.households_col in df.columns: keep_cols.append(args.households_col)
    keep_cols.append("_filing_rate")

    # Optionals we want to carry through if present
    optional_cols = [
        "treated_hurr", "treated_ts", "storm_name",
        "evict", "evict_rate"  # safe to include if you add these later
    ]
    for c in optional_cols:
        if c in df.columns:
            keep_cols.append(c)

    df = df[keep_cols].rename(columns={
        "_zip": "zip",
        "_year": "year",
        "_filing_rate": "filing_rate"
    })

    zcta = _read_vector(args.zcta)
    # Accept multiple possible ZCTA/GEOID columns (2010/2020 schema)
    zip_col_cands = [c for c in ["ZCTA5CE10","ZCTA5CE20","GEOID10","GEOID20","ZCTA5CE","GEOID"] if c in zcta.columns]
    if not zip_col_cands:
        print(f"ERROR: Could not find a ZIP/ZCTA column in ZCTA file. Available columns: {list(zcta.columns)}", file=sys.stderr)
        sys.exit(1)
    zcol = zip_col_cands[0]
    zcta["zip"] = (
        zcta[zcol].astype(str)
        .str.extract(r"(\d+)", expand=False)
        .fillna("")
        .str.zfill(5)
        .str[:5]
    )

    if args.states:
        states = _read_vector(args.states)
        name_col = "NAME" if "NAME" in states.columns else "STATE_NAME" if "STATE_NAME" in states.columns else None
        if not name_col:
            print("ERROR: Could not find a state name column in the states file (expected NAME or STATE_NAME).", file=sys.stderr)
            sys.exit(1)
        fl = states[states[name_col] == args.state_name]
        if fl.empty:
            print(f"ERROR: Could not find state named '{args.state_name}' in states file.", file=sys.stderr)
            sys.exit(1)
        fl_union = fl.dissolve().geometry.iloc[0]
        zcta_fl = zcta[zcta.intersects(fl_union)].copy()
    else:
        # No states file provided -> keep all ZCTAs; the ZIP join below will keep only rows present in your CSV
        zcta_fl = zcta.copy()
    zcta_fl = zcta_fl[["zip", "geometry"]]
    gdf = zcta_fl.merge(df, on="zip", how="right").dropna(subset=["geometry"])

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    gdf.to_file(args.out, driver="GeoJSON")
    print(f"Wrote GeoJSON: {args.out} with {len(gdf)} features.")

if __name__ == "__main__":
    main()
