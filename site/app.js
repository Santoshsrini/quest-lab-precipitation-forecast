// Varsha: map and search.
//
// The user picks a place either by clicking the map or by searching.
// Either way we end up in select(), which marks the place with a white dot
// and shows its name in the search bar.

// ---------------------------------------------------------------- settings

const START_VIEW = { center: [79, 22], zoom: 4 };     // India, as [longitude, latitude]
const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";   // free, no key
const PHOTON = "https://photon.komoot.io";            // place names and search
const TYPING_PAUSE_MS = 300;                          // wait this long after a key press

// Colours for the map, lifting OpenFreeMap's near-black style to a mid grey.
const LAND = "#63666a";
const WATER = "#54575b";
const BORDER = "#2c2e31";
const ROAD = "#5c5f63";
const LABEL = "#f1f3f5";

// ---------------------------------------------------------------- the map

let map = null;

async function startMap() {
  // Fetch the ready-made dark style and recolour it before showing it.
  const style = await (await fetch(MAP_STYLE)).json();
  for (const layer of style.layers) {
    layer.paint = layer.paint || {};
    layer.layout = layer.layout || {};
    if (layer.type === "background") {
      layer.paint["background-color"] = LAND;
    } else if (layer.type === "raster") {
      layer.layout.visibility = "none";             // shaded relief: not needed
    } else if (layer.type === "fill") {
      if (layer.id.startsWith("water")) layer.paint["fill-color"] = WATER;
      else layer.layout.visibility = "none";        // parks, woods, buildings: keep it plain
    } else if (layer.type === "line") {
      if (layer.id.includes("boundary")) {
        layer.paint["line-color"] = BORDER;
        layer.paint["line-opacity"] = 0.55;
      } else if (layer.id.startsWith("water")) {
        layer.paint["line-color"] = WATER;
      } else {
        layer.paint["line-color"] = ROAD;           // roads and railways: barely visible
      }
    } else if (layer.type === "symbol") {
      // Place names in English where there is one, in one script only.
      if (layer.layout["text-field"]) {
        layer.layout["text-field"] =
          ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
      }
      layer.paint["text-color"] = LABEL;
      layer.paint["text-halo-color"] = "rgba(40, 42, 45, 0.85)";
      layer.paint["text-halo-width"] = 1.2;
    }
  }
  setLabelLevels(style);

  map = new maplibregl.Map({
    container: "map",
    style,
    center: START_VIEW.center,
    zoom: START_VIEW.zoom,
    minZoom: 1.5,               // cannot zoom out past about one world
    maxZoom: 11,                // cannot zoom in past city level
    dragRotate: false,          // the map always has north at the top
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: false,  // added below, with our own credits
  });
  map.touchZoomRotate.disableRotation();

  // Credits first, so they sit at the very bottom with the zoom buttons above.
  map.addControl(new maplibregl.AttributionControl({
    compact: false,
    customAttribution:
      'Forecast: <a href="https://www.ecmwf.int/en/forecasts/datasets/open-data">ECMWF Open Data</a> (CC BY 4.0) | ' +
      'Search: <a href="https://photon.komoot.io">Photon</a>',
  }), "bottom-right");
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

  map.on("click", onMapClick);
  map.on("mousemove", (event) => {                // a hand over city and town names
    map.getCanvas().style.cursor = labelAt(event.point) ? "pointer" : "";
  });
  map.on("load", startRain);      // colour the map once it has been drawn
}

// Place names, one level at a time as you zoom in:
//   zoom 1.5 to 3     continents and oceans
//   zoom 3 to 5.5     countries, oceans and seas
//   zoom 5.5 to 7.5   cities
//   zoom 7.5 and in   cities and towns (villages from 9)
// State names, suburbs and road names are never shown.
const LEVEL = { country: 3, city: 5.5, town: 7.5, village: 9 };
const CONTINENTS = ["Africa", "Antarctica", "Asia", "Europe", "North America", "South America", "Oceania"];
const NAME = ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
const CLICKABLE = ["place_city_large", "place_city", "place_town", "place_village"];

function setLabelLevels(style) {
  const levels = {
    // id: [from zoom, up to zoom, text size, capitals?, letter spacing]
    place_country_major: [LEVEL.country, LEVEL.city, ["interpolate", ["linear"], ["zoom"], 3, 12, 5.5, 15], true, 0.2],
    place_country_minor: [LEVEL.country, LEVEL.city, ["interpolate", ["linear"], ["zoom"], 3, 10, 5.5, 13], true, 0.15],
    place_country_other: [LEVEL.country, LEVEL.city, ["interpolate", ["linear"], ["zoom"], 3, 9, 5.5, 12], true, 0.15],
    place_city_large: [LEVEL.city, 24, ["interpolate", ["linear"], ["zoom"], 5.5, 13, 9, 15], false, 0],
    place_city: [LEVEL.city, 24, ["interpolate", ["linear"], ["zoom"], 5.5, 11, 9, 13], false, 0],
    place_town: [LEVEL.town, 24, ["interpolate", ["linear"], ["zoom"], 7.5, 11, 10, 12], false, 0],
    place_village: [LEVEL.village, 24, 10.5, false, 0],
  };
  const hidden = ["place_state", "place_other", "place_suburb", "highway_name_other",
                  "highway_name_motorway", "road_oneway", "road_oneway_opposite"];

  for (const layer of style.layers) {
    const level = levels[layer.id];
    if (level) {
      const [from, to, size, capitals, spacing] = level;
      layer.minzoom = from;
      layer.maxzoom = to;
      layer.layout["text-size"] = size;
      layer.layout["text-transform"] = capitals ? "uppercase" : "none";
      layer.layout["text-letter-spacing"] = spacing;
      if (capitals) layer.paint["text-opacity"] = 0.75;    // countries a little faded
    } else if (hidden.includes(layer.id)) {
      layer.layout.visibility = "none";
    } else if (layer.id === "water_name") {
      layer.minzoom = LEVEL.town;                            // river names only when close
    }
  }

  // Continent, ocean and sea names: in OpenFreeMap's data but not drawn by
  // its style, so add them here.
  const paint = { "text-color": LABEL, "text-halo-color": "rgba(40, 42, 45, 0.85)", "text-halo-width": 1.2 };
  const point = ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false];
  style.layers.push(
    {
      id: "continent_name", type: "symbol", source: "openmaptiles", "source-layer": "place",
      maxzoom: LEVEL.country,
      filter: ["all", point, ["==", ["get", "class"], "continent"], ["in", NAME, ["literal", CONTINENTS]]],
      layout: { "text-field": NAME, "text-font": ["Noto Sans Regular"], "text-size": 14,
                "text-transform": "uppercase", "text-letter-spacing": 0.4 },
      paint: { ...paint, "text-opacity": 0.85 },
    },
    {
      id: "ocean_name", type: "symbol", source: "openmaptiles", "source-layer": "water_name",
      maxzoom: LEVEL.city,
      // The data files oceans as seas, so pick them by name.
      filter: ["all", point, ["in", "Ocean", NAME]],
      layout: { "text-field": NAME, "text-font": ["Noto Sans Italic"], "text-size": 13,
                "text-letter-spacing": 0.25, "text-max-width": 8 },
      paint: { ...paint, "text-opacity": 0.75 },
    },
    {
      id: "sea_name", type: "symbol", source: "openmaptiles", "source-layer": "water_name",
      minzoom: LEVEL.country, maxzoom: LEVEL.town,
      filter: ["all", point, ["!", ["in", "Ocean", NAME]],
               ["match", ["get", "class"], ["sea", "bay", "gulf", "strait"], true, false]],
      layout: { "text-field": NAME, "text-font": ["Noto Sans Italic"], "text-size": 11,
                "text-letter-spacing": 0.1, "text-max-width": 8 },
      paint: { ...paint, "text-opacity": 0.7 },
    },
  );
}

