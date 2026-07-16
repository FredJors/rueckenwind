/**
 * GPX-Parsing und Distanzberechnung.
 *
 * Komoot exportiert Tracks als <trkpt lat=".." lon=".."> innerhalb von
 * <trkseg>. Wir lesen alle Trackpunkte, dünnen sie auf eine handhabbare
 * Anzahl aus und berechnen die Gesamtlänge über die Haversine-Formel.
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Parst einen GPX-String und liefert Punkte als [{lat, lon}, ...].
 * Wirft einen Error, wenn keine Trackpunkte gefunden werden.
 */
export function parseGpx(gpxText) {
  const doc = new DOMParser().parseFromString(gpxText, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Datei ist kein gültiges GPX.');
  }
  // trkpt ist der Normalfall (Komoot), rtept als Fallback für Routen-GPX.
  let nodes = doc.querySelectorAll('trkpt');
  if (nodes.length === 0) nodes = doc.querySelectorAll('rtept');
  if (nodes.length < 2) {
    throw new Error('GPX enthält keine Trackpunkte.');
  }
  const points = [];
  for (const node of nodes) {
    const lat = parseFloat(node.getAttribute('lat'));
    const lon = parseFloat(node.getAttribute('lon'));
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      points.push({ lat, lon });
    }
  }
  return points;
}

/**
 * Dünnt eine Punktliste gleichmäßig auf maximal `max` Punkte aus.
 * Erster und letzter Punkt bleiben immer erhalten.
 */
export function thinPoints(points, max = 200) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const thinned = [];
  for (let i = 0; i < max; i++) {
    thinned.push(points[Math.round(i * step)]);
  }
  return thinned;
}

/** Haversine-Distanz zwischen zwei Punkten in km. */
export function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Gesamtlänge einer Punktliste in km. */
export function totalDistanceKm(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += haversineKm(points[i - 1], points[i]);
  }
  return sum;
}

/**
 * Wählt die Sample-Punkte für die Wetterabfrage:
 * Start-, Mittel- und Endpunkt; bei Routen unter 30 km nur der Mittelpunkt.
 */
export function samplePoints(points) {
  const mid = points[Math.floor(points.length / 2)];
  if (totalDistanceKm(points) < 30) return [mid];
  return [points[0], mid, points[points.length - 1]];
}
