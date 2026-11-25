# Varsha: rain forecast for any place on Earth

Varsha shows the ECMWF precipitation forecast for any point you pick on a map: today and the next three days, in 3-hour blocks.

**Live app:** https://santoshsrini.github.io/quest-lab-precipitation-forecast/

Built by Santosh Srinivas for the QUEST Lab (IISc) Full Stack AI pre-doctoral selection task, Project 1: fetch precipitation forecasts from ECMWF Open Data, process them, and deploy a web application that presents the forecast.

## Using it

When the app opens, the map is coloured wherever at least 1 mm is forecast in the current 3-hour block. The legend in the bottom left shows the colours and the block's times.

The switch at the top right changes what the colours mean:
- **Precipitation amount** colours by mm per 3 hours (1, 2.5, 5, 10, 20, 50 mm and up).
- **Precipitation type** colours the same areas by what falls: Rain, Rain and snow, Snow, Freezing rain or Ice pellets.

The page remembers your choice in this browser. Search, the summary box and the panel work the same in both.

The map shows one level of place names at a time: continents and oceans when zoomed out, then countries and seas, then cities, then towns (and villages when close in). State names are not shown.

1. Pick a place in one of three ways:
   - click anywhere on the map;
   - click a city or town name, which opens the 4-day panel straight away;
   - type a name in the search bar and choose a suggestion.

   Choosing a continent, country or state only moves the map there, since a forecast is for one point.
2. A white dot marks the place. A small box beside it shows the amount for the current 3-hour block, its type and times (for example "Rain, 5:30 PM to 8:30 PM", or "No rain" under 0.1 mm). It adds "Freezing rain possible" or "Ice pellets possible" when the model shows them at the end of the block.
3. Press **4-day forecast** in the box. A panel opens at the bottom with four day cards: today and the next three days, in the place's own time zone. Each card shows:
   - a condition word and icon: Dry, Mostly dry, Showers, Rain, Storms likely, Snow, or Rain and snow. "Freezing rain at times" or "Ice pellets at times" is added when the model shows them.
   - the day's high and low temperature
   - the day's total rainfall, with an intensity pill using India Meteorological Department daily categories (Very light to Extremely heavy)
   - a ring with the ensemble's chance of 10 mm or more in 24 hours
   - one small line with the hours the total covers and the chance's window, for example "Rain: 24 h from 2:30 AM · 10 mm+: 24 h from 5:30 AM"
4. Below the cards, the selected day's rain is shown as one bar per 3-hour block, coloured like the map (pale blue under 1 mm) and labelled with the time the block starts. The current block is marked "Now". Press another card to see that day.
5. The panel header names the picked coordinates, the grid point the forecast comes from and its distance, the time zone, and both forecast runs used.
6. Press the cross on the box or the panel to clear the selection. The map stays where it is.

Picking another place while the panel is open updates the panel.

## How it works

There is no server. A scheduled script prepares data files and pictures, and the web page reads them directly in the browser.

```
ECMWF Open Data          pipeline/fetch_forecast.py           site/data/                     site/ (web page)
IFS, 0.25° grid      ->  download tp, cp, sf, mx2t3,      ->  meta.json                  ->  reads one tile for
main run 4 a day,        mn2t3, ptype, mucape, tpg10;         648 tiles (.json.gz)           the picked point;
ensemble 00/12 UTC       work out each 3-hour block;          48 rain pictures (.png)        lays the current
                         cut into tiles, draw pictures        48 type pictures (.png)        picture over the map
```

**1. Fetch.** The script finds the newest main (HRES) run that is fully published and downloads, for steps 0 to 144 hours every 3 hours:
- total precipitation (`tp`), its convective part (`cp`) and its snowfall part (`sf`)
- the highest and lowest temperature in each 3-hour block (`mx2t3`, `mn2t3`)
- precipitation type at each step (`ptype`)
- storm energy (`mucape`)

From the newest 00 or 12 UTC ensemble run it downloads the chance of at least 10 mm in 24 hours (`tpg10`): 12 windows of 24 hours, one starting every 12 hours from that run's start (0–24 h up to 132–156 h).

Each download is written under a temporary name and kept only if every step arrived. Requests time out if the connection stalls, and each file is tried three times before the script stops.

**2. Process.** `tp`, `cp` and `sf` are running totals since the start of the run, in metres. The amount in each 3-hour block is one step's total minus the previous step's, converted to mm and stored in tenths of a mm. Amounts smaller than the file's precision count as zero (see Known limits). Temperatures are stored in whole °C. `ptype` and `mucape` become a weather code per block: `hazard * 2 + storm`, where hazard is 1 for freezing rain or drizzle and 2 for ice pellets (from `ptype` at the block's end), and storm is 1 when `mucape` reaches 1000 J/kg at either end of the block.

