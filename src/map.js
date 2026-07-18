/**
 * Leaflet-Setup: Karte mit CARTO-Positron-Tiles, Route zeichnen/anzeigen.
 *
 * Es gibt immer genau eine aktive Route – entweder aus einem GPX-Upload
 * oder manuell geklickt. setRoute() ersetzt sie vollständig.
 */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const GERMANY_CENTER = [51.2, 10.4];
const GERMANY_ZOOM = 6;

const ROUTE_STYLE = {
  color: '#10161f',
  weight: 4,
  opacity: 0.9,
  lineCap: 'round',
  lineJoin: 'round',
};

// Farben der Rückenwind-Bilanz (tail = schiebt, head = bremst)
const CATEGORY_COLORS = {
  tail: '#22c55e',
  cross: '#9aa5b4',
  head: '#e5484d',
};

export function createMap(container, { onRouteChange }) {
  const map = L.map(container, { center: GERMANY_CENTER, zoom: GERMANY_ZOOM });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende' +
      ' &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map);

  let points = [];        // aktive Route als [{lat, lon}, ...]
  let polyline = null;
  let waypointLayer = L.layerGroup().addTo(map); // Punkte im Zeichenmodus
  let segmentLayer = L.layerGroup().addTo(map);  // Rückenwind-Einfärbung
  let drawing = false;

  function redraw() {
    // Jede Routenänderung macht eine vorhandene Einfärbung ungültig.
    segmentLayer.clearLayers();
    if (polyline) polyline.setStyle({ opacity: ROUTE_STYLE.opacity });

    const latLngs = points.map((p) => [p.lat, p.lon]);
    if (polyline) {
      polyline.setLatLngs(latLngs);
    } else if (latLngs.length > 0) {
      polyline = L.polyline(latLngs, ROUTE_STYLE).addTo(map);
    }
    waypointLayer.clearLayers();
    if (drawing) {
      for (const p of points) {
        L.circleMarker([p.lat, p.lon], {
          radius: 4,
          color: '#10161f',
          fillColor: '#ffffff',
          fillOpacity: 1,
          weight: 2,
        }).addTo(waypointLayer);
      }
    }
    onRouteChange(points);
  }

  /** Ersetzt die aktive Route (z. B. nach GPX-Upload) und zoomt darauf. */
  function setRoute(newPoints) {
    points = newPoints;
    redraw();
    if (points.length >= 2 && polyline) {
      map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
    }
  }

  function clearRoute() {
    points = [];
    if (polyline) {
      polyline.remove();
      polyline = null;
    }
    redraw();
  }

  /** Zeichenmodus: Klicks auf die Karte setzen Wegpunkte. */
  function setDrawing(active) {
    drawing = active;
    container.classList.toggle('is-drawing', active);
    redraw();
  }

  function undoPoint() {
    points.pop();
    redraw();
  }

  map.on('click', (e) => {
    if (!drawing) return;
    points.push({ lat: e.latlng.lat, lon: e.latlng.lng });
    redraw();
  });

  /**
   * Färbt die Route nach der Rückenwind-Bilanz ein: `categories` enthält
   * pro Segment 'tail' | 'cross' | 'head' (Länge = Punkte − 1).
   * null entfernt die Einfärbung wieder.
   */
  function setSegmentCategories(categories) {
    segmentLayer.clearLayers();
    if (!categories || points.length < 2) {
      if (polyline) polyline.setStyle({ opacity: ROUTE_STYLE.opacity });
      return;
    }
    if (polyline) polyline.setStyle({ opacity: 0 }); // Basislinie darunter aus
    for (let i = 1; i < points.length; i++) {
      L.polyline(
        [
          [points[i - 1].lat, points[i - 1].lon],
          [points[i].lat, points[i].lon],
        ],
        {
          color: CATEGORY_COLORS[categories[i - 1]] || ROUTE_STYLE.color,
          weight: 4,
          opacity: 0.95,
          lineCap: 'round',
        }
      ).addTo(segmentLayer);
    }
  }

  return { map, setRoute, clearRoute, setDrawing, undoPoint, setSegmentCategories };
}
