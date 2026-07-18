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

/* --- Windverteilung (Kompass-Modal) -------------------------------------- */

const SECTOR_LABELS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];

/** Punkt auf dem Kompass: Winkel in Grad (0 = N, im Uhrzeigersinn), Radius. */
function polar(cx, cy, deg, r) {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
}

/**
 * Baut die Windrose als SVG: pro Sektor ein Keil, dessen Länge dem Anteil
 * entspricht (normiert auf den größten Sektor), außen Richtungs-Label und
 * Prozentwert. Der dominante Sektor ist grün hervorgehoben.
 */
function compassSvg(shares) {
  const cx = 150;
  const cy = 150;
  const rMin = 12;   // Keil-Länge bei 0 %
  const rMax = 92;   // Keil-Länge des größten Sektors
  const rRing = 96;  // dezenter Außenring
  const rLabel = 116;
  const maxShare = Math.max(...shares);
  const dominant = shares.indexOf(maxShare);

  let parts = `
    <circle cx="${cx}" cy="${cy}" r="${rRing}" fill="none" stroke="#e4e7ec" stroke-width="1"/>
    <circle cx="${cx}" cy="${cy}" r="${rRing / 2}" fill="none" stroke="#eef0f4" stroke-width="1"/>
    <circle cx="${cx}" cy="${cy}" r="3" fill="#8b94a3"/>`;

  for (let i = 0; i < 8; i++) {
    const angle = i * 45;
    const r = rMin + (maxShare > 0 ? (shares[i] / maxShare) * (rMax - rMin) : 0);
    const [x1, y1] = polar(cx, cy, angle - 17, r);
    const [x2, y2] = polar(cx, cy, angle + 17, r);
    const fill = i === dominant ? 'var(--accent)' : '#d7dce4';
    parts += `
      <path d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)}
               A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z"
            fill="${fill}" opacity="${i === dominant ? 1 : 0.9}"/>`;
  }

  for (let i = 0; i < 8; i++) {
    const angle = i * 45;
    const [lx, ly] = polar(cx, cy, angle, rLabel);
    const strong = i === dominant;
    parts += `
      <text x="${lx.toFixed(1)}" y="${(ly - 3).toFixed(1)}" text-anchor="middle"
            font-size="13" font-weight="700"
            fill="${strong ? 'var(--accent)' : '#141c28'}">${SECTOR_LABELS[i]}</text>
      <text x="${lx.toFixed(1)}" y="${(ly + 11).toFixed(1)}" text-anchor="middle"
            font-size="11" font-weight="${strong ? 600 : 400}"
            fill="${strong ? 'var(--accent)' : '#6b7686'}">${fmt(shares[i] * 100, 0)} %</text>`;
  }

  return `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg"
               role="img" aria-label="Windrose mit Verteilung je Himmelsrichtung">${parts}</svg>`;
}

/** Öffnet das Unterfenster mit der Verteilung; subtitle z. B. „Juni · 2016–2025". */
export function openCompass(sectorShares, subtitle) {
  el('compass-subtitle').textContent = subtitle || '';
  el('compass-rose').innerHTML = compassSvg(sectorShares);
  el('compass-modal').hidden = false;
  el('compass-close').focus();
}

export function closeCompass() {
  el('compass-modal').hidden = true;
}

export function isCompassOpen() {
  return !el('compass-modal').hidden;
}
