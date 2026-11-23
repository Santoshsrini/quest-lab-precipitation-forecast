"""Varsha data script.

Downloads the newest ECMWF IFS rain forecast and saves it as small files
that the web page can read. The method is described step by step in
docs/backend-data-processing.md.

Run it with:   .venv/bin/python pipeline/fetch_forecast.py

Output:        site/data/meta.json                                the run, block times, parameters
               site/data/tp/tiles/r00_c00.json ... r17_c35.json   (648 files)
               site/data/tp/pictures/b00.png ... b47.png          (48 files)

Each forecast parameter has its own folder (only "tp", rain, for now), so
more parameters can be added without changing the layout.

Data source: ECMWF Open Data, licensed CC BY 4.0.
"""

import json
import math
import shutil
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import eccodes
import numpy as np
import xarray as xr
from ecmwf.opendata import Client
from PIL import Image

# ---------------------------------------------------------------- settings

ROOT = Path(__file__).resolve().parent.parent
DOWNLOADS = ROOT / "pipeline" / "downloads"
DATA = ROOT / "site" / "data"

BLOCK_HOURS = 3                 # ECMWF gives one value every 3 hours
# How far ahead we store: 144 hours, the last 3-hourly step of every ECMWF
# run. The page shows the selected place's today plus 3 days, which ends at
# most 96 hours from now; the run in use is several hours old, and older
# still if a scheduled job fails. 144 hours covers all of that.
LAST_STEP = 144
STEPS = list(range(0, LAST_STEP + 1, BLOCK_HOURS))    # 0, 3, 6, ... 144
BLOCKS = len(STEPS) - 1         # 48 blocks of 3 hours

GRID_ROWS = 721                 # 90N to 90S, every 0.25 degrees
GRID_COLS = 1440                # 180W to 179.75E, every 0.25 degrees
SPACING = 0.25

TILE_POINTS = 40                # a tile is 40 by 40 grid points = 10 by 10 degrees
TILE_ROWS = 18
TILE_COLS = 36

MAX_PLAUSIBLE_MM = 1000         # more rain than this in 3 hours means bad data

# Colours for the rain pictures that are laid over the map. Each entry is
# (rain in mm at which the colour starts, the colour). Below the first
# entry the picture is transparent, so the plain map shows.
RAIN_COLOURS = [
    (1,   "#8cc4ff"),           # light blue: light rain
    (2.5, "#3a7be0"),           # blue
    (5,   "#3fb563"),           # green: moderate
    (10,  "#f2dc3d"),           # yellow: heavy
    (20,  "#f5962a"),           # orange: very heavy
    (50,  "#e03a3a"),           # red: extreme
]
# Colours start at 1 mm. Starting lower painted about 40% of the globe
# light blue and hid the land; at 1 mm about 8% is coloured.
PICTURE_SIZE = 1440             # pictures are 1440 x 1440 pixels
MAP_EDGE_LAT = 85.0511          # the web map's projection stops at this latitude

# The forecast parameters we save. Each gets its own folder in site/data/
# and its own entry in meta.json. Adding a parameter later means adding an
# entry here and the code that works out its values.
RAIN = "tp"
PARAMETERS = {
    RAIN: {
        "name": "Rain",
        "unit": "mm",
        "per": "3 hours",
        "stored_as": "tenths",          # 4.2 mm is stored as 42
        "colours": RAIN_COLOURS,
    },
}


# ------------------------------------------- step 1: find the newest run

def find_newest_run(client):
    """Return the start time of the newest run that is fully published.

    ECMWF publishes a run step by step, so we ask for the newest run that
    already has our last step. The earlier steps are then there too.
    """
    return client.latest(type="fc", stream="oper", step=LAST_STEP, param="tp")


# ------------------------------------------------ step 2: download `tp`

def download_steps(client, run):
    """Download the tp field for every step. Return {step: file path}."""
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    prefix = run.strftime("%Y%m%d_%Hz")

    # Remove files left over from older runs.
    for old in DOWNLOADS.glob("*.grib2"):
        if not old.name.startswith(prefix):
            old.unlink()

    paths = {}
    for step in STEPS:
        path = DOWNLOADS / f"{prefix}_tp_{step:03d}.grib2"
        if not path.exists():
            client.retrieve(
                date=run.date(), time=run.hour, type="fc", stream="oper",
                step=step, param="tp", target=str(path),
            )
        paths[step] = path
    return paths