startMap();

// ---------------------------------------------------------- the selection

// The place the user has picked: { lat, lon, name }, or null for none.
// Build phase 3 reads this to show the forecast.
let selected = null;
let dot = null;               // the white dot on the map
let pickNumber = 0;           // counts picks, so a slow answer for an old pick is ignored

const input = document.getElementById("search-input");
const clearButton = document.getElementById("search-clear");
const list = document.getElementById("suggestions");

function select(lat, lon, name) {
  selected = { lat, lon, name, zone: zoneAt(lat, lon) };
  pickNumber += 1;

  if (dot) dot.remove();
  const element = document.createElement("div");
  element.className = "dot";
  dot = new maplibregl.Marker({ element }).setLngLat([lon, lat]).addTo(map);

  input.value = name;
  clearButton.hidden = false;
  hideSuggestions();
  showForecast();
}

// Remove the white dot, the summary box and the panel, and empty the search
// bar. The map stays where it is.
function clearSelection() {
  selected = null;
  pickNumber += 1;
  closeForecast();
  if (dot) dot.remove();
  dot = null;
  input.value = "";
  clearButton.hidden = true;
  hideSuggestions();
}

// "12.97°N, 77.59°E"
function formatCoordinates(lat, lon) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

// ------------------------------------------------------- clicking the map

// The city or town name drawn under a point on the screen, or undefined.
function labelAt(point) {
  const box = [[point.x - 4, point.y - 4], [point.x + 4, point.y + 4]];
  return map.queryRenderedFeatures(box, { layers: CLICKABLE })[0];
}

async function onMapClick(event) {
  // Clicking a city or town name: forecast for that place, straight in the panel.
  const label = labelAt(event.point);
  if (label) {
    const [lon, lat] = label.geometry.coordinates;
    const name = label.properties.name_en || label.properties["name:latin"] || label.properties.name;
    panelOpen = true;
    shownDay = 0;
    select(lat, lon, name);
    const thisPick = pickNumber;
    // Add the state and country ("Chennai, Tamil Nadu, India") when known.
    const place = await findPlace(lat, lon);
    if (place && place.region && thisPick === pickNumber) {
      selected.name = `${name}, ${place.region}`;
      input.value = selected.name;
      showNames();
    }
    return;
  }

  // wrap() brings the longitude back into -180 to 180 after dragging round the globe
  const { lat, lng: lon } = event.lngLat.wrap();

  // Show the coordinates at once, then replace them with a name if one is found.
  select(lat, lon, formatCoordinates(lat, lon));
  const thisPick = pickNumber;

  const place = await findPlace(lat, lon);
  if (place && thisPick === pickNumber) {
    selected.name = place.full;
    input.value = place.full;
    showNames();
  }
}

// Ask Photon for the nearest town or city, within 50 km: describe()'s
// { place, region, full }, or null if none.
async function findPlace(lat, lon) {
  const url = `${PHOTON}/reverse?lat=${lat}&lon=${lon}&lang=en&radius=50` +
              "&layer=city&layer=county&layer=state";
  try {
    const response = await fetch(url);
    const place = (await response.json()).features[0];
    return place ? describe(place.properties) : null;
  } catch (error) {
    return null;              // no network, or Photon is down: keep what we have
  }
}

// Turn Photon's description of a place into text to show.
//   place:  "Chennai"            region: "Tamil Nadu, India"
//   full:   "Chennai, Tamil Nadu, India"
function describe(p) {
  const place = p.type === "city" || !p.city ? p.name : p.city;
  const parts = [p.state, p.country].filter((part) => part && part !== place);
  const region = [...new Set(parts)].join(", ");
  return { place, region, full: region ? `${place}, ${region}` : place };
}

// ---------------------------------------------------------- the search bar

// Search results that only move the map, with no forecast.
const WIDE_AREAS = ["continent", "country", "state"];
// The continents, for search: [west, north, east, south].
const CONTINENT_VIEWS = [
  { name: "Africa", extent: [-18, 37, 52, -35] },
  { name: "Antarctica", extent: [-180, -60, 180, -85] },
  { name: "Asia", extent: [26, 75, 150, -10] },
  { name: "Europe", extent: [-25, 71, 45, 35] },
  { name: "North America", extent: [-168, 72, -52, 7] },
  { name: "South America", extent: [-82, 13, -34, -56] },
  { name: "Oceania", extent: [110, 0, 180, -48] },
];

