# Varsha: Back End Data Processing Plan

*Started 15 Nov 2026; updated 23 Nov 2026 for 144 hours, the per-parameter layout and local time. This document goes deeper than section 5 of `plan.md`. Where the two differ, this one is newer. The "Results of the first full run" section records the 15 Nov run with 96 hours, and is kept as it was.*

## Purpose

This document describes how Varsha gets rainfall forecasts from ECMWF and turns them into files the web page can read. It covers only the back end: one Python script and the schedule that runs it. It also states how the page reads those files, because the script and the page must agree on the layout.

## In short

- **In:** the newest ECMWF IFS forecast, total precipitation only, for the whole globe, for 144 hours (6 days) from the run's start.
- **Out:** 648 small JSON files (one per 10° by 10° area of the globe) and one information file, saved beside the web page.
- **How often:** four times a day, after each new ECMWF forecast is published.

## Terms used here

| Term | Meaning |
|---|---|
| Run | One forecast made by ECMWF. A run is named by its start time, for example "15 Nov, 00 UTC". |
| Step | How many hours after the run's start a value applies to. Step 3 means 3 hours after the start. |
| `tp` | Total precipitation: ECMWF's name for rain plus snow and other precipitation reaching the ground, measured as depth of water. |
| Grid | The regular net of points over the globe for which ECMWF gives values, one point every 0.25° of latitude and longitude. |
| Block | One 3-hour period, the time between two neighbouring steps. |
| Tile | One 10° by 10° piece of the grid, saved as one file. |

## What is checked and what is assumed

Each claim this plan rests on, and how sure we are of it. "File header" means the description at the start of the `tp` field, read directly from the ECMWF server on 15 Nov 2026 for the 00 UTC run.

| Claim | Status | Source |
|---|---|---|
| Four runs a day (00, 06, 12, 18 UTC), all under the stream name `oper` | Checked | Live ECMWF server, 14 Nov 2026 |
| A run appears about 6.5 to 7.5 hours after its start | Checked for two runs | File dates on the server, 14 Nov 2026 |
| Steps exist every 3 hours up to 144 hours for every run; no 1-hour step | Checked | Live server: step 1 missing, steps 3 to 144 present, step 147 missing |
| Each step's file contains a field named `tp`, about 250 to 400 KB | Checked | The step's index file on the server |
| The grid has 1,038,240 points: 1440 columns by 721 rows, 0.25° apart | Checked | File header |
| Rows run north to south, from 90°N to 90°S | Checked | File header: first latitude 90, last −90 |
| Columns run eastward from the 180° line, ending at 179.75°E | Checked | File header: first longitude 180 (the same line as −180), last 179.75 |
| `tp` at a step is the total since the run's start | Checked | File header: accumulation from hour 0, over 3 hours for step 3, 6 hours for step 6, 96 hours for step 96 |
| The step-0 file contains a `tp` field | Checked | The step-0 index file |
| The step-0 `tp` field is zero everywhere | Checked | Downloaded data, 15 Nov 2026. The script stops if this is ever not so. |
| `tp` is in metres | Checked | The file reader reports the unit as "m". The global average of each 3-hour block is about 0.3 mm, which matches the Earth's known average rainfall of roughly 2.5 to 3 mm a day. A unit ten times off would give an impossible average. |
| The `ecmwf-opendata` package can download `tp` alone, without the rest of the file | Checked | Each step arrives as 235 to 400 KB; 33 steps total 11.8 MB |
| The file stores values with limited precision, which gets coarser at later steps | Found on the first download | See "Precision of the data" |
| How many days a run stays on the server | Not known | Not needed by the script, which always takes the newest run |

## Counting

Everything is counted from 0, in both the script and the page.

| What | Runs from | To | How many |
|---|---|---|---|
| Grid row | 0 (90°N) | 720 (90°S) | 721 |
| Grid column | 0 (180°W) | 1439 (179.75°E) | 1440 |
| Tile row | 0 (northernmost) | 17 (southernmost) | 18 |
| Tile column | 0 (westernmost) | 35 (easternmost) | 36 |
| Row inside a tile | 0 | 39 (40 in the southernmost tiles) | 40 or 41 |
| Column inside a tile | 0 | 39 | 40 |
| Position in a tile's `values` list | 0 | 1599 (1639 in the southernmost tiles) | 1,600 or 1,640 |
| Block | 0 (the first 3 hours of the run) | 47 | 48 |

