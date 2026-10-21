import { useEffect, useRef } from 'react';
import {
  addDays,
  diffLessons,
  getExamTypeBadge,
  minutesToTime,
  mondayOf,
  type ChangeKind,
  type Exam,
  type Lesson,
  type LessonChange,
} from '@untisplus/shared';
import { api } from './api.js';
import { useApp } from './store.js';
import { typeName, useEffectiveTarget } from './data.js';
import { todayIso } from './lib.js';
import { emitModEvent } from './mods.js';
import i18n from './i18n.js';

export interface NotificationSettings {
  enabled: boolean;
  notifyCancellations: boolean; // Stundenausfälle
  notifySubstitutions: boolean; // Vertretungen & Raumänderungen
  notifyExams: boolean;         // Prüfungen & Tests
  examReminderDays: number[];   // e.g. [7, 5, 3, 1, 0] (0 = heute, 1 = morgen, 3 = in 3 Tagen, etc.)
  quietHoursEnabled: boolean;
  quietHoursStart: string;      // "22:00"
  quietHoursEnd: string;        // "06:30"
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  notifyCancellations: true,
  notifySubstitutions: true,
  notifyExams: true,
  examReminderDays: [7, 5, 3, 1, 0],
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '06:30',
};

export const NOTIFICATION_SETTINGS_KEY = 'up.notification_settings';
export const NOTIFIED_EXAMS_KEY = 'up.notified_exams';

export function loadNotificationSettings(): NotificationSettings {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (!raw) {
      const legacyNotify = localStorage.getItem('up.notify');
      return {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        enabled: legacyNotify === 'on',
      };
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...parsed,
      examReminderDays: Array.isArray(parsed.examReminderDays)
        ? parsed.examReminderDays
        : DEFAULT_NOTIFICATION_SETTINGS.examReminderDays,
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem('up.notify', settings.enabled ? 'on' : 'off');
  } catch {
    /* ignore storage quota */
  }
}

export function isQuietHour(settings: NotificationSettings, date = new Date()): boolean {
  if (!settings.quietHoursEnabled) return false;
  if (!settings.quietHoursStart || !settings.quietHoursEnd) return false;

  const [sH, sM] = settings.quietHoursStart.split(':').map(Number);
  const [eH, eM] = settings.quietHoursEnd.split(':').map(Number);
  if (isNaN(sH!) || isNaN(sM!) || isNaN(eH!) || isNaN(eM!)) return false;

  const currentMin = date.getHours() * 60 + date.getMinutes();
  const startMin = sH! * 60 + sM!;
  const endMin = eH! * 60 + eM!;

  if (startMin <= endMin) {
    return currentMin >= startMin && currentMin < endMin;
  }
  // Overnight range, e.g. 22:00 -> 06:30
  return currentMin >= startMin || currentMin < endMin;
}

export function daysBetween(dateA: string, dateB: string): number {
  const [y1, m1, d1] = dateA.split('-').map(Number);
  const [y2, m2, d2] = dateB.split('-').map(Number);
  const utc1 = Date.UTC(y1!, m1! - 1, d1!);
  const utc2 = Date.UTC(y2!, m2! - 1, d2!);
  return Math.round((utc1 - utc2) / (1000 * 60 * 60 * 24));
}