let typingTimer = null;
let suggestions = [];         // the places now listed
let activeIndex = -1;         // which one the arrow keys have highlighted
let searchNumber = 0;         // counts searches, so a slow old answer is ignored

input.addEventListener("input", () => {
  clearButton.hidden = input.value === "";
  clearTimeout(typingTimer);
  const text = input.value.trim();
  if (text.length < 2) {
    hideSuggestions();
    return;
  }
  typingTimer = setTimeout(() => search(text), TYPING_PAUSE_MS);
});

async function search(text) {
  searchNumber += 1;
  const thisSearch = searchNumber;

  // lat and lon make Photon prefer places near what the map is showing.
  const centre = map.getCenter().wrap();
  const url = `${PHOTON}/api/?q=${encodeURIComponent(text)}&limit=5&lang=en` +
              `&lat=${centre.lat.toFixed(2)}&lon=${centre.lng.toFixed(2)}` +
              "&layer=city&layer=district&layer=county&layer=state&layer=country";
  let found;
  try {
    const response = await fetch(url);
    found = (await response.json()).features;
  } catch (error) {
    if (thisSearch === searchNumber) showNote("Search is not available right now.");
    return;
  }
  if (thisSearch !== searchNumber) return;      // the user has typed more since

  suggestions = found.map((feature) => {
    const p = feature.properties;
    const s = describe(p);
    return {
      ...s,
      type: p.type,
      lat: feature.geometry.coordinates[1],
      lon: feature.geometry.coordinates[0],
      extent: p.extent,             // [west, north, east, south], for countries and states
      // The district or county, if it says more than the place's own name.
      area: [p.district, p.county].find((a) => a && a !== s.place && !s.region.includes(a)) || "",
    };
  });
  // Continents first: Photon doesn't know them.
  const typed = text.toLowerCase();
  const continents = CONTINENT_VIEWS
    .filter((c) => c.name.toLowerCase().startsWith(typed))
    .map((c) => ({ place: c.name, region: "Continent", full: c.name, type: "continent",
                   extent: c.extent, area: "" }));
  suggestions = [...continents, ...suggestions.filter((s) => !continents.some((c) => c.place === s.place))];
  if (suggestions.length === 0) {
    showNote("No place found with that name.");
    return;
  }

  // Places that would look identical in the list (same name and region),
  // such as the two Yong'an in Fujian, get their district or county and
  // their coordinates on an extra line, so the user can tell them apart.
  const looks = (s) => `${s.place}|${s.region}`;
  for (const s of suggestions) {
    const same = suggestions.filter((t) => looks(t) === looks(s)).length > 1;
    s.detail = same ? [s.area, formatCoordinates(s.lat, s.lon)].filter(Boolean).join(" · ") : "";
  }

  list.replaceChildren(...suggestions.map((s, index) => {
    const item = document.createElement("li");
    const place = document.createElement("div");
    place.className = "place";
    place.textContent = s.place;
    const region = document.createElement("div");
    region.className = "region";
    region.textContent = s.region;
    item.append(place, region);
    if (s.detail) {
      const detail = document.createElement("div");
      detail.className = "detail";
      detail.textContent = s.detail;
      item.append(detail);
    }
    // mousedown, not click: it fires before the input loses focus
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      choose(index);
    });
    return item;
  }));
  activeIndex = -1;
  list.hidden = false;
}

function showNote(text) {
  suggestions = [];
  const item = document.createElement("li");
  item.className = "note";
  item.textContent = text;
  list.replaceChildren(item);
  list.hidden = false;
}

function hideSuggestions() {
  clearTimeout(typingTimer);
  searchNumber += 1;          // ignore any answer still on its way
  suggestions = [];
  activeIndex = -1;
  list.hidden = true;
}

// The user picked suggestion number `index`.
function choose(index) {
  const s = suggestions[index];
  if (!s) return;
  if (WIDE_AREAS.includes(s.type)) {
    // A continent, country or state is too big for one point's forecast:
    // just show it on the map.
    clearSelection();
    input.value = s.full;
    clearButton.hidden = false;
    if (s.extent) {
      const [west, north, east, south] = s.extent;
      map.fitBounds([[west, south], [east, north]], { padding: 40, maxZoom: 6.5 });
    } else {
      map.flyTo({ center: [s.lon, s.lat], zoom: s.type === "state" ? 5.5 : 4 });
    }
    input.blur();
    return;
  }
  select(s.lat, s.lon, s.full);
  // With the panel open, land the place in the strip of map above it.
  map.flyTo({ center: [s.lon, s.lat], zoom: s.type === "county" ? 8 : 9,
              offset: panelOpen ? stripOffset() : [0, 0] });
  input.blur();
}

input.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideSuggestions();
    return;
  }
  if (suggestions.length === 0) return;

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    activeIndex = (activeIndex + step + suggestions.length) % suggestions.length;
    [...list.children].forEach((item, i) => item.classList.toggle("active", i === activeIndex));
  } else if (event.key === "Enter") {
    event.preventDefault();
    choose(activeIndex >= 0 ? activeIndex : 0);
  }
});

// Leaving the search bar closes the list and restores the selected name.
input.addEventListener("blur", () => {
  hideSuggestions();
  if (selected) input.value = selected.name;
  clearButton.hidden = input.value === "";
});

clearButton.addEventListener("click", () => {
  clearSelection();
  input.focus();
});

// ============================================================ the forecast
//
// The data script (pipeline/fetch_forecast.py) saves the forecast as:
//   data/meta.json               when the forecast starts, how many blocks
//   data/tiles/r07_c25.json.gz   every field, one gzip file per 10 x 10 degrees
// See docs/backend-data-processing.md for the layout.

const HOUR_MS = 3600 * 1000;
const DAYS_SHOWN = 4;         // today and the next 3 days
const MIN_SCALE_MM = 5;       // a full-height bar is at least this much rain

let meta = null;              // the contents of meta.json, once loaded
const tileCache = new Map();  // tiles already downloaded, by file name

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