Reason: Python and JavaScript both count list entries from 0, and the formulas then need no adding or subtracting of 1. For example, the latitude of a grid row is 90 − row × 0.25, so row 0 is exactly 90°N.

## How the grid divides into tiles

The grid has 721 rows, not 720, because it includes both poles. So 648 tiles of 40 by 40 points do not cover it exactly:

| | Points |
|---|---|
| The grid: 1440 × 721 | 1,038,240 |
| 648 tiles × 1,600 points | 1,036,800 |
| Left over: one row of 1440 points | 1,440 |

The row left over is the South Pole row (grid row 720). It is added to the 36 southernmost tiles, which therefore have 41 rows:

- 612 tiles × 1,600 points = 979,200
- 36 tiles × 1,640 points = 59,040
- Total = 1,038,240, the same as the grid.

## The steps

### Step 1. Find the newest run

Ask the server for the most recent run that has `tp` available for every step we need. If the newest run is only partly published, use the one before it.

*Why:* a run is published step by step, so the very newest may be incomplete.

### Step 2. Download `tp` for steps 0 to 144

49 steps, one every 3 hours: step 0, then steps 3 to 144. About 24 MB in total.

*Why 144 hours (changed from 96 on 23 Nov):* 144 is the last 3-hourly step of every ECMWF run (checked for all four runs of 22 Nov). The page shows the selected place's today plus 3 days, which ends at most 96 hours from the present moment. A run is usually up to about 13 hours old while in use, and older if a scheduled job fails. 144 hours covers all of that without a fine-tuned number. The script uses the newest run that already has step 144.

### Step 3. Read each step into a grid of numbers

Each step becomes a table of 721 rows by 1440 columns, one number per grid point.

### Step 4. Turn running totals into rain per block

One rule for every block:

**rain in a block = `tp` at the block's end step − `tp` at the step before**

- Block 0 (hours 0 to 3) = tp(3) − tp(0). Since tp(0) is zero, this equals tp(3).
- Block 1 (hours 3 to 6) = tp(6) − tp(3).
- And so on, up to block 47 (hours 141 to 144) = tp(144) − tp(141).

Then:

- Multiply by 1000 to go from metres to mm.
- Set to zero any amount smaller than the file's precision for that block (see "Precision of the data"). This also removes the tiny negative results.
- Round to 0.1 mm.

### Precision of the data

Found on the first download, 15 Nov 2026. The plan before that did not know of it.

The file stores each value in fixed steps, using 12 bits per value. Because `tp` is a running total that keeps growing, the steps get coarser the further into the forecast one goes:

| Step | Smallest difference the file can hold |
|---|---|
| 3 hours | 0.06 mm |
| 6 hours | 0.12 mm |
| 93 and 96 hours | 0.49 mm |

These figures are for the 15 Nov 00 UTC run. They change from run to run, because they depend on the largest total anywhere on the globe.

Two effects:

- **False tiny amounts.** Where the precision changes between two steps, subtracting them gives small false results. Between steps 3 and 6, 2.5% of grid points showed the total falling by 0.06 mm, and about 100,000 showed a rise of exactly 0.06 mm.
- **Light rain is invisible at long range.** In the block from 93 to 96 hours, every point is either 0 or at least 0.49 mm.

**The rule (agreed with Santosh on 15 Nov):** a block's precision is the coarser of the precisions of its two steps. Any amount smaller than that cannot be told apart from no rain and is stored as zero. Each block's precision is recorded in `meta.json`, in the rain parameter's `precision` list, so the page can state it.

Values are still stored to 0.1 mm, but beyond the first day they are not accurate to 0.1 mm. Moderate and heavy rain are unaffected.

### Step 5. Cut the grid into tiles

10° by 10° tiles: 36 across and 18 down, 648 in all. Tile row t holds grid rows t × 40 to t × 40 + 39, and tile row 17 also holds grid row 720. Tile column u holds grid columns u × 40 to u × 40 + 39.

*Why tiles:* the page needs one point at a time. One tile is about 160 KB before compression (5 to 15 KB as sent); the whole globe in one file would be about 105 MB.

### Step 6. Save each tile as a JSON file