const DE_DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export function weekdayName(iso: string, lang = 'de'): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y!, m! - 1, d!);
  try {
    const locale = lang === 'en' ? 'en-GB' : 'de-AT';
    const s = date.toLocaleDateString(locale, { weekday: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return DE_DAYS[date.getDay()] ?? '';
  }
}

export function formatExamReminderMessage(
  exam: Exam,
  daysBefore: number,
  lang = 'de',
): { title: string; body: string } {
  const fach = exam.subject?.name || exam.subject?.longName || 'Prüfung';
  const badge = getExamTypeBadge(exam.type);
  const art = badge.label || exam.type || 'Prüfung';
  const zeit = minutesToTime(exam.startMin);
  const wochentag = weekdayName(exam.date, lang);
  const room = exam.rooms?.map((r) => r.name).join(', ');
  const roomSuffix = room ? ` (Raum ${room})` : '';
  const note = exam.text ? ` · ${exam.text}` : '';

  let title = '';
  let body = '';

  if (daysBefore === 0) {
    title = `📝 Heute Prüfung: ${fach} (${art}) um ${zeit}`;
    body = `${art} heute um ${zeit}${roomSuffix}${note}`;
  } else if (daysBefore === 1) {
    title = `🔔 Morgen Prüfung: ${fach} (${art}) um ${zeit}`;
    body = `${art} morgen um ${zeit}${roomSuffix}${note}`;
  } else if (daysBefore === 3) {
    title = `⏳ In 3 Tagen Prüfung: ${fach} (${art}) am ${wochentag}`;
    body = `${art} am ${wochentag} um ${zeit}${roomSuffix}${note}`;
  } else if (daysBefore === 5) {
    title = `⏳ In 5 Tagen Prüfung: ${fach} (${art}) am ${wochentag}`;
    body = `${art} am ${wochentag} um ${zeit}${roomSuffix}${note}`;
  } else if (daysBefore === 7) {
    title = `📅 In 1 Woche Prüfung: ${fach} (${art}) am ${wochentag}`;
    body = `${art} am ${wochentag} um ${zeit}${roomSuffix}${note}`;
  } else {
    title = `📝 In ${daysBefore} Tagen Prüfung: ${fach} (${art}) am ${wochentag}`;
    body = `${art} am ${wochentag} um ${zeit}${roomSuffix}${note}`;
  }

  return { title, body };
}

export function getNotifiedExams(): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(NOTIFIED_EXAMS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveNotifiedExams(map: Record<string, number>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(NOTIFIED_EXAMS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function clearNotifiedExams(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(NOTIFIED_EXAMS_KEY);
  } catch {
    /* ignore */
  }
}

export async function checkAndDispatchExamReminders(
  exams: Exam[],
  settings: NotificationSettings = loadNotificationSettings(),
  referenceDateIso = todayIso(),
): Promise<string[]> {
  if (!settings.enabled || !settings.notifyExams) return [];
  if (!notificationSupported() || Notification.permission !== 'granted') return [];
  if (isQuietHour(settings)) return [];

  const notified = getNotifiedExams();
  const dispatchedKeys: string[] = [];

  for (const exam of exams) {
    const daysDiff = daysBetween(exam.date, referenceDateIso);
    if (!settings.examReminderDays.includes(daysDiff)) continue;

    const key = `${exam.id}_${exam.date}_${daysDiff}`;
    const altKey = `exam-${exam.id}-day-${daysDiff}`;
    if (notified[key] || notified[altKey]) continue;

    const { title, body } = formatExamReminderMessage(exam, daysDiff, i18n.language);
    await dispatchNotification(title, {
      body,
      tag: `untisplus-exam-${exam.id}-${daysDiff}`,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url: 'exams',
    });

    const now = Date.now();
    notified[key] = now;
    notified[altKey] = now;
    dispatchedKeys.push(key);
  }

  saveNotifiedExams(notified);
  return dispatchedKeys;
}

const SNAP_PREFIX = 'up.snap.';
const snapKey = (target: string | number, weekStart: string) => `${SNAP_PREFIX}${target}:${weekStart}`;

function readSnap(key: string): Lesson[] | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Lesson[]) : null;
  } catch {
    return null;
  }
}

function writeSnap(key: string, lessons: Lesson[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(lessons));
  } catch {
    /* ignore quota errors */
  }
}

const KIND_KEY: Record<ChangeKind, string> = {
  CANCELLED: 'changes.kind.CANCELLED',
  UNCANCELLED: 'changes.kind.UNCANCELLED',
  ROOM_CHANGE: 'changes.kind.ROOM_CHANGE',
  TEACHER_CHANGE: 'changes.kind.TEACHER_CHANGE',
  TIME_CHANGE: 'changes.kind.TIME_CHANGE',
  SUBSTITUTION: 'changes.kind.SUBSTITUTION',
  ADDED: 'changes.kind.ADDED',
  REMOVED: 'changes.kind.REMOVED',
};

export function describeChange(c: LessonChange): string {
  return `${minutesToTime(c.startMin)} ${i18n.t(KIND_KEY[c.kind])}`;
}

