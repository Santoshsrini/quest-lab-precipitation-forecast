# Precipitation Forecast App — Planning Document

QUEST Lab (IISc) Full Stack AI Pre-doctoral selection task · Santosh Srinivas · started 14 Nov 2026

**Status:** plan agreed on 14 Nov 2026. Building follows the "Order of work" list at the end of section 6.

## Context

The selection task (Project 1): fetch precipitation forecasts from ECMWF Open Data (IFS or AIFS), process them, and deploy a web application that presents the forecast through an innovative front end and user experience.

## 1. Product Requirements

**Deadline:** 15 Nov 2026.
**Deliverables:** a live deployed URL, a GitHub repository, and a demo or presentation.

**Guiding principle:** get it working functionally first. Start with a simple version, then add to it.

### Phase 1 (the simple version)

- A public web application that anyone can open. No login.
- **Map:** the user can zoom in, zoom out and move around. The map is plain: no animation and no rainfall colouring. Its only job is to let the user pick a location.
- **Pick by clicking:** clicking a point on the map selects that location.
- **Pick by searching:** a search bar lets the user find and select a location by name.
- **Bottom panel:** once a location is selected, a panel at the bottom shows:
  - the precipitation forecast for that location for 4 days: today and the 3 days after it, each in 3-hour blocks, in the selected place's local time. If today is Sunday, the panel shows Sunday, Monday, Tuesday and Wednesday.
  - each day begins with the 3-hour block that contains 12 AM. The blocks do not line up with midnight: in India they run 11:30 PM to 2:30 AM, 2:30 to 5:30 AM and so on.
  - blocks of today that fall before the forecast's start are drawn as empty bars marked "before forecast", because a forecast has no values before it starts. Blocks at the end of the fourth day that lie beyond the 96 hours of data are drawn the same way, marked "not yet available".

(Changed by Santosh on 15 Nov 2026. Before that, the panel showed the next 24 hours from the present moment, plus details of the location such as coordinates and sunrise. Both were removed.)

### Phase 2 (later)

- Colouring or markings on the map that show where a lot of rain is expected.

(The multi-day forecast was listed here until 15 Nov 2026, when Santosh moved it into Phase 1 as a 4-day forecast.)

### Not in scope

- Login or user accounts
- Saving favourite locations
- Special features such as airports

### Settled points

1. **Time step: 3-hour blocks.** The original request was hourly, but ECMWF Open Data gives precipitation every 3 hours for IFS and every 6 hours for AIFS (to be confirmed against the ECMWF documentation). We show what the data contains and do not invent hourly detail. This means Phase 1 uses IFS.
2. **Coverage: anywhere in the world.** The back end must handle the full global grid.

### The innovative element

The brief asks for an "innovative front end and user experience". Rain colouring on the map, listed above under Phase 2, is brought into this submission as build phase 4 in section 6. It is dropped if it is not working by the cut-off time.

## 2. User Flow / App Flow

**Changed by Santosh on 15 Nov 2026.** These points replace anything below that says otherwise:

- **Summary box:** the place name, the rain in the next 3 hours, a down arrow and a small cross. No 24-hour total. "The next 3 hours" is the 3-hour block that contains the present moment, shown with its real times.
- **Bottom panel:** the 4-day forecast only, scrolling sideways with a divider between days. "About this location" is removed.
- **Crosses:** the summary box's cross and the panel's cross each remove the white dot and the box or panel, and empty the search bar. The map stays exactly where it is, at the same position and zoom. It does not go back to the opening view.
- **Screen sizes:** the website is responsive. The layout adapts to phone, tablet and laptop widths.
- **Search bar cross:** a small cross inside the search bar clears the selection in the same way.

The app is a single screen. There are no separate pages.

### The flow

1. **Open the app.** The user sees the map filling the screen, centred on India, and a search bar at the top left. The user can still drag to anywhere in the world.
2. **Choose a location**, in either of two ways:
   - **Search:** type a place name such as "Chennai" or "Bangalore" in the search bar. A dropdown suggests matching places while the user types (for example "Chennai, Tamil Nadu, India") and the user picks one.
   - **Map:** zoom in, zoom out and drag the map (as on windy.com), then click a point. That point becomes the selected location.
3. **See the quick answer.** A white dot marks the point, and a small summary box attached to the dot appears with the place name, the rain expected in the next 3 hours, the total for the next 24 hours, a down arrow and a small cross.
4. **See the full forecast.** Pressing the down arrow makes the summary box disappear. The white dot stays, and a panel opens at the bottom of the screen. It shows:
   - the precipitation forecast for the selected location
   - beside the forecast, an "About this location" section with details such as the coordinates
