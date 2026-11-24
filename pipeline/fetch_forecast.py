"""Varsha data script.

Downloads the newest ECMWF IFS rain forecast and saves it as small files
that the web page can read. The method is described step by step in
docs/backend-data-processing.md.

Run it with:   .venv/bin/python pipeline/fetch_forecast.py

Output:        site/data/meta.json                              the runs, block times, parameters
               site/data/tiles/r00_c00.json.gz ... r17_c35.json.gz   (648 files)
               site/data/tp/pictures/b00.png ... b47.png        (48 rain pictures)

Each tile holds every parameter for its 10 x 10 degree area: rain, the
showery part of the rain, high and low temperature, a weather code, and
the ensemble chance of 10 mm or more. Tiles are gzip-compressed JSON; the
page unpacks them in the browser.

Data source: ECMWF Open Data, licensed CC BY 4.0.
"""

import gzip
import json
import math
import shutil
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import eccodes
import numpy as np
import requests
import xarray as xr
from ecmwf.opendata import Client
from PIL import Image

# ---------------------------------------------------------------- settings

ROOT = Path(__file__).resolve().parent.parent
DOWNLOADS = ROOT / "pipeline" / "downloads"
DATA = ROOT / "site" / "data"
DOWNLOAD_TIMEOUT = (30, 120)    # seconds to connect, and to wait for more data
DOWNLOAD_TRIES = 3

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

# Extra fields for the day cards. All come from the same main run as the
# rain, except the chance of 10 mm, which comes from the ensemble.
#   cp       showery (convective) part of the rain, tenths of a mm per block
#   sf       snowfall part of the total (water equivalent), tenths of a mm per block
#   tmax     highest temperature in the block, whole degrees C (from mx2t3)
#   tmin     lowest temperature in the block, whole degrees C (from mn2t3)
#   wx       weather code per block = hazard * 2 + storm
#              hazard: 0 none, 1 freezing rain or drizzle, 2 ice pellets
#                      (from ptype, the type at the block's end only)
#              storm: 1 if storm energy (mucape) reaches STORM_CAPE
#   p10      ensemble chance of at least 10 mm in 24 hours, whole percent
STORM_CAPE = 1000               # J/kg of storm energy that counts as "storm"
# ECMWF precipitation type codes for the two hazards sf cannot show.
FREEZING_TYPES = (3, 12)        # freezing rain, freezing drizzle
ICE_TYPES = (8,)                # ice pellets
# Ensemble windows: 24 hours long, one starting every 12 hours from the
# ensemble run's start. 12 windows reach 156 hours, which covers the place's
# today plus 3 days even when the ensemble run is the older of the two.
PROB_WINDOWS = [(start, start + 24) for start in range(0, 133, 12)]


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
    for old in [*DOWNLOADS.glob("*.grib2"), *DOWNLOADS.glob("*.partial")]:
        if not old.name.startswith(prefix):
            old.unlink()

    paths = {}
    for step in STEPS:
        path = DOWNLOADS / f"{prefix}_tp_{step:03d}.grib2"
        safe_download(client, path, [step], date=run.date(), time=run.hour,
                      type="fc", stream="oper", param="tp")
        paths[step] = path
    return paths


def download_field(client, run, param, steps, kind="fc", stream="oper"):
    """Download one parameter for many steps into one file. Return its path."""
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    path = DOWNLOADS / f"{run:%Y%m%d_%Hz}_{param}.grib2"
    safe_download(client, path, steps, date=run.date(), time=run.hour,
                  type=kind, stream=stream, param=param)
    return path


