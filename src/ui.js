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

/**
 * Zeigt die Rückenwind-Bilanz im Wind-Modal: Streckenanteile als
 * gestapelter Balken + Legende. `exposure` ist das Ergebnis von
 * routeWindExposure(); null blendet die Sektion aus.
 */
export function setExposure(exposure, reversed) {
  const section = el('exposure-section');
  if (!exposure?.shares) {
    section.hidden = true;
    return;
  }
  const { tail, cross, head } = exposure.shares;
  el('exposure-seg-tail').style.width = `${tail * 100}%`;
  el('exposure-seg-cross').style.width = `${cross * 100}%`;
  el('exposure-seg-head').style.width = `${head * 100}%`;
  el('exposure-tail').textContent = `${fmt(tail * 100, 0)} %`;
  el('exposure-cross').textContent = `${fmt(cross * 100, 0)} %`;
  el('exposure-head').textContent = `${fmt(head * 100, 0)} %`;
  el('exposure-direction').textContent = reversed
    ? 'Richtung: Ziel → Start'
    : 'Richtung: Start → Ziel';
  section.hidden = false;
}

export function closeCompass() {
  el('compass-modal').hidden = true;
}

export function isCompassOpen() {
  return !el('compass-modal').hidden;
}

/* --- Detail-Modal für Sonne & Regen -------------------------------------- */

function openDetail(title, subtitle, contentHtml) {
  el('detail-title').textContent = title;
  el('detail-subtitle').textContent = subtitle || '';
  el('detail-content').innerHTML = contentHtml;
  el('detail-modal').hidden = false;
  el('detail-close').focus();
}

export function closeDetail() {
  el('detail-modal').hidden = true;
}

export function isDetailOpen() {
  return !el('detail-modal').hidden;
}

/** Kachel-Reihe mit großen Kennzahlen. */
function statGrid(items) {
  const cells = items
    .map(
      (i) => `
    <div class="stat-grid__item">
      <span class="stat-grid__value">${i.value}</span>
      <span class="stat-grid__label">${i.label}</span>
    </div>`
    )
    .join('');
  return `<div class="stat-grid">${cells}</div>`;
}

/**
 * Kleines Balkendiagramm (10 Jahresbalken) als SVG-String.
 * `items`: [{ label: "'16", value: 31 | null }]; null wird als "–" gezeigt.
 */
function barChartSvg(items, { unit = '', digits = 0 } = {}) {
  const W = 300;
  const H = 128;
  const top = 20;
  const bottom = 18;
  const innerH = H - top - bottom;
  const bw = W / items.length;
  const max = Math.max(...items.map((i) => i.value ?? 0), 0.001);

  let parts = `<line x1="0" y1="${H - bottom + 0.5}" x2="${W}" y2="${H - bottom + 0.5}"
                     stroke="#e4e7ec" stroke-width="1"/>`;
  items.forEach((item, i) => {
    const cx = i * bw + bw / 2;
    const h = item.value != null ? (item.value / max) * innerH : 0;
    const y = top + innerH - h;
    parts += `
      <rect x="${(i * bw + bw * 0.18).toFixed(1)}" y="${y.toFixed(1)}"
            width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}"
            rx="3" fill="#d7dce4"/>
      <text x="${cx.toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle"
            font-size="9" fill="#6b7686">${item.value != null ? fmt(item.value, digits) : '–'}</text>
      <text x="${cx.toFixed(1)}" y="${H - 5}" text-anchor="middle"
            font-size="9" fill="#6b7686">${item.label}</text>`;
  });

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img"
               aria-label="Jahreswerte${unit ? ` in ${unit}` : ''}">${parts}</svg>`;
}

const yearLabel = (year) => `'${String(year).slice(2)}`;

/** Unterfenster mit den Regen-Details öffnen. */
export function openRainDetail(stats, subtitle) {
  const html =
    statGrid([
      {
        value: stats.rainDayShare != null ? `${fmt(stats.rainDayShare * 100, 0)} %` : '–',
        label: 'Regentage (≥ 1 mm)',
      },
      {
        value: stats.heavyRainShare != null ? `${fmt(stats.heavyRainShare * 100, 0)} %` : '–',
        label: 'nasse Tage (≥ 10 mm)',
      },
      {
        value: stats.meanPrecipPerDay != null ? `${fmt(stats.meanPrecipPerDay)} mm` : '–',
        label: '⌀ Niederschlag/Tag',
      },
    ]) +
    `<h3 class="detail-heading">Regentage je Jahr</h3>` +
    barChartSvg(
      stats.perYear.map((y) => ({
        label: yearLabel(y.year),
        value: y.rainDayShare != null ? y.rainDayShare * 100 : null,
      })),
      { unit: 'Prozent' }
    ) +
    `<p class="modal__note">Je ähnlicher die Balken, desto verlässlicher der Mittelwert</p>`;
  openDetail('Regen', subtitle, html);
}

/** Unterfenster mit den Sonnen-/Temperatur-Details öffnen. */
export function openSunDetail(stats, subtitle) {
  const html =
    statGrid([
      {
        value: stats.sunHoursPerDay != null ? `${fmt(stats.sunHoursPerDay)} h` : '–',
        label: '⌀ Sonne/Tag',
      },
      {
        value: stats.tMaxMean != null ? `${fmt(stats.tMaxMean, 0)} °C` : '–',
        label: '⌀ Max-Temperatur',
      },
      {
        value: stats.heatDayShare != null ? `${fmt(stats.heatDayShare * 100, 0)} %` : '–',
        label: 'Hitzetage (≥ 30 °C)',
      },
    ]) +
    `<h3 class="detail-heading">Sonnenstunden je Jahr</h3>` +
    barChartSvg(
      stats.perYear.map((y) => ({
        label: yearLabel(y.year),
        value: y.sunHoursPerDay,
      })),
      { unit: 'Stunden', digits: 1 }
    ) +
    `<p class="modal__note">Je ähnlicher die Balken, desto verlässlicher der Mittelwert</p>`;
  openDetail('Sonne & Temperatur', subtitle, html);
}
