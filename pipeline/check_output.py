"""Checks on the files that fetch_forecast.py saved.

Reads site/data/ the way the web page will, and compares it with the
grids rebuilt from the downloaded ECMWF files.

Run it with:   .venv/bin/python pipeline/check_output.py
It prints PASS or FAIL for each check and exits with an error if any fail.
"""

import json
import sys
from datetime import datetime

import numpy as np
import xarray as xr

import fetch_forecast as ff

failures = 0


def check(name, passed, detail=""):
    global failures
    if not passed:
        failures += 1
    print(f"{'PASS' if passed else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""))


def read_point(lat, lon, tiles):
    """Read a point's 32 values from the tile files, as the page does."""
    tile_row, tile_col, position = ff.find_point(lat, lon)
    return tiles[(tile_row, tile_col)]["rain"][position]


def nearest_index(lat, lon, grid_lat, grid_lon):
    """Find the nearest grid point without using find_point's arithmetic:
    search the file's own latitude and longitude lists for the closest."""
    row = int(np.abs(grid_lat - lat).argmin())
    distance = np.abs((grid_lon - lon + 180) % 360 - 180)   # around the globe
    col = int(distance.argmin())
    return row, col


# ---- load what was saved
with open(ff.DATA / "meta.json") as f:
    meta = json.load(f)
tiles = {}
for path in sorted((ff.DATA / "tiles").glob("*.json")):
    with open(path) as f:
        tiles[(int(path.name[1:3]), int(path.name[5:7]))] = json.load(f)

# ---- the tile files
rows_40 = sum(1 for t in tiles.values() if t["rows"] == 40)
rows_41 = sum(1 for t in tiles.values() if t["rows"] == 41)
points = sum(len(t["rain"]) for t in tiles.values())
check("648 tile files", len(tiles) == 648, f"found {len(tiles)}")
check("612 tiles with 40 rows, 36 with 41 rows", (rows_40, rows_41) == (612, 36),
      f"{rows_40} and {rows_41}")
check("41-row tiles are exactly tile row 17",
      all((t["rows"] == 41) == (key[0] == 17) for key, t in tiles.items()))
check("points add up to 1,038,240", points == 1_038_240, f"{points:,}")
check("every point has 32 blocks",
      all(len(p) == 32 for t in tiles.values() for p in t["rain"]))
check("list length = rows x cols in every tile",
      all(len(t["rain"]) == t["rows"] * t["cols"] for t in tiles.values()))

everything = np.concatenate([np.array(t["rain"]).ravel() for t in tiles.values()])
check("no negative values", everything.min() >= 0, f"smallest {everything.min()}")
check("no implausibly large values", everything.max() < ff.MAX_PLAUSIBLE_MM * 10,
      f"largest {everything.max() / 10:.1f} mm in 3 hours")
check("meta.json agrees with the tiles",
      meta["blocks"] == 32 and len(meta["precision_mm"]) == 32
      and meta["grid"]["rows"] == 721 and meta["grid"]["cols"] == 1440)

# ---- rebuild the full grids from the downloaded files and compare
run = datetime.strptime(meta["run"], "%Y-%m-%dT%H:%MZ")
prefix = run.strftime("%Y%m%d_%Hz")
paths = {s: ff.DOWNLOADS / f"{prefix}_tp_{s:03d}.grib2" for s in ff.STEPS}
rain, _ = ff.build_rain(paths)
coords = xr.open_dataset(paths[3], engine="cfgrib", backend_kwargs={"indexpath": ""})
grid_lat, grid_lon = coords["latitude"].values, coords["longitude"].values

check("tiles hold the same total rain as the full grid",
      int(everything.sum()) == int(rain.astype(np.int64).sum()))

places = {
    "Bengaluru": (12.97, 77.59),
    "Chennai": (13.08, 80.27),
    "London": (51.51, -0.13),
    "New York": (40.71, -74.01),
    "Sydney": (-33.87, 151.21),
    "Wettest point of the run": None,
    "North Pole": (90, 0),
    "South Pole": (-90, 0),
    "Near the South Pole": (-89.95, 45.0),
    "On the 180 line, west side": (0.1, -180),
    "Just west of 180E": (0.1, 179.9),
    "Far south-east corner": (-89.95, 179.95),
    "Far north-west corner": (89.95, -179.95),
}
wet_block, wet_row, wet_col = np.unravel_index(rain.argmax(), rain.shape)
places["Wettest point of the run"] = (float(grid_lat[wet_row]), float(grid_lon[wet_col]))

for name, (lat, lon) in places.items():
    row, col = nearest_index(lat, lon, grid_lat, grid_lon)
    same = read_point(lat, lon, tiles) == rain[:, row, col].tolist()
    check(f"lookup matches the grid: {name}", same,
          f"grid point {grid_lat[row]:.2f}, {grid_lon[col]:.2f}")

rng = np.random.default_rng(2026)
wrong = 0
for _ in range(2000):
    lat, lon = rng.uniform(-90, 90), rng.uniform(-180, 180)
    row, col = nearest_index(lat, lon, grid_lat, grid_lon)
    if read_point(lat, lon, tiles) != rain[:, row, col].tolist():
        wrong += 1
check("lookup matches the grid: 2000 random points", wrong == 0, f"{wrong} wrong")

print(f"\n{'ALL CHECKS PASSED' if failures == 0 else f'{failures} CHECK(S) FAILED'}")
sys.exit(1 if failures else 0)
