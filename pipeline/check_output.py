"""Checks on the files that fetch_forecast.py saved.

Reads site/data/ the way the web page will, and compares it with the
grids rebuilt from the downloaded ECMWF files.

Run it with:   .venv/bin/python pipeline/check_output.py
It prints PASS or FAIL for each check and exits with an error if any fail.
"""

import json
import sys
from datetime import datetime, timedelta, timezone

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
    """Read a point's values from the tile files, as the page does."""
    tile_row, tile_col, position = ff.find_point(lat, lon)
    return tiles[(tile_row, tile_col)]["values"][position]


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
rain_meta = next(p for p in meta["parameters"] if p["id"] == ff.RAIN)
tiles = {}
for path in sorted((ff.DATA / rain_meta["tiles"]).glob("*.json")):
    with open(path) as f:
        tiles[(int(path.name[1:3]), int(path.name[5:7]))] = json.load(f)

# ---- the tile files
rows_40 = sum(1 for t in tiles.values() if t["rows"] == 40)
rows_41 = sum(1 for t in tiles.values() if t["rows"] == 41)
points = sum(len(t["values"]) for t in tiles.values())
check("648 tile files", len(tiles) == 648, f"found {len(tiles)}")
check("612 tiles with 40 rows, 36 with 41 rows", (rows_40, rows_41) == (612, 36),
      f"{rows_40} and {rows_41}")
check("41-row tiles are exactly tile row 17",
      all((t["rows"] == 41) == (key[0] == 17) for key, t in tiles.items()))
check("points add up to 1,038,240", points == 1_038_240, f"{points:,}")
check(f"every point has {ff.BLOCKS} blocks",
      all(len(p) == ff.BLOCKS for t in tiles.values() for p in t["values"]))
check("list length = rows x cols in every tile",
      all(len(t["values"]) == t["rows"] * t["cols"] for t in tiles.values()))

everything = np.concatenate([np.array(t["values"]).ravel() for t in tiles.values()])
check("no negative values", everything.min() >= 0, f"smallest {everything.min()}")
check("no implausibly large values", everything.max() < ff.MAX_PLAUSIBLE_MM * 10,
      f"largest {everything.max() / 10:.1f} mm in 3 hours")
check("meta.json agrees with the tiles",
      meta["blocks"] == ff.BLOCKS and len(rain_meta["precision"]) == ff.BLOCKS
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

# ---- the rain pictures laid over the map
from PIL import Image

pictures = sorted((ff.DATA / rain_meta["pictures"]).glob("b*.png"))
check(f"{ff.BLOCKS} rain pictures", len(pictures) == ff.BLOCKS, f"found {len(pictures)}")
images = [np.array(Image.open(p)) for p in pictures]       # colour numbers, 0 = transparent
check("every picture is 1440 x 1440",
      all(image.shape == (ff.PICTURE_SIZE, ff.PICTURE_SIZE) for image in images))


def pixel_for(lat, lon):
    """Which pixel shows this place? Worked out from the map's projection,
    separately from the script's own picture_rows()."""
    import math
    top = math.asinh(math.tan(math.radians(ff.MAP_EDGE_LAT)))
    y = (1 - math.asinh(math.tan(math.radians(lat))) / top) / 2
    x = (lon - meta["pictures"]["west"]) / 360
    return int(y * ff.PICTURE_SIZE), int(x * ff.PICTURE_SIZE)


# At grid points, the pixel's colour must be the colour of the stored rain value.
wrong = 0
tested = 0
for _ in range(5000):
    block = int(rng.integers(0, ff.BLOCKS))
    row = int(rng.integers(24, 697))                        # 84N to 84S: inside the map
    col = int(rng.integers(0, 1440))
    pixel_row, pixel_col = pixel_for(float(grid_lat[row]), float(grid_lon[col]))
    expected = int(ff.colour_class(rain[block, row, col]))
    tested += 1
    if int(images[block][pixel_row, pixel_col]) != expected:
        wrong += 1
check("picture colours match the stored rain: 5000 random grid points", wrong == 0,
      f"{wrong} wrong of {tested}")

wet_pixel = pixel_for(float(grid_lat[wet_row]), float(grid_lon[wet_col]))
check("the wettest point of the run has the colour for its amount",
      int(images[wet_block][wet_pixel]) == int(ff.colour_class(rain[wet_block, wet_row, wet_col])),
      f"{rain[wet_block, wet_row, wet_col] / 10:.1f} mm, colour number {int(images[wet_block][wet_pixel])}")
dry = np.argwhere(rain[0, 24:697, :] == 0)[0]
dry_pixel = pixel_for(float(grid_lat[dry[0] + 24]), float(grid_lon[dry[1]]))
check("a dry point is transparent", int(images[0][dry_pixel]) == 0)

# ---- the run is the newest one ECMWF has published in full
from ecmwf.opendata import Client

newest = Client(source="ecmwf", model="ifs", resol="0p25").latest(
    type="fc", stream="oper", step=ff.LAST_STEP, param="tp")
check("the run used is the newest complete run on the ECMWF server",
      newest.strftime("%Y-%m-%dT%H:%MZ") == meta["run"],
      f"used {meta['run']}, newest {newest:%Y-%m-%dT%H:%MZ}")

# ---- today plus 3 days fits in the data, for every time zone
# The page shows each place's local 12 AM today to 12 AM four days later.
# Blocks before the run's start are always in the past, so only the end of
# that window needs to be inside the data. Tested now and 13 hours from now
# (when the next run normally replaces this one), for every offset from
# UTC-12 to UTC+14 in 15-minute steps.
data_end = datetime.strptime(meta["first_block_start"], "%Y-%m-%dT%H:%MZ").replace(
    tzinfo=timezone.utc) + timedelta(hours=meta["block_hours"] * meta["blocks"])
short = []
for hours_later in (0, 13):
    moment = datetime.now(timezone.utc) + timedelta(hours=hours_later)
    for quarter in range(-12 * 4, 14 * 4 + 1):
        offset = timedelta(minutes=15 * quarter)
        local = moment + offset
        local_midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
        window_end = local_midnight + timedelta(days=4) - offset      # back in UTC
        if window_end > data_end:
            short.append(f"UTC{quarter / 4:+g} at +{hours_later} h")
check("today plus 3 days is inside the data in every time zone", not short,
      f"data ends {data_end:%d %b %H:%M} UTC" + (f"; short for {short[:3]}" if short else ""))

print(f"\n{'ALL CHECKS PASSED' if failures == 0 else f'{failures} CHECK(S) FAILED'}")
sys.exit(1 if failures else 0)
