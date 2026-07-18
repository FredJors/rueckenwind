/**
 * App-Initialisierung: State, Event-Verdrahtung, Analyse-Ablauf.
 */

import { createMap } from './map.js';
import { createParticles } from './particles.js';
import { parseGpx, thinPoints, totalDistanceKm, samplePoints } from './gpx.js';
import {
  monthWeights,
  describeMonths,
  referenceYears,
  fetchDailyHistory,
  computeStats,
} from './weather.js';
import * as ui from './ui.js';

const els = {
  map: document.getElementById('map'),
  mapPanel: document.querySelector('.map-panel'),
  canvas: document.getElementById('wind-canvas'),
  dateStart: document.getElementById('date-start'),
  dateEnd: document.getElementById('date-end'),
  fileInput: document.getElementById('file-input'),
  btnUpload: document.getElementById('btn-upload'),
  btnDraw: document.getElementById('btn-draw'),
  btnUndo: document.getElementById('btn-undo'),
  btnReset: document.getElementById('btn-reset'),
  drawTools: document.getElementById('draw-tools'),
  btnAnalyze: document.getElementById('btn-analyze'),
  pillWindBtn: document.getElementById('pill-wind-btn'),
  compassClose: document.getElementById('compass-close'),
  compassBackdrop: document.getElementById('compass-backdrop'),
};

let routePoints = [];
let routeSource = null; // 'gpx' | 'draw' | null
let drawMode = false;
let analyzing = false;
let lastStats = null;        // Ergebnis der letzten Analyse (für das Kompass-Modal)
let lastAnalysisLabel = ''; // z. B. „Klimastatistik für Juni · 2016–2025"

const mapCtl = createMap(els.map, { onRouteChange });
const particles = createParticles(els.canvas);

/* --- Zustand & Validierung --------------------------------------------- */

/** Date-Input („2026-07-01") als lokales Datum parsen, sonst null. */
function parseDateLocal(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getPeriod() {
  const start = parseDateLocal(els.dateStart.value);
  const end = parseDateLocal(els.dateEnd.value);
  const valid = start != null && end != null && end >= start;
  const days = valid ? Math.round((end - start) / 86400000) + 1 : 0;
  return { start, end, valid, days };
}

function updateControls() {
  const period = getPeriod();

  if (period.start && period.end && !period.valid) {
    ui.setError('Das Enddatum liegt vor dem Startdatum.');
  } else {
    ui.setError(null);
  }
  ui.setPeriodHint(
    period.valid && period.days > 60
      ? 'Zeitraum über 60 Tage – es wird über mehrere Monate gemittelt.'
      : ''
  );

  ui.setCta({
    enabled: routePoints.length >= 2 && period.valid,
    loading: analyzing,
  });
}

/** Eine geänderte Route oder ein neuer Zeitraum machen die Analyse ungültig. */
function resetAnalysis() {
  lastStats = null;
  lastAnalysisLabel = '';
  ui.setPills(null);
  ui.hideBadge();
  ui.closeCompass();
  particles.stop();
  ui.setStatus('Bereit');
}

function onRouteChange(points) {
  routePoints = points;
  ui.setRouteLength(points.length >= 2 ? totalDistanceKm(points) : null);
  resetAnalysis();
  updateControls();
}

/* --- Route: GPX-Upload & Zeichnen --------------------------------------- */

async function loadGpxFile(file) {
  try {
    const text = await file.text();
    const points = thinPoints(parseGpx(text));
    setDrawMode(false);
    routeSource = 'gpx';
    mapCtl.setRoute(points); // ersetzt eine evtl. vorhandene Route
    ui.setError(null);
  } catch (err) {
    ui.setError(err.message);
  }
}

function setDrawMode(active) {
  drawMode = active;
  els.btnDraw.setAttribute('aria-pressed', String(active));
  els.drawTools.hidden = !active;
  if (active && routeSource === 'gpx') {
    mapCtl.clearRoute(); // gezeichnet wird immer eine frische Route
  }
  if (active) routeSource = 'draw';
  mapCtl.setDrawing(active);
}

els.btnUpload.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', () => {
  const file = els.fileInput.files?.[0];
  if (file) loadGpxFile(file);
  els.fileInput.value = ''; // gleiche Datei erneut wählbar
});

els.btnDraw.addEventListener('click', () => setDrawMode(!drawMode));
els.btnUndo.addEventListener('click', () => mapCtl.undoPoint());
els.btnReset.addEventListener('click', () => mapCtl.clearRoute());

// Drag & Drop einer GPX-Datei direkt auf die Karte
els.mapPanel.addEventListener('dragover', (e) => {
  e.preventDefault();
  ui.setDropHint(true);
});
els.mapPanel.addEventListener('dragleave', () => ui.setDropHint(false));
els.mapPanel.addEventListener('drop', (e) => {
  e.preventDefault();
  ui.setDropHint(false);
  const file = e.dataTransfer?.files?.[0];
  if (file && /\.gpx$/i.test(file.name)) loadGpxFile(file);
  else if (file) ui.setError('Bitte eine GPX-Datei ablegen.');
});

/* --- Zeitraum ------------------------------------------------------------ */

els.dateStart.addEventListener('change', () => {
  resetAnalysis();
  updateControls();
});
els.dateEnd.addEventListener('change', () => {
  resetAnalysis();
  updateControls();
});

/* --- Analyse ------------------------------------------------------------- */

async function analyze() {
  const period = getPeriod();
  if (!period.valid || routePoints.length < 2 || analyzing) return;

  analyzing = true;
  ui.setError(null);
  ui.setStatus('Lade Klimadaten…', { loading: true });
  updateControls();

  try {
    const months = monthWeights(period.start, period.end);
    const years = referenceYears();
    const dailyList = await fetchDailyHistory(samplePoints(routePoints), years);
    const stats = computeStats(dailyList, months);

    ui.setPills(stats);
    ui.showBadge(stats);
    if (stats.directionDeg != null) {
      particles.start(stats.directionDeg, stats.windSpeedKmh ?? 0);
    }

    const label = describeMonths(months);
    lastStats = stats;
    lastAnalysisLabel = `${label} · ${years.start}–${years.end}`;
    ui.setStatus(`${label} analysiert`);
    ui.setPeriodHint(`Klimastatistik für ${lastAnalysisLabel}`);
  } catch (err) {
    ui.setStatus('Bereit');
    ui.setError(`Klimadaten konnten nicht geladen werden: ${err.message}`);
  } finally {
    analyzing = false;
    ui.setCta({
      enabled: routePoints.length >= 2 && getPeriod().valid,
      loading: false,
    });
  }
}

els.btnAnalyze.addEventListener('click', analyze);

/* --- Windverteilung (Kompass-Modal) -------------------------------------- */

els.pillWindBtn.addEventListener('click', () => {
  if (lastStats?.sectorShares) {
    ui.openCompass(lastStats.sectorShares, lastAnalysisLabel);
  }
});
els.compassClose.addEventListener('click', ui.closeCompass);
els.compassBackdrop.addEventListener('click', ui.closeCompass);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.isCompassOpen()) ui.closeCompass();
});

/* --- Start --------------------------------------------------------------- */

ui.setStatus('Bereit');
updateControls();
