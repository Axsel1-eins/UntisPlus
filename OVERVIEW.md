# Untis⁺ — A Better WebUntis

> **Status:** Planning / pre-build. This document is the *overview and problem inventory*.
> The companion file `BUILD-MEGA-PROMPT.md` is the self-contained prompt that a coding
> agent can execute to build it.
>
> **One-liner:** A fast, offline-first, actually-notifiable web client (PWA) for WebUntis
> that fixes the UX and the missed-substitution problem, built on the real WebUntis API.

---

## 0. TL;DR

WebUntis is the school timetable / substitution / homework system used by most schools in
Austria, Germany, and Switzerland. It works, but the client experience is widely disliked:
the app crashes, substitutions are shown confusingly, the *only* push notification is for
new messages, load times are long, and the API can't even be used by accounts with 2FA.

**Untis⁺ is a PWA + thin API proxy that reads the *real* WebUntis data** and presents it
better: a clean day/timetable view, substitution changes highlighted as *from → to*, real
push notifications for changes that affect *you*, homework with completion tracking,
absences/exams in one place, a unified inbox, and full offline support.

---

## 1. Background — what WebUntis is and what it exposes

### 1.1 The product

- **WebUntis** = the browser app at `https://<school>.webuntis.com/WebUntis/`.
- **Untis Mobile** = the official iOS/Android app (`com.grupet.web.app`).
- Vendor: Untis GmbH (formerly Grupet), Austria.
- Core modules: Timetable (Stundenplan), Substitutions (Vertretungen), Homework
  (Hausübungen), Absences (Abwesenheiten), Class register (Klassenbuch), Exams
  (Prüfungen), Messaging/News (Nachrichten).

### 1.2 The API surfaces (verified)

There are **four** ways in. We care about three.

| # | Surface | Endpoint | Auth | Read/Write | Notes |
|---|---------|----------|------|-----------|-------|
| 1 | **Classic JSON-RPC** | `POST /WebUntis/jsonrpc.do?school=<school>` | `authenticate(user, pass, client)` → `sessionId` | **Read-only** | Officially documented (on request from Untis). Stable. **Blocked for 2FA users since the 2025 releases.** |
| 2 | **TOTP / internal RPC** | `POST /WebUntis/jsonrpc_intern.do?m=getUserData2017` | user + TOTP (from app secret) | Read-only | The path the official app/QR login uses. Needed for 2FA + secret-based accounts. |
| 3 | **Internal REST (SPA)** | `/WebUntis/api/rest/view/v1/...` | form login `j_spring_security_check` + JWT from `api/token/new` + cookies | Read (+ some writes, e.g. mark homework done) | Undocumented, per-tenant, may change. Richest data: messages, homework, absences, exams. |
| 4 | **Untis Platform API** | `api.webuntis.com` | OAuth2 client credentials | Read + **write** | Official partner product. Requires an integration partnership → **out of scope** for a personal client. |

**Login flows to support (all confirmed):**

| Flow | Credentials | Why it matters |
|------|-------------|----------------|
| `:rpc` password | user + password | Default. Fails for 2FA accounts. |
| `:secret` TOTP | user + base32 secret (from the QR code) | The only way in for 2FA. We generate the OTP server-side. |
| `:anonymous` | none | If the school publishes public timetables. Great for a zero-signup demo. |
| form login | user + password | Needed to mint the REST JWT for the richer data. |

**Authentication quirks we must design around:**

- The `authenticate` call needs a plausible `client` string; Untis rejects unknown/blank clients.
- Sessions idle out after ~10 minutes — we must keep the session alive and log out politely
  when done (Untis explicitly asks clients to).
- Error codes: `-8520` not authenticated, `-8509`/`-8510` session expired, `-8501` invalid
  params. We map these to re-login-and-retry-once plus typed errors.

### 1.3 Data quirks (these cause most third-party bugs)

