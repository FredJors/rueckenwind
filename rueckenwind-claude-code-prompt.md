# Claude Code Prompt: „Rückenwind" – Klima-Planer für mehrtägige Radtouren

Baue eine rein clientseitige Web-App (kein Backend) namens **Rückenwind**. Sie zeigt für eine geplante mehrtägige Radtour – Route + Reisezeitraum – die klimatologisch wahrscheinlichste Windrichtung, die durchschnittlichen Sonnenstunden und die Regenwahrscheinlichkeit. Datenbasis sind ausschließlich historische Monatsstatistiken der letzten 10 Jahre, keine Live-Vorhersage.

## Tech-Stack
- **Vite + Vanilla JavaScript** (ES Modules), kein Framework, kein TypeScript
- **Leaflet** (npm) für die Karte; Tiles: **CARTO Positron** (hell, minimal) mit korrekter OSM/CARTO-Attribution
- Eigenes CSS, keine UI-Library; Schrift: Inter (Fallback `system-ui`)
- Wetterdaten: **Open-Meteo Historical Weather API** – kostenlos, CORS-fähig, kein API-Key

## Projektstruktur
```
rueckenwind/
├── index.html
├── package.json
└── src/
    ├── main.js        # App-Init, State, Verdrahtung
    ├── map.js         # Leaflet-Setup, Route zeichnen
    ├── gpx.js         # GPX-Parsing, Distanzberechnung
    ├── weather.js     # Open-Meteo-Fetch + Statistik (pure functions)
    ├── particles.js   # Wind-Canvas-Overlay
    ├── ui.js          # DOM-Updates, Zustände
    └── styles.css
```

## Funktionen

### 1. Route eingeben
- **GPX-Upload** (Komoot-Export): Datei-Button + Drag-&-Drop auf die Karte. `<trkpt>`-Punkte per DOMParser lesen, auf ~200 Punkte ausdünnen, als Polyline zeichnen, Karte per `fitBounds` zoomen, Gesamtlänge via Haversine in km anzeigen.
- **Manuell zeichnen**: Toggle „Route zeichnen" – Klicks auf die Karte setzen Wegpunkte (Polyline verbindet sie), dazu „Letzten Punkt entfernen" und „Zurücksetzen".
- Es gibt immer nur eine aktive Route; ein neuer Upload ersetzt die alte.

### 2. Zeitraum eingeben
- Zwei Date-Inputs: Start und Ende.
- Daraus die betroffenen Monate ableiten. Erstreckt sich die Tour über zwei Monate, beide Monatsstatistiken **anteilig nach Tour-Tagen gewichten**.
- Im UI klar benennen: „Klimastatistik für Juni · 2016–2025".

### 3. Klimastatistik berechnen (Open-Meteo)
- Endpoint: `https://archive-api.open-meteo.com/v1/archive`
- **Sample-Punkte**: Start-, Mittel- und Endpunkt der Route (bei Routen < 30 km reicht 1 Punkt). Die API akzeptiert mehrere Koordinaten kommagetrennt in einem Request; die Antwort ist dann ein JSON-Array.
- **Zeitraum**: die letzten 10 vollständigen Kalenderjahre (2016-01-01 bis 2025-12-31), `timezone=auto`.
- **Daily-Variablen**: `wind_direction_10m_dominant`, `wind_speed_10m_max`, `sunshine_duration`, `precipitation_sum` (optional zusätzlich `temperature_2m_max`).
- Beispiel-Request:
  `https://archive-api.open-meteo.com/v1/archive?latitude=52.52,51.30&longitude=13.41,12.40&start_date=2016-01-01&end_date=2025-12-31&daily=wind_direction_10m_dominant,wind_speed_10m_max,sunshine_duration,precipitation_sum&timezone=auto`
- Clientseitig auf die Zielmonate filtern, pro Punkt berechnen, dann über die Punkte mitteln:
  - **Dominante Windrichtung**: zirkulärer Mittelwert der täglichen Richtungen, gewichtet mit der Windgeschwindigkeit; Ausgabe als 8er-Kompasssektor (N, NO, O, SO, S, SW, W, NW) plus Anteil der Tage im dominanten Sektor, z. B. „aus W · an 38 % der Tage". **Achtung: Windrichtung ist meteorologisch die Herkunftsrichtung.**
  - **Windgeschwindigkeit**: Mittel der täglichen Maxima in km/h.
  - **Sonnenstunden**: Mittel von `sunshine_duration / 3600` → „⌀ 7,4 h/Tag" (Fallback, falls die Variable fehlt: `shortwave_radiation_sum` nur relativ einordnen).
  - **Regenwahrscheinlichkeit**: Anteil der Tage mit `precipitation_sum ≥ 1 mm` → „31 % Regentage".
