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

*To be filled.*

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