export function formatLessonChangeNotification(c: LessonChange): {
  title: string;
  body: string;
  url: string;
  tag: string;
} {
  const subject = c.subject || i18n.t('notify.defaultSubject', 'Unterricht');
  const time = minutesToTime(c.startMin);
  const reason = c.reason || c.text;

  if (c.kind === 'CANCELLED') {
    const reasonStr = reason ? ` (${reason})` : '';
    return {
      title: i18n.t('notify.cancelledTitle', { subject, time, reason: reasonStr }),
      body: i18n.t('notify.cancelledBody', { subject, time, reason: reasonStr }),
      url: 'subs',
      tag: `untisplus-cancel-${c.id}`,
    };
  }

  if (c.kind === 'ROOM_CHANGE') {
    const room = c.room || c.text || i18n.t('notify.otherRoom', 'Anderer Raum');
    return {
      title: i18n.t('notify.roomChange', { subject, time, room }),
      body: i18n.t('notify.roomChangeBody', { room, time }),
      url: 'subs',
      tag: `untisplus-room-${c.id}`,
    };
  }

  if (c.kind === 'TEACHER_CHANGE') {
    const teacher = c.teacher || c.text || i18n.t('notify.substitution', 'Vertretung');
    return {
      title: i18n.t('notify.substTeacher', { subject, time, teacher }),
      body: i18n.t('notify.substTeacherBody', { teacher, time }),
      url: 'subs',
      tag: `untisplus-teacher-${c.id}`,
    };
  }

  const note = c.text ? ` (${c.text})` : '';
  return {
    title: i18n.t('notify.substGeneral', { subject, time, note }),
    body: `${describeChange(c)}${note}`,
    url: 'subs',
    tag: `untisplus-subst-${c.id}`,
  };
}

export function pushNotification(
  changes: LessonChange[],
  settings: NotificationSettings = loadNotificationSettings(),
): void {
  if (!settings.enabled) return;
  if (!notificationSupported() || Notification.permission !== 'granted') return;
  if (isQuietHour(settings)) return;

  const relevantChanges = changes.filter((c) => {
    if (c.kind === 'CANCELLED') {
      return settings.notifyCancellations;
    }
    return settings.notifySubstitutions;
  });

  if (relevantChanges.length === 0) return;

  for (const c of relevantChanges.slice(0, 5)) {
    const { title, body, url, tag } = formatLessonChangeNotification(c);
    void dispatchNotification(title, {
      body,
      tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      url,
    });
  }
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
}

export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as unknown as { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  );
}

export interface NotificationDiagnostics {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  isIos: boolean;
  isStandalone: boolean;
  iosWebPushBlocked: boolean;
}

export function getNotificationDiagnostics(): NotificationDiagnostics {
  const supported = notificationSupported();
  const perm = notificationPermission();
  const ios = isIosDevice();
  const standalone = isStandaloneApp();
  // On iOS, notifications are only permitted if running standalone (added to Home Screen)
  const iosWebPushBlocked = ios && !standalone;

  return {
    supported,
    permission: perm,
    isIos: ios,
    isStandalone: standalone,
    iosWebPushBlocked,
  };
}

export function notificationSupported(): boolean {
  return typeof Notification !== 'undefined';
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationSupported()) return false;
  if (Notification.permission === 'granted') return true;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg && reg.active) return reg;
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
    ]);
  } catch {
    return null;
  }
}

export async function dispatchNotification(
  title: string,
  options: NotificationOptions & { url?: string },
): Promise<{ ok: boolean; method?: 'serviceworker' | 'notification'; error?: string }> {
  if (!notificationSupported()) {
    return { ok: false, error: 'unsupported' };
  }

  // 1. Try Service Worker showNotification (Mandatory for iOS PWA and modern Android Chrome)
  try {
    const sw = await getServiceWorkerRegistration();
    if (sw && typeof sw.showNotification === 'function') {
      await sw.showNotification(title, options);
      return { ok: true, method: 'serviceworker' };
    }
  } catch (err) {
    console.warn('[notify] ServiceWorker showNotification failed, trying fallback:', err);
  }

  // 2. Fallback to desktop window.Notification constructor
  if (typeof Notification !== 'undefined') {
    try {
      const n = new Notification(title, options);
      if (options.url) {
        n.onclick = () => {
          window.focus();
          window.location.hash = options.url!;
        };
      }
      return { ok: true, method: 'notification' };
    } catch (err) {
      console.warn('[notify] window.Notification constructor failed:', err);
      return { ok: false, error: String(err) };
    }
  }

  return { ok: false, error: 'failed_to_display' };
}

export async function sendTestNotification(options?: {
  title?: string;
  body?: string;
  delaySeconds?: number;
}): Promise<{ ok: boolean; reason?: string; method?: string }> {
  const diag = getNotificationDiagnostics();
  if (!diag.supported && diag.iosWebPushBlocked) {
    return { ok: false, reason: 'ios_not_standalone' };
  }
  if (!diag.supported) {
    return { ok: false, reason: 'unsupported' };
  }

  if (Notification.permission !== 'granted') {
    const granted = await requestNotificationPermission();
    if (!granted) {
      return { ok: false, reason: 'denied' };
    }
  }

  const delayMs = (options?.delaySeconds ?? 0) * 1000;
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const title = options?.title ?? i18n.t('settings.notifyTestTitle', { defaultValue: 'Untis⁺ Test' });
  const body =
    options?.body ??
    i18n.t('settings.notifyTestBody', {
      defaultValue: '🎉 Push-Benachrichtigungen funktionieren einwandfrei auf diesem Gerät!',
    });

  const res = await dispatchNotification(title, {
    body,
    tag: 'untisplus-test',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  });

  return res.ok ? { ok: true, method: res.method } : { ok: false, reason: res.error };
}