def safe_download(client, path, steps, **request):
    """Download the steps into path, unless it is already there.

    The file is written under a temporary name and kept only if every step
    arrived, so a download cut off half way is never reused. A stalled
    connection times out (see TimeoutAdapter), and each file is tried
    DOWNLOAD_TRIES times before the script stops.
    """
    if path.exists():
        return
    partial = path.with_suffix(".partial")
    for attempt in range(1, DOWNLOAD_TRIES + 1):
        try:
            client.retrieve(step=steps if len(steps) > 1 else steps[0],
                            target=str(partial), **request)
            with open(partial, "rb") as f:
                count = eccodes.codes_count_in_file(f)
            if count == len(steps):
                partial.rename(path)
                return
            problem = f"got {count} of {len(steps)} steps"
        except requests.RequestException as e:
            problem = type(e).__name__
        partial.unlink(missing_ok=True)
        print(f"  {path.name}: {problem} (try {attempt} of {DOWNLOAD_TRIES})")
    raise RuntimeError(f"{path.name}: download failed {DOWNLOAD_TRIES} times; run the script again")


class TimeoutAdapter(requests.adapters.HTTPAdapter):
    """Give every request a time limit. The ECMWF client sets none, so a
    connection that stops sending data would otherwise wait for ever."""

    def send(self, request, timeout=None, **kwargs):
        return super().send(request, timeout=timeout or DOWNLOAD_TIMEOUT, **kwargs)


def make_client():
    client = Client(source="ecmwf", model="ifs", resol="0p25")
    # The library's own retries default to 500 tries, 2 minutes apart.
    # Keep a few quick ones; safe_download retries the whole file after that.
    client.maximum_retries = 3
    client.retry_after = 10
    adapter = TimeoutAdapter()
    client.session.mount("https://", adapter)
    client.session.mount("http://", adapter)
    return client


def read_messages(path, windows=False):
    """Read every field in a downloaded file with eccodes.

    Returns {step: (grid, precision)}. The step is the end of the period
    (an int), or (start, end) when windows is True, for the ensemble's
    24-hour windows. Grids
    are 721 x 1440, north to south, west to east, like the rain.
    """
    fields = {}
    with open(path, "rb") as f:
        while True:
            message = eccodes.codes_grib_new_from_file(f)
            if message is None:
                break
            get = lambda key: eccodes.codes_get(message, key)
            assert (get("Ni"), get("Nj")) == (GRID_COLS, GRID_ROWS), "unexpected grid size"
            assert get("latitudeOfFirstGridPointInDegrees") == 90, "rows do not start at 90N"
            grid = eccodes.codes_get_values(message).reshape(GRID_ROWS, GRID_COLS)
            bits = get("bitsPerValue")
            precision = 0.0 if bits == 0 else 2.0 ** get("binaryScaleFactor") / 10.0 ** get("decimalScaleFactor")
            start, end = get("startStep"), get("endStep")
            key = (start, end) if windows else end
            fields[key] = (grid.astype("float64"), precision)
            eccodes.codes_release(message)
    return fields


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


# ------------------------------------------------- fields for the day cards