// ---- keeping up with new data
//
// The scheduled job replaces the data files several times a day. meta.json
// says when the forecast starts, so the tiles and pictures must always be
// read with the meta.json they were made with. Before reading a new tile or
// picture, and every few minutes, the page asks for meta.json again
// (bypassing the browser's cache). If it has changed, the page drops what it
// downloaded, redraws the map and refreshes the open box or panel.
const META_CHECK_MS = 5 * 60 * 1000;    // the regular check
let metaCheckedAt = 0;

async function loadMeta() {
  meta = await fetchJson("data/meta.json", { cache: "no-store" });
  metaCheckedAt = Date.now();
}

// Fetch meta.json again. Returns true if the data was remade since the
// page last read it (meta is then the new one and old tiles are forgotten).
async function checkForNewData() {
  let fresh;
  try {
    fresh = await fetchJson("data/meta.json", { cache: "no-store" });
  } catch (error) {
    return false;               // offline for a moment: keep what we have
  }
  metaCheckedAt = Date.now();
  if (!meta || fresh.made === meta.made) return false;
  meta = fresh;
  tileCache.clear();
  return true;
}

// After new data: redraw the map colours and legend for the new run.
function redrawMapForNewData() {
  if (!meta.pictures || !map.getSource("rain")) return;
  if (!typeInfo()) mapMode = "amount";
  else paintModeIcons();
  buildLegend();
  shownBlock = null;
  showRainForNow();
}

// Which tile holds the grid point nearest to this place, and where in the
// tile's "values" list is it? Same arithmetic as find_point() in the data script.
function findPoint(lat, lon) {
  const g = meta.grid;
  const per = meta.tile_points;                                   // 40
  let gridRow = Math.floor((g.north - lat) / g.spacing + 0.5);    // 0 to 720
  let gridCol = Math.floor((lon - g.west) / g.spacing + 0.5);     // 0 to 1440
  if (gridCol === g.cols) gridCol = 0;                            // the 180 line
  const lastTileRow = Math.floor((g.rows - 1) / per) - 1;         // 17
  const tileRow = Math.min(Math.floor(gridRow / per), lastTileRow);
  const tileCol = Math.floor(gridCol / per);
  const position = (gridRow - tileRow * per) * per + (gridCol - tileCol * per);
  const two = (n) => String(n).padStart(2, "0");
  return { file: `r${two(tileRow)}_c${two(tileCol)}.json.gz`, position };
}

// The rain entry in meta.json's list of parameters.
const rainInfo = () => meta.parameters.find((p) => p.id === "tp");

// Tiles are gzip-compressed JSON (to keep the site small); the browser
// unpacks them with its built-in DecompressionStream.
async function fetchGzipJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const unpacked = response.body.pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(unpacked).text());
}

// Everything the panel needs for one place, as lists:
//   tp, cp, sf   total, its showery part and its snowfall part, mm per 3-hour block
//   tmax, tmin   highest and lowest temperature per block, degrees C
//   wx       weather code per block: hazard * 2 + storm
//              (hazard at the block's end: 0 none, 1 freezing rain or drizzle, 2 ice pellets)
//   p10      ensemble chance of 10 mm or more, % per 24-hour window
async function loadPoint(lat, lon) {
  if (!meta) await loadMeta();
  let { file, position } = findPoint(lat, lon);
  let url = `data/${meta.tiles}/${file}?made=${meta.made}`;
  if (!tileCache.has(url)) {
    // About to download a tile: first make sure meta.json is still the
    // current one, so the tile and its times come from the same run.
    if (await checkForNewData()) {
      redrawMapForNewData();
      ({ file, position } = findPoint(lat, lon));
      url = `data/${meta.tiles}/${file}?made=${meta.made}`;
    }
    tileCache.set(url, await fetchGzipJson(url));
  }
  const f = tileCache.get(url).fields;
  const at = (name) => f[name][position];
  return {
    tp: at("tp").map((tenths) => tenths / 10),
    cp: at("cp").map((tenths) => tenths / 10),
    sf: at("sf").map((tenths) => tenths / 10),
    tmax: at("tmax"), tmin: at("tmin"), wx: at("wx"), p10: at("p10"),
  };
}

// ------------------------------------------------ local time of a place

// The time zone at a latitude and longitude, such as "Asia/Kolkata".
// If the tz-lookup library did not load, use the browser's own zone.
function zoneAt(lat, lon) {
  try {
    return tzlookup(lat, lon);
  } catch (error) {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}

// The date at a moment in a zone, as "2026-11-23".
function dayKey(date, zone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric",
                                            month: "2-digit", day: "2-digit" }).format(date);
}

// The day after a "2026-11-23" key, as a key.
function nextDayKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// "Monday 23 Nov", for a "2026-11-23" key.
function dayName(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short",
                                            timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

// "Asia/Kolkata (UTC+5:30)"
function zoneLabel(zone) {
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" })
    .formatToParts(new Date()).find((p) => p.type === "timeZoneName").value;
  return `${zone} (${offset.replace("GMT", "UTC").replace(/^UTC$/, "UTC+0")})`;
}

// Block number k starts this many hours after the forecast's start.
// k can be negative or past the end: those blocks have no data.
function blockStart(k) {
  return new Date(Date.parse(meta.first_block_start) + k * meta.block_hours * HOUR_MS);
}

function blockValue(rain, k) {
  return k >= 0 && k < rain.length ? rain[k] : null;      // null = no data
}

// The block that contains the present moment.
function currentBlock() {
  return Math.floor((Date.now() - Date.parse(meta.first_block_start)) / (meta.block_hours * HOUR_MS));
}

// Split the forecast into the place's today and the next 3 days, in the
// place's own time zone. A block belongs to the day in which it starts.
// Only blocks from the latest forecast run are shown: blocks before the
// run's start are not in the data, and are always in the past anyway.
function groupIntoDays(point, zone) {
  const rain = point.tp;
  const days = [];
  let key = dayKey(new Date(), zone);
  for (let d = 0; d < DAYS_SHOWN; d++) {
    days.push({ key, blocks: [] });
    key = nextDayKey(key);
  }
  const now = currentBlock();
  for (let k = 0; k < rain.length; k++) {
    const day = days.find((d) => d.key === dayKey(blockStart(k), zone));
    if (day) day.blocks.push({ k, start: blockStart(k), mm: rain[k], isNow: k === now });
  }
  return days;
}

// "5:30 PM", "6 PM". With a zone, in that zone; without, in the viewer's own.
function formatTime(date, zone) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone })
    .format(date).replace(":00", "");
}
const formatMm = (mm) => (mm === 0 ? "0" : mm.toFixed(1));

