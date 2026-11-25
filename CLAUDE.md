# Varsha

Rain forecast web app for the QUEST Lab (IISc) selection task, Project 1. ECMWF IFS Open Data → Python script → gzip JSON tiles and map pictures → plain HTML/CSS/JS page on GitHub Pages.

- Live: https://santoshsrini.github.io/quest-lab-precipitation-forecast/
- Deadline: Wed 25 Nov 2026, 8:26 AM IST

## Commands

```
.venv/bin/python pipeline/fetch_forecast.py            # writes site/data/
(cd pipeline && ../.venv/bin/python check_output.py)   # only automated check; must pass
cd site && python3 -m http.server 8000
```

## File layout

- `pipeline/fetch_forecast.py`: main run tp, cp, sf, mx2t3, mn2t3, ptype, mucape (0–144 h); ensemble tpg10 (12 windows); writes `site/data/`
- `pipeline/check_output.py`: checks tiles, lookup, pictures, card fields, freshness
- `site/data/meta.json`: runs, block times, grid, colours, per-block precision, prob windows
- `site/data/tiles/rNN_cNN.json.gz`: 648 tiles, fields tp, cp, sf, tmax, tmin, wx, p10
- `site/data/tp/pictures/`, `site/data/type/pictures/`: 48 rain and 48 type PNGs (b00–b47)
- `site/index.html`, `style.css`, `app.js`: MapLibre 4.7.1 + OpenFreeMap, Photon search, tz-lookup 6.1.25
- `.github/workflows/update.yml`: 01, 08, 13, 20 UTC and on pushes to `site/`, `pipeline/`; check, then deploy
- `docs/plan.md`: decisions (log at the end), open items (section 7); `docs/backend-data-processing.md`: data method

## Data and time rules

- Script and page use the same point lookup (count from 0; add 0.5 then round down; 41-row tiles in tile row 17; column 1440 wraps to 0). Change both together.
- Never invent values: no hourly interpolation, no blending of the numbers shown.
- tp, cp, sf are running totals: block = step minus previous step; below the GRIB precision = 0.
- A block belongs to the local day it starts in (place's time zone via tz-lookup).
- Type rule: snow share ≥ 80% Snow, > 20% Rain and snow, else Rain; ptype hazards at block end win. Must match in `fetch_forecast.py` type_class, `app.js` precipType, `check_output.py` expected_type.
- wx = hazard * 2 + storm (hazard 1 freezing, 2 ice pellets; storm = mucape ≥ 1000 J/kg).
- Chance window: most overlap with the day; tie → window starting within the day.
- Page stays plain JS, no build step. Pin exact versions.
- After changing `style.css` or `app.js`, bump its `?v=` in `index.html`.
- Don't commit `site/data/`, `pipeline/downloads/`, `docs/screenshots/`, `docs/references/`.

## Lessons learned

- Downloads can stall or truncate: `safe_download` writes a `.partial` file, checks the step count, has a request timeout, and caps the library's retries.
- GitHub Pages serves `.json.gz` as plain `application/gzip` (no content-encoding), so the page unpacks tiles with `DecompressionStream`.
- Browsers cache old JS/CSS: bump `?v=`.
- Ensemble tpg only exists for 00/12 UTC runs; it can be older than the main run.
- ECMWF publishes about 7 h after a run starts; the cron times follow that.
- High can be 1 °C below low after rounding; the check allows −1.
- OpenFreeMap's style draws no continent/ocean labels: added in `setLabelLevels`; oceans are filed as class "sea", so they are picked by name.
- Tiles and pictures must be read with the `meta.json` they were made with: `checkForNewData()` re-fetches it (no-store) before any new tile or picture and every 5 min, and resets everything if `made` changed.

## Working with Santosh

- Approving a plan is not permission to build. Wait for an explicit go-ahead.
- Give a short to-do list before each phase; stop after it for his review.
- Commit only when he says so. Push only when he explicitly says "push"; a commit request alone never includes a push.
- Record decisions in `docs/plan.md`.
- Keep answers short and plain.