def build_card_fields(client, run, prob_run):
    """Download and work out the extra fields for the day cards.

    Returns {name: array}: cp, sf, tmax, tmin, wx as 48 x 721 x 1440, and
    p10 as 12 x 721 x 1440 (one per ensemble window).
    """
    out = {}
    block_ends = STEPS[1:]                                  # 3, 6, ... 144

    # Showery rain and snowfall: running totals like tp, so the same
    # subtraction rule, stored as tenths of a mm per block.
    for name in ("cp", "sf"):
        field = read_messages(download_field(client, run, name, STEPS))
        blocks = np.zeros((BLOCKS, GRID_ROWS, GRID_COLS), dtype=np.int16)
        for b, end in enumerate(block_ends):
            (now, p_now), (before, p_before) = field[end], field[end - BLOCK_HOURS]
            mm = (now - before) * 1000
            mm[mm < max(p_now, p_before) * 1000 * 0.999] = 0  # below precision = none
            blocks[b] = np.rint(mm * 10)
        assert blocks.min() >= 0, f"{name} running total fell"
        out[name] = blocks

    # High and low temperature in each block: kelvin to whole degrees C.
    for name, param in (("tmax", "mx2t3"), ("tmin", "mn2t3")):
        field = read_messages(download_field(client, run, param, block_ends))
        out[name] = np.stack([np.rint(field[end][0] - 273.15) for end in block_ends]).astype(np.int16)
        assert -95 < out[name].min() and out[name].max() < 65, f"{param} out of range"

    # Weather code: a freezing or ice hazard in ptype at the block's end, and
    # whether storm energy reached STORM_CAPE at either end of the block.
    ptype = read_messages(download_field(client, run, "ptype", block_ends))
    cape = read_messages(download_field(client, run, "mucape", STEPS))
    wx = np.zeros((BLOCKS, GRID_ROWS, GRID_COLS), dtype=np.int16)
    for b, end in enumerate(block_ends):
        code = np.rint(ptype[end][0]).astype(int)
        hazard = np.zeros_like(code)
        hazard[np.isin(code, FREEZING_TYPES)] = 1
        hazard[np.isin(code, ICE_TYPES)] = 2
        storm = np.maximum(cape[end][0], cape[end - BLOCK_HOURS][0]) >= STORM_CAPE
        wx[b] = hazard * 2 + storm
    out["wx"] = wx

    # Ensemble chance of 10 mm or more, per 24-hour window.
    windows = [f"{a}-{b}" for a, b in PROB_WINDOWS]
    prob = read_messages(download_field(client, prob_run, "tpg10", windows, kind="ep", stream="enfo"),
                         windows=True)
    out["p10"] = np.stack([np.rint(prob[w][0]) for w in PROB_WINDOWS]).astype(np.int16)
    assert 0 <= out["p10"].min() and out["p10"].max() <= 100, "probability out of range"
    return out


def find_prob_run(client):
    """The newest ensemble run (00 or 12 UTC) whose last window we need is published."""
    a, b = PROB_WINDOWS[-1]
    return client.latest(type="ep", stream="enfo", param="tpg10", step=f"{a}-{b}")


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

def write_tiles(fields, folder):
    """Save every field for the whole globe as 648 gzip-compressed tile files.

    fields is {name: array of (steps, 721, 1440)}. In each tile, each field
    is a list with one entry per grid point (row by row, west to east), and
    each entry lists that point's values, first block (or window) first.
    """
    folder.mkdir(parents=True)
    for tile_row in range(TILE_ROWS):
        first_row = tile_row * TILE_POINTS
        last_row = first_row + TILE_POINTS
        if tile_row == TILE_ROWS - 1:
            last_row = GRID_ROWS            # the southernmost tiles take row 720 too
        for tile_col in range(TILE_COLS):
            first_col = tile_col * TILE_POINTS
            rows = (last_row - first_row)
            tile = {"rows": rows, "cols": TILE_POINTS, "fields": {}}
            for name, values in fields.items():
                piece = values[:, first_row:last_row, first_col:first_col + TILE_POINTS]
                # Reorder to (row, column, step), then flatten the rows and
                # columns: one entry per grid point, row by row, west to east.
                points = piece.transpose(1, 2, 0).reshape(rows * TILE_POINTS, piece.shape[0])
                tile["fields"][name] = points.tolist()
            name = f"r{tile_row:02d}_c{tile_col:02d}.json.gz"
            with gzip.open(folder / name, "wt", compresslevel=6) as f:
                json.dump(tile, f, separators=(",", ":"))


