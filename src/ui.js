/**
 * DOM-Updates: Status, Pills, Badge, Fehler, CTA.
 * Hier passiert keine Logik – nur Formatierung und Zustandsanzeige.
 */

const el = (id) => document.getElementById(id);

const fmt = (value, digits = 1) =>
  value.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });

/** Statuszeile im Eingabe-Panel („Bereit" / „Lade Klimadaten…" / „Juni analysiert"). */
export function setStatus(text, { loading = false } = {}) {
  el('status-text').textContent = text;
  el('status-dot').classList.toggle('is-loading', loading);
}

/** Rote Hinweiszeile; null blendet sie aus. */
export function setError(message) {
  const line = el('error-line');
  line.hidden = !message;
  line.textContent = message || '';
}

export function setCta({ enabled, loading = false }) {
  el('btn-analyze').disabled = !enabled || loading;
  el('cta-spinner').hidden = !loading;
  el('cta-label').textContent = loading ? 'Lade Klimadaten…' : 'Analysieren';
}

export function setRouteLength(km) {
  el('route-length').textContent =
    km != null && km > 0 ? `Route: ${fmt(km)} km` : '';
}

/** Grauer Hinweistext rechts neben der Routenlänge. */
export function setPeriodHint(text) {
  el('period-hint').textContent = text || '';
}

/** Stat-Pills befüllen; ohne Analyse (stats = null) stehen Platzhalter. */
export function setPills(stats) {
  if (!stats) {
    el('pill-wind').textContent = '–';
    el('pill-sun').textContent = '–';
    el('pill-rain').textContent = '–';
    return;
  }
  el('pill-wind').textContent =
    stats.sector != null
      ? `${stats.sector} · ${fmt(stats.sectorShare * 100, 0)} %`
      : '–';
  el('pill-sun').textContent =
    stats.sunHoursPerDay != null
      ? `${fmt(stats.sunHoursPerDay)} h`
      : relativeSunLabel(stats.radiationMean);
  el('pill-rain').textContent =
    stats.rainDayShare != null ? `${fmt(stats.rainDayShare * 100, 0)} %` : '–';
}

/**
 * Fallback, falls sunshine_duration nicht verfügbar ist:
 * die Globalstrahlung (MJ/m²/Tag) nur grob relativ einordnen.
 */
function relativeSunLabel(radiationMean) {
  if (radiationMean == null) return '–';
  if (radiationMean < 8) return 'wenig';
  if (radiationMean < 16) return 'mittel';
  return 'viel';
}

/** Schwebe-Badge über der Karte: Pfeil in Strömungsrichtung + „aus W · 18 km/h". */
export function showBadge(stats) {
  const badge = el('wind-badge');
  if (stats?.sector == null || stats.windSpeedKmh == null) {
    badge.hidden = true;
    return;
  }
  el('wind-badge-text').textContent =
    `aus ${stats.sector} · ${fmt(stats.windSpeedKmh, 0)} km/h`;
  // Der Pfeil zeigt dorthin, wo die Luft hinströmt (Herkunft + 180°).
  const icon = badge.querySelector('.wind-badge__icon');
  icon.style.transform = `rotate(${(stats.directionDeg + 180) % 360}deg)`;
  badge.hidden = false;
}

export function hideBadge() {
  el('wind-badge').hidden = true;
}

export function setDropHint(visible) {
  el('drop-hint').hidden = !visible;
}