# --------------------------------------- step 3: read a step into a grid

def read_step(path):
    """Read one downloaded file.

    Returns (grid, precision):
      grid       721 x 1440 numbers: total precipitation in metres since
                 the start of the run, north to south, west to east
      precision  the smallest difference this file can hold, in metres.
                 The file stores values in fixed steps, and the steps get
                 coarser as the totals grow.
    """
    data = xr.open_dataset(path, engine="cfgrib", backend_kwargs={"indexpath": ""})
    tp = data["tp"]
    lat = data["latitude"].values
    lon = data["longitude"].values

    # Stop if the file is not laid out the way the rest of the code assumes.
    assert tp.shape == (GRID_ROWS, GRID_COLS), f"unexpected grid size {tp.shape}"
    assert tp.attrs["units"] == "m", f"unexpected units {tp.attrs['units']}"
    assert tp.attrs["GRIB_stepType"] == "accum", "tp is not a running total"
    assert lat[0] == 90 and lat[-1] == -90, "rows do not run from 90N to 90S"
    assert lon[0] == -180 and lon[-1] == 179.75, "columns do not run from 180W to 179.75E"

    grid = tp.values.astype("float64")
    assert not np.isnan(grid).any(), "the grid has missing values"

    with open(path, "rb") as f:
        message = eccodes.codes_grib_new_from_file(f)
        bits = eccodes.codes_get(message, "bitsPerValue")
        binary_scale = eccodes.codes_get(message, "binaryScaleFactor")
        decimal_scale = eccodes.codes_get(message, "decimalScaleFactor")
        eccodes.codes_release(message)
    # A field that is the same everywhere (step 0 is all zeros) uses 0 bits.
    precision = 0.0 if bits == 0 else 2.0 ** binary_scale / 10.0 ** decimal_scale

    return grid, precision


# ------------------------- step 4: turn running totals into rain per block

def build_rain(paths):
    """Work out the rain in each 3-hour block, for the whole globe.

    Returns (rain, precisions):
      rain        48 x 721 x 1440 whole numbers, in tenths of a mm
      precisions  48 numbers: the smallest amount each block can show, in mm
    """
    rain = np.zeros((BLOCKS, GRID_ROWS, GRID_COLS), dtype=np.int16)
    precisions = []

    previous_total, previous_precision = read_step(paths[STEPS[0]])
    assert (previous_total == 0).all(), "step 0 is not zero everywhere"

    for block, step in enumerate(STEPS[1:]):
        total, precision = read_step(paths[step])

        # The one rule: rain in a block = this step's total - the step before.
        block_mm = (total - previous_total) * 1000        # metres to mm

        # Amounts smaller than the file's precision cannot be told apart
        # from no rain, so they count as zero. This also removes the tiny
        # negative values that the precision steps produce.
        limit_mm = max(precision, previous_precision) * 1000
        assert block_mm.min() > -limit_mm * 1.001, (
            f"step {step}: the total falls by {-block_mm.min():.3f} mm, "
            f"more than the precision of {limit_mm:.3f} mm")
        block_mm[block_mm < limit_mm * 0.999] = 0

        assert block_mm.max() < MAX_PLAUSIBLE_MM, (
            f"step {step}: {block_mm.max():.0f} mm in 3 hours is not plausible")
        # Averaged over the globe, about 0.3 mm falls in 3 hours. A value far
        # from that would mean the units are not what we think.
        assert 0.05 < block_mm.mean() < 1.5, (
            f"step {step}: global average of {block_mm.mean():.3f} mm is not plausible")

        rain[block] = np.rint(block_mm * 10)              # tenths of a mm
        precisions.append(round(limit_mm, 4))
        previous_total, previous_precision = total, precision

    return rain, precisions


# --------------------------------------------------- finding a grid point