def write_files(rain, precisions, run, card, prob_run):
    """Save the tiles, the rain pictures and meta.json into site/data/."""
    # Write into a temporary folder first and swap it in at the end, so a
    # failure half way never leaves a mix of old and new files.
    new = DATA.with_name("data.new")
    if new.exists():
        shutil.rmtree(new)
    new.mkdir()

    p = PARAMETERS[RAIN]
    write_tiles({RAIN: rain, **card}, new / "tiles")
    write_pictures(rain, new / RAIN / "pictures", p["colours"])

    run_utc = run.replace(tzinfo=timezone.utc)
    utc = lambda t: t.replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
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
        "tiles": "tiles",
        # The ensemble run the chance of 10 mm comes from (00 or 12 UTC; can
        # be older than the main run), and its 24-hour windows in hours from
        # that run's start.
        "prob_run": utc(prob_run),
        "prob_windows": [list(w) for w in PROB_WINDOWS],
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
            "pictures": f"{RAIN}/pictures",
            "precision": precisions,
            "colours": [{"from": start, "colour": colour} for start, colour in p["colours"]],
        },
            {"id": "cp", "name": "Showery rain", "unit": "mm", "per": "3 hours", "stored_as": "tenths"},
            {"id": "sf", "name": "Snowfall (water equivalent)", "unit": "mm", "per": "3 hours", "stored_as": "tenths"},
            {"id": "tmax", "name": "Highest temperature", "unit": "°C", "per": "3 hours", "stored_as": "whole"},
            {"id": "tmin", "name": "Lowest temperature", "unit": "°C", "per": "3 hours", "stored_as": "whole"},
            {"id": "wx", "name": "Weather code", "per": "3 hours", "stored_as": "hazard * 2 + storm",
             "hazards": ["none", "freezing rain or drizzle", "ice pellets"], "storm_cape": STORM_CAPE},
            {"id": "p10", "name": "Chance of 10 mm or more", "unit": "%", "per": "24 hours",
             "stored_as": "whole", "windows": "prob_windows", "run": "prob_run"},
        ],
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
    with gzip.open(DATA / "tiles" / f"r{tile_row:02d}_c{tile_col:02d}.json.gz", "rt") as f:
        values = json.load(f)["fields"][RAIN][position]
    print(f"\n{name} ({lat}, {lon}): tile r{tile_row:02d}_c{tile_col:02d}, position {position}")
    print("  block  starts (UTC)       rain (mm)")
    for block, tenths in enumerate(values):
        start = run + timedelta(hours=block * BLOCK_HOURS)
        print(f"  {block:>5}  {start:%d %b %H:%M}       {tenths / 10:>6.1f}")


# -------------------------------------------------------------------- main

def main():
    started = time.time()
    client = make_client()

    run = find_newest_run(client)
    print(f"Newest complete run: {run:%d %b %Y, %H:%M} UTC")

    paths = download_steps(client, run)
    size_mb = sum(p.stat().st_size for p in paths.values()) / 1e6
    print(f"Downloaded {len(paths)} steps, {size_mb:.1f} MB")

    rain, precisions = build_rain(paths)
    print(f"Rain worked out for {BLOCKS} blocks. "
          f"Largest value: {rain.max() / 10:.1f} mm in 3 hours. "
          f"Precision: {precisions[0]} mm (first block) to {precisions[-1]} mm (last block)")

    prob_run = find_prob_run(client)
    print(f"Newest ensemble run for the chance of 10 mm: {prob_run:%d %b %Y, %H:%M} UTC")
    card = build_card_fields(client, run, prob_run)
    print("Card fields worked out: showery rain, high and low temperature, weather code, chance of 10 mm")

    write_files(rain, precisions, run, card, prob_run)
    files = list((DATA / "tiles").glob("*.json.gz"))
    out_mb = sum(p.stat().st_size for p in files) / 1e6
    print(f"Saved {len(files)} tiles ({out_mb:.0f} MB compressed) and meta.json in {DATA}")
    pictures = list((DATA / RAIN / "pictures").glob("*.png"))
    picture_kb = sum(p.stat().st_size for p in pictures) / 1e3 / len(pictures)
    print(f"Saved {len(pictures)} rain pictures, about {picture_kb:.0f} KB each")

    print_forecast("Bengaluru", 12.97, 77.59, run)
    print(f"\nDone in {time.time() - started:.0f} seconds.")


if __name__ == "__main__":
    main()