- **File name:** `site/data/tiles/r07_c25.json.gz` for tile row 7, tile column 25 (from 24 Nov; see "Day-card fields"). Rain pictures stay in `site/data/tp/pictures/`.
- **Values:** whole numbers of tenths of a mm, so 4.2 mm is stored as 42.
- **Order of the `values` list:** row by row. All of the tile's first row from west to east, then its second row, and so on. Each entry is one grid point's 48 block values, block 0 first.

Sketch of one file:

```
{
  "rows": 40, "cols": 40, "blocks": 48,
  "values": [
    [0, 0, 12, 42, 5, 0, ...],     48 numbers for position 0 (row 0, column 0 of the tile)
    [0, 0, 10, 38, 7, 0, ...],     48 numbers for position 1 (row 0, column 1)
    ...                            1600 positions in all (1640 where "rows" is 41)
  ]
}
```

### Step 7. Save the information file, `meta.json`

All times are in UTC.

```
{
  "model": "ECMWF IFS",
  "source": "ECMWF Open Data, licensed CC BY 4.0",
  "run": "2026-11-23T06:00Z",
  "made": "2026-11-23T13:20Z",
  "block_hours": 3,
  "blocks": 48,
  "first_block_start": "2026-11-23T06:00Z",
  "grid": { "north": 90, "west": -180, "spacing": 0.25, "rows": 721, "cols": 1440 },
  "tile_degrees": 10,
  "tile_points": 40,
  "pictures": { "north": 85.05, "south": -85.05, "west": -180.125, "east": 179.875 },
  "parameters": [
    {
      "id": "tp", "name": "Rain", "unit": "mm", "per": "3 hours", "stored_as": "tenths",
      "tiles": "tp/tiles", "pictures": "tp/pictures",
      "precision": [0.0305, ... 0.2441],          one number per block
      "colours": [{ "from": 1, "colour": "#8cc4ff" }, ...]
    }
  ]
}
```

### Step 8. Publish

The files go into `site/data/` beside the web page, and the scheduled job publishes the whole `site/` folder.

## Day-card fields (added 24 Nov 2026)

The bottom panel's day cards need more than rain. The script downloads these too, from the same main run unless noted, and stores them in the same tiles.

| Field in the tile | ECMWF field | Per | Stored as |
|---|---|---|---|
| `cp` | `cp`, convective (showery) precipitation, a running total like `tp` | 3-hour block | tenths of a mm, worked out by the same subtraction and precision rule as rain |
| `sf` | `sf`, snowfall as depth of water, a running total like `tp`; part of `tp` | 3-hour block | tenths of a mm, same subtraction and precision rule |
| `tmax` | `mx2t3`, highest 2 m temperature in the last 3 hours | 3-hour block | whole °C |
| `tmin` | `mn2t3`, lowest 2 m temperature in the last 3 hours | 3-hour block | whole °C |
| `wx` | `ptype` at the block's end, and `mucape` at either end | 3-hour block | hazard × 2 + storm. Hazard: 0 none, 1 freezing rain or drizzle (codes 3, 12), 2 ice pellets (code 8). Storm: 1 if storm energy reaches 1000 J/kg. The ECMWF `ptype` download is unchanged; the script only groups its codes |
| `p10` | ensemble `tpg10`, chance of at least 10 mm in 24 hours | 24-hour window | whole percent. 12 windows from the ensemble run's start: 0–24, 12–36, … 132–156 h |

**The ensemble run** is the newest 00 or 12 UTC run whose last needed window is published. It can be 6 hours older than the main run. `meta.json` records it as `prob_run` with its windows as `prob_windows`.

**Tiles** now hold every field and are gzip-compressed (`site/data/tiles/r07_c25.json.gz`): `{"rows", "cols", "fields": {"tp": [...], "cp": [...], "sf": [...], "tmax": [...], "tmin": [...], "wx": [...], "p10": [...]}}`. Each field lists one entry per grid point in the same order as before. The page unpacks a tile with the browser's built-in `DecompressionStream`. All 648 tiles total about 60 MB.

