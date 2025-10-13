# scripts/build_world_land.py
import argparse
import geopandas as gpd
from shapely.ops import unary_union

NE_URL = "https://naturalearth.s3.amazonaws.com/110m_physical/ne_110m_land.zip"

p = argparse.ArgumentParser()
p.add_argument("--url", default=NE_URL)
p.add_argument("--out", default="docs/base/world_land_110m.min.geojson")
p.add_argument("--simplify", type=float, default=0.05)
args = p.parse_args()

gdf = gpd.read_file(args.url).to_crs(4326)
geom = unary_union(gdf.geometry)
land = gpd.GeoDataFrame(geometry=[geom], crs="EPSG:4326")
if args.simplify > 0:
    land["geometry"] = land.buffer(0).simplify(args.simplify, preserve_topology=True)
land["featurecla"] = "land"
land.to_file(args.out, driver="GeoJSON")
print(f"Wrote {args.out} with {len(land)} feature(s).")
