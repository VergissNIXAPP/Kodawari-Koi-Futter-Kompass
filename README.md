# Kodawari KoiFutter Kompass (WebApp / PWA)

Diese Version ist eine **offline‑fähige WebApp (PWA)** – optimiert für **iPhone (Safari)** und **Android (Chrome)**.

## Features
- 🌊 Teiche verwalten (Volumen, Temperatur, Notizen)
- 🐟 Koi verwalten (Länge, optional Gewicht, Teichzuordnung)
- 🧮 Fütterungs‑Rechner (Richtwert aus Temperatur & Biomasse)
- 📝 Logbuch (Fütterungen + Notizen)
- 🔒 Optionaler Passwortschutz (Standard: `koi`, in Settings änderbar)
- 💾 Offline‑Speicherung (IndexedDB)
- ⇄ Export/Import als JSON Backup
- 📲 „Add to Home Screen“ / Installierbar (PWA)
- 🧠 Service Worker Cache (Updates beim nächsten App‑Start)

## Starten (lokal)
**Wichtig:** Service Worker + PWA funktionieren nur über `http://` oder `https://` – nicht über `file://`.

### Option A: VS Code Live Server
1. Ordner öffnen
2. „Live Server“ starten
3. `http://localhost:...` öffnen

### Option B: Python HTTP Server
```bash
python -m http.server 8080
```
Dann im Browser: `http://localhost:8080`

## Deploy (Vercel / GitHub Pages)
- Als statische Seite deployen (kein Build nötig).
- Achte auf HTTPS – dann ist Offline/Install sauber.

## iPhone installieren
Safari → Teilen → **Zum Home‑Bildschirm**.

Viel Spaß! 🚀


## Passwortschutz
Das Lock-Passwort ist **im Code fest**. Ändere es in `app.js` bei:

- `const LOCK_PASSWORD = "koi";`

In den Einstellungen kann nur **aktiv/deaktiv** gesetzt werden.
