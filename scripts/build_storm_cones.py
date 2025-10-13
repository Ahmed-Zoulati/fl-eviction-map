import argparse, re
from pathlib import Path
from shapely.ops import unary_union
import geopandas as gpd
import pandas as pd

def parse_folder(folder_name: str):
    m = re.match(r"([A-Za-z]+)[ _-]?((19|20)\d{2})", folder_name)
    if not m:
        return None, None
    return m.group(1).upper(), int(m.group(2))

def infer_type_from_points(pts_path: Path):
    if not pts_path.exists():
        return None
    try:
        gpts = gpd.read_file(pts_path)
    except Exception:
        return None
    wind_col = next((c for c in gpts.columns if c.upper()=="MAXWIND"), None)
    if not wind_col:
        return None
    w = pd.to_numeric(gpts[wind_col], errors="coerce")
    if w.notna().any():
        mx = float(w.max())
        if mx >= 64: return "hurricane"
        if mx > 0:   return "tropical"
    return None

def load_meta(meta_csv: Path):
    if not meta_csv or not meta_csv.exists():
        return None
    df = pd.read_csv(meta_csv)
    df["name"] = df["name"].astype(str).str.upper().str.strip()
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
    df["storm_type"] = df["storm_type"].str.lower().str.strip()
    return df

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="Folder with per-storm subfolders (each has hurricane_cone.shp)")
    ap.add_argument("--out", required=True, help="Output GeoJSON")
    ap.add_argument("--meta", help="CSV with: name,year,storm_type (hurricane|tropical)")
    ap.add_argument("--min_year", type=int, default=2004)
    ap.add_argument("--max_year", type=int, default=2016)
    ap.add_argument("--simplify", type=float, default=0.02, help="Tolerance degrees (0.02≈2.2km)")
    args = ap.parse_args()

    src = Path(args.src)
    out = Path(args.out)
    meta = load_meta(Path(args.meta)) if args.meta else None

    rows = []
    subfolders = [p for p in src.iterdir() if p.is_dir()]
    if not subfolders:
        raise SystemExit(f"No subfolders found in {src}")

    for folder in sorted(subfolders):
        name, year = parse_folder(folder.name)
        cone_path = folder / "hurricane_cone.shp"
        if not cone_path.exists():
            print(f"– {folder.name}: no hurricane_cone.shp, skipped")
            continue
        try:
            g = gpd.read_file(cone_path)
        except Exception as e:
            print(f"– {folder.name}: read cone failed: {e}")
            continue
        g = g[g.geometry.notnull()]
        g = g[g.geometry.geom_type.isin(["Polygon","MultiPolygon"])]
        if g.empty:
            print(f"– {folder.name}: no polygons, skipped")
            continue

        geom = unary_union(g.geometry)
        gg = gpd.GeoDataFrame(geometry=[geom], crs=g.crs)

        if gg.crs and gg.crs.to_string() != "EPSG:4326":
            gg = gg.to_crs(4326)
        elif gg.crs is None:
            gg.set_crs(4326, inplace=True, allow_override=True)

        stype = None
        if meta is not None and name and year:
            hit = meta[(meta["name"]==name) & (meta["year"]==year)]
            if not hit.empty:
                stype = hit.iloc[0]["storm_type"]
        if stype is None:
            stype = infer_type_from_points(folder / "hurricane_points.shp")

        rows.append({
            "name": name, "year": year, "storm_type": stype, "geometry": gg.geometry.iloc[0]
        })
        print(f"✓ {folder.name}: cone added (type={stype})")

    if not rows:
        raise SystemExit("No cones assembled.")

    gdf = gpd.GeoDataFrame(rows, geometry="geometry", crs="EPSG:4326")
    gdf = gdf[(gdf["year"].notna()) & (gdf["year"]>=args.min_year) & (gdf["year"]<=args.max_year)]
    gdf["geometry"] = gdf.geometry.simplify(args.simplify, preserve_topology=True)
    gdf = gdf[~gdf.geometry.is_empty & gdf.geometry.notnull()]

    out.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(out, driver="GeoJSON")

    print(f"\nWrote {out} with {len(gdf)} cones.")
    print("Counts by storm_type:")
    print(gdf["storm_type"].value_counts(dropna=False).to_string())
    if gdf["year"].notna().any():
        print(f"Year span: {int(gdf['year'].min())}–{int(gdf['year'].max())}")
    print(f"Simplify tolerance: {args.simplify}")

if __name__ == "__main__":
    main()
