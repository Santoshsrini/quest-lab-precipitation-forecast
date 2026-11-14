# Precipitation Forecast App — Planning Document

QUEST Lab (IISc) Full Stack AI Pre-doctoral selection task · Santosh Srinivas · started 14 Nov 2026

**Status:** planning only. No code is written until this document is agreed.

## Context

The selection task (Project 1): fetch precipitation forecasts from ECMWF Open Data (IFS or AIFS), process them, and deploy a web application that presents the forecast through an innovative front end and user experience.

## 1. Product Requirements

**Deadline:** within 3 days (by about 17 Nov 2026).
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

- **The innovative element.** The brief asks for an "innovative front end and user experience" and Phase 1 is deliberately plain. Santosh will decide what to add once Phase 1 works. Risk: with a 3-day deadline, Phase 1 must be finished early enough to leave time for it.

## 2. User Flow / App Flow

The app is a single screen. There are no separate pages.

### The flow

1. **Open the app.** The user sees the map filling the screen, centred on India, and a search bar at the top left. The user can still drag to anywhere in the world.
2. **Choose a location**, in either of two ways:
   - **Search:** type a place name such as "Chennai" or "Bangalore" in the search bar. A dropdown suggests matching places while the user types (for example "Chennai, Tamil Nadu, India") and the user picks one.
   - **Map:** zoom in, zoom out and drag the map (as on windy.com), then click a point. That point becomes the selected location.
3. **See the forecast.** A panel opens at the bottom of the screen. It shows:
   - the precipitation forecast for the selected location
   - beside the forecast, an "About this location" section with details such as the coordinates
4. **Close the panel** by pressing the cross mark.

### Bottom panel behaviour

- **Forecast drawing:** a bar chart. One bar per 3-hour block, taller for more rain, with the time below the bar and the amount in mm above it.
- **Phase 1:** the panel shows the forecast for the day only (the next 24 hours in 3-hour blocks, as settled in section 1).
- **Phase 2:** the panel scrolls left to right to show later times and days, with a dividing line between one day and the next.
- **"About this location" position:** always beside the forecast, in the same left-to-right strip, in the way the days sit side by side. It does not move below the forecast.

### Screen sizes

- Designed for a laptop or desktop screen first, and usable on a phone.
- On a phone the panel keeps the same side-by-side layout. If the forecast and "About this location" do not both fit across the screen, the user scrolls the panel sideways to reach the part that is off screen.

### Detailed behaviour

- **Marker:** a pin appears on the map at the selected point, so the user can see what the panel refers to.
- **After a search:** the map moves to the chosen place, drops the pin and opens the panel.
- **Choosing again:** clicking another point, or searching again, while the panel is open replaces the forecast in the panel. The user does not need to close it first.
- **After closing:** the pin is removed and the app returns to its opening state.
- **Place name:** the panel has a heading with the name of the place. For a search this is the name the user chose. For a map click it is the nearest named place if one can be found, otherwise the coordinates.
- **While loading:** the panel opens immediately with a loading indicator, then fills in.
- **If the forecast cannot be loaded:** the panel shows a short message and a "Try again" button.

## 3. Tech Stack Specification

*To be filled.*

## 4. Content Guidelines

*To be filled.*

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