// ---------------------------------------------- summary box and panel

const panel = document.getElementById("panel");
const panelTitle = document.getElementById("panel-title");
const panelNote = document.getElementById("panel-note");
const panelPlace = document.getElementById("panel-place");

// Where the selected place is, and which grid point its forecast comes
// from. Two places can share a name (there are two Yong'an in Fujian), so
// this tells the user exactly which one they picked.
//   "Picked 25.94°N, 117.36°E · forecast for grid point 26.00°N, 117.25°E, 13 km away"
function placeDescription(lat, lon) {
  const g = meta.grid;
  let row = Math.floor((g.north - lat) / g.spacing + 0.5);         // same rounding as findPoint
  let col = Math.floor((lon - g.west) / g.spacing + 0.5);
  if (col === g.cols) col = 0;
  const gridLat = g.north - row * g.spacing;
  const gridLon = g.west + col * g.spacing;
  return `Picked ${formatCoordinates(lat, lon)} · forecast for grid point ` +
         `${formatCoordinates(gridLat, gridLon)}, ${Math.round(distanceKm(lat, lon, gridLat, gridLon))} km away`;
}

// Distance along the Earth's surface, in km.
function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
const panelBody = document.getElementById("panel-body");

let box = null;               // the summary box attached to the white dot
let panelOpen = false;        // true once the down arrow has been pressed

// Called whenever a place is picked. Shows the summary box, or, if the panel
// is already open, refreshes the panel for the new place.
async function showForecast() {
  const thisPick = pickNumber;
  const { lat, lon } = selected;

  if (panelOpen) {
    if (box) box.remove();
    box = null;
    fillPanel(null, "Loading forecast…");
  } else {
    fillBox(null, "Loading forecast…");
  }

  let point = null;
  let problem = "";
  try {
    point = await loadPoint(lat, lon);
  } catch (error) {
    problem = "Could not load the forecast.";
  }
  if (thisPick !== pickNumber) return;        // another place was picked meanwhile

  if (panelOpen) fillPanel(point, problem);
  else fillBox(point, problem);
}

function closeForecast() {
  if (box) box.remove();
  box = null;
  panelOpen = false;
  panel.hidden = true;
  document.body.classList.remove("panel-open");
}

// The place name changed (the name for a clicked point arrives a moment later).
function showNames() {
  if (!selected) return;
  const title = document.querySelector(".box-title");
  if (title) title.textContent = selected.name.split(",")[0];
  panelTitle.textContent = selected.name;
}

// A small helper to build elements: el("div", "class", "text")
function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function tryAgainButton() {
  const button = el("button", "try-again", "Try again");
  button.type = "button";
  button.addEventListener("click", showForecast);
  return button;
}

// ---- the summary box

function fillBox(point, message) {
  const content = el("div", "box");

  const head = el("div", "box-head");
  head.append(el("div", "box-title", selected.name.split(",")[0]));
  const close = el("button", "box-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", clearSelection);
  head.append(close);
  content.append(head);

  if (!point) {
    content.append(el("div", "box-message", message));
    if (message.startsWith("Could not")) content.append(tryAgainButton());
  } else {
    const k = currentBlock();
    const mm = blockValue(point.tp, k);
    if (mm === null) {
      content.append(el("div", "box-message", "No forecast for the present time."));
    } else {
      content.append(el("div", "box-amount", `${formatMm(mm)} mm`));
      const zone = selected.zone;
      const type = mm < 0.1 ? "No rain" : precipType(mm, blockValue(point.sf, k));
      content.append(el("div", "box-when",
        `${type}, ${formatTime(blockStart(k), zone)} to ${formatTime(blockStart(k + 1), zone)}`));
      // Hazard from ptype at the block's end only, so "possible".
      const hazard = mm >= 0.1 ? point.wx[k] >> 1 : 0;
      if (hazard) {
        content.append(el("div", "box-hazard",
          hazard === 1 ? "Freezing rain possible" : "Ice pellets possible"));
      }
    }
    const more = el("button", "box-more", "4-day forecast");
    more.type = "button";
    more.prepend(el("span", "arrow", "▾"));
    more.addEventListener("click", () => {
      box.remove();                             // the arrow swaps the box for the panel
      box = null;
      panelOpen = true;
      shownDay = 0;
      fillPanel(point, "");
    });
    content.append(more);
  }

  if (box) box.remove();
  box = new maplibregl.Popup({ closeButton: false, closeOnClick: false, focusAfterOpen: false,
                               anchor: "bottom", offset: 20, maxWidth: "260px" })
    .setLngLat([selected.lon, selected.lat])
    .setDOMContent(content)
    .addTo(map);
}

// ---- the bottom panel: four day cards, and the 3-hour timeline of one day

let shownDay = 0;                // which day card is selected (0 = today)

// India Meteorological Department's daily rainfall categories, in mm.
const INTENSITY = [
  [204.5, "Extremely heavy", "extreme"], [115.6, "Very heavy", "very-heavy"],
  [64.5, "Heavy", "heavy"], [15.6, "Moderate", "moderate"],
  [2.5, "Light", "light"], [0.1, "Very light", "very-light"], [0, "No rain", "none"],
];

// The 24-hour ensemble window that overlaps [from, to) the most.
function bestWindow(point, from, to) {
  const runStart = Date.parse(meta.prob_run);
  let best = null;
  meta.prob_windows.forEach(([a, b], i) => {
    const ws = runStart + a * HOUR_MS, we = runStart + b * HOUR_MS;
    const overlap = Math.min(we, to) - Math.max(ws, from);
    if (overlap <= 0) return;
    // On a tie, prefer the window that starts within the card's day, so the
    // card isn't labelled with a window that began the day before.
    const startsInDay = ws >= from && ws < to;
    if (!best || overlap > best.overlap || (overlap === best.overlap && startsInDay && !best.startsInDay)) {
      best = { overlap, startsInDay, pct: point.p10[i], start: new Date(ws) };
    }
  });
  return best;
}

