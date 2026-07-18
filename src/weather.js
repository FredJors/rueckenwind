/**
 * Open-Meteo Historical Weather API + Klimastatistik.
 *
 * Datenbasis: tägliche Werte der letzten 10 vollständigen Kalenderjahre.
 * Alle Statistikfunktionen sind pure functions.
 *
 * Wichtig: Windrichtung ist meteorologisch die HERKUNFTSrichtung
 * (270° = Wind aus Westen, Luft strömt nach Osten).
 */

const API_URL = 'https://archive-api.open-meteo.com/v1/archive';
const DAILY_VARS = [
  'wind_direction_10m_dominant',
  'wind_speed_10m_max',
  'sunshine_duration',
  'precipitation_sum',
  'shortwave_radiation_sum', // nur als Fallback, falls sunshine_duration fehlt
];
const RAIN_THRESHOLD_MM = 1;
const CACHE_PREFIX = 'rueckenwind_v1';

/** Die letzten 10 vollständigen Kalenderjahre, z. B. { start: 2016, end: 2025 }. */
export function referenceYears(now = new Date()) {
  const end = now.getFullYear() - 1;
  return { start: end - 9, end };
}

/**
 * Leitet aus dem Reisezeitraum die betroffenen Monate ab.
 * Liefert Monate in Reihenfolge ihres Auftretens mit der Anzahl Tour-Tage:
 * [{ month: 6, days: 20 }, { month: 7, days: 5 }] (month: 1–12).
 */
export function monthWeights(startDate, endDate) {
  const months = [];
  const byMonth = new Map();
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const m = cursor.getMonth() + 1;
    if (!byMonth.has(m)) {
      const entry = { month: m, days: 0 };
      byMonth.set(m, entry);
      months.push(entry);
    }
    byMonth.get(m).days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return months;
}

/** Kompasssektor (8er-Rose) für eine Gradzahl, deutsch: N, NO, O, SO, S, SW, W, NW. */
export function sectorName(deg) {
  const sectors = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return sectors[sectorIndex(deg)];
}

/** Index 0–7 des 45°-Sektors, in dem eine Richtung liegt (0 = N). */
export function sectorIndex(deg) {
  return Math.round((((deg % 360) + 360) % 360) / 45) % 8;
}

/**
 * Zirkulärer Mittelwert von Richtungen (Grad) mit Gewichten.
 * Ein einfaches arithmetisches Mittel wäre falsch (350° und 10° → 180°),
 * daher werden die Richtungen als gewichtete Einheitsvektoren summiert.
 */
export function circularMean(degrees, weights) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < degrees.length; i++) {
    const rad = (degrees[i] * Math.PI) / 180;
    x += weights[i] * Math.sin(rad);
    y += weights[i] * Math.cos(rad);
  }
  if (x === 0 && y === 0) return null;
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

/** Gewichteter Mittelwert; null, wenn keine gültigen Werte vorliegen. */
export function weightedMean(values, weights) {
  let sum = 0;
  let wSum = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue;
    sum += weights[i] * values[i];
    wSum += weights[i];
  }
  return wSum > 0 ? sum / wSum : null;
}

/**
 * Gewichtete Verteilung der Windherkunft über die 8 Kompasssektoren.
 * Liefert ein Array mit 8 Anteilen (Summe 1, Index 0 = N) oder null,
 * wenn keine gültigen Richtungen vorliegen.
 */
export function sectorDistribution(degrees, weights) {
  const acc = new Array(8).fill(0);
  let total = 0;
  for (let i = 0; i < degrees.length; i++) {
    if (degrees[i] == null) continue;
    acc[sectorIndex(degrees[i])] += weights[i];
    total += weights[i];
  }
  return total > 0 ? acc.map((v) => v / total) : null;
}

/** Gewichteter Anteil der Tage, an denen `predicate` zutrifft. */
export function weightedShare(values, weights, predicate) {
  let hit = 0;
  let wSum = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue;
    if (predicate(values[i])) hit += weights[i];
    wSum += weights[i];
  }
  return wSum > 0 ? hit / wSum : null;
}

/**
 * Sammelt aus einem oder mehreren Open-Meteo-Daily-Blöcken alle Tage der
 * Zielmonate als flache Liste – jeder Tag mit seinem Monats-Gewicht.
 *
 * Monats-Gewichtung: Erstreckt sich die Tour über mehrere Monate, soll jeder
 * Monat anteilig nach Tour-Tagen eingehen. Jeder Kalendertag im Datensatz
 * erhält daher das Gewicht (Tour-Tage des Monats) / (Datensatz-Tage des Monats).
 */
