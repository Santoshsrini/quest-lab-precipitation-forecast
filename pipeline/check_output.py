"""Checks on the files that fetch_forecast.py saved.

Reads site/data/ the way the web page will, and compares it with the
grids rebuilt from the downloaded ECMWF files.

Run it with:   .venv/bin/python pipeline/check_output.py
It prints PASS or FAIL for each check and exits with an error if any fail.
"""

import gzip
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
    return tiles[(tile_row, tile_col)]["fields"][ff.RAIN][position]


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
for path in sorted((ff.DATA / meta["tiles"]).glob("*.json.gz")):
    with gzip.open(path, "rt") as f:
        tiles[(int(path.name[1:3]), int(path.name[5:7]))] = json.load(f)

# ---- the tile files
rows_40 = sum(1 for t in tiles.values() if t["rows"] == 40)
rows_41 = sum(1 for t in tiles.values() if t["rows"] == 41)
points = sum(len(t["fields"][ff.RAIN]) for t in tiles.values())
check("648 tile files", len(tiles) == 648, f"found {len(tiles)}")
check("612 tiles with 40 rows, 36 with 41 rows", (rows_40, rows_41) == (612, 36),
      f"{rows_40} and {rows_41}")
check("41-row tiles are exactly tile row 17",
      all((t["rows"] == 41) == (key[0] == 17) for key, t in tiles.items()))
check("points add up to 1,038,240", points == 1_038_240, f"{points:,}")
check(f"every point has {ff.BLOCKS} blocks",
      all(len(p) == ff.BLOCKS for t in tiles.values() for p in t["fields"][ff.RAIN]))
check("list length = rows x cols in every tile",
      all(len(f) == t["rows"] * t["cols"] for t in tiles.values() for f in t["fields"].values()))

everything = np.concatenate([np.array(t["fields"][ff.RAIN]).ravel() for t in tiles.values()])
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

# ---- the precipitation type pictures (the second map)
type_meta = next(p for p in meta["parameters"] if p["id"] == ff.TYPES)
type_pictures = sorted((ff.DATA / type_meta["pictures"]).glob("b*.png"))
check(f"{ff.BLOCKS} precipitation type pictures", len(type_pictures) == ff.BLOCKS,
      f"found {len(type_pictures)}")
type_images = [np.array(Image.open(p)) for p in type_pictures]
check("every type picture is 1440 x 1440",
      all(image.shape == (ff.PICTURE_SIZE, ff.PICTURE_SIZE) for image in type_images))
check("meta.json lists the five types in the pictures' colour order",
      [t["name"] for t in type_meta["types"]] ==
      ["Rain", "Rain and snow", "Snow", "Freezing rain", "Ice pellets"])


def tile_value(name, row, col, block):
    """One stored value, read from the tiles the way the page reads them."""
    tile_row, tile_col = min(row // 40, 17), col // 40
    t = tiles[(tile_row, tile_col)]
    return t["fields"][name][(row - tile_row * 40) * t["cols"] + (col - tile_col * 40)][block]


def expected_type(tp, sf, wx):
    """The type rule written out again, separately from the script:
    0 none, 1 rain, 2 rain and snow, 3 snow, 4 freezing rain, 5 ice pellets."""
    if tp < 10:
        return 0                                    # under 1 mm: not coloured
    if wx // 2 == 1:
        return 4
    if wx // 2 == 2:
        return 5
    share = sf / tp
    return 3 if share >= 0.8 else 2 if share > 0.2 else 1


wrong = 0
seen = set()
for _ in range(5000):
    block = int(rng.integers(0, ff.BLOCKS))
    row = int(rng.integers(24, 697))
    col = int(rng.integers(0, 1440))
    want = expected_type(*(tile_value(n, row, col, block) for n in ("tp", "sf", "wx")))
    seen.add(want)
    if int(type_images[block][pixel_for(float(grid_lat[row]), float(grid_lon[col]))]) != want:
        wrong += 1
check("type picture colours match the stored tp, sf and wx: 5000 random grid points",
      wrong == 0, f"{wrong} wrong; types seen {sorted(seen)}")
# Wet points only, so that every type gets tested, including the rare ones.
wrong = 0
counts = {}
for block in range(0, ff.BLOCKS, 6):
    for row, col in np.argwhere(rain[block, 24:697, :] >= 10)[::400]:
        row = int(row) + 24
        want = expected_type(*(tile_value(n, row, int(col), block) for n in ("tp", "sf", "wx")))
        counts[want] = counts.get(want, 0) + 1
        if int(type_images[block][pixel_for(float(grid_lat[row]), float(grid_lon[col]))]) != want:
            wrong += 1
check("type picture colours match at wet points", wrong == 0,
      f"{wrong} wrong of {sum(counts.values())}; by type {dict(sorted(counts.items()))}")

# ---- the day-card fields
def field(name):
    return np.concatenate([np.array(t["fields"][name]).reshape(-1) for t in tiles.values()])

cp, sf, tmax, tmin, wx, p10 = (field(n) for n in ("cp", "sf", "tmax", "tmin", "wx", "p10"))
check("every tile has all seven fields",
      all(set(t["fields"]) == {"tp", "cp", "sf", "tmax", "tmin", "wx", "p10"} for t in tiles.values()))
check("p10 has one value per ensemble window",
      all(len(v) == len(meta["prob_windows"]) for t in tiles.values() for v in t["fields"]["p10"]))
check("showery rain is never negative", cp.min() >= 0, f"smallest {cp.min()}")
# The showery part can exceed the total only by the files' precision.
cp_over = (cp - everything)
check("showery rain is not more than total rain (beyond precision)", cp_over.max() <= 10,
      f"largest excess {cp_over.max() / 10:.1f} mm")
check("snowfall is never negative", sf.min() >= 0, f"smallest {sf.min()}")
sf_over = (sf - everything)
check("snowfall is not more than total rain (beyond precision)", sf_over.max() <= 10,
      f"largest excess {sf_over.max() / 10:.1f} mm")
check("there is some snowfall somewhere", sf.max() > 0)
check("temperatures are plausible", -95 < tmin.min() and tmax.max() < 65,
      f"{tmin.min()} to {tmax.max()} C")
# High and low are stored separately and rounded to whole degrees, so when
# the temperature barely changes in 3 hours the high can come out 1 C below
# the low. Any bigger gap would be an error.
check("high is never more than 1 C (rounding) below low in the same block",
      (tmax - tmin).min() >= -1, f"smallest difference {(tmax - tmin).min()} C")
check("weather codes are 0 to 5", wx.min() >= 0 and wx.max() <= 5)
check("chance of 10 mm is 0 to 100%", p10.min() >= 0 and p10.max() <= 100)

prob_start = datetime.strptime(meta["prob_run"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
check("ensemble run is 00 or 12 UTC, not after the main run",
      prob_start.hour in (0, 12) and prob_start <= datetime.strptime(meta["run"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc),
      f"{meta['prob_run']} for main run {meta['run']}")
prob_end = prob_start + timedelta(hours=meta["prob_windows"][-1][1])

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
        if window_end > data_end or window_end > prob_end:
            short.append(f"UTC{quarter / 4:+g} at +{hours_later} h")
check("today plus 3 days is inside the data in every time zone", not short,
      f"data ends {data_end:%d %b %H:%M} UTC" + (f"; short for {short[:3]}" if short else ""))

print(f"\n{'ALL CHECKS PASSED' if failures == 0 else f'{failures} CHECK(S) FAILED'}")
sys.exit(1 if failures else 0)
