'use strict';

// STUB: resolves a point to a (placeholder, approximate) city corporation.
const data = require('./data/jurisdictions.json');

function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// shortcut: outer ring only, no holes/MultiPolygon; fine for the placeholder file.
function resolveJurisdiction(lat, lng) {
  for (const f of data.features) {
    if (inRing(lng, lat, f.geometry.coordinates[0])) return { ...f.properties };
  }
  return null;
}

module.exports = { resolveJurisdiction };