// The chance window's start, as "7 AM", or "Mon 7 PM" when it starts on a
// different local day from the card's own day.
function chanceStart(start, cardDayKey, zone) {
  const time = formatTime(start, zone);
  if (dayKey(start, zone) === cardDayKey) return time;
  return `${dayName(dayKey(start, zone)).slice(0, 3)} ${time}`;
}

// Rain, snow, or both, from the share of the total that falls as snow.
// Used by the day cards (day sums) and the summary box (one block).
function precipType(tp, sf) {
  const snowy = tp > 0 ? sf / tp : 0;
  if (snowy >= 0.8) return "Snow";
  if (snowy > 0.2) return "Rain and snow";
  return "Rain";
}

// Everything one day card shows, worked out from that day's 3-hour blocks.
function summarise(day, point) {
  const ks = day.blocks.map((b) => b.k);
  if (ks.length === 0) return null;
  const sum = (list) => ks.reduce((t, k) => t + list[k], 0);
  const total = sum(point.tp);
  // Shares of the day's total, from amounts summed over the whole day.
  const showery = total > 0 ? sum(point.cp) / total : 0;     // share that is showery
  const storm = ks.some((k) => point.wx[k] % 2 === 1);       // storm energy reached the threshold

  let condition;
  const type = precipType(total, sum(point.sf));
  if (total < 0.2) condition = "Dry";
  else if (total < 1) condition = "Mostly dry";
  else if (type !== "Rain") condition = type;              // Snow, or Rain and snow
  else if (storm && showery >= 0.5 && total >= 5) condition = "Storms likely";
  else if (showery >= 0.5) condition = "Showers";
  else condition = "Rain";

  // Hazards that snowfall amounts can't show, from ptype at block ends:
  // listed if any wet block (0.1 mm or more) shows them.
  const wet = ks.filter((k) => point.tp[k] >= 0.1);
  const hazards = [];
  if (wet.some((k) => point.wx[k] >> 1 === 1)) hazards.push("Freezing rain at times");
  if (wet.some((k) => point.wx[k] >> 1 === 2)) hazards.push("Ice pellets at times");

  const from = blockStart(ks[0]), to = blockStart(ks.at(-1) + 1);
  return {
    total, condition, hazards,
    intensity: INTENSITY.find(([min]) => total >= min),
    high: Math.max(...ks.map((k) => point.tmax[k])),
    low: Math.min(...ks.map((k) => point.tmin[k])),
    from, to,
    chance: bestWindow(point, from.getTime(), to.getTime()),
  };
}

// Small line icons for each condition (drawn in SVG, no image files).
const ICONS = {
  "Dry": '<circle cx="24" cy="24" r="8" class="sun"/><g class="rays"><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11.3 11.3l3.5 3.5M33.2 33.2l3.5 3.5M11.3 36.7l3.5-3.5M33.2 14.8l3.5-3.5"/></g>',
  "Mostly dry": '<circle cx="18" cy="17" r="6" class="sun"/><path class="cloud" d="M16 36h20a7 7 0 0 0 0-14 9 9 0 0 0-17 3 5.5 5.5 0 0 0-3 11z"/>',
  "Showers": '<circle cx="16" cy="14" r="5" class="sun"/><path class="cloud" d="M14 30h20a7 7 0 0 0 0-14 9 9 0 0 0-17 3 5.5 5.5 0 0 0-3 11z"/><path class="drops" d="M19 35l-1.5 4M27 35l-1.5 4"/>',
  "Rain": '<path class="cloud dark" d="M12 28h22a8 8 0 0 0 0-16 10 10 0 0 0-19 3 6.5 6.5 0 0 0-3 13z"/><path class="drops" d="M17 33l-2 5M24 33l-2 5M31 33l-2 5"/>',
  "Storms likely": '<path class="cloud dark" d="M12 27h22a8 8 0 0 0 0-16 10 10 0 0 0-19 3 6.5 6.5 0 0 0-3 13z"/><path class="bolt" d="M25 29l-5 8h5l-3 7 8-10h-5l3-5z"/><path class="drops" d="M15 32l-2 5M33 32l-2 5"/>',
  "Snow": '<path class="cloud" d="M12 26h22a8 8 0 0 0 0-16 10 10 0 0 0-19 3 6.5 6.5 0 0 0-3 13z"/><g class="flakes"><circle cx="17" cy="34" r="1.6"/><circle cx="24" cy="38" r="1.6"/><circle cx="31" cy="34" r="1.6"/></g>',
  "Rain and snow": '<path class="cloud" d="M12 26h22a8 8 0 0 0 0-16 10 10 0 0 0-19 3 6.5 6.5 0 0 0-3 13z"/><path class="drops" d="M17 31l-2 5M31 31l-2 5"/><g class="flakes"><circle cx="24" cy="36" r="1.6"/></g>',
};
// A ring gauge for a chance in %: a grey track and a blue arc, the number inside.
function ring(pct) {
  const r = 17, around = 2 * Math.PI * r;
  const shown = pct < 5 ? 0.04 : pct / 100;        // a sliver for "<5%"
  const wrap = el("div", "ring");
  wrap.innerHTML =
    `<svg viewBox="0 0 44 44" aria-hidden="true">` +
    `<circle cx="22" cy="22" r="${r}" class="ring-track"/>` +
    `<circle cx="22" cy="22" r="${r}" class="ring-arc" stroke-dasharray="${(shown * around).toFixed(1)} ${around.toFixed(1)}"/>` +
    `</svg>`;
  wrap.append(el("span", "ring-text", pct < 5 ? "<5%" : `${pct}%`));
  wrap.setAttribute("aria-label", `${pct < 5 ? "under 5" : pct}% chance of 10 mm or more`);
  return wrap;
}

function icon(condition) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[condition];
  return svg;
}

// Colour of a 3-hour bar: the map's colour bands, and a pale blue under 1 mm.
function barColour(mm) {
  const band = [...rainInfo().colours].reverse().find((c) => mm >= c.from);
  return band ? band.colour : "#c9d7ec";
}

