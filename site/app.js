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
}

// Remove the white dot and empty the search bar. The map stays where it is.
function clearSelection() {
  selected = null;
  pickNumber += 1;
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