5. **Close the panel** by pressing its cross mark. Everything goes, the white dot included, and the app returns to its opening state.

### Bottom panel behaviour

- **Forecast drawing:** a bar chart. One bar per 3-hour block, taller for more rain, with the time below the bar and the amount in mm above it.
- **Phase 1:** the panel shows the forecast for the day only (the next 24 hours in 3-hour blocks, as settled in section 1).
- **Phase 2:** the panel scrolls left to right to show later times and days, with a dividing line between one day and the next.
- **"About this location" position:** always beside the forecast, in the same left-to-right strip, in the way the days sit side by side. It does not move below the forecast.

### Screen sizes

- Designed for a laptop or desktop screen first, and usable on a phone.
- On a phone the panel keeps the same side-by-side layout. If the forecast and "About this location" do not both fit across the screen, the user scrolls the panel sideways to reach the part that is off screen.

### Detailed behaviour

- **Marker:** a white dot appears on the map at the selected point, so the user can see what the summary box or the panel refers to.
- **One thing at a time:** the summary box and the panel are never on screen together. The down arrow swaps the box for the panel.
- **After a search:** the map moves to the chosen place, places the white dot and shows the summary box.
- **Summary box cross:** pressing it removes the box and the white dot, and the app returns to its opening state.
- **Panel cross:** pressing it removes the panel and the white dot, and the app returns to its opening state.
- **Choosing again while the summary box is showing:** the white dot and the summary box move to the new place.
- **Choosing again while the panel is open:** the white dot moves to the new place and the panel stays open and shows the new forecast. No summary box appears.
- **Place name:** the summary box and the panel both have a heading with the name of the place, and the search bar shows it too. For a search this is the name the user chose. For a map click it is the nearest named place if one can be found, otherwise the coordinates.
- **While loading:** the summary box appears immediately with a loading indicator, then fills in.
- **If the forecast cannot be loaded:** the summary box shows a short message and a "Try again" button.

## 3. Tech Stack Specification

### Constraints

- **Easy to build and minimal.** This is the main rule for every choice.
- Santosh is comfortable with Python and with plain HTML, CSS and JavaScript, is mostly new to web development, and is not familiar with React. He must be able to explain the code in the demo.
- The forecast must work for any point on the map.
- Accounts available: GitHub and Netlify.
- The deadline is 15 Nov 2026.

### The stack

**Overall shape:** two parts and no server.

1. A Python script downloads the newest forecast and saves it as small files.
2. A web page, made of static files, reads those files in the browser.

**Front end**

| Need | Choice | Why |
|---|---|---|
| Page | Plain HTML, CSS and JavaScript. No React, no build tools. | Santosh knows it and can explain every line. Nothing to install or compile. |
| Map | MapLibre GL JS 4.7.1, loaded from a CDN, drawing OpenFreeMap's dark style, recoloured to mid grey | Free, with no key and no usage limits. Zoom, drag and click work out of the box. Changed on 15 Nov 2026 from Leaflet with CARTO's dark map images, which turned out to need a key when loaded in a browser. |
| Bar chart | Drawn with plain HTML and CSS | Eight bars do not need a chart library. |
| Place search and place names | Photon (photon.komoot.io) | Free, no key, and built for suggestions while typing. Also turns a clicked point into a place name. |
| Time zone of the picked point | `tz-lookup`, a small JavaScript library | Works in the browser from latitude and longitude. No service to call. |

**Back end (data script)**

| Need | Choice | Why |
|---|---|---|
| Language | Python 3.10 or later | Already installed. Santosh knows it. |
| Download | `ecmwf-opendata` | ECMWF's own package for this data. |
| Read the GRIB2 files | `xarray` with `cfgrib` and `eccodes` | The standard way to read this format in Python. |
| Calculations | `numpy` | Subtracting one time step from the previous one, and converting metres to mm. |
| Output | Small files, one per map area, each holding every time step for that area | The browser downloads only the one file that covers the picked point. This is what makes any point on the globe work without a server. |

**Hosting and schedule**

| Need | Choice | Why |
|---|---|---|
| Code | GitHub repository (public) | A required deliverable. |
| Scheduled data job | GitHub Actions, four times a day (see section 5) | Free. Runs the Python script when ECMWF publishes a new forecast. |
| Website | GitHub Pages | The same scheduled job that makes the data files also publishes the site, in one step. |

**Why GitHub Pages and not Netlify.** Both would serve the page equally well. With Netlify, the scheduled job on GitHub would have to hand the fresh data files to Netlify every 6 hours, using either a stored access token or commits of data files that make the repository grow without limit. GitHub for both has fewer parts. Netlify stays available as a fallback.

