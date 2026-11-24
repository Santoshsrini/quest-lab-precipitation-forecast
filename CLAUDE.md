# Varsha

Rain forecast web app for the QUEST Lab (IISc) selection task: ECMWF IFS Open Data → Python script → static JSON tiles and rain pictures → plain HTML/CSS/JS page on GitHub Pages.

- Live: https://santoshsrini.github.io/quest-lab-precipitation-forecast/
- Deadline: Wed 25 Nov 2026, 8:26 AM IST

## Layout

- `pipeline/fetch_forecast.py`: downloads `tp`, works out rain per 3-hour block, plus cp, mx2t3/mn2t3, ptype, mucape and ensemble tpg10; writes `site/data/` (`meta.json`, gzip tiles in `tiles/` with all fields, rain pictures in `tp/pictures/`), 144 h
- `pipeline/check_output.py`: checks the output; must pass before publishing
- `site/`: `index.html`, `style.css`, `app.js` (MapLibre + OpenFreeMap, Photon search)
- `.github/workflows/update.yml`: runs the script 4×/day and on pushes to `site/` or `pipeline/`, deploys to Pages
- `docs/plan.md`: decisions and the open items (section 7); `docs/backend-data-processing.md`: data method

## Commands

```
.venv/bin/python pipeline/fetch_forecast.py
(cd pipeline && ../.venv/bin/python check_output.py)
cd site && python3 -m http.server 8000
```

## Rules that must hold

- Script and page use the same point lookup (count from 0; round by adding 0.5 then rounding down; 41-row tiles in tile row 17; column 1440 wraps to 0). Change both together.
- Never invent values: no hourly interpolation, no blending in the numbers shown.
- Keep the page plain JS with no build step. Pin exact versions.
- Don't commit `site/data/`, downloads or `docs/screenshots/` (Windy images).

## Working with Santosh

- Approving a plan is not permission to build. Wait for an explicit go-ahead.
- Give a short to-do list before each phase; stop after it for his review.
- Commit only when he says so. Push only when he explicitly says "push"; a commit request alone never includes a push. Record decisions in `docs/plan.md`.
- Keep answers short and plain.