- **Dates** are `yyyymmdd` integers (`20260610`).
- **Times** are **packed `HMM` integers** (`710` = 07:10, `800` = 08:00, `1045` = 10:45) —
  *not* minutes-since-midnight. (Confirmed against python-webuntis `%H%M` and the JS
  `webuntis` client `Hmm`.) The master-data time grid instead uses strings like `"T07:10"`.
- **No timezone information** is returned. Times are "school local time". We must anchor
  to the school's timezone, not the viewer's.
- **Per-school permissions.** Every call can fail with "no right for …". Master data is
  inconsistent: schools abuse the teacher `name` field for initials, some fields are null.
- **Element types** for timetable queries: `CLASS=1, TEACHER=2, SUBJECT=3, STUDENT=4, ROOM=5`.

---

## 2. Problem inventory — what's actually wrong (research-backed)

Grouped by cause. Each problem maps to a solution in §4.

### A. Missed changes (the #1 real-world pain)

1. **Push notifications only fire for new *messages*** — not for substitution/timetable
   changes. A cancelled lesson, a room change, or a different teacher is silent until the
   student manually opens the app.
2. **No digest for the day.** Students must open the app every morning to see "what changed".
3. **No "affects me" filtering.** A substitution plan lists many classes; there's no
   personalized "this touches *your* lessons" view.

### B. Confusing presentation

4. **Substitutions are hard to read.** Reinforced from student reports: the same lesson is
   shown in multiple rows, and the change is not expressed as a clean *before → after*
   (time, room, teacher, subject). Cancellations aren't visually distinct enough.
5. **Cluttered grid.** The desktop web timetable is dense with tiny text; poor responsive
   behaviour on phones; no good "today only / next lesson" view.
6. **No color semantics.** Changed/cancelled/irregular periods aren't standardized visually.

### C. Reliability & performance