export async function sendTestCancellationNotification(): Promise<{
  ok: boolean;
  reason?: string;
  method?: string;
}> {
  const diag = getNotificationDiagnostics();
  if (!diag.supported && diag.iosWebPushBlocked) {
    return { ok: false, reason: 'ios_not_standalone' };
  }
  if (!diag.supported) {
    return { ok: false, reason: 'unsupported' };
  }

  if (Notification.permission !== 'granted') {
    const granted = await requestNotificationPermission();
    if (!granted) {
      return { ok: false, reason: 'denied' };
    }
  }

  const title = '⚠️ Entfall: Mathematik entfällt um 09:40 (Krankheit)';
  const body = 'Mathematik entfällt um 09:40 (Krankheit)';

  const res = await dispatchNotification(title, {
    body,
    tag: 'untisplus-test-cancellation',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    url: 'subs',
  });

  return res.ok ? { ok: true, method: res.method } : { ok: false, reason: res.error };
}

export async function sendTestExamReminderNotification(): Promise<{
  ok: boolean;
  reason?: string;
  method?: string;
}> {
  const diag = getNotificationDiagnostics();
  if (!diag.supported && diag.iosWebPushBlocked) {
    return { ok: false, reason: 'ios_not_standalone' };
  }
  if (!diag.supported) {
    return { ok: false, reason: 'unsupported' };
  }

  if (Notification.permission !== 'granted') {
    const granted = await requestNotificationPermission();
    if (!granted) {
      return { ok: false, reason: 'denied' };
    }
  }

  const title = '📝 Morgen Prüfung: Mathematik (Schularbeit) um 08:00';
  const body = 'Schularbeit morgen um 08:00 in Raum 204';

  const res = await dispatchNotification(title, {
    body,
    tag: 'untisplus-test-exam',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    url: 'exams',
  });

  return res.ok ? { ok: true, method: res.method } : { ok: false, reason: res.error };
}

/**
 * Watch the effective timetable for changes and upcoming exams.
 * Active while notifications are enabled and a session exists.
 * Runs on mount, on an interval, and when the tab becomes visible again.
 */
export function useChangeWatcher(intervalMs = 5 * 60_000): void {
  const { session, notifyPref, setRecentChanges } = useApp();
  const target = useEffectiveTarget();
  const busy = useRef(false);

  useEffect(() => {
    const initialSettings = loadNotificationSettings();
    if (!session || (!initialSettings.enabled && notifyPref !== 'on') || !target) return;
    let disposed = false;

    const tick = async () => {
      if (busy.current || disposed) return;
      busy.current = true;
      try {
        const settings = loadNotificationSettings();
        if (!settings.enabled && notifyPref !== 'on') return;

        const today = todayIso();
        const weekStart = mondayOf(today);
        const weekEnd = addDays(weekStart, 6);
        const { lessons } = await api.timetable(weekStart, weekEnd, {
          id: target.id,
          type: typeName(target.type),
        });
        if (disposed) return;
        const key = snapKey(target.id, weekStart);
        const prev = readSnap(key);
        writeSnap(key, lessons);
        if (prev) {
          const rawChanges = diffLessons(prev, lessons);
          if (rawChanges.length > 0) {
            const changes = rawChanges.map((c) => {
              const l = lessons.find((x) => x.id === c.id) || prev.find((x) => x.id === c.id);
              return {
                ...c,
                subject: l?.subjects[0]?.name,
                room: l?.rooms[0]?.name,
                teacher: l?.teachers[0]?.name,
                reason: c.text ?? l?.substText,
              };
            });
            setRecentChanges(changes);
            emitModEvent('changes', changes);
            pushNotification(changes, settings);
          }
        }

        // Exam reminders check for the next 14 days
        if (settings.notifyExams) {
          try {
            const examRes = await api.exams(today, addDays(today, 14));
            if (!disposed && examRes?.available && examRes?.data) {
              await checkAndDispatchExamReminders(examRes.data, settings, today);
            }
          } catch {
            /* offline / expired session — retry on the next tick */
          }
        }
      } catch {
        /* offline / expired session — retry on the next tick */
      } finally {
        busy.current = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session, notifyPref, target?.id, target?.type, intervalMs, setRecentChanges]);
}
