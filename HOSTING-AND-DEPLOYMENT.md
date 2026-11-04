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

## 4. Android APK & iOS IPA Downloads & GitHub Releases

Untis⁺ bietet fertige Mobile-Builds für Android und iOS. Sowohl die **Android APK** als auch die **iOS IPA** werden bei jedem Release automatisch via **GitHub Actions** gebaut und als Download an den GitHub Release angehängt.

### 📥 Download fertiger Releases (APK & IPA)
Alle Versionen und Downloads findest du direkt unter:
👉 **[GitHub Releases](https://github.com/Axsel1-eins/UntisPlus/releases)**

Dort sind bei jedem Release folgende Dateien direkt angehängt:
- `UntisPlus.apk` / `UntisPlus-debug.apk` (Android APK — direkt installierbar)
- `UntisPlus.ipa` / `UntisPlus-unsigned.ipa` (Apple iOS IPA — ungesignt für Sideloading / AltStore / TrollStore)
- `SHA256SUMS.txt` (Prüfsummen zur Integritätsprüfung)

### 🤖 Android (APK)
- **Download:** Lade `UntisPlus.apk` aus dem neuesten [GitHub Release](https://github.com/Axsel1-eins/UntisPlus/releases) herunter.
- **Installation:** Die APK-Datei auf dein Android-Smartphone übertragen (z. B. via USB, Google Drive oder WhatsApp/Telegram) und anklicken. Bei Nachfrage "Installation aus unbekannten Quellen" für den Dateimanager zulassen.
- **Lokaler Build:** Führe einfach `bash scripts/build-apk.sh` aus (erzeugt `dist-mobile/UntisPlus.apk`).

### 🍏 Apple iOS (IPA)
- **Download:** Lade `UntisPlus.ipa` aus dem neuesten [GitHub Release](https://github.com/Axsel1-eins/UntisPlus/releases) herunter.
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

### 🚀 Automatische Release-Erstellung (GitHub Actions)
Der Workflow `.github/workflows/build-mobile.yml` hängt APK und IPA automatisch an einen Release an:
1. **GitHub Release veröffentlichen:** Auf GitHub unter Releases auf *Draft a new release* klicken und veröffentlichen. Der Workflow startet automatisch, baut APK & IPA und hängt sie an.
2. **Git-Tag pushen:**
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
3. **Manuell via Actions (Workflow Dispatch):** Unter *Actions* → *Build Mobile Apps (APK & iOS)* → *Run workflow* auswählen und *Publish assets to a GitHub Release* ankreuzen.

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