7. **App crashes** reported on swipe-to-next-week (App Store teacher review).
8. **Long/odd load times** (multiple user reports) and stale data ("doesn't know my
   timetable").
9. **Login failures / blank white screen** in browsers (Chrome support thread) — often
   extensions/site-data related, but the app gives no useful error.
10. **No offline mode** for flaky school Wi-Fi.

### D. Feature gaps

11. **Homework is buried**, with no reminders and no easy across-the-week done/not-done view.
12. **Absences are opaque** — no clean excused/unexcused overview; can't act from the client.
13. **Exam dates often unavailable** to students (permission gaps) and never merged into the
    timetable.
14. **Messaging is a separate, slow inbox** with no unified feed or unread aggregation.
15. **No calendar export (ICS)**, no widget, inconsistent dark mode.
16. **Accessibility gaps**: contrast, keyboard navigation, screen-reader labelling.

### E. Ecosystem / platform constraints

17. **2FA lockout:** since the 2025 releases the classic JSON-RPC API **cannot be used by
    2FA accounts**, breaking many third-party integrations. (Our design handles this.)
18. **Read-only classic API:** can't submit absences or (natively) mark homework done.
19. **School discovery is confusing**: users don't know their server/school name.
20. **Legal/ToS risk:** surface #3 is the SPA's internal/undocumented API. We must be a
    polite client (cache, throttle, log out) and degrade gracefully if it changes.

### F. Teacher-specific pain (why teachers will want it too)

21. **No "where do I need to be next" view.** A teacher teaches many classes in many rooms;
    the next room change is easy to miss, especially across buildings.
22. **Covering a lesson is hard to spot.** Substitutions *for* the teacher (supply) don't
    stand out from their regular schedule.
23. **No room-centric day.** There's no quick "what's in lab 3 this afternoon".
24. **Free periods are invisible.** The timetable shows lessons, not the gaps a teacher
    actually plans around.
25. **Cross-class context needs too many taps.** Checking another class means re-navigating
    the whole app.

---

## 3. Principles (non-negotiable)

1. **Fast first.** Aggressive server-side caching + a client cache; the timetable should be
   paintable from cache before the network answers.
2. **Offline-first PWA.** Installable, works on the bus, reconciles when back online.
3. **Never store the password if we can avoid it; never store it in plaintext ever.**
   Prefer a long-lived session/token; if a credential must be stored for re-auth, encrypt
   it (AES-GCM) and keep the key server-side only.
4. **The browser never talks to WebUntis directly** (CORS + secret exposure). All calls go
   through our proxy.
5. **Be a good citizen.** Throttle, cache, honor session idle-out, identify our client,
   log out on session end.
6. **Changes are explained, not just shown.** Every diff is expressed as *what changed*.
7. **Accessible by default** (WCAG AA): contrast, keyboard, focus, reduced motion.
8. **No dark patterns:** no forced app-install walls, no ads, no upsells.

---

## 4. Problems → Solutions

| # | Problem | Untis⁺ solution |
|---|---------|-----------------|
| 1 | Only message pushes | **Change-detection engine**: server polls timetable/substitutions, diffs against a snapshot, sends **Web Push** for changes affecting *your* lessons. |
| 2 | No daily digest | **Morning digest** push (configurable time) + "today at a glance" home screen. |
| 3 | Plan isn't personalized | **My changes** feed: only lessons that touch my class/student, ranked by impact. |
| 4 | Confusing substitutions | **Before → after cards** (time/room/teacher/subject), color-coded: cancelled / room-change / teacher-change / free / added. |
| 5 | Cluttered grid | **Day view + agenda view**; week grid is secondary and responsive; "next lesson" hero card. |
| 6 | No color semantics | One documented **status palette** used everywhere (timetable, substitution, notifications). |
| 7 | Crashes | We're a web app: no swipe-crash class of bugs; error boundaries instead of white screens. |
| 8 | Slow/stale | Server cache + stale-while-revalidate + visible "last updated" + manual refresh. |
| 9 | Login blank screen | Typed errors with actionable text (wrong school? wrong creds? 2FA? permission?). |
| 10 | No offline | Workbox service worker + IndexedDB; full app shell + last-known data offline. |
| 11 | Homework buried | Dedicated **homework** view, per-day rollup, **mark-done** (via REST where allowed), reminders. |
| 12 | Opaque absences | **Absence overview** with excused/unexcused split and a clear timeline. |
| 13 | Exams missing | **Exams** merged into the day/timetable + a dedicated list; graceful when permission denied. |
| 14 | Slow inbox | **Unified inbox** with unread badges, grouping, and push on new messages. |
| 15 | No calendar/widgets | **ICS export** per class/user; web app manifest shortcuts; dark mode. |
| 16 | Accessibility | WCAG AA, keyboard-first, reduced-motion, screen-reader labels. |
| 17 | 2FA lockout | Support **password, TOTP-secret, QR-code, and anonymous** login. Generate OTPs server-side. |
| 18 | Read-only RPC | Use the **REST layer for writes** (homework done) where available; otherwise read-only and honest about it. |
| 19 | School discovery | **School search** by name → resolves server + school + tenant id automatically. |
| 20 | ToS/legal risk | Cache + throttle + graceful degradation; clear "unofficial client" disclaimer. |
| 21 | Teachers miss next room | **"Now" bar** + next-lesson room prominently shown; room-centric day view. |
| 22 | Supply lessons unclear | Supply/substitution lessons visually distinct + a "I must cover" filter. |
| 23 | No room-centric view | **Room plan** view ("what's in this room today"). |
| 24 | Free periods invisible | Day timeline shows free periods and gaps, not just lessons. |
| 25 | Too many taps for context | **Jump to class** from any lesson; keep the current day pinned. |

---

## 5. Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────────────────┐
│  apps/web  (React PWA)       │  HTTPS  │  apps/api  (Node + TypeScript proxy)      │
│  - Installable, offline      │ ──────► │  - Session in HttpOnly cookie             │
│  - TanStack Query cache      │  JSON   │  - WebUntis client (JSON-RPC + REST)      │
│  - Route-level code-split    │ ◄────── │  - Response cache (SQLite / Redis)        │
│  - Service worker (Workbox)  │         │  - Change-detection diff engine           │
└─────────────────────────────┘         │  - Web Push (VAPID) + scheduler           │
                                         │  - Encrypted credential/secret vault      │
                                         └───────────────┬──────────────────────────┘
                                                         │
                                              ┌──────────▼───────────┐
                                              │  <school>.webuntis.com│
                                              │  jsonrpc.do / REST    │
                                              └──────────────────────┘
```

### 5.1 Why a backend proxy is mandatory

- **CORS:** `jsonrpc.do` sends no CORS headers → browsers cannot call it directly.
- **Secrets:** passwords/TOTP secrets must never live in `localStorage`.
- **Push:** someone must poll WebUntis and send notifications when the tab is closed.
- **Caching/aggregation:** to be fast and to be polite to Untis servers.
- **Session lifecycle:** keep-alive + polite logout.

### 5.2 Repo layout (pnpm workspaces)

```
untisplus/
├─ apps/
│  ├─ web/                 # React + Vite + TS PWA
│  └─ api/                 # Fastify + TS WebUntis proxy + push worker
├─ packages/
│  └─ shared/              # zod schemas + types shared web⇄api
├─ docs/
│  ├─ OVERVIEW.md          # this file
│  └─ BUILD-MEGA-PROMPT.md # the build prompt
├─ docker-compose.yml
└─ package.json            # workspace root
```

### 5.3 Tech stack (concrete)

**Backend (`apps/api`)**
- Node 20+, TypeScript strict, ESM.
- **Fastify** + `@fastify/cookie`, `@fastify/rate-limit`, `@fastify/helmet`, `@fastify/cors`.
- **`untapi`** as the WebUntis client (zero-dep, TS, covers JSON-RPC + REST). Fall back to a
  hand-rolled client if a method is missing (`api.client._request`).
- **otplib** for TOTP (secret/QR login).
- **Drizzle ORM + better-sqlite3** (dev) / Postgres (prod) for users, sessions, cache,
  snapshots, push subscriptions.
- **web-push** for VAPID Web Push. **node-cron** or `pg-boss` for the polling worker.
- **zod** validation, **pino** logging, **AES-256-GCM** credential vault (key from env).

**Frontend (`apps/web`)**
- **Vite 5 + React 18 + TypeScript**, strict.
- **TanStack Query v5** (server state) + **TanStack Router** (typed routes).
- **Tailwind CSS** + a small component set (shadcn/ui or hand-rolled).
- **vite-plugin-pwa** (Workbox) for offline + install.
- **zustand** for tiny UI state, **date-fns** (+ `date-fns-tz`) for local-time handling,
  **lucide-react** icons, **i18next + react-i18next** for `de`/`en`, **Recharts** only if needed.

**Shared:** zod schemas + inferred types, one source of truth.

**Testing:** Vitest (unit), Playwright (e2e). **CI:** GitHub Actions. **Deploy:** Docker.

---

## 6. Domain model (shared types, first cut)

```ts
type School = { server: string; schoolName: string; tenantId?: string; displayName: string };

type AuthMode = 'password' | 'secret' | 'qr' | 'anonymous';

type Lesson = {
  id: number;
  date: string;            // ISO, school-local
  startMin: number; endMin: number; // minutes since midnight
  subject: Ref; teachers: Ref[]; rooms: Ref[]; klassen: Ref[];
  status: 'REGULAR' | 'CANCELLED' | 'IRREGULAR' | 'FREE' | 'EXAM';
  substitution?: Substitution;
};

type Substitution = {
  kind: 'CANCELLED' | 'ROOM_CHANGE' | 'TEACHER_CHANGE' | 'SUBJECT_CHANGE' | 'ADDED' | 'MOVED';
  before: Partial<Lesson>; after: Partial<Lesson>;
  text?: string; createdBy?: string;
};

type Homework = { id: number; date: string; dueDate?: string; subject: Ref; text: string;
  completed: boolean; attachments?: { name: string; url: string }[] };

type Absence = { id: number; start: string; end: string; excused: boolean; reason?: string; subject?: Ref };

type Exam = { id: number; date: string; startMin: number; endMin: number;
  subject: Ref; rooms: Ref[]; teachers: Ref[]; type?: string };

type Message = { id: string; date: string; subject: string; body: string; read: boolean;
  sender?: Ref; attachments?: { name: string; url: string }[] };

type ChangeEvent = { // produced by the diff engine
  id: string; accountId: string; type: 'substitution' | 'homework' | 'message' | 'absence' | 'exam';
  lessonRef?: string; before?: unknown; after?: unknown;
  severity: 'info' | 'important' | 'critical'; detectedAt: string; notified: boolean;
};
```

### 6.1 Change-detection engine (the heart of Untis⁺)

1. Worker wakes per account on a schedule (school hours + morning digest).
2. Pulls substitution plan + timetable for the next N days.
3. Canonicalizes each lesson to a stable key, diffs against the last snapshot.
4. Emits `ChangeEvent`s for meaningful changes only (dedupe noise).
5. Filters to changes that touch **this user's** lessons.
6. Sends a Web Push (respecting per-user quiet hours, severity, and per-type toggles).

---

## 7. Feature spec (what "better" means, module by module)

> **Audience:** students **and teachers**. WebUntis is used by both, and teachers are the
> people who complain loudest about it. Untis⁺ has a **role-aware shell**: the same app
> shows a student their class schedule and a teacher their teaching schedule. Role is
> detected from the login (`personType`) and can be overridden in settings.

### 7.0 Roles & role-aware behavior

| Aspect | Student view | Teacher view |
|--------|--------------|--------------|
| Home hero | "Next lesson" + room/teacher | "Next lesson" + **which class + which room**, with a "get there" hint |
| Timetable default | *My class* | *Me (as teacher)* |
| Substitutions | Changes to my class | Changes to **my lessons** + **lessons I must cover (supply)** |
| Absences | My absences | Class register events / absences of my classes (read-only where permitted) |
| Exams | My exams | Exams I supervise/teach |
| Homework | My homework + mark done | Homework I assigned for my classes (read-only where permitted) |
| Extras | — | **Room plan** ("where am I this hour"), **class list** view, day summary |

Role-specific niceties that make teachers prefer it:
- A **"Now" bar** showing the current period and the **next room**, so a teacher can move
  between rooms without tapping around.
- **Supply/substitution emphasis**: lessons a teacher must cover are visually distinct from
  their regular lessons.
- **Jump to class**: tap a lesson → see that class's timetable for the day.
- **Between-lessons gap view**: shows free periods, not just lessons.

Anonymous sessions are inherently class/student-centric; teacher-specific data needs a
**password/secret login**, so the teacher experience unlocks on real accounts while the
student/anonymous experience works with zero setup.

### 7.1 Home / "Today"
- Hero card: **next lesson** with room, teacher, time, and *any change*.
- Timeline of today's lessons with status colors.
- "Changes since yesterday" panel (only the ones affecting you).
- Homework due today/tomorrow.
- Last-updated timestamp + pull-to-refresh.

### 7.2 Timetable
- Default **Day** view (agenda), plus Week grid and Month/list.
- Smooth prev/next, keyboard nav, "today" jump.
- Each period shows: subject, teacher(s), room(s), time; substituted periods are visually
  flagged and expand to a **before → after** card.
- Responsive: works at 360 px.

### 7.3 Substitutions (Vertretungen)
- "My changes" first; full plan second.
- Every change as a card: **before → after**, plus reason text from the school.
- Filters: only relevant / all / type. Sort by impact.

### 7.4 Homework
- Per-day rollup + "due soon" list.
- **Mark done** (via REST where permitted) with optimistic UI + offline queue.
- Reminder notifications (e.g. 18:00 for tomorrow's homework).

### 7.5 Absences
- Excused vs unexcused split, totals, per-subject breakdown, timeline.
- Clear explanation of each entry.

### 7.6 Exams
- Upcoming exams list + merged into the day view.
- Handles "no permission" gracefully instead of erroring.

### 7.7 Inbox / News
- Unified feed, unread badge, grouping by day/sender.
- Push on new message; attachments listed.

### 7.8 Notifications
- Web Push + in-app.
- Per-category toggles (substitutions / homework / messages / exams), quiet hours,
  morning-digest time.
- Notification deep-links straight to the affected lesson.

### 7.9 Account & onboarding
- School search → credentials (password / QR / secret / anonymous).
- Clear error messages for each failure class, including the 2FA case.
- Settings: theme, language (de/en), week start, timezone (default school-local).

---

## 8. Delivery roadmap

| Phase | Goal | Contents | Exit criteria |
|-------|------|----------|---------------|
| **0 — Foundations** | Nothing subjective yet, but real data flows | Monorepo, shared types, school discovery, auth (all 4 flows), session mgmt, proxy + cache, polite client, **role detection (student/teacher)** | Can log in, fetch and cache a real timetable end-to-end |
| **1 — MVP (the core win)** | "Better than the app for daily use" | Day/Today view, Week grid, Substitutions with before→after, dark mode, PWA install + offline, **de/en i18n scaffolding**, **role-aware shell + teacher "Now" bar** | Usable every school day; clearly better than WebUntis for timetable+substitutions, for both roles |
| **2 — Stuff students need** | Homework, absences, exams | Homework (+mark done), Absence overview, Exams merged into day | All read modules from §7 live |
| **3 — Notifications** | The killer feature | Change-detection engine, Web Push, toggles, digest | A cancelled lesson reaches the phone within N minutes |
| **4 — Inbox & polish** | Complete + shippable | Messaging, ICS export, accessibility pass, de/en i18n, perf budget | WCAG AA; Lighthouse ≥ 95; e2e green |
| **5 — Hardening** | Operational | Rate-limit/backoff, graceful REST-API degradation, Docker deploy, CI | Deployable with one command; failure modes documented |

**MVP cut line:** Phases 0–1 + a first cut of 3 (digest + cancelled-lesson push).

---

## 9. Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Internal REST API changes/blocked | Rich features (homework/messages) break | Isolate behind an adapter; fall back to JSON-RPC; feature-flag modules; surface "unavailable" not an error |
| 2FA requirement | Password login fails | First-class TOTP/QR/anonymous login; clear onboarding copy |
| School revokes/limits API | Whole app degraded | Polite caching/throttling; anonymous mode for public timetables; document constraints |
| Timezone handling wrong | Lessons off by hours | Anchor all computation to school tz; store raw local values + tz id |
| ToS concerns | Takedown/legal | Unofficial-client disclaimer, no scraping at scale, user-supplied creds, minimal retention |
| Credential custody | Security breach | AES-GCM vault, key server-side, prefer session over stored password, never log secrets |

---

## 10. Open questions (need answers before Phase 1 is *verified*)

1. **Do you have a WebUntis account we can test against?** (school name + server + whether
   it's a student/teacher account, and whether 2FA is on). Without this, Phase 1 is built on
   fixtures and tenant-specific details stay unverified.
2. **Deployment target** — run locally, a VPS, or a host like Fly.io/Render? (Affects push,
   TLS, and the persistent DB.)
3. ~~**Languages**~~ — **Decided: build i18n scaffolding for both `de` and `en` from the start**
   (German default, English toggle), rather than adding it in Phase 4.
4. **Scope of writes** — is "mark homework done" enough, or do you also want to *submit*
   absences (which needs the partner API and is likely out of reach)?
5. **Design direction** — a neutral clean look, or should I match your existing
   Stake-quality design language from the `casino` project?

---

## 11. Non-goals

- Replacing Untis for **teachers/admins** (no write access to grades, registers, or scheduling).
- Circumventing authentication, permissions, or school policy.
- Bulk-scraping other schools' data or building a public aggregator.
- Using the partner Platform API (needs an official partnership).