- API-Antworten pro (Koordinate, Jahresspanne) in **localStorage cachen**, damit wiederholte Analysen sofort laden.

### 4. Wind-Partikel auf der Karte
- Canvas-Overlay absolut über dem Leaflet-Container, `pointer-events: none`, wird erst nach erfolgreicher Analyse eingeblendet.
- 120–200 Partikel als kurze Striche mit Fade-Trail (Canvas pro Frame mit halbtransparentem Weiß überblenden statt hart zu clearen).
- Bewegungsrichtung = Windrichtung + 180° (Luft strömt von der Herkunftsrichtung weg); Geschwindigkeit proportional zur mittleren Windgeschwindigkeit.
- Dezent: Farbe ca. `#7C8CA0`, Opacity ≤ 0,6. `requestAnimationFrame`, bei `document.hidden` pausieren, bei Resize Canvas anpassen. Partikel laufen im Screen-Space (kein Geo-Reprojizieren nötig, da eine einheitliche Richtung).

### 5. UI & Design
Referenz ist der Look der Mammotion-„Yuka"-App: sehr helles UI, eine große zentrale Visualisierung als Hero, abgerundete weiße Pills und Panels, unten ein dunkler CTA-Button in voller Breite. Statt des Produktbilds ist hier **die Karte der Hero**.

- Sehr clean, mobile-first (Inhalt max-width ~520 px zentriert, auf Desktop mit Luft).
- Farben: Hintergrund `#F4F5F7`, Panels Weiß, Text `#141C28`, Akzentgrün `#22C55E` (sparsam: Status-Punkt, Badge), CTA fast-schwarz `#10161F`.
- Radius 20–24 px für Panels, 14–16 px für Buttons; weiche Schatten (`0 8px 24px rgba(20,28,40,0.06)`).
- Aufbau von oben nach unten:
  1. **Header**: nur der App-Name „Rückenwind", klein, links.
  2. **Schwebe-Badge** über der Karte (wie eine Sprechblase): nach der Analyse Windpfeil-Icon + „aus W · 18 km/h".
  3. **Karten-Panel** (Hero, ~55 % der Viewport-Höhe) mit Route und Windpartikeln.
  4. **Stat-Pills** in einer Reihe: Windrichtung, Sonnenstunden/Tag, Regentage-% (optional ⌀ Max-Temp). Vor der Analyse Platzhalter „–".
  5. **Eingabe-Panel**: Statuszeile mit grünem Punkt („Bereit" / „Lade Klimadaten…" / „Juni analysiert"), Datumsfelder nebeneinander, GPX-Upload-Button + „Route zeichnen"-Toggle, Routenlänge in km; ganz unten ein **großer dunkler CTA-Button in voller Breite: „Analysieren"**.
- Icons als schlichte Inline-SVGs (keine Icon-Font, keine Emojis im finalen UI). Keine dekorativen Extras, viel Weißraum.

### 6. Zustände, Validierung, Fehler
- Start: Karte auf Deutschland zentriert (51.2, 10.4 / Zoom 6), Pills leer, CTA deaktiviert.
- CTA erst aktiv, wenn Route (≥ 2 Punkte) **und** gültiger Zeitraum (Ende ≥ Start) vorliegen.
- Während des Fetch: Spinner im CTA, Status „Lade Klimadaten…".
- Fehler (Netz/API): dezente rote Hinweiszeile im Eingabe-Panel, kein `alert()`.
- Zeitraum > 60 Tage: Hinweis, dass über mehrere Monate gemittelt wird.

## Qualität & Abschluss
- Kleiner, gut kommentierter Code; Statistikfunktionen (zirkulärer Mittelwert, Regentage-Quote, Monats-Gewichtung) als pure functions in `weather.js`.
- `README.md`: Setup (`npm install`, `npm run dev`), Datenquelle und Methodik in 5 Sätzen, Hinweis auf den Komoot-GPX-Export.
- Zum Schluss die App mit `npm run dev` starten und einen kurzen Smoke-Test durchgehen: GPX laden → Juni wählen → Analysieren → Pills und Partikel prüfen.