**Versions**

- MapLibre GL JS 4.7.1.
- Every other package is fixed to an exact version when it is first installed and tested, and written into `requirements.txt` (Python) or into the page's CDN links (JavaScript). The versions are then listed here.
- Python packages, installed and tested on 15 Nov 2026 with Python 3.10: `ecmwf-opendata` 0.3.35, `xarray` 2025.6.1, `cfgrib` 0.9.15.1, `eccodes` 2.50.1, `numpy` 2.2.6.
- Node is not needed.

**On the laptop**

- A separate Python environment for this project, so its packages do not affect anything else.
- The page is previewed locally with Python's built-in web server.

### To check when building starts

- That Photon, the dark map style and the two JavaScript libraries work as described and their usage rules allow this app.
- That `eccodes` installs cleanly on the Mac and on GitHub Actions.

## 4. Content Guidelines

The look takes inspiration from windy.com. It is not a copy: we borrow the general layout and feel, and do not reproduce Windy's logo, branding, stylesheet or exact design.

### Decisions

- **App name: Varsha** (the Sanskrit word for rain). Used in the browser tab and as the page's name.
- **Map style: dark grey**, like the reference: a plain dark map with thin borders and pale labels. The exact free style is confirmed when building starts.
- **Marker:** a white dot at the selected point.
- **Summary box:** a small box attached to the white dot, with the place name, the rain in the next 3 hours, the total for the next 24 hours, a down arrow and a small cross.
- **Panel colours: light.** A white or near-white panel with dark text, on the dark map.
- **Panel order, left to right:** forecast for the day, later days (Phase 2), then "About this location" last.
- **Rain wording:** each bar shows its amount, such as "4.2 mm". Above the chart, one plain sentence sums up the next 24 hours, for example "Rain likely this evening, 12 mm in total" or "No rain expected in the next 24 hours".
- **Search bar:** shows the name of the selected place.
- **Styles:** Varsha has its own small set of styles (colours, font, rounded search bar, panel), written from what the reference screenshots show. Windy's stylesheet is not used.
- **Rainfall colours on the map:** added in build phase 4 (section 6), with a small legend.

### Text and credits

- **Units:** rainfall in mm.
- **Times:** 12-hour clock in the selected place's local time, for example "3 PM".
- **Forecast source line:** the panel states where the numbers come from and how fresh they are, for example "ECMWF IFS forecast, issued 14 Nov, 12:00 UTC".
- **Credits, always visible in a corner of the map:** ECMWF (its open data licence, CC BY 4.0, requires credit), OpenStreetMap contributors, and the provider of the map style.

### Reference screenshots

Five screenshots of windy.com, kept in `docs/screenshots/` on Santosh's laptop and not committed, because they are images of another company's site and this repository is public.

**Screenshot 1: overall layout, fully zoomed out**

- Take: a search bar at the top left; the map filling the whole screen; continent names and ocean names on the map; a bottom panel that expands to hold the selected location's information.
- Leave out: the share button beside the search bar; the Windy logo; the menu and every button and symbol on the right-hand side.

**Screenshot 2: zoomed in one step**

- Take: country names appear on the map (India, Pakistan and so on) in place of continent names.

**Screenshot 3: zoomed in further**

- Take: local places appear (cities and towns), and the map stops at a maximum zoom level.
- Leave out: the temperature shown under each city name.

**Screenshot 4: a location is selected, panel open**

- Take: the white dot at the selected point; the place's name in the search bar; the bottom panel with the forecast; later days to the right, each under its own heading such as "Saturday 14" (Phase 2); "About this location" at the far right.
- Already decided differently: the forecast is a bar chart of rainfall, where the screenshot uses a table of many weather values.
- Leave out: temperature, wind and the other weather rows; weather icons; the red bar of forecast types beneath the panel; "Nearest weather stations".

**Screenshot 5: summary box beside the selected point**

- Take: a small box attached to the white dot with the rain amount, a cross, and a down arrow that opens the bottom panel.

Labels changing with zoom (continents and oceans, then countries, then cities and towns) come from the map style we choose, not from code we write.

### Open points

- **Continent and ocean names:** whether the chosen dark map style shows them when zoomed out, as the reference does. To check when the style is confirmed.
- **Summary sentence rules:** the exact wording, and the rainfall amounts at which it changes. To be written in section 5 or 6.

## 5. Back End: Data Fetching and Processing