export function collectDays(dailyList, months) {
  const wanted = new Map(months.map((m) => [m.month, m.days]));
  const days = [];

  for (const daily of dailyList) {
    const monthOf = (i) => Number(daily.time[i].slice(5, 7));

    const perMonthCount = new Map();
    for (let i = 0; i < daily.time.length; i++) {
      const m = monthOf(i);
      if (wanted.has(m)) perMonthCount.set(m, (perMonthCount.get(m) || 0) + 1);
    }

    for (let i = 0; i < daily.time.length; i++) {
      const m = monthOf(i);
      if (!wanted.has(m)) continue;
      days.push({
        weight: wanted.get(m) / perMonthCount.get(m),
        dir: daily.wind_direction_10m_dominant?.[i] ?? null,
        speed: daily.wind_speed_10m_max?.[i] ?? null,
        sun: daily.sunshine_duration?.[i] ?? null,
        radiation: daily.shortwave_radiation_sum?.[i] ?? null,
        precip: daily.precipitation_sum?.[i] ?? null,
      });
    }
  }
  return days;
}

/**
 * Kernstatistik über die Tageswerte aller Sample-Punkte.
 * Da jeder Punkt gleich viele Tage liefert, entspricht das Zusammenwerfen
 * aller Tage dem Mittel über die Punkte.
 */
export function computeStats(dailyList, months) {
  const days = collectDays(dailyList, months);

  // Dominante Windrichtung: zirkulärer Mittelwert der Herkunftsrichtungen,
  // gewichtet mit Tages-Gewicht × Windgeschwindigkeit.
  const windDays = days.filter((d) => d.dir != null && d.speed != null);
  const directionDeg = circularMean(
    windDays.map((d) => d.dir),
    windDays.map((d) => d.weight * d.speed)
  );

  // Verteilung über alle 8 Sektoren; daraus der Anteil des dominanten.
  const sectorShares = sectorDistribution(
    windDays.map((d) => d.dir),
    windDays.map((d) => d.weight)
  );
  const sectorShare =
    directionDeg != null && sectorShares != null
      ? sectorShares[sectorIndex(directionDeg)]
      : null;

  const weights = days.map((d) => d.weight);
  const sunHoursPerDay = weightedMean(days.map((d) => d.sun), weights);

  return {
    directionDeg,
    sector: directionDeg != null ? sectorName(directionDeg) : null,
    sectorShare,
    sectorShares,
    windSpeedKmh: weightedMean(days.map((d) => d.speed), weights),
    sunHoursPerDay: sunHoursPerDay != null ? sunHoursPerDay / 3600 : null,
    // Fallback-Kennzahl (MJ/m² pro Tag), falls sunshine_duration fehlt
    radiationMean: weightedMean(days.map((d) => d.radiation), weights),
    rainDayShare: weightedShare(
      days.map((d) => d.precip),
      weights,
      (p) => p >= RAIN_THRESHOLD_MM
    ),
  };
}

/** Lesbarer Monatsname-Text für das UI: "Juni", "Juni & Juli", "Juni – August". */
export function describeMonths(months) {
  const names = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
  ];
  const list = months.map((m) => names[m.month - 1]);
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  return `${list[0]} – ${list[list.length - 1]}`;
}

/* ------------------------------------------------------------------------
   Fetch + localStorage-Cache
------------------------------------------------------------------------- */

function cacheKey(point, years) {
  const lat = point.lat.toFixed(2);
  const lon = point.lon.toFixed(2);
  return `${CACHE_PREFIX}_${lat}_${lon}_${years.start}-${years.end}`;
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key, daily) {
  try {
    localStorage.setItem(key, JSON.stringify(daily));
  } catch {
    // Quota voll o. Ä. – der Cache ist nur eine Optimierung, kein Fehler.
  }
}

/**
 * Lädt die täglichen Historien für alle Sample-Punkte.
 * Gecachte Punkte kommen aus localStorage, fehlende in EINEM Request
 * (die API akzeptiert kommagetrennte Koordinatenlisten).
 * Liefert ein Array von Daily-Objekten in der Reihenfolge der Punkte.
 */
export async function fetchDailyHistory(points, years = referenceYears()) {
  const results = new Array(points.length).fill(null);
  const missing = [];

  points.forEach((p, i) => {
    const cached = readCache(cacheKey(p, years));
    if (cached) results[i] = cached;
    else missing.push(i);
  });

  if (missing.length > 0) {
    const params = new URLSearchParams({
      latitude: missing.map((i) => points[i].lat.toFixed(4)).join(','),
      longitude: missing.map((i) => points[i].lon.toFixed(4)).join(','),
      start_date: `${years.start}-01-01`,
      end_date: `${years.end}-12-31`,
      daily: DAILY_VARS.join(','),
      timezone: 'auto',
    });
    const res = await fetch(`${API_URL}?${params}`);
    if (!res.ok) {
      throw new Error(`Open-Meteo antwortet mit Status ${res.status}.`);
    }
    const json = await res.json();
    // Bei einem Punkt liefert die API ein Objekt, sonst ein Array.
    const list = Array.isArray(json) ? json : [json];
    missing.forEach((pointIdx, listIdx) => {
      const daily = list[listIdx]?.daily;
      if (!daily) throw new Error('Unerwartete Antwort von Open-Meteo.');
      results[pointIdx] = daily;
      writeCache(cacheKey(points[pointIdx], years), daily);
    });
  }

  return results;
}