function utcText(iso) {
  const d = new Date(Date.parse(iso));
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) +
    ", " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

// The strip of map left visible above the open panel and below the search bar.
const SEARCH_BAR_BOTTOM = 70;
function visibleStrip() {
  return { top: SEARCH_BAR_BOTTOM, bottom: panel.getBoundingClientRect().top };
}

// Where to centre the map so that [lon, lat] sits in the middle of the
// visible strip: the offset is from the map's centre, in pixels.
function stripOffset() {
  const { top, bottom } = visibleStrip();
  return [0, (top + bottom) / 2 - map.getContainer().clientHeight / 2];
}

// If the picked place is hidden behind the panel or the search bar, slide
// the map so it shows in the strip above the panel. The zoom stays the same.
function keepInView() {
  if (!selected || panel.hidden || map.isMoving()) return;
  const { top, bottom } = visibleStrip();
  const y = map.project([selected.lon, selected.lat]).y;
  if (y < top + 20 || y > bottom - 20) {
    map.easeTo({ center: [selected.lon, selected.lat], offset: stripOffset(), duration: 500 });
  }
}

function fillPanel(point, message) {
  panel.hidden = false;
  document.body.classList.add("panel-open");
  keepInView();
  panelTitle.textContent = selected.name;
  panelPlace.textContent = meta ? placeDescription(selected.lat, selected.lon)
                                : `Picked ${formatCoordinates(selected.lat, selected.lon)}`;
  panelBody.replaceChildren();

  if (!point) {
    panelNote.textContent = "";
    const note = el("div", "panel-message", message);
    if (message.startsWith("Could not")) note.append(tryAgainButton());
    panelBody.append(note);
    return;
  }

  const zone = selected.zone;
  panelNote.textContent = `Times in ${zoneLabel(zone)} · ECMWF IFS run ${utcText(meta.run)}` +
    ` · chance of rain from ensemble run ${utcText(meta.prob_run)}`;

  const days = groupIntoDays(point, zone);
  const summaries = days.map((day) => summarise(day, point));
  if (!summaries[shownDay]) shownDay = 0;

  // The four day cards.
  const cards = el("div", "cards");
  days.forEach((day, i) => {
    const s = summaries[i];
    const card = el("button", "card" + (i === shownDay ? " selected" : ""));
    card.type = "button";
    // dayName gives "Tuesday 24 Nov": the card shows "Today" / "Tue 24 Nov", or "Wed" / "25 Nov".
    const [weekday, ...date] = dayName(day.key).split(" ");
    // Top: day and date on the left, the condition icon on the right.
    const top = el("div", "card-top");
    const when = el("div");
    when.append(el("div", "card-day", i === 0 ? "Today" : weekday.slice(0, 3)));
    when.append(el("div", "card-date", i === 0 ? `${weekday.slice(0, 3)} ${date.join(" ")}` : date.join(" ")));
    top.append(when);
    card.append(top);
    if (!s) {
      card.append(el("div", "card-empty", "Not yet available"));
      card.disabled = true;
    } else {
      top.append(icon(s.condition));
      // Condition on the left, high / low on the right.
      const line = el("div", "card-line");
      line.append(el("div", "card-condition", s.condition));
      const temps = el("div", "card-temps");
      temps.innerHTML = `<b>${s.high}°C</b> / ${s.low}°C`;
      line.append(temps);
      card.append(line);
      // Keep the cards lined up: reserve the hazard line on every card if any has one.
      if (summaries.some((x) => x && x.hazards.length)) {
        card.append(el("div", "card-hazard", s.hazards.join(" · ")));
      }

      // The inner box: rainfall on the left, chance of 10 mm+ on the right.
      const box = el("div", "card-box");
      const rain = el("div", "card-rain");
      rain.append(el("div", "card-label", "Rainfall"));
      const total = el("div", "card-total", s.total === 0 ? "0" : s.total.toFixed(1));
      total.append(el("span", "card-unit", "mm"));
      rain.append(total, el("div", `pill ${s.intensity[2]}`, s.intensity[1]));
      box.append(rain);
      if (s.chance) {
        const chance = el("div", "card-chance");
        chance.append(el("div", "card-label", "10 mm+"), ring(s.chance.pct));
        box.append(chance);
      }
      card.append(box);

      // One small line: the hours the total covers (today can be shorter),
      // and the 24-hour window the chance is for.
      const hours = Math.round((s.to - s.from) / HOUR_MS);
      let note = `Rain: ${hours} h from ${formatTime(s.from, zone)}`;
      if (s.chance) note += ` · 10 mm+: 24 h from ${chanceStart(s.chance.start, day.key, zone)}`;
      card.append(el("div", "card-note", note));
      card.addEventListener("click", () => { shownDay = i; fillPanel(point, ""); });
    }
    cards.append(card);
  });
  panelBody.append(cards);

  // The timeline of the selected day.
  const day = days[shownDay];
  const timeline = el("div", "timeline");
  timeline.append(el("div", "timeline-title",
    (shownDay === 0 ? "Today, " : "") + dayName(day.key)));
  const largest = Math.max(MIN_SCALE_MM, ...day.blocks.map((b) => b.mm));
  const bars = el("div", "bars");
  for (const b of day.blocks) {
    const column = el("div", "slot" + (b.isNow ? " now" : ""));
    column.append(el("div", "slot-now", b.isNow ? "Now" : ""));
    column.append(el("div", "slot-amount", formatMm(b.mm)));
    const track = el("div", "slot-track");
    const bar = el("div", "slot-bar");
    if (b.mm > 0) {
      bar.style.height = `${Math.max(4, (b.mm / largest) * 100)}%`;
      bar.style.background = barColour(b.mm);
    }
    track.append(bar);
    column.append(track);
    column.append(el("div", "slot-start", formatTime(b.start, zone)));   // block start only
    bars.append(column);
  }
  timeline.append(bars);

  // Colour key, the same bands as the map.
  const key = el("div", "key");
  key.append(el("span", "key-title", "mm of rain per 3 hours"));
  const keyItem = (colour, text) => {
    const item = el("span", "key-item");
    const swatch = el("i");
    swatch.style.background = colour;
    item.append(swatch, text);
    key.append(item);
  };
  keyItem("#c9d7ec", "under 1");
  const bands = rainInfo().colours;
  bands.forEach((c, i) => keyItem(c.colour, i + 1 < bands.length ? `${c.from}–${bands[i + 1].from}` : `${c.from}+`));
  timeline.append(key);
  panelBody.append(timeline);
}

