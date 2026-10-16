# 🌐 Untis⁺ Hosting, Reverse Proxy & Deployment Guide

Dieser Leitfaden erklärt dir Schritt für Schritt, wo und wie du **Untis⁺** am besten hosten kannst, wie du ein **GitHub Repository** anlegst, wie der **Nginx Reverse Proxy** konfiguriert wird und wie du die **Android APK** sowie die **iOS IPA** installierst.

---

## 1. Hosting-Optionen im Vergleich

| Option | Anbieter / Methode | Kosten | Vorteile | Geeignet für |
|---|---|---|---|---|
| **Empfehlung 1 (Best Value & Speed)** | **Hetzner Cloud (CX22)** | ~3,79 € / Monat | Eigener Linux-Server in Deutschland/Österreich, unbegrenzte Bandbreite, 100% Kontrolle über Docker & Nginx. | Dauerhafter 24/7 Betrieb, blitzschnelle Ladezeiten, uneingeschränkte Mod- und Theme-Freiheit. |
| **Empfehlung 2 (Kostenlos / PaaS)** | **Railway / Render** | 0 € / Monat (Free Tier) | Kein Server-Management nötig. Direkt aus GitHub deployen, automatische HTTPS-Zertifikate. | Schnelles Testen und Teilen mit Freunden ohne Server-Administration. |
| **Empfehlung 3 (Self-Hosted Home Server)** | **Raspberry Pi / Mini-PC** | Einmalig Hardware (0 € laufend) | Deine Daten verlassen nie dein Zuhause. Mit Cloudflare Tunnels erreichbar ohne Portweiterleitung. | Datenschutz-Puristen und Home-Lab-Enthusiasten. |

---

## 2. Docker & Nginx Reverse Proxy Setup

Im Repository sind alle Konfigurationsdateien bereits fertig vorbereitet:
- `Dockerfile`: Multi-Stage Build für API und Frontend.
- `docker-compose.yml`: Startet App und Reverse Proxy mit einem Befehl.
- `nginx/nginx.conf`: Nginx Reverse Proxy mit WebSocket-Unterstützung, SPA-Routing, Caching und Gzip-Kompression.

### Schnellstart mit Docker Compose:

```bash
# 1. Repository klonen oder hochladen
git clone https://github.com/<dein-name>/untisplus.git
cd untisplus

# 2. Web-Assets kompilieren
npm run build

# 3. Container im Hintergrund starten
docker compose up -d --build

# 4. Status prüfen
docker compose ps
```

Untis⁺ ist nun unter Port 80 (und nach Einrichtung eines SSL-Zertifikats unter 443) erreichbar.

### Automatische HTTPS-Verschlüsselung (Let's Encrypt / Certbot)

Falls du eine Domain (z. B. `untis.deinedomain.at`) auf die Server-IP zeigen lässt:

```bash
# Certbot installieren (Ubuntu / Debian)
sudo apt install certbot python3-certbot-nginx -y

# SSL-Zertifikat automatisch einrichten
sudo certbot --nginx -d untis.deinedomain.at
```

---

## 3. GitHub Repository anlegen & Code hochladen

Um das Projekt auf GitHub zu sichern und automatische Builds zu nutzen:

```bash
# 1. Sicherstellen, dass sensible Anmeldedaten NICHT committet werden
echo "Anmelde Daten.md" >> .gitignore
echo "dist-mobile/" >> .gitignore

# 2. Git initialisieren und committen
git init
git add .
git commit -m "feat: initial commit Untis⁺ v2.0"

# 3. Haupt-Branch umbenennen
git branch -M main

# 4. Mit deinem GitHub-Repo verknüpfen (erstelle vorher ein leeres Repo auf github.com)
git remote add origin https://github.com/<dein-benutzername>/untisplus.git

# 5. Hochladen
git push -u origin main
```

---

## 4. Android APK & iOS IPA Downloads

Das Repository verfügt über einen automatisierten **GitHub Actions Workflow** (`.github/workflows/build-mobile.yml`), der bei jedem Push automatisch auf Linux und macOS gebaut wird:

### 🤖 Android (APK)
- **Lokaler Build:** Führe einfach `bash scripts/build-apk.sh` aus.
  - Das fertige Paket liegt unter: `dist-mobile/UntisPlus-debug.apk`
- **Installation:** Die APK-Datei auf dein Android-Smartphone übertragen (z. B. via USB, Google Drive oder WhatsApp/Telegram) und anklicken. Bei Nachfrage "Installation aus unbekannten Quellen" für den Dateimanager zulassen.

### 🍏 Apple iOS (IPA)
- **Automatischer Build via GitHub Actions:**
  - Klicke in deinem GitHub-Repository auf den Reiter **Actions**.
  - Wähle den letzten erfolgreichen Workflow **Build Mobile Apps (APK & iOS)**.
  - Lade unter **Artifacts** die Datei `UntisPlus-iOS-Debug-IPA` herunter.
- **Installation auf dem iPhone/iPad (ohne Jailbreak):**
  1. **AltStore / SideStore:** (Kostenlos mit deiner normalen Apple-ID)
     - AltServer auf PC/Mac starten, AltStore auf dem iPhone installieren.
     - Die `.ipa`-Datei in AltStore öffnen und installieren.
  2. **Sideloadly:** (Einfachste Methode über USB-Kabel von PC oder Mac).
  3. **TrollStore:** (Für kompatible iOS-Versionen: dauerhafte Installation ohne 7-Tage-Resign).
- **Lokaler Build (auf einem Mac mit Xcode):**
  ```bash
  cd apps/web
  npx cap sync ios
  npx cap open ios # Öffnet das fertige Projekt direkt in Xcode zum Ausführen auf deinem iPhone
  ```

---

## 5. Reverse Proxy Architektur-Übersicht

```
[ Browser / Android App / iPhone App ]
                 │
                 ▼ HTTPS (Port 443)
┌──────────────────────────────────────────────┐
│             Nginx Reverse Proxy              │
│  - Gzip / Brotli Kompression                 │
│  - SSL Termination                           │
│  - Static Asset Cache (1 Jahr für /assets/)  │
└──────┬────────────────────────────────┬──────┘
       │                                │
       ▼                                ▼
┌──────────────────────┐    ┌───────────────────────────┐
│     API Service      │    │    WebUntis Upstream      │
│  - Node.js Fastify   │    │  - JSON-RPC & REST Proxy  │
│  - Port 8787         │    │  - Abwesenheiten Cache    │
│  - iCal Feeds (.ics) │    │  - Vertretungsplan Sync   │
└──────────────────────┘    └───────────────────────────┘
```