**3. Tile.** The grid has 721 by 1440 points (0.25°, about 25 km apart). It is cut into 648 tiles of 10° by 10°, each saved as one gzip-compressed JSON file holding every field for every grid point in it. The southernmost tile row has 41 rows, to include the South Pole.

**4. Draw.** The script saves two pictures of the globe per 3-hour block, 48 of each:
- **Rain pictures**, coloured by amount and transparent below 1 mm.
- **Type pictures**, colouring the same areas (1 mm or more) by type:
  - Freezing rain or Ice pellets where `ptype` at the block's end shows it. These take priority.
  - Otherwise by snow share (`sf` ÷ `tp`): Snow when at least 80% is snow, Rain and snow when over 20%, Rain otherwise.

The summary box and the day cards use the same snow-share rule. The pictures' rows are re-sampled to the web map's projection so the colours line up with the coastlines. They are for display only: clicks and numbers come from the tiles.

**5. Publish.** A GitHub Actions job runs the script four times a day (01:00, 08:00, 13:00 and 20:00 UTC), on pushes to `site/`, `pipeline/` or the workflow file, and by hand. It runs the output checks and then publishes the page and the data to GitHub Pages. If any step fails, nothing is published and the site keeps its previous data. The script also writes into a temporary folder and swaps it in only at the end.

**6. Display.** When you pick a point, the page works out the nearest grid point, downloads the one tile that holds it (about 20 to 210 KB compressed), unpacks it in the browser, and reads that point's values. Each number on screen is one the model produced for that grid point, or a sum of them; nothing is interpolated or blended.

The full method, with the arithmetic and a worked example, is in [docs/backend-data-processing.md](docs/backend-data-processing.md). The product decisions and their reasons are in [docs/plan.md](docs/plan.md).

## Running it on your own computer

Needs Python 3.10 or later (the scheduled job uses 3.10).

```
python3 -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt

.venv/bin/python pipeline/fetch_forecast.py            # downloads the forecast, writes site/data/
(cd pipeline && ../.venv/bin/python check_output.py)   # checks the output

cd site && python3 -m http.server 8000                 # then open http://127.0.0.1:8000/
```

The page needs `site/data/` to show forecasts; without it the plain map and search still work.

## Tests

There is no unit-test suite. The only automated check is `pipeline/check_output.py`. The scheduled job runs it after the script, and nothing is published if it fails. It prints PASS or FAIL for each check and exits with an error if any fail. It needs the downloaded files in `pipeline/downloads/` and a network connection.

What it checks:
- **Tiles:** 648 files; 612 with 40 rows and 36 with 41 rows, the 41-row ones exactly tile row 17; 1,038,240 points; 48 blocks per point; `meta.json` agrees with the tiles.
- **Rain values:** none negative or implausibly large; the tiles hold the same total as the full grid rebuilt from the downloads.
- **Point lookup:** for 13 named places (including both poles, both sides of the 180° line and the far corners) and 2,000 random points, the value read through the tiles equals the value at the nearest grid point found by a separate search of the file's own coordinates.
- **Rain pictures:** 48 pictures of 1440 by 1440; at 5,000 random grid points the pixel colour matches the stored rain; the wettest point has its colour; a dry point is transparent.
- **Type pictures:** 48 pictures; the five types in order in `meta.json`; pixel colours match the type rule, written out again separately, at 5,000 random points and at a sample of wet points.
- **Day-card fields:** all seven fields in every tile; one chance per ensemble window; showery rain and snowfall not negative and not above total rain beyond precision; plausible temperatures; high never more than 1 °C below low (rounding); weather codes 0 to 5; chances 0 to 100%; ensemble run at 00 or 12 UTC and not after the main run.
- **Freshness and coverage:** the run used is the newest complete run on the ECMWF server; today plus 3 days lies inside the data and the ensemble windows for every time zone, now and 13 hours from now.

Earlier, by hand (15 Nov 2026, recorded in [docs/backend-data-processing.md](docs/backend-data-processing.md)): for seven cities the 3-hour rain values were compared with Open-Meteo, which republishes the same ECMWF data. 222 of 224 blocks agreed within 0.3 mm, and none differed by more.

## Known limits