document.getElementById("panel-close").addEventListener("click", clearSelection);

// ========================================================= rain on the map
//
// The data script also saves one picture of the globe per 3-hour block
// (data/tp/pictures/b00.png ..., or data/type/pictures/ for the type map). The
// picture for the block that contains the present moment is laid over the
// map. It is only a picture: clicks still go to the map, and the numbers
// in the summary box and the panel still come from the tiles.

const legend = document.getElementById("legend");
const legendWhen = document.getElementById("legend-when");
let shownBlock = null;          // the block whose picture is on the map
// Which map: "amount" colours by mm, "type" by rain, snow and so on. The
// viewer's last choice is remembered in this browser only.
let mapMode = "amount";
try { if (localStorage.getItem("mapMode") === "type") mapMode = "type"; } catch (error) { /* ignore */ }

async function startRain() {
  try {
    if (!meta) await loadMeta();
  } catch (error) {
    return;                     // no forecast files: the plain map still works
  }
  if (!meta.pictures) return;
  // Older data has no type pictures: keep to the rain amount map.
  if (!typeInfo()) mapMode = "amount";
  else {
    paintModeIcons();
    modeSwitch.hidden = false;
  }
  setMapMode(mapMode);
  setInterval(keepUp, 60 * 1000);
}

// Every minute: look for new data every few minutes, or when the next block
// begins (its picture is about to be downloaded); then show the current block.
async function keepUp() {
  const nextBlock = currentBlock() !== shownBlock;
  if (nextBlock || Date.now() - metaCheckedAt >= META_CHECK_MS) {
    if (await checkForNewData()) {
      redrawMapForNewData();
      if (selected) showForecast();          // the box or panel, from the new run
      return;
    }
  }
  showRainForNow();
}

function showRainForNow() {
  const k = currentBlock();
  if (k === shownBlock) return;
  shownBlock = k;

  if (k < 0 || k >= meta.blocks) {            // the present moment is outside the forecast
    if (map.getLayer("rain")) map.setLayoutProperty("rain", "visibility", "none");
    legendWhen.textContent = "No forecast for the present time";
    return;
  }

  const p = meta.pictures;
  // "?made=" makes the browser fetch the new picture when the data is remade.
  const folder = mapMode === "type" ? typeInfo().pictures : rainInfo().pictures;
  const url = `data/${folder}/b${String(k).padStart(2, "0")}.png?made=${meta.made}`;
  const corners = [[p.west, p.north], [p.east, p.north], [p.east, p.south], [p.west, p.south]];

  if (map.getSource("rain")) {
    map.getSource("rain").updateImage({ url, coordinates: corners });
    map.setLayoutProperty("rain", "visibility", "visible");
  } else {
    map.addSource("rain", { type: "image", url, coordinates: corners });
    // Put the colours beneath the borders and the place names.
    const above = map.getStyle().layers.find((l) => l.type === "symbol" || l.id.includes("boundary"));
    map.addLayer({
      id: "rain", type: "raster", source: "rain",
      paint: { "raster-opacity": 0.6, "raster-fade-duration": 0 },
    }, above ? above.id : undefined);
  }
  // The map covers the whole globe, so its times are in the viewer's own zone.
  legendWhen.textContent = `${mapMode === "type" ? "Precipitation type" : "Precipitation"}, ` +
    `${formatTime(blockStart(k))} to ${formatTime(blockStart(k + 1))}`;
}

// The colour key, built from the same tables the data script used.
function buildLegend() {
  const bar = document.getElementById("legend-bar");
  const unit = document.getElementById("legend-unit");
  bar.classList.toggle("types", mapMode === "type");
  if (mapMode === "type") {
    const info = typeInfo();
    bar.replaceChildren(...info.types.map((t) => {
      const item = el("div", "legend-type");
      const swatch = el("i");
      swatch.style.background = t.colour;
      item.append(swatch, t.name);
      return item;
    }));
    unit.textContent = `where ${info.from_mm} mm or more falls in 3 hours`;
  } else {
    bar.replaceChildren(...rainInfo().colours.map((c) => {
      const step = el("div", "legend-step");
      const swatch = el("div", "legend-swatch");
      swatch.style.background = c.colour;
      step.append(swatch, el("div", "legend-number", String(c.from)));
      return step;
    }));
    unit.textContent = "mm per 3 hours";
  }
  legend.hidden = false;
}

// ---- the switch between the two maps: rain amount (mm) or rain type

const typeInfo = () => meta.parameters.find((p) => p.id === "type");
const modeSwitch = document.getElementById("mode");

function setMapMode(mode) {
  mapMode = mode;
  try { localStorage.setItem("mapMode", mode); } catch (error) { /* private window: not remembered */ }
  for (const button of modeSwitch.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
  if (!meta || !meta.pictures) return;
  buildLegend();
  shownBlock = null;              // redraw the picture for the same block
  showRainForNow();
}

for (const button of modeSwitch.querySelectorAll("button")) {
  button.addEventListener("click", () => setMapMode(button.dataset.mode));
}

// Each switch button's round icon: a colour wheel of that map's own colours
// (from meta.json), so the icon always matches the map.
function paintModeIcons() {
  const wheel = (colours) => {
    const slice = 360 / colours.length;
    return `conic-gradient(${colours.map((c, i) => `${c} ${i * slice}deg ${(i + 1) * slice}deg`).join(", ")})`;
  };
  const icon = (mode) => modeSwitch.querySelector(`[data-mode="${mode}"] .mode-icon`);
  icon("amount").style.background = wheel(rainInfo().colours.map((c) => c.colour));
  icon("type").style.background = wheel(typeInfo().types.map((t) => t.colour));
}