**Updated on 15 Nov 2026:** the detailed and current back end plan is in `backend-data-processing.md`. It stores 96 hours (32 blocks) where this section says 72 hours (24 blocks), and it corrects the tile layout and the point lookup. Where the two differ, that document is the one to follow.

### Outline

A timed script fetches the ECMWF Open Data forecast, processes it to extract the values the front end needs, and stores the result where the front end loads it from.

### What the ECMWF server holds (checked live on 14 Nov 2026, 16:09 UTC)

- **Runs:** four a day, starting at 00, 06, 12 and 18 UTC. All four are published under the same stream name, `oper`.
- **When a run appears:** about 6.5 to 7.5 hours after it starts. The 00 UTC run appeared at 07:34 UTC and the 06 UTC run at 12:27 UTC.
- **Time steps:** every 3 hours out to 144 hours (6 days), for every run. There is no 1-hour step. The 00 and 12 UTC runs continue beyond that in 6-hour steps.
- **Rain field:** named `tp`. Each time step's `tp` is about 330 KB, inside a much larger file of some 55 weather fields. The `ecmwf-opendata` package downloads only the `tp` part.
- **Meaning of `tp`:** total precipitation in metres since the start of the run. Rain within one 3-hour block is this step's value minus the previous step's value.
- **Grid:** the whole globe at 0.25° spacing, about 25 km. That is 721 rows by 1440 columns, about 1 million points.

Not yet checked: how many days a run stays on the server, and the exact latitude and longitude order inside the file. Both are checked on the first download.

### Model

IFS only (decided in section 1, because AIFS has 6-hour steps). The single main forecast, not the 51-run ensemble.

### The method, step by step

1. **Find the newest run** that the server has published. If the newest one is not complete yet, use the one before it.
2. **Download `tp`** for steps 3, 6, 9 and so on up to 72 hours: 24 steps, about 8 MB in total.
3. **Read** each step into a grid of numbers with `xarray` and `cfgrib`.
4. **Work out rain per block:** subtract the previous step from each step (the first block is simply step 3), multiply by 1000 to turn metres into mm, set any tiny negative results to zero, and round to 0.1 mm.
5. **Cut the globe into tiles** of 10° by 10°. That gives 648 tiles, each holding 40 by 40 grid points and all 24 blocks for each point.
6. **Save each tile as a JSON file**, with rain stored as whole numbers of tenths of a mm to keep files small. Each file is about 100 KB before compression. JSON is chosen because a person can open a file and read the numbers.
7. **Save one small information file** (`meta.json`) with the run's start time, the start time of each block, and the grid layout.
8. **Publish:** the scheduled job puts these files beside the web page and publishes both to GitHub Pages.

### How the front end uses the files

1. On opening, the page loads `meta.json`.
2. When the user picks a point, the page finds the nearest grid point, works out which tile holds it, and downloads that one tile.
3. It reads the 24 values for that grid point, keeps the block containing the present moment and the 7 blocks after it, and shows those 8.

The value shown is the forecast for the grid point nearest to the picked spot. There is no blending between neighbouring points, so every number on screen is one the model produced.

### Why 72 hours when the panel shows 24

- A run is already about 7 hours old when published, and up to about 14 hours old just before the next one replaces it. Showing 24 hours ahead therefore needs steps out to about 40 hours.
- The extra, up to 72 hours, keeps the app working if one or several scheduled jobs fail.
- It also gives Phase 2 a start. Showing more days later means changing one number in the script.

### Schedule

- GitHub Actions runs the script four times a day, at about 01:00, 08:00, 13:00 and 20:00 UTC, shortly after each run normally appears.
- GitHub may start a scheduled job late. That only delays the refresh.

### When something goes wrong

- **A job fails:** the site keeps the previous data. Nothing breaks for the user.
- **Data is getting old:** the panel always shows when the forecast was issued. If the stored data no longer covers a full 24 hours ahead, the panel shows the blocks it has and says so.

### A consequence for the labels

The 3-hour blocks sit on UTC boundaries: 00:00, 03:00, 06:00 UTC and so on. In India (UTC+5:30) those are 5:30, 8:30, 11:30 and so on. A bar in India therefore reads "2:30 PM to 5:30 PM", not "3 PM to 6 PM" as in the examples in sections 1 and 4. Shifting the blocks to round local hours would mean inventing values, so we keep the true boundaries.

### How we check the numbers are right

- On the first download, print the 8 blocks for a few known places, such as Bengaluru and a place where it is raining that day, and compare them with the ECMWF forecast shown on a public weather site.
- Check that no value is negative and that the grid has 721 by 1440 points.

## 6. Implementation

