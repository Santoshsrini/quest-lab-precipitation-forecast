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
  map.on("load", startRain);      // colour the map once it has been drawn
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
  selected = { lat, lon, name };
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

async function onMapClick(event) {
  // wrap() brings the longitude back into -180 to 180 after dragging round the globe
  const { lat, lng: lon } = event.lngLat.wrap();

  // Show the coordinates at once, then replace them with a name if one is found.
  select(lat, lon, formatCoordinates(lat, lon));
  const thisPick = pickNumber;

  const name = await findPlaceName(lat, lon);
  if (name && thisPick === pickNumber) {
    selected.name = name;
    input.value = name;
    showNames();
  }
}

// Ask Photon for the nearest town or city, within 50 km. Returns "" if none.
async function findPlaceName(lat, lon) {
  const url = `${PHOTON}/reverse?lat=${lat}&lon=${lon}&lang=en&radius=50` +
              "&layer=city&layer=county&layer=state";
  try {
    const response = await fetch(url);
    const place = (await response.json()).features[0];
    return place ? describe(place.properties).full : "";
  } catch (error) {
    return "";                // no network, or Photon is down: keep the coordinates
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

  suggestions = found.map((feature) => ({
    ...describe(feature.properties),
    type: feature.properties.type,
    lat: feature.geometry.coordinates[1],
    lon: feature.geometry.coordinates[0],
  }));
  if (suggestions.length === 0) {
    showNote("No place found with that name.");
    return;
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
  // Zoom in further for a town than for a whole country.
  const zoom = { country: 4, state: 6, county: 8 }[s.type] || 9;
  select(s.lat, s.lon, s.full);
  map.flyTo({ center: [s.lon, s.lat], zoom });
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
//   data/meta.json             when the forecast starts, how many blocks
//   data/tiles/r07_c25.json    the rain values, one file per 10 x 10 degrees
// See docs/backend-data-processing.md for the layout.

const HOUR_MS = 3600 * 1000;
const DAYS_SHOWN = 4;         // today and the next 3 days
const MIN_SCALE_MM = 5;       // a full-height bar is at least this much rain

let meta = null;              // the contents of meta.json, once loaded
const tileCache = new Map();  // tiles already downloaded, by file name

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

// Which tile holds the grid point nearest to this place, and where in the
// tile's "rain" list is it? Same arithmetic as find_point() in the data script.
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
  return { file: `r${two(tileRow)}_c${two(tileCol)}.json`, position };
}

// Rain for one place: a list of numbers in mm, one per 3-hour block.
async function loadRain(lat, lon) {
  if (!meta) meta = await fetchJson("data/meta.json");
  const { file, position } = findPoint(lat, lon);
  if (!tileCache.has(file)) tileCache.set(file, await fetchJson(`data/tiles/${file}`));
  return tileCache.get(file).rain[position].map((tenths) => tenths / 10);
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

// Split the forecast into days, in the laptop's own time zone.
// A block belongs to the day in which it ends, so the block that contains
// 12 AM is the first block of the new day.
function groupIntoDays(rain) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];
  for (let d = 0; d < DAYS_SHOWN; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    days.push({ date, blocks: [] });
  }
  const now = currentBlock();
  for (let k = -40; k < rain.length + 40; k++) {
    const justBeforeEnd = new Date(blockStart(k + 1).getTime() - 60 * 1000);
    justBeforeEnd.setHours(0, 0, 0, 0);
    const day = days.find((d) => d.date.getTime() === justBeforeEnd.getTime());
    if (day) {
      day.blocks.push({ start: blockStart(k), mm: blockValue(rain, k),
                        isNow: k === now, missing: k < 0 ? "before" : "after" });
    }
  }
  return days;
}

const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short" });
const formatTime = (date) => timeFormat.format(date).replace(":00", "");     // "5:30 PM", "6 PM"
const formatMm = (mm) => (mm === 0 ? "0" : mm.toFixed(1));

// ---------------------------------------------- summary box and panel

const panel = document.getElementById("panel");
const panelTitle = document.getElementById("panel-title");
const panelNote = document.getElementById("panel-note");
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

  let rain = null;
  let problem = "";
  try {
    rain = await loadRain(lat, lon);
  } catch (error) {
    problem = "Could not load the forecast.";
  }
  if (thisPick !== pickNumber) return;        // another place was picked meanwhile

  if (panelOpen) fillPanel(rain, problem);
  else fillBox(rain, problem);
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

function fillBox(rain, message) {
  const content = el("div", "box");

  const head = el("div", "box-head");
  head.append(el("div", "box-title", selected.name.split(",")[0]));
  const close = el("button", "box-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", clearSelection);
  head.append(close);
  content.append(head);

  if (!rain) {
    content.append(el("div", "box-message", message));
    if (message.startsWith("Could not")) content.append(tryAgainButton());
  } else {
    const k = currentBlock();
    const mm = blockValue(rain, k);
    if (mm === null) {
      content.append(el("div", "box-message", "No forecast for the present time."));
    } else {
      content.append(el("div", "box-amount", `${formatMm(mm)} mm`));
      content.append(el("div", "box-when",
        `Rain, ${formatTime(blockStart(k))} to ${formatTime(blockStart(k + 1))}`));
    }
    const more = el("button", "box-more", "4-day forecast");
    more.type = "button";
    more.prepend(el("span", "arrow", "▾"));
    more.addEventListener("click", () => {
      box.remove();                             // the arrow swaps the box for the panel
      box = null;
      panelOpen = true;
      fillPanel(rain, "");
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

// ---- the bottom panel

function fillPanel(rain, message) {
  panel.hidden = false;
  document.body.classList.add("panel-open");
  panelTitle.textContent = selected.name;
  panelBody.replaceChildren();

  if (!rain) {
    panelNote.textContent = "";
    const note = el("div", "panel-message", message);
    if (message.startsWith("Could not")) note.append(tryAgainButton());
    panelBody.append(note);
    return;
  }

  const issued = new Date(Date.parse(meta.run));
  const issuedText = issued.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) +
    ", " + issued.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
  panelNote.textContent = `ECMWF forecast issued ${issuedText} · mm of rain per 3 hours · times in your local time`;

  const days = groupIntoDays(rain);
  const largest = Math.max(MIN_SCALE_MM, ...days.flatMap((d) => d.blocks.map((b) => b.mm || 0)));

  days.forEach((day, index) => {
    const section = el("div", "day");
    section.append(el("div", "day-name", (index === 0 ? "Today · " : "") + dayFormat.format(day.date)));

    const chart = el("div", "chart");
    for (const block of day.blocks) {
      const column = el("div", "column" + (block.isNow ? " now" : "") + (block.mm === null ? " empty" : ""));
      column.append(el("div", "amount", block.mm === null ? "–" : formatMm(block.mm)));
      const track = el("div", "track");
      const bar = el("div", "bar");
      if (block.mm) bar.style.height = `${Math.max(3, (block.mm / largest) * 100)}%`;
      track.append(bar);
      column.append(track);
      column.append(el("div", "time", formatTime(block.start)));
      chart.append(column);
    }

    // One label across the blocks that have no data.
    const before = day.blocks.filter((b) => b.mm === null && b.missing === "before").length;
    const after = day.blocks.filter((b) => b.mm === null && b.missing === "after").length;
    if (before) chart.append(gapLabel("before forecast", before, "left"));
    if (after) chart.append(gapLabel("not yet available", after, "right"));

    section.append(chart);
    panelBody.append(section);
  });
}

function gapLabel(text, count, side) {
  const label = el("div", "gap-label", text);
  label.style.width = `calc(${count} * var(--column))`;
  label.style[side] = "0";
  return label;
}

document.getElementById("panel-close").addEventListener("click", clearSelection);

// ========================================================= rain on the map
//
// The data script also saves one picture of the globe per 3-hour block
// (data/rain/b00.png, b01.png, ...), coloured by the amount of rain. The
// picture for the block that contains the present moment is laid over the
// map. It is only a picture: clicks still go to the map, and the numbers
// in the summary box and the panel still come from the tiles.

const legend = document.getElementById("legend");
const legendWhen = document.getElementById("legend-when");
let shownBlock = null;          // the block whose picture is on the map

async function startRain() {
  try {
    if (!meta) meta = await fetchJson("data/meta.json");
  } catch (error) {
    return;                     // no forecast files: the plain map still works
  }
  if (!meta.pictures) return;
  buildLegend();
  showRainForNow();
  setInterval(showRainForNow, 60 * 1000);     // move on when the next block begins
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
  const url = `data/${p.folder}/b${String(k).padStart(2, "0")}.png?made=${meta.made}`;
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
  legendWhen.textContent = `Rain, ${formatTime(blockStart(k))} to ${formatTime(blockStart(k + 1))}`;
}

// The colour key, built from the same table the data script used.
function buildLegend() {
  const bar = document.getElementById("legend-bar");
  bar.replaceChildren(...meta.pictures.colours.map((c) => {
    const step = el("div", "legend-step");
    const swatch = el("div", "legend-swatch");
    swatch.style.background = c.colour;
    step.append(swatch, el("div", "legend-number", String(c.from_mm)));
    return step;
  }));
  legend.hidden = false;
}