- **About 25 km grid, not a point measurement.** Values are for the nearest 0.25° grid point, which can be up to about 18 km from the picked spot. They are the model's value for that grid cell. Single-point values in intense storms can be erratic.
- **3-hour blocks, not hourly.** ECMWF Open Data gives these fields every 3 hours. The app shows those blocks as they are and does not invent hourly values.
- **Blocks sit on UTC boundaries.** In India they run 11:30 PM to 2:30 AM, 2:30 to 5:30 AM and so on. A block belongs to the local day it starts in, so a day can run, for example, from 2:30 AM to 2:30 AM, and the card says "Rain: 24 h from 2:30 AM".
- **Today can be shorter.** A run has no values before its own start, so today begins at the first block the run covers. The card's line then shows fewer hours. The missing blocks are always in the past.
- **Summary box and panel can disagree just after midnight.** The box shows the block containing the present moment. Between 12 AM and the first block of the new day (2:30 AM in India), that block started yesterday and is not in the panel's today.
- **The map legend's times are in the viewer's own time zone,** because the map covers the whole globe. The summary box and the panel use the selected place's time zone.
- **Precision cut-off.** The source files store running totals with limited precision, which gets coarser as totals grow: about 0.06 mm in the first block, and about 0.25 to 0.5 mm by the later days, depending on the run. Amounts below the block's precision are shown as zero, so very light rain may not appear on later days. Each block's precision is listed in `meta.json`.
- **Map colours start at 1 mm.** Lighter rain is not coloured on the map, so the land stays visible. The summary box and the panel still show it. The map pictures are smoothed between grid points, so at the edge of a coloured area the colour can differ slightly from the number in the box.
- **Precipitation type is partly a snapshot.** `ptype` is the type at the end of each 3-hour block only, so the box says "Freezing rain possible" / "Ice pellets possible" and the cards say "at times". Snow versus rain comes from the snowfall share (`sf` ÷ `tp`) over the block or the day.
- **Card conditions are worked out, not forecast directly.** Snow when snowfall is at least 80% of the day's total, Rain and snow when over 20%, Showers when at least half the rain is showery. ECMWF Open Data has no thunderstorm field: "Storms likely" means the day has at least 5 mm, at least half of it showery, and storm energy of at least 1000 J/kg in some block.
- **The chance of 10 mm+ can come from an older run, over a slightly different 24 hours.** ECMWF publishes these probabilities only from its 00 and 12 UTC ensemble runs, in 24-hour windows starting every 12 hours from that run's start. So the ensemble run can be older than the main run, and its window rarely matches the card's day exactly. Each card uses the window with the most overlap with its day; on a tie, the one that starts within the day. The card's line names the window's start (with the weekday if it starts on another day), and the panel names both runs.
- **The forecast is 7 to 14 hours old when you see it.** ECMWF publishes each run about 7 hours after it starts, and a new run arrives every 6 hours.
- **A page left open across a data update can mix old and new data.** The page loads `meta.json` once. After the next update it still uses the old run's times while downloading the new tiles and pictures, until it is reloaded. This is a known bug, not yet fixed.
- **Scheduled updates can pause.** GitHub stops scheduled jobs in a repository with no activity for 60 days. The job can be restarted from the Actions tab.

## Folder layout

```
pipeline/fetch_forecast.py      the data script
pipeline/check_output.py        checks on the script's output
pipeline/requirements.txt       exact Python package versions
site/index.html                 the page
site/style.css                  styles
site/app.js                     map, search, summary box, forecast panel, map pictures
site/data/                      made by the script, not in Git:
  meta.json                       runs, block times, grid, colours, precision
  tiles/r00_c00.json.gz ...       648 tiles with every field
  tp/pictures/b00.png ...         48 rain pictures
  type/pictures/b00.png ...       48 precipitation type pictures
.github/workflows/update.yml    the scheduled job and Pages deploy
docs/plan.md                    plan and decision log
docs/backend-data-processing.md the data method and check results
```

## What it is built with

- **Data script:** Python 3.10 with `ecmwf-opendata` 0.3.35, `xarray` 2025.6.1, `cfgrib` 0.9.15.1, `eccodes` 2.50.1, `numpy` 2.2.6, `Pillow` 12.3.0 and `requests` 2.34.2.
- **Page:** plain HTML, CSS and JavaScript, with no framework and no build step.
- **Map:** MapLibre GL JS 4.7.1, drawing OpenFreeMap's dark style recoloured to grey.
- **Time zones:** tz-lookup 6.1.25, to find a place's time zone from its coordinates.
- **Place search and names:** Photon.
- **Hosting and schedule:** GitHub Pages and GitHub Actions.

## Data and credits

- Forecast: [ECMWF Open Data](https://www.ecmwf.int/en/forecasts/datasets/open-data), IFS model (0.25° open data), licensed under CC BY 4.0. This app is not endorsed by ECMWF.
- Map data: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. Map style and tiles: [OpenFreeMap](https://openfreemap.org/), © OpenMapTiles.
- Place search: [Photon](https://photon.komoot.io/) by Komoot.
- Map library: [MapLibre GL JS](https://maplibre.org/).

The layout takes inspiration from windy.com. No code, styles or branding from it are used.
