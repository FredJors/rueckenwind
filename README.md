# Rückenwind

Klima-Planer für mehrtägige Radtouren: zeigt für eine Route und einen
Reisezeitraum die klimatologisch wahrscheinlichste Windrichtung, die
durchschnittlichen Sonnenstunden und die Regenwahrscheinlichkeit – rein
clientseitig, ohne Backend und ohne API-Key.

## Setup

```bash
npm install
npm run dev      # Entwicklung: http://localhost:5173
npm run build    # Produktions-Build nach dist/
```

## Datenquelle & Methodik

Die App nutzt die kostenlose [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api)
und lädt für Start-, Mittel- und Endpunkt der Route (bei Routen unter 30 km
nur einen Punkt) die Tageswerte der letzten 10 vollständigen Kalenderjahre.
Aus den Tagen der Reisemonate wird die dominante Windrichtung als zirkulärer,
mit der Windgeschwindigkeit gewichteter Mittelwert berechnet – Windrichtung
ist dabei meteorologisch die Herkunftsrichtung. Sonnenstunden sind das Mittel
der täglichen `sunshine_duration`, die Regenwahrscheinlichkeit ist der Anteil
der Tage mit mindestens 1 mm Niederschlag. Erstreckt sich die Tour über
mehrere Monate, werden die Monatsstatistiken anteilig nach Tour-Tagen
gewichtet; API-Antworten werden in `localStorage` gecacht. Es handelt sich um
historische Monatsstatistik, nicht um eine Wettervorhersage.

## Route laden

Eigene Touren lassen sich aus [Komoot](https://www.komoot.com) als GPX
exportieren (Tour öffnen → „⋯" → „Als GPX exportieren") und per Button oder
Drag-&-Drop auf die Karte laden. Alternativ kann eine Route mit
„Route zeichnen" direkt auf der Karte geklickt werden.

## Deployment (Netlify)

Das Repo enthält eine `netlify.toml`; Netlify baut mit `npm run build` und
veröffentlicht `dist/`. Lokal per CLI: `netlify deploy --prod`.
