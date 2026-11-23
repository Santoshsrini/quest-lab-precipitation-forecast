# Varsha: rain forecast for any place on Earth

Varsha shows the ECMWF rain forecast for any point you pick on a map: today and the next three days, in 3-hour blocks.

**Live app:** https://santoshsrini.github.io/quest-lab-precipitation-forecast/

Built by Santosh Srinivas for the QUEST Lab (IISc) Full Stack AI pre-doctoral selection task, Project 1: fetch precipitation forecasts from ECMWF Open Data, process them, and deploy a web application that presents the forecast.

## Using it

When the app opens, the map is coloured wherever at least 1 mm of rain is forecast in the current 3-hour block. The legend in the bottom left shows the colour for each amount and the block's times.

1. Pick a place by clicking the map, or by typing a name in the search bar and choosing a suggestion.
2. A white dot marks the place. A small box beside it shows the rain forecast for the current 3-hour block.
3. Press **4-day forecast** in the box. A panel opens at the bottom with one bar per 3-hour block for today and the next three days. The amount in mm is above each bar and the start time below it.
4. Press the cross on the box or the panel to clear the selection. The map stays where it is.

Picking another place while the panel is open updates the panel.

## How it works

There is no server. A scheduled script prepares small data files, and the web page reads them directly in the browser.

```
ECMWF Open Data          pipeline/fetch_forecast.py          site/data/                 site/ (web page)
IFS forecast, 0.25°  ->  download total precipitation,   ->  meta.json              ->  reads one tile for
4 runs a day             work out rain per 3-hour block,     648 tile files (JSON)      the picked point
                         cut the globe into tiles
```

**1. Fetch.** The script finds the newest fully published run of the ECMWF IFS forecast and downloads one field, total precipitation (`tp`), for steps 0 to 144 hours. That is 49 small files, about 24 MB.

**2. Process.** `tp` is a running total since the start of the run, in metres. The rain in each 3-hour block is one step's total minus the previous step's, converted to mm.

**3. Tile.** The grid has 721 by 1440 points (about 25 km apart). It is cut into 648 tiles of 10° by 10°, each saved as one JSON file holding 48 values for every grid point in it.

**3b. Draw.** The script also saves one small picture of the globe per 3-hour block, coloured by rain amount and transparent below 1 mm. Its rows are re-sampled to the web map's projection so the rain lines up with the coastlines. The page lays the picture for the current block over the map. The picture is for display only: clicks and forecast numbers still come from the tiles.

**4. Publish.** A GitHub Actions job runs the script four times a day, runs the output checks, and publishes the page and the data to GitHub Pages. If any step fails, nothing is published and the site keeps its previous data.

**5. Display.** When you pick a point, the page works out the nearest grid point, downloads the one tile that holds it (3 to 10 KB compressed), and reads that point's values. Each number on screen is one the model produced for that grid point; nothing is blended or estimated.

The full method, with the arithmetic and a worked example, is in [docs/backend-data-processing.md](docs/backend-data-processing.md). The product decisions and their reasons are in [docs/plan.md](docs/plan.md).

## How the numbers were checked

- The script stops without publishing if the grid size, units or layout differ from what it expects, if a running total falls, or if a value is implausible.
- `pipeline/check_output.py` reads the saved tiles the way the page does. For 13 named places and 2,000 random points, the value found through the tiles equals the value at the nearest grid point, found by a separate method. The named places include both poles and both sides of the 180° line.
- For 5,000 random grid points, the colour of the rain picture at that point equals the colour for the rain value stored in the tiles.
- For seven cities, the 3-hour values were compared with Open-Meteo, an independent service that republishes the same ECMWF data. 222 of 224 blocks agreed within 0.3 mm, and none differed by more.

Results are recorded in [docs/backend-data-processing.md](docs/backend-data-processing.md).

## Running it on your own computer

Needs Python 3.10 or later.

```
python3 -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt

.venv/bin/python pipeline/fetch_forecast.py        # downloads the forecast, writes site/data/ (about a minute)
(cd pipeline && ../.venv/bin/python check_output.py)   # optional: runs the checks

cd site && python3 -m http.server 8000             # then open http://127.0.0.1:8000/
```

## Folder layout

```
pipeline/fetch_forecast.py      the data script
pipeline/check_output.py        checks on the script's output
pipeline/requirements.txt       exact Python package versions
site/index.html                 the page
site/style.css                  styles
site/app.js                     map, search, summary box, forecast panel
site/data/                      forecast files, made by the script (not in Git)
.github/workflows/update.yml    the scheduled job
docs/                           planning documents
```

## What it is built with

- **Data script:** Python, with `ecmwf-opendata`, `xarray`, `cfgrib`, `eccodes`, `numpy` and `Pillow`.
- **Page:** plain HTML, CSS and JavaScript, with no framework and no build step.
- **Map:** MapLibre GL JS, drawing OpenFreeMap's dark style recoloured to grey.
- **Place search and names:** Photon.
- **Hosting and schedule:** GitHub Pages and GitHub Actions.

## Known limits

- **3-hour blocks, not hourly.** ECMWF Open Data gives precipitation every 3 hours. The app shows those blocks as they are and does not invent hourly values.
- **Blocks sit on UTC boundaries.** In India they run 11:30 PM to 2:30 AM, 2:30 to 5:30 AM and so on. Each day in the panel begins with the block that contains 12 AM.
- **Today can have fewer than 8 bars.** The panel shows the selected place's today plus 3 days, in the place's own time zone, from the latest forecast run. A run has no values before its own start, so today begins at the first block the run covers. Those missing blocks are always in the past.
- **The map legend's times are in the viewer's own time zone,** because the map covers the whole globe. The summary box and the panel use the selected place's time zone.
- **Precision gets coarser further ahead.** The source files store totals with limited precision, about 0.06 mm early in the forecast and about 0.5 mm by day four. Amounts below the precision are shown as zero, so very light rain may not appear on later days.
- **Map colours start at 1 mm.** Lighter rain is not coloured on the map, so that the land stays visible. The summary box and the panel still show it. Colours are smoothed between grid points, so at the edge of a coloured area the colour can differ slightly from the number in the summary box.
- **About 25 km resolution.** The value is for the nearest grid point, which can be up to about 18 km from the picked spot. Single-point values in intense storms can be erratic.
- **The forecast is 7 to 14 hours old when you see it.** ECMWF publishes each run about 7 hours after it starts. The panel shows when the forecast in use was issued.
- **Scheduled updates can pause.** GitHub stops scheduled jobs in a repository with no activity for 60 days. The job can be restarted from the Actions tab.

## Data and credits

- Forecast: [ECMWF Open Data](https://www.ecmwf.int/en/forecasts/datasets/open-data), IFS model, licensed under CC BY 4.0. This app is not endorsed by ECMWF.
- Map data: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. Map style and tiles: [OpenFreeMap](https://openfreemap.org/), © OpenMapTiles.
- Place search: [Photon](https://photon.komoot.io/) by Komoot.
- Map library: [MapLibre GL JS](https://maplibre.org/).

The layout takes inspiration from windy.com. No code, styles or branding from it are used.