The work is done in build phases. These are not the same as "Phase 1" and "Phase 2" in section 1, which describe the product. Build phases 1 to 3b together deliver the product's Phase 1. Build phases 4 and 5 are the product's Phase 2: rain colouring on the map is planned for this submission, and the multi-day forecast stays optional.

### Folder structure

```
docs/plan.md                    this document
site/index.html                 the page
site/style.css                  Varsha's styles
site/app.js                     map, search, summary box, panel
site/data/                      meta.json and the 648 tiles (made by the script, not committed)
pipeline/fetch_forecast.py      the data script
pipeline/requirements.txt       exact Python package versions
.github/workflows/update.yml    the scheduled job: run the script, publish the site
README.md                       what the app is, how it works, how to run it
.gitignore                      keeps site/data/, downloads and screenshots out of Git
```

### Build phase 1: data fetching and processing

This comes first because it is the part most likely to go wrong (installing `eccodes`, reading the file format, running on GitHub's machines) and it is the core of the brief.

Build:
- A separate Python environment and `requirements.txt` with exact versions.
- `fetch_forecast.py`, following the method in section 5: find the newest run, download `tp`, work out rain per block, write the tiles and `meta.json` into `site/data/`.

Done when, checked on the laptop:
- The script runs from start to finish and writes 648 tile files and `meta.json`.
- The grid has 721 by 1440 points and no rain value is negative.
- The 8 blocks printed for Bengaluru, and for a place where it is raining that day, agree with the ECMWF forecast on a public weather site.

### Build phase 2: map and search

Build:
- The page with the dark map filling the screen, opening centred on India. Zoom in, zoom out and drag.
- Clicking the map places the white dot and shows the place name, or the coordinates if no name is found, in the search bar.
- The search bar suggests places while typing. Choosing one moves the map there, places the white dot and shows the name in the search bar.
- Credits in a corner of the map.

Done when, checked in a browser on the laptop:
- Zoom and drag work, and labels change from countries to cities when zooming in.
- A click on Bengaluru shows "Bengaluru" in the search bar. A click in the middle of an ocean shows coordinates.
- Typing "Chennai" lists suggestions, and choosing one moves the map there.
- The page is usable at phone width.

Also in this phase: confirm the dark map style and the Photon usage rules (the checks listed in section 3).

### Going live (straight after build phase 2)

Build:
- Create the public GitHub repository and push. Claude asks Santosh before creating it and before the first push.
- `update.yml`: on a schedule four times a day, on every push and on demand, run the data script and publish `site/` to GitHub Pages.

Done when:
- The live URL shows the map and search on a laptop and on a phone.
- The job, started by hand, finishes and the live site holds `meta.json` for the newest run.

Going live before build phase 3a means any hosting problem shows up while there is still time to fix it.

### Build phase 3a: forecast on screen

The smallest step that makes the app work end to end. After this phase the app could be submitted.

Build:
- The summary box attached to the white dot: place name, rain in the next 3 hours, 24-hour total, down arrow, cross.
- The bottom panel with the bar chart of 8 blocks, the forecast source line, and its cross.
- The arrow swaps the box for the panel. Both crosses clear the selection. A new pick updates the open panel.

Done when, checked in a browser:
- Picking a place by click or by search shows the summary box, and the arrow opens the panel with 8 bars.
- The numbers on screen match the values the script printed for the same place in build phase 1.
- Times are in the selected place's local time: a place in India and a place in another time zone both read correctly.

### Build phase 3b: the rest of the panel

Build:
- "About this location": coordinates, time zone, sunrise, sunset, dusk.
- The one-sentence summary above the chart, and the rules for its wording (the open point from section 4).
- Loading indicator and the "Try again" message.
- Layout at phone width.

Done when, checked in a browser:
- Sunrise and sunset for Bengaluru agree with a public source to within a few minutes.
- The summary sentence reads correctly for a dry place and for a rainy place.
- With the data file made unreachable, the "Try again" message appears.
- The panel is usable at phone width, scrolling sideways to reach "About this location".

### Build phase 4: rain on the map

This is the app's standout visual element, answering the brief's request for an innovative front end. It is planned, not optional, but it is dropped if it is not working by the cut-off time below. It is cheap because the data script already holds the whole globe's rain.

Build:
- The data script also saves one picture of the globe per 3-hour block: transparent where there is no rain, coloured by amount where there is. The script redraws the rows of the grid to match the map's projection, so the rain lines up with the coastlines.
- The map lays the picture for the current block over itself, under the labels where the map style allows.
- A small legend showing which colour means how many mm.

Done when, checked in a browser:
- Coloured rain areas appear on the map and line up with the coastlines when compared with a known feature.
- Clicking inside a coloured area shows rain in the summary box for the current block, and clicking in a clear area shows none.
- The legend matches the colours on the map.

How long this takes is not known until build phase 1 shows how the data behaves.

### Build phase 5: more days (optional)

- A forecast beyond 24 hours, with sideways scrolling and day dividers in the panel.
- Stepping the map's rain picture forward through the blocks.

### Cut-off time

Santosh wants to finish by the evening of 15 Nov. **No new features after 3 PM IST on 15 Nov.** From then on, only testing on the live URL, the README, and the demo. Whatever is not working by then is left out. Santosh can move this time.

### Before submission

- Run through the whole user flow on the live URL, on a laptop and on a phone.
- Prepare the demo. Its form is not decided yet; Santosh chooses once the app is live.
- Final commit and push.

### How we work

- **Stop after each build phase.** Claude shows the phase working, Santosh tries it himself, and Claude commits only when Santosh says so.
- **Commits:** one per build phase, with messages in the style already used (`feat: ...`, `docs: ...`).
- **Nothing is pushed or published without Santosh's say-so** the first time. After that, pushes to the same repository follow each approved commit.

### Order of work

1. Save this section into `docs/plan.md` and commit. Add `.gitignore`.
2. Build phase 1 (data script), then Santosh's review, then commit.
3. Build phase 2 (map and search), then review, then commit.
4. Going live.
5. Build phase 3a (forecast on screen), then review, then commit. The app is now submittable.
6. Build phase 3b (the rest of the panel), then review, then commit.
7. Build phase 4 (rain on the map), then review, then commit. Dropped if not working by the cut-off.
8. **Cut-off: 3 PM IST, 15 Nov.** `README.md`, then "Before submission".
9. Build phase 5 (more days), only if everything above is done before the cut-off.

## 7. Items to Revisit Later

Noted by Santosh on 15 Nov 2026 after reviewing the summary box and the 4-day panel. Not being worked on yet.

1. **Done on 23 Nov 2026 (step 1).** ~~Use the selected place's local time for the forecast.~~ At the time, every time, and the meaning of "today", comes from the laptop's own time zone. That was chosen on 15 Nov as the quicker option for the deadline. The forecast should instead follow the local time of the selected location. This needs a way to find a place's time zone from its latitude and longitude, such as the `tz-lookup` library.
2. **Polish and beautify the bottom panel** for the rain forecast. Like the summary box, it should be based on the selected place's local time.
3. **Summary box and panel can disagree just after midnight** (noted 24 Nov 2026, left as it is for now). The summary box shows the block containing the present moment. A block belongs to the day it starts in, so between 12 AM and the first block of the new day (2:30 AM in India), the current block started yesterday and is not in the panel's "today". To be resolved.

Also still open from earlier:

- Sections 4 and 6 above still describe "About this location" and the old phase split. The note at the top of section 2 overrides them.
- ~~Filling the start of today from earlier forecast runs and extending the data to 120 hours.~~ Replaced on 23 Nov 2026: the data now reaches 144 hours, and the panel shows only the latest run's blocks for the place's today plus 3 days.

## Decision Log

| Date | Decision | Reason |
|---|---|---|
| 14 Nov 2026 | Plan fully before writing any code | Santosh's request |
| 14 Nov 2026 | Deadline within 3 days; hand in live URL, GitHub repo and demo | Santosh's answers |
| 14 Nov 2026 | Phase 1 is a plain map plus search to pick a location, with a bottom panel showing the forecast and location details; no login, favourites or airports | Santosh's product requirements: function first |
| 14 Nov 2026 | Show 3-hour blocks from IFS instead of hourly values | The source has no hourly data; estimated hourly values would be invented |
| 14 Nov 2026 | Panel covers the next 24 hours from now | Always shows a full day ahead |
| 14 Nov 2026 | Locations anywhere in the world | The app is for anyone |
| 14 Nov 2026 | Choose the innovative element after Phase 1 works | Santosh's choice: function first |
| 14 Nov 2026 | Single screen: map, search bar at top left, bottom panel with forecast and "About this location", closed with a cross | Santosh's user flow |
| 14 Nov 2026 | Map opens centred on India | Suits Santosh and the evaluators; the world is still reachable |
| 14 Nov 2026 | Forecast drawn as a bar chart | Easy to read; extends to scrolling across days in Phase 2 |
| 14 Nov 2026 | Search suggests places while typing | Avoids picking the wrong place when names are shared |
| 14 Nov 2026 | Usable on a phone; "About this location" stays beside the forecast on every screen size | Santosh's choice: same side-by-side layout as the days |
| 14 Nov 2026 | Pin on the selected point; new selection replaces the forecast; closing removes the pin; place-name heading; loading indicator; "Try again" on failure | Proposed by Claude to fill gaps in the flow, accepted by Santosh |
| 14 Nov 2026 | Deadline corrected to 15 Nov 2026 (first recorded as "within 3 days") | Santosh's correction |
| 14 Nov 2026 | No server: a scheduled Python script prepares small data files, split by map area, that the browser reads directly | Simplest and most reliable; works for any point on the globe; free |
| 14 Nov 2026 | Front end in plain HTML, CSS and JavaScript with Leaflet; no React, no build tools | Santosh knows it and must explain it; nothing to compile; one day left |
| 14 Nov 2026 | Python with `ecmwf-opendata`, `xarray`, `cfgrib` and `numpy` for the data script | Standard tools for ECMWF data; Santosh knows Python |
| 14 Nov 2026 | GitHub for everything: repository, scheduled job (Actions) and website (Pages) | One step publishes data and site together; fewer parts than adding Netlify |
| 14 Nov 2026 | Look inspired by windy.com, not copied; Windy's stylesheet is not used | Santosh's content guidelines; inspiration, not a clone |
| 14 Nov 2026 | App name: Varsha | Santosh's choice |
| 14 Nov 2026 | Dark grey map style, replacing standard OpenStreetMap images | Matches Santosh's reference screenshots |
| 14 Nov 2026 | Light bottom panel on the dark map | Matches Screenshot 4 |
| 14 Nov 2026 | Each bar shows mm; one plain sentence sums up the next 24 hours | Numbers for detail, a sentence for a quick answer |
| 14 Nov 2026 | Search bar shows the selected place's name | From Screenshot 4 |
| 14 Nov 2026 | Marker is a white dot, replacing the pin | Santosh's choice, from the screenshots |
| 14 Nov 2026 | A summary box appears first; its down arrow swaps it for the bottom panel. Replaces "panel opens at once" | Santosh's choice from Screenshot 5; one thing on screen at a time |
| 14 Nov 2026 | The panel's cross and the summary box's cross each clear the whole selection, white dot included | Santosh's clarification |
| 14 Nov 2026 | Picking another place while the panel is open updates the panel in place | Quick for comparing places |
| 14 Nov 2026 | Download only the `tp` field of the IFS main forecast, 24 steps covering 72 hours | Small download; covers 24 hours ahead even when the run is old or jobs fail |
| 14 Nov 2026 | Store the result as 648 JSON tiles of 10° by 10°, plus `meta.json` | The browser fetches one small file per pick; JSON is readable |
| 14 Nov 2026 | Show the nearest grid point's values, with no blending | Every number shown is one the model produced |
| 14 Nov 2026 | Keep the true UTC block boundaries, so bars in India fall on half hours | Shifting to round local hours would invent values |
| 14 Nov 2026 | Scheduled job four times a day, shortly after each run appears | Matches ECMWF's publishing times, checked live |
| 14 Nov 2026 | Build order: data script; map and search; forecast in the front end; rain on the map | Santosh's phases, reordered on Claude's suggestion so the riskiest part and the core of the brief come first |
| 14 Nov 2026 | Go live once, straight after build phase 2, with the page and the scheduled data job together | Hosting problems show up before build phase 3a, not near the deadline |
| 14 Nov 2026 | Stop after each build phase for Santosh's review; commit only on his say-so | Santosh stays in control and can explain each part |
| 14 Nov 2026 | Build phase 3 split into 3a (forecast on screen) and 3b (the rest of the panel) | A submittable app exists as early as possible |
| 14 Nov 2026 | Rain on the map is planned build phase 4 and is the innovative element; more days is optional build phase 5 | The brief asks for an innovative front end; the data script already holds the global rain |
| 14 Nov 2026 | No new features after 3 PM IST on 15 Nov | Santosh wants to finish by the evening; leaves time for testing, README and demo |
| 15 Nov 2026 | Panel shows 4 days (today and the next 3) from local midnight, replacing "the next 24 hours from now"; multi-day forecast moves into Phase 1 | Santosh's change |
| 15 Nov 2026 | Blocks before the forecast's start, and beyond its end, are empty bars with a label | A forecast has no values outside its own 96 hours; no change to the data script |
| 15 Nov 2026 | Summary box drops the 24-hour total; "About this location" is removed; SunCalc is dropped | Santosh's change: keep it simple |
| 15 Nov 2026 | Crosses clear the selection without moving the map | Santosh's change |
| 15 Nov 2026 | The website is responsive | Santosh's change |
| 15 Nov 2026 | Map drawn by MapLibre with OpenFreeMap's dark style, replacing Leaflet with CARTO images | CARTO's images need a key in a browser; OpenFreeMap needs none |
| 15 Nov 2026 | The 3 PM cut-off was missed; submission moved to about 9 PM IST | Planning and data questions took longer than planned |
| 15 Nov 2026 | Times and "today" use the laptop's time zone for now; `tz-lookup` is not used | Quicker for the deadline, and what windy.com does. To be changed to the selected place's local time later (section 7) |
| 15 Nov 2026 | Panel shows days, times and rain only: no day totals and no summary sentence | Santosh's specification |
| 15 Nov 2026 | Build the panel first, go live, then extend the data script to make all four days complete | Santosh's choice |
| 15 Nov 2026 | Map coloured by the rain in the current 3-hour block, from one picture per block written by the data script, with a legend | Santosh's idea; the standout visual element planned as build phase 4 |
| 23 Nov 2026 | Data reaches 144 hours (48 blocks), the last 3-hourly step of every run | Covers the place's today plus 3 days in every time zone, even if jobs fail; simpler than a tuned number |
| 23 Nov 2026 | Each parameter in its own folder (`site/data/tp/...`), listed in `meta.json` | More parameters can be added later without changing the layout |
| 23 Nov 2026 | Panel and summary box in the selected place's time zone (`tz-lookup`); show only latest-run blocks starting in the place's today plus 3 days; a block belongs to the day it starts in | Santosh's new algorithm; removes the confusing previous-day 11:30 PM block |
| 24 Nov 2026 | Bottom panel becomes four day cards plus the selected day's 3-hour timeline, in a clean minimal style | Santosh's design (made with Claude Design; `docs/screenshots/day-cards-design-claude.png`) |
| 24 Nov 2026 | Card fields from `cp`, `mx2t3`, `mn2t3`, `ptype`, `mucape` and ensemble `tpg10`; condition word by rules; intensity by IMD daily categories | Mapped in the day-card plan; thunderstorms are derived because open data has no lightning field |
| 24 Nov 2026 | Chance of 10 mm+ from the newest 00/12 UTC ensemble run, which can differ from the main run; both runs named | Ensemble probabilities exist only for 00 and 12 UTC |
| 24 Nov 2026 | Condition word from daily amounts: snow share `sf`/`tp` (≥ 80% Snow, over 20% Rain and snow, else rain family) and showery share `cp`/`tp` (≥ 50%, rain days only); "Sleet" dropped. `ptype` kept only for "Freezing rain at times" / "Ice pellets at times" lines | `ptype` is a snapshot at each block's end, so a vote over blocks didn't reflect the whole day (Santosh) |
| 24 Nov 2026 | Summary box names the current block's type with the same snow-share rule (No rain under 0.1 mm, Snow, Rain and snow, Rain), plus "Freezing rain possible" / "Ice pellets possible"; no Showers or Thunderstorms in the box | The box said "Rain" even for snow or dry blocks (Santosh) |
| 24 Nov 2026 | Place names one level at a time by zoom: continents and oceans (to 3), countries and seas (3 to 5.5), cities (5.5+), towns (7.5+), villages (9+); state names hidden | Showing countries and cities together cluttered the map; Windy's levels as inspiration (Santosh) |
| 24 Nov 2026 | Clicking a city or town name opens its 4-day panel; searching a continent, country or state only moves the map (continents from a built-in list) | A big area has no single-point forecast (Santosh) |
| 24 Nov 2026 | Second map, "Rain type": same areas as the rain map (1 mm+), one flat colour per type (Rain, Rain and snow, Snow from `sf`/`tp`; Freezing rain, Ice pellets from `ptype` at block end, which take priority); switch on the right; box and panel unchanged | Santosh's request; block-end `ptype` keeps map, box and cards in agreement |
| 25 Nov 2026 | Card total reads "24 h from 1 AM" (not "1 AM to 1 AM"); chance window ties go to the window starting within the card's day; weekday added when the window starts on another day | "1 AM to 1 AM" read as zero hours, and a tie showed a window from the previous evening (Santosh) |
| 24 Nov 2026 | Tiles hold all fields and are gzip-compressed | Six fields as plain JSON would have made the site about 600 MB; compressed it is about 60 MB |
| 15 Nov 2026 | Map colours start at 1 mm, in six bands (1, 2.5, 5, 10, 20, 50 mm), 60% solid, smoothed | Starting at 0.1 mm coloured 39% of the globe and hid the land; 1 mm colours about 8.5% |