**How the page uses them for a card** (for the blocks in the place's local day):

- Total rain: sum of `tp`. Intensity from the total, India Meteorological Department categories: Very light under 2.5 mm, Light to 15.5, Moderate to 64.4, Heavy to 115.5, Very heavy to 204.4, then Extremely heavy.
- Snow share: sum of `sf` ÷ sum of `tp`. Showery share: sum of `cp` ÷ sum of `tp`. Both use amounts over the whole day, not snapshots.
- Condition, in order: under 0.2 mm Dry; under 1 mm Mostly dry; snow share at least 80% → Snow; snow share over 20% → Rain and snow; any storm block, at least half showery and at least 5 mm → Thunderstorms likely; at least half showery → Showers; otherwise Rain.
- Extra line: "Freezing rain at times" or "Ice pellets at times" if any block with at least 0.1 mm shows that `ptype` at its end. These are snapshots, so they say "at times".
- High and low: highest `tmax` and lowest `tmin`.
- Chance of 10 mm+: the `p10` window that overlaps the day the most. The day is the span of its blocks, e.g. 1 AM to 1 AM at UTC+7.
  - On a tie, the window that starts within the day wins.
  - It is shown with its start time, plus the weekday if that is another day.
  - The card's total line reads "24 h from 1 AM" (fewer hours for a shorter today).

**Checks added:** all seven fields in every tile; showery rain and snowfall not negative and not above total rain beyond precision; temperatures plausible; high not more than 1 °C below low (rounding of two separately stored fields, seen in 0.19% of blocks); weather codes 0 to 5; chances 0 to 100%; ensemble run is 00 or 12 UTC and not newer than the main run; today plus 3 days lies inside the ensemble windows for every time zone.

**Downloads** are written to a temporary name and kept only if every step arrived, after a download that stopped half way was nearly reused on 24 Nov.

## How the page finds a point's forecast

"Rounded to the nearest whole number" below means: add 0.5, then round down. The script and the page both do it this way, so that a value exactly half way between two grid points goes the same way in both.

1. **Grid row** = (90 − latitude) ÷ 0.25, rounded to the nearest whole number. Result: 0 to 720.
2. **Grid column** = (longitude + 180) ÷ 0.25, rounded to the nearest whole number. If the result is 1440, use 0, because that is the same line. Result: 0 to 1439.
3. **Tile row** = grid row ÷ 40, rounded down, but never more than 17. **Tile column** = grid column ÷ 40, rounded down.
4. **Row inside the tile** = grid row − tile row × 40. **Column inside the tile** = grid column − tile column × 40.
5. Download that tile.
6. **Position in the `values` list** = row inside the tile × 40 + column inside the tile. The entry there is the point's 48 block values. The multiplier is the tile's number of columns, which is always 40, including in the 41-row tiles.
7. Using the run's start time from `meta.json`, work out each block's start time in the place's local time. See "Local time" for which blocks are shown.

The value shown is the forecast for the grid point nearest to the picked spot. There is no blending between neighbouring points.

### Two edge cases

- **The South Pole row.** For grid row 720, "grid row ÷ 40, rounded down" gives 18, and tile rows stop at 17. The "never more than 17" in step 3 handles this, and the row inside the tile is then 40. Only picks within 0.125° of the South Pole are affected.
- **Just west of the 180° line.** A pick within 0.125° west of 180°E rounds to column 1440, and columns stop at 1439. Step 2 turns it into column 0.

### Worked example: Bengaluru (12.97°N, 77.59°E)

| Step | Calculation | Result |
|---|---|---|
| Grid row | (90 − 12.97) ÷ 0.25 = 308.12 | 308, which is latitude 13.00°N |
| Grid column | (77.59 + 180) ÷ 0.25 = 1030.36 | 1030, which is longitude 77.50°E |
| Tile row | 308 ÷ 40 = 7.7, rounded down | 7 |
| Tile column | 1030 ÷ 40 = 25.75, rounded down | 25 |
| Row inside the tile | 308 − 7 × 40 | 28 |
| Column inside the tile | 1030 − 25 × 40 | 30 |
| Position in the list | 28 × 40 + 30 | 1150 |

The page downloads `r07_c25.json`, which covers 20°N to 10.25°N and 70°E to 79.75°E, and reads entry 1150 of its `values` list. The grid point used is 13.00°N, 77.50°E, about 10 km from the picked spot.

## Precipitation type pictures (added 24 Nov 2026)

For the second map ("Rain type"), the script saves `site/data/type/pictures/b00.png … b47.png`. They have the same size, projection and area as the rain pictures, and the same 1 mm threshold. Each pixel's colour number is worked out from the tile values of that block:

| Colour number | Type | Rule, checked in this order |
|---|---|---|
| 0 | none (transparent) | `tp` under 1 mm |
| 4 | Freezing rain | `wx` hazard 1 (`ptype` 3 or 12 at the block's end) |
| 5 | Ice pellets | `wx` hazard 2 (`ptype` 8 at the block's end) |
| 3 | Snow | `sf` at least 80% of `tp` |
| 2 | Rain and snow | `sf` over 20% of `tp` |
| 1 | Rain | otherwise |

`meta.json` lists the types and their colours under the parameter `type`, so the page's legend always matches the pictures.

**Check:** `check_output.py` reads `tp`, `sf` and `wx` from the tiles for 5,000 random points, plus a sample of wet points so every type is tested. It works out the type with its own copy of the rule and compares it with the picture's pixel.

## Local time

The panel shows times in the selected place's local time. This changes nothing in the back end.

- **Back end:** stores UTC only. `meta.json` holds the run's start time, and each block is a fixed 3 hours after the one before.
- **Page:** when the user picks a point, the page works out that point's time zone from its latitude and longitude and shows each block's time in that zone.

The back end cannot do the conversion, because local time depends on which point is picked. Storing UTC once also lets one set of files serve every time zone.

**Which blocks the panel shows (from 23 Nov):**

1. Use the latest forecast run.
2. Find the selected place's time zone from its latitude and longitude (the `tz-lookup` library).
3. The window is the place's local 12 AM today to 12 AM four days later: today plus 3 days.
4. Show every block that starts inside the window. A block belongs to the day it starts in.
5. Blocks before the run's start are not in the data. They are always in the past, because a run is published about 7 hours after it starts, so nothing in the future is missing. Today can therefore have fewer than 8 blocks.

Consequences:

- Blocks sit on UTC boundaries (00:00, 03:00, 06:00 UTC and so on). In a zone with a half-hour offset, such as India, bars read "2:30 PM to 5:30 PM", and each day runs from the 2:30 AM block to the 11:30 PM block. No block from the previous day appears.
- The map's colour legend covers the whole globe, so its times stay in the viewer's own time zone.

`check_output.py` confirms that, for every offset from UTC−12 to UTC+14, the window lies inside the stored data now and 13 hours from now.

## Schedule

GitHub Actions runs the script at about 01:00, 08:00, 13:00 and 20:00 UTC, shortly after each run normally appears.

## If something fails

- The script stops without publishing, so the site keeps its previous data.
- The page always shows which run it is using and when it was issued.

## Checks when building

**On the data**

- The grid has 721 by 1440 points.
- The step-0 `tp` field is zero everywhere.
- Totals never fall from one step to the next, apart from tiny rounding differences.
- No rain value is negative, and none is implausibly large.
- Values are the size expected for metres: a few thousandths for a few mm of rain.
- The blocks for a few known places agree with the ECMWF forecast on a public weather site.

**On the tiles**

- 648 files are written: 612 with 40 rows and 36 with 41 rows.
- The points in all tiles add up to 1,038,240.

**On the lookup**

- For a few points, the value the page reads equals the value the script printed for the same grid point.
- The lookup gives a valid tile and position at 90°N, at 90°S, at 180°W, just west of 180°E, and at an ordinary point.

## Results of the first full run (15 Nov 2026)

The script is `pipeline/fetch_forecast.py` and the checks are `pipeline/check_output.py`. Both were run on the laptop against the 15 Nov 00 UTC run.

**The run**

- Time taken: 52 seconds.
- Download: 33 steps, 11.8 MB.
- Output: 648 tiles of 106 to 137 KB each, 69 MB in all, plus `meta.json`.
- Largest value: 307.6 mm in one 3-hour block.

**The checks: all 24 passed**

- Tile files: 648 in all, 612 with 40 rows and 36 with 41 rows; the 41-row tiles are exactly tile row 17; points add up to 1,038,240; every point has 32 blocks.
- Values: none negative; the tiles hold the same total rain as the full grid.
- Lookup: for 13 named places and 2,000 random points, the value read from the tiles equals the value at the nearest grid point, found by a separate method that searches the file's own latitude and longitude lists. The named places include both poles, both sides of the 180° line and the four far corners.

**Comparison with an independent source**

Open-Meteo republishes the same ECMWF IFS 0.25° data. For each place, its hourly values were added up into our 3-hour blocks.

| Place | Blocks compared | Blocks within 0.3 mm | Largest difference | 4-day total, ours and theirs |
|---|---|---|---|---|
| Bengaluru | 32 | 32 | 0.0 mm | 0.0 and 0.0 mm |
| Chennai | 32 | 32 | 0.1 mm | 25.3 and 25.5 mm |
| Colombo | 32 | 31 | 0.3 mm | 6.9 and 7.5 mm |
| Trincomalee | 32 | 32 | 0.1 mm | 11.7 and 11.7 mm |
| Singapore | 32 | 32 | 0.1 mm | 69.7 and 69.6 mm |
| London | 32 | 32 | 0.1 mm | 10.0 and 10.5 mm |
| Sydney | 32 | 31 | 0.3 mm | 6.9 and 7.2 mm |

Our totals are slightly lower where rain is very light, because amounts below the file's precision are stored as zero.

### Open point: one value that disagrees with Windy

At 9.00°N, 83.75°E, in a storm east of Sri Lanka, our data gives 195.2 mm for 00 to 03 UTC on 15 Nov. Santosh read about 19 mm for that spot on windy.com.

What is established:

- The raw file, read a second way with no code of ours, holds 0.195190 m at that point for hours 0 to 3.
- Open-Meteo gives 195.3 mm for the same point and hours, and agrees with us to 0.1 mm on the next three blocks.
- Santosh ran separate code of his own in Colab and also got 195 mm at this point.
- So the script reproduces what the ECMWF 00 UTC open data contains. The difference from Windy is not in our fetching or conversion.

What is not established: why Windy differs. Possible reasons, none confirmed:

- **A different time window.** The run before (14 Nov 18 UTC) gives 58.6 mm at this point for 21 to 00 UTC, which is 19.5 mm an hour.
- **A different run.** That earlier run gives 83.6 mm for 00 to 03 UTC, less than half of the newer run's figure.
- **A different grid.** Windy uses ECMWF's native 9 km grid, a licensed product; the open data is the same forecast re-sampled to 25 km. Neighbouring points 25 km apart range from 11 to 195 mm in this block. On its own this is a weak explanation, because re-sampling to a coarser grid normally lowers peaks, not raises them.

A single grid point in a storm core is erratic. Only 9 points on the globe exceed 100 mm in this block. Santosh is inspecting the Windy value by hand.

## Questions raised and settled

| Date | Question | Outcome |
|---|---|---|
| 15 Nov 2026 | Store 4 days, not 3? | Yes. 96 hours, 32 blocks. |
| 15 Nov 2026 | Does the grid's point count equal 648 tiles × points per tile? | Not on its own: the grid has one extra row, the South Pole. The 36 southernmost tiles take it and have 41 rows. See "How the grid divides into tiles". |
| 15 Nov 2026 | Is rain in the first block tp(3h) − tp(0h)? | Yes. tp(0h) is zero, so it equals tp(3h). One rule is used for all blocks. |
| 15 Nov 2026 | Do the 41-row tiles change the lookup? | Yes, for the South Pole row. The lookup now limits the tile row to 17. A second edge at the 180° line was fixed at the same time. |
| 15 Nov 2026 | Does showing local time change the back end? | No. The back end stores UTC; the page converts. |
| 15 Nov 2026 | How is the grid point found inside a tile? | Position = row inside the tile × 40 + column inside the tile. |
| 23 Nov 2026 | Store 144 hours, not 96? | Yes. 144 is the last 3-hourly step of every run, and it covers today plus 3 days everywhere even if jobs fail. 48 blocks. |
| 23 Nov 2026 | Times in the viewer's or the place's time zone? | The place's. The panel shows the place's today plus 3 days; a block belongs to the day it starts in. |
| 23 Nov 2026 | Is the latest run used? | Yes. `check_output.py` asks ECMWF independently for its newest complete run and compares. |
| 15 Nov 2026 | Counting from 0 or 1? | From 0, everywhere. |
| 15 Nov 2026 | How to treat amounts smaller than the file's precision? | Store them as zero, and record each block's precision in `meta.json`. |
| 15 Nov 2026 | Is 195 mm at 9°N, 83.75°E a processing error? | No. Two readings of the raw file and an independent service give the same value. Why Windy shows about 19 mm is not established. |
