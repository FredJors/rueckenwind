/**
 * Wind-Partikel-Overlay.
 *
 * Ein Canvas liegt absolut über dem Leaflet-Container (pointer-events: none).
 * 120–200 Partikel driften als kurze Striche in Strömungsrichtung – also
 * Windrichtung + 180°, denn die meteorologische Windrichtung ist die
 * HERKUNFTSrichtung. Die Partikel laufen im Screen-Space; da alle dieselbe
 * Richtung haben, ist keine Geo-Reprojektion nötig.
 *
 * Fade-Trail: Statt das Canvas hart zu leeren, wird der alte Frame pro Tick
 * leicht Richtung transparent ausgeblendet (destination-out), sodass hinter
 * jedem Partikel eine kurze Schweifspur stehen bleibt und die Karte darunter
 * sichtbar bleibt.
 */

const COLOR = 'rgba(124, 140, 160, 0.6)'; // ~#7C8CA0, Opacity ≤ 0,6
const TAIL_FRAMES = 7;                    // Länge des gezeichneten Strichs

export function createParticles(canvas) {
  const ctx = canvas.getContext('2d');
  let particles = [];
  let velocity = { x: 0, y: 0 };
  let active = false;   // Analyse vorhanden → Overlay gewünscht
  let rafId = null;
  let dpr = 1;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = canvas;
    if (w === 0 || h === 0) return; // versteckt – Größe später übernehmen
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (active) spawnParticles();
  }

  function spawnParticles() {
    const w = canvas.width;
    const h = canvas.height;
    // Dichte an die Fläche koppeln, aber im Rahmen von 120–200 bleiben.
    const count = Math.max(120, Math.min(200, Math.round((w * h) / 12000)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      jitter: 0.7 + Math.random() * 0.6, // individuelle Tempo-Variation
    }));
  }

  function frame() {
    rafId = null;
    if (!active || document.hidden) return;

    const w = canvas.width;
    const h = canvas.height;

    // Alten Frame Richtung transparent ausblenden → Fade-Trail.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.10)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = COLOR;
    ctx.lineWidth = 1.2 * dpr;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const p of particles) {
      const vx = velocity.x * p.jitter * dpr;
      const vy = velocity.y * p.jitter * dpr;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - vx * TAIL_FRAMES, p.y - vy * TAIL_FRAMES);
      p.x += vx;
      p.y += vy;
      // Am Rand (mit Puffer für den Schweif) auf die Gegenseite springen.
      const pad = 30 * dpr;
      if (p.x < -pad) p.x = w + pad;
      if (p.x > w + pad) p.x = -pad;
      if (p.y < -pad) p.y = h + pad;
      if (p.y > h + pad) p.y = -pad;
    }
    ctx.stroke();

    rafId = requestAnimationFrame(frame);
  }

  function ensureRunning() {
    if (active && !document.hidden && rafId === null) {
      rafId = requestAnimationFrame(frame);
    }
  }

  /**
   * Startet das Overlay nach einer erfolgreichen Analyse.
   * @param {number} directionDeg meteorologische Windrichtung (Herkunft)
   * @param {number} speedKmh mittlere maximale Windgeschwindigkeit
   */
  function start(directionDeg, speedKmh) {
    // Bewegungsrichtung = Herkunft + 180°; im Screen-Space zeigt y nach unten.
    const flowRad = ((directionDeg + 180) * Math.PI) / 180;
    const pxPerFrame = Math.min(2.4, 0.4 + speedKmh * 0.05);
    velocity = {
      x: Math.sin(flowRad) * pxPerFrame,
      y: -Math.cos(flowRad) * pxPerFrame,
    };
    canvas.hidden = false;
    active = true;
    resize();
    ensureRunning();
  }

  function stop() {
    active = false;
    canvas.hidden = true;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Bei verstecktem Tab pausieren, danach weiterlaufen lassen.
  document.addEventListener('visibilitychange', ensureRunning);
  window.addEventListener('resize', resize);

  canvas.hidden = true;
  return { start, stop };
}
