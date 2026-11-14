# Precipitation Forecast App — Planning Document

QUEST Lab (IISc) Full Stack AI Pre-doctoral selection task · Santosh Srinivas · started 14 Nov 2026

**Status:** planning only. No code is written until this document is agreed.

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
  - the precipitation forecast for that location for the next 24 hours, in 3-hour blocks (8 blocks, for example "3 PM to 6 PM: 4.2 mm"), in the selected place's local time
  - details of the location, for example:
    `N12°43'40", E77°46'15" · Asia/Kolkata (+05:30) · Sunrise 6:16 AM · Sunset 5:50 PM · Dusk 6:12 PM`

### Phase 2 (later)

- Forecast for the next 5 days or a week.
- Colouring or markings on the map that show where a lot of rain is expected.

### Not in scope

- Login or user accounts
- Saving favourite locations
- Special features such as airports

### Settled points

1. **Time step: 3-hour blocks.** The original request was hourly, but ECMWF Open Data gives precipitation every 3 hours for IFS and every 6 hours for AIFS (to be confirmed against the ECMWF documentation). We show what the data contains and do not invent hourly detail. This means Phase 1 uses IFS.
2. **Time window: the next 24 hours from now**, not the calendar day, so the panel is never nearly empty late in the day.
3. **Coverage: anywhere in the world.** The back end must handle the full global grid.

### Open point

- **The innovative element.** The brief asks for an "innovative front end and user experience" and Phase 1 is deliberately plain. Santosh will decide what to add once Phase 1 works. Risk: the deadline is 15 Nov, so there may be little or no time for it after Phase 1.

## 2. User Flow / App Flow

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
| Map | Leaflet 1.9.4, loaded from a CDN, with a free dark grey map style (see section 4; exact style confirmed when building starts) | The simplest map library. Zoom, drag and click work out of the box. Free, no key. |
| Bar chart | Drawn with plain HTML and CSS | Eight bars do not need a chart library. |
| Place search and place names | Photon (photon.komoot.io) | Free, no key, and built for suggestions while typing. Also turns a clicked point into a place name. |
| Time zone of the picked point | `tz-lookup`, a small JavaScript library | Works in the browser from latitude and longitude. No service to call. |
| Sunrise, sunset, dusk | SunCalc, a small JavaScript library | Calculated in the browser. No service to call. |

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
| Scheduled data job | GitHub Actions, every 6 hours | Free. Runs the Python script when ECMWF publishes a new forecast. |
| Website | GitHub Pages | The same scheduled job that makes the data files also publishes the site, in one step. |

**Why GitHub Pages and not Netlify.** Both would serve the page equally well. With Netlify, the scheduled job on GitHub would have to hand the fresh data files to Netlify every 6 hours, using either a stored access token or commits of data files that make the repository grow without limit. GitHub for both has fewer parts. Netlify stays available as a fallback.

**Versions**

- Leaflet 1.9.4.
- Every other package is fixed to an exact version when it is first installed and tested, and written into `requirements.txt` (Python) or into the page's CDN links (JavaScript). The versions are then listed here.
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
- **Rainfall colours on the map:** Phase 2, as section 1 says.

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

*To be filled.*

## 6. Implementation

*To be filled.*

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