def find_point(lat, lon):
    """Where is the grid point nearest to this latitude and longitude?

    Returns (tile_row, tile_col, position): which tile file holds the
    point, and its position in that tile's "values" list. Everything is
    counted from 0. The web page does exactly the same arithmetic.
    """
    grid_row = math.floor((90 - lat) / SPACING + 0.5)       # 0 to 720
    grid_col = math.floor((lon + 180) / SPACING + 0.5)      # 0 to 1440
    if grid_col == GRID_COLS:       # just west of the 180 line: same as column 0
        grid_col = 0

    tile_row = min(grid_row // TILE_POINTS, TILE_ROWS - 1)  # the South Pole row
    tile_col = grid_col // TILE_POINTS                      # joins tile row 17

    row_in_tile = grid_row - tile_row * TILE_POINTS
    col_in_tile = grid_col - tile_col * TILE_POINTS
    position = row_in_tile * TILE_POINTS + col_in_tile
    return tile_row, tile_col, position


# ------------------------------------ steps 5 to 7: cut into tiles and save

def write_tiles(values, folder):
    """Save one parameter's values for the whole globe as 648 tile files."""
    folder.mkdir(parents=True)
    for tile_row in range(TILE_ROWS):
        first_row = tile_row * TILE_POINTS
        last_row = first_row + TILE_POINTS
        if tile_row == TILE_ROWS - 1:
            last_row = GRID_ROWS            # the southernmost tiles take row 720 too
        for tile_col in range(TILE_COLS):
            first_col = tile_col * TILE_POINTS
            piece = values[:, first_row:last_row, first_col:first_col + TILE_POINTS]
            rows = piece.shape[1]
            # Reorder to (row, column, block), then flatten the rows and
            # columns: one entry per grid point, row by row, west to east.
            points = piece.transpose(1, 2, 0).reshape(rows * TILE_POINTS, BLOCKS)
            tile = {"rows": rows, "cols": TILE_POINTS, "blocks": BLOCKS,
                    "values": points.tolist()}
            name = f"r{tile_row:02d}_c{tile_col:02d}.json"
            with open(folder / name, "w") as f:
                json.dump(tile, f, separators=(",", ":"))


def write_files(rain, precisions, run):
    """Save each parameter's tiles and pictures, and meta.json, into site/data/."""
    # Write into a temporary folder first and swap it in at the end, so a
    # failure half way never leaves a mix of old and new files.
    new = DATA.with_name("data.new")
    if new.exists():
        shutil.rmtree(new)
    new.mkdir()

    p = PARAMETERS[RAIN]
    write_tiles(rain, new / RAIN / "tiles")
    write_pictures(rain, new / RAIN / "pictures", p["colours"])

    run_utc = run.replace(tzinfo=timezone.utc)
    meta = {
        "model": "ECMWF IFS",
        "source": "ECMWF Open Data, licensed CC BY 4.0",
        "run": run_utc.strftime("%Y-%m-%dT%H:%MZ"),
        "made": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "block_hours": BLOCK_HOURS,
        "blocks": BLOCKS,
        "first_block_start": run_utc.strftime("%Y-%m-%dT%H:%MZ"),
        "grid": {"north": 90, "west": -180, "spacing": SPACING,
                 "rows": GRID_ROWS, "cols": GRID_COLS},
        "tile_degrees": 10,
        "tile_points": TILE_POINTS,
        # The area every map picture covers.
        "pictures": {
            "north": MAP_EDGE_LAT, "south": -MAP_EDGE_LAT,
            "west": -180 - SPACING / 2, "east": 180 - SPACING / 2,
        },
        # One entry per parameter. The page's legend uses these colours, so
        # it always matches the pictures.
        "parameters": [{
            "id": RAIN,
            "name": p["name"],
            "unit": p["unit"],
            "per": p["per"],
            "stored_as": p["stored_as"],
            "tiles": f"{RAIN}/tiles",
            "pictures": f"{RAIN}/pictures",
            "precision": precisions,
            "colours": [{"from": start, "colour": colour} for start, colour in p["colours"]],
        }],
    }
    with open(new / "meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    if DATA.exists():
        shutil.rmtree(DATA)
    new.rename(DATA)


# ------------------------------------------- rain pictures for the map

def picture_rows():
    """For each row of a picture, which grid row does it show?

    The grid's rows are evenly spaced in latitude. The web map is not: it
    uses the Web Mercator projection, which stretches the far north and
    south. So each picture row is given the latitude it has on the map,
    and takes the nearest grid row. This makes the rain line up with the
    coastlines.
    """
    # Position of each picture row's centre, from 0 at the top to 1 at the bottom.
    fraction = (np.arange(PICTURE_SIZE) + 0.5) / PICTURE_SIZE
    # The Web Mercator formula, turned round to give latitude.
    top = math.asinh(math.tan(math.radians(MAP_EDGE_LAT)))
    lat = np.degrees(np.arctan(np.sinh(top * (1 - 2 * fraction))))
    return np.floor((90 - lat) / SPACING + 0.5).astype(int)


def colour_class(tenths, colours=RAIN_COLOURS):
    """Which colour does each value get? 0 = none, 1 = the first colour..."""
    starts = [round(start * 10) for start, _ in colours]   # in tenths
    return np.digitize(tenths, starts).astype(np.uint8)


def write_pictures(values, folder, colours):
    """Save one picture of the globe per block: b00.png, b01.png, ..."""
    folder.mkdir(parents=True)
    rows = picture_rows()

    # The picture stores a colour number per pixel, plus this list of colours.
    palette = [0, 0, 0]                                     # colour 0: transparent
    for _, colour in colours:
        palette += [int(colour[i:i + 2], 16) for i in (1, 3, 5)]

    for block in range(values.shape[0]):
        classes = colour_class(values[block], colours)[rows, :]    # 1440 x 1440
        picture = Image.fromarray(classes, mode="P")
        picture.putpalette(palette)
        picture.save(folder / f"b{block:02d}.png", transparency=0, optimize=True)


# ------------------------------------------------------------ a quick look

def print_forecast(name, lat, lon, run):
    """Read one place back from the saved files and print its forecast."""
    tile_row, tile_col, position = find_point(lat, lon)
    with open(DATA / RAIN / "tiles" / f"r{tile_row:02d}_c{tile_col:02d}.json") as f:
        values = json.load(f)["values"][position]
    print(f"\n{name} ({lat}, {lon}): tile r{tile_row:02d}_c{tile_col:02d}, position {position}")
    print("  block  starts (UTC)       rain (mm)")
    for block, tenths in enumerate(values):
        start = run + timedelta(hours=block * BLOCK_HOURS)
        print(f"  {block:>5}  {start:%d %b %H:%M}       {tenths / 10:>6.1f}")


# -------------------------------------------------------------------- main

def main():
    started = time.time()
    client = Client(source="ecmwf", model="ifs", resol="0p25")

    run = find_newest_run(client)
    print(f"Newest complete run: {run:%d %b %Y, %H:%M} UTC")

    paths = download_steps(client, run)
    size_mb = sum(p.stat().st_size for p in paths.values()) / 1e6
    print(f"Downloaded {len(paths)} steps, {size_mb:.1f} MB")

    rain, precisions = build_rain(paths)
    print(f"Rain worked out for {BLOCKS} blocks. "
          f"Largest value: {rain.max() / 10:.1f} mm in 3 hours. "
          f"Precision: {precisions[0]} mm (first block) to {precisions[-1]} mm (last block)")

    write_files(rain, precisions, run)
    files = list((DATA / RAIN / "tiles").glob("*.json"))
    out_mb = sum(p.stat().st_size for p in files) / 1e6
    print(f"Saved {len(files)} tiles ({out_mb:.0f} MB) and meta.json in {DATA}")
    pictures = list((DATA / RAIN / "pictures").glob("*.png"))
    picture_kb = sum(p.stat().st_size for p in pictures) / 1e3 / len(pictures)
    print(f"Saved {len(pictures)} rain pictures, about {picture_kb:.0f} KB each")

    print_forecast("Bengaluru", 12.97, 77.59, run)
    print(f"\nDone in {time.time() - started:.0f} seconds.")


if __name__ == "__main__":
    main()
