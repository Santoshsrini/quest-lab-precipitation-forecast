# Varsha: Back End Data Processing Plan

*Started 15 Nov 2026. This document goes deeper than section 5 of `plan.md`. Where the two differ, this one is newer.*

## Purpose

This document describes how Varsha gets rainfall forecasts from ECMWF and turns them into files the web page can read. It covers only the back end: one Python script and the schedule that runs it. It also states how the page reads those files, because the script and the page must agree on the layout.

## In short

- **In:** the newest ECMWF IFS forecast, total precipitation only, for the whole globe, for the next 96 hours (4 days).
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
| The step-0 `tp` field is zero everywhere | Assumed | A total over zero hours must be zero. Confirmed on the first download. |
| `tp` is in metres | Assumed, with good grounds | The header uses ECMWF's own code for total precipitation (category 1, number 193), which ECMWF defines in metres. The header does not state units. Confirmed on the first download by the size of the values: 4 mm of rain appears as about 0.004. |
| The `ecmwf-opendata` package can download `tp` alone, without the rest of the file | Assumed | The package's documented behaviour. Confirmed on the first download by the size of what arrives. |
| How many days a run stays on the server | Not known | Checked when building |

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
| Position in a tile's `rain` list | 0 | 1599 (1639 in the southernmost tiles) | 1,600 or 1,640 |
| Block | 0 (the first 3 hours of the run) | 31 | 32 |

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

### Step 2. Download `tp` for steps 0 to 96

33 steps, one every 3 hours: step 0, then steps 3 to 96. About 10 MB in total.

*Why 96 hours:* the page can then show up to 4 days. A run is 7 to 14 hours old while in use, so 96 hours of data gives at least 3 full days ahead of the present moment, and leaves a margin if an update is missed.

### Step 3. Read each step into a grid of numbers

Each step becomes a table of 721 rows by 1440 columns, one number per grid point.

### Step 4. Turn running totals into rain per block

One rule for every block:

**rain in a block = `tp` at the block's end step − `tp` at the step before**

- Block 0 (hours 0 to 3) = tp(3) − tp(0). Since tp(0) is zero, this equals tp(3).
- Block 1 (hours 3 to 6) = tp(6) − tp(3).
- And so on, up to block 31 (hours 93 to 96) = tp(96) − tp(93).

Then:

- Multiply by 1000 to go from metres to mm.
- Set tiny negative results to zero. They can arise from how the file stores numbers.
- Round to 0.1 mm.

### Step 5. Cut the grid into tiles

10° by 10° tiles: 36 across and 18 down, 648 in all. Tile row t holds grid rows t × 40 to t × 40 + 39, and tile row 17 also holds grid row 720. Tile column u holds grid columns u × 40 to u × 40 + 39.

*Why tiles:* the page needs one point at a time. One tile is about 130 KB; the whole globe in one file would be about 85 MB.

### Step 6. Save each tile as a JSON file

- **File name:** `site/data/tiles/r07_c25.json` for tile row 7, tile column 25.
- **Values:** whole numbers of tenths of a mm, so 4.2 mm is stored as 42.
- **Order of the `rain` list:** row by row. All of the tile's first row from west to east, then its second row, and so on. Each entry is one grid point's 32 block values, block 0 first.

Sketch of one file:

```
{
  "rows": 40, "cols": 40, "blocks": 32,
  "rain": [
    [0, 0, 12, 42, 5, 0, ...],     32 numbers for position 0 (row 0, column 0 of the tile)
    [0, 0, 10, 38, 7, 0, ...],     32 numbers for position 1 (row 0, column 1)
    ...                            1600 positions in all (1640 where "rows" is 41)
  ]
}
```

### Step 7. Save the information file, `meta.json`

All times are in UTC.

```
{
  "model": "ECMWF IFS",
  "run": "2026-11-15T00:00Z",
  "block_hours": 3,
  "blocks": 32,
  "first_block_start": "2026-11-15T00:00Z",
  "grid": { "north": 90, "west": -180, "spacing": 0.25, "rows": 721, "cols": 1440 },
  "tile_degrees": 10
}
```

### Step 8. Publish

The files go into `site/data/` beside the web page, and the scheduled job publishes the whole `site/` folder.

## How the page finds a point's forecast

1. **Grid row** = (90 − latitude) ÷ 0.25, rounded to the nearest whole number. Result: 0 to 720.
2. **Grid column** = (longitude + 180) ÷ 0.25, rounded to the nearest whole number. If the result is 1440, use 0, because that is the same line. Result: 0 to 1439.
3. **Tile row** = grid row ÷ 40, rounded down, but never more than 17. **Tile column** = grid column ÷ 40, rounded down.
4. **Row inside the tile** = grid row − tile row × 40. **Column inside the tile** = grid column − tile column × 40.
5. Download that tile.
6. **Position in the `rain` list** = row inside the tile × 40 + column inside the tile. The entry there is the point's 32 block values. The multiplier is the tile's number of columns, which is always 40, including in the 41-row tiles.
7. Using the run's start time from `meta.json`, find the block containing the present moment, and show it with the blocks after it.

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

The page downloads `r07_c25.json`, which covers 20°N to 10.25°N and 70°E to 79.75°E, and reads entry 1150 of its `rain` list. The grid point used is 13.00°N, 77.50°E, about 10 km from the picked spot.

## Local time

The panel shows times in the selected place's local time. This changes nothing in the back end.

- **Back end:** stores UTC only. `meta.json` holds the run's start time, and each block is a fixed 3 hours after the one before.
- **Page:** when the user picks a point, the page works out that point's time zone from its latitude and longitude and shows each block's time in that zone.

The back end cannot do the conversion, because local time depends on which point is picked. Storing UTC once also lets one set of files serve every time zone.

Two consequences for the page:

- Blocks sit on UTC boundaries (00:00, 03:00, 06:00 UTC and so on). In a zone with a half-hour offset, such as India, bars read "2:30 PM to 5:30 PM".
- In those zones local midnight falls inside a block (in India, the block from 11:30 PM to 2:30 AM). The day divider in the panel goes before the first block that starts on the new local day.

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

## Questions raised and settled

| Date | Question | Outcome |
|---|---|---|
| 15 Nov 2026 | Store 4 days, not 3? | Yes. 96 hours, 32 blocks. |
| 15 Nov 2026 | Does the grid's point count equal 648 tiles × points per tile? | Not on its own: the grid has one extra row, the South Pole. The 36 southernmost tiles take it and have 41 rows. See "How the grid divides into tiles". |
| 15 Nov 2026 | Is rain in the first block tp(3h) − tp(0h)? | Yes. tp(0h) is zero, so it equals tp(3h). One rule is used for all blocks. |
| 15 Nov 2026 | Do the 41-row tiles change the lookup? | Yes, for the South Pole row. The lookup now limits the tile row to 17. A second edge at the 180° line was fixed at the same time. |
| 15 Nov 2026 | Does showing local time change the back end? | No. The back end stores UTC; the page converts. |
| 15 Nov 2026 | How is the grid point found inside a tile? | Position = row inside the tile × 40 + column inside the tile. |
| 15 Nov 2026 | Counting from 0 or 1? | From 0, everywhere. |
