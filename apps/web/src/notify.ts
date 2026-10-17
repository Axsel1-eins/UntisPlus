import { useEffect, useRef } from 'react';
import {
  addDays,
  diffLessons,
  minutesToTime,
  mondayOf,
  type ChangeKind,
  type Lesson,
  type LessonChange,
} from '@untisplus/shared';
import { api } from './api.js';
import { useApp } from './store.js';
import { typeName, useEffectiveTarget } from './data.js';
import { todayIso } from './lib.js';
import { emitModEvent } from './mods.js';
import i18n from './i18n.js';

/**
 * Change detection.
 *
 * Instead of relying on a push channel (which WebUntis only offers for *messages*), Untis+
 * snapshots the week's timetable, then re-fetches it periodically and diffs. When a lesson is
 * cancelled, moved, re-roomed or otherwise substituted, we raise an in-app banner and — if the
 * user allowed it — a browser notification. This directly targets the "missed substitution"
 * complaint.
 *
 * Limitation: it runs while the app is open (or when it regains focus). Background delivery
 * would need Push/Periodic Background Sync and is on the roadmap.
 */

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

function pushNotification(changes: LessonChange[]): void {
  if (!notificationSupported() || Notification.permission !== 'granted') return;
  const lines = changes.slice(0, 3).map(describeChange);
  if (changes.length > 3) lines.push(`+${changes.length - 3} …`);
  void dispatchNotification(i18n.t('changes.title'), {
    body: lines.join('\n'),
    tag: 'untisplus-changes',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  });
}

/**
 * Watch the effective timetable for changes. Active only while `notifyPref === 'on'` and a
 * session exists. Runs on mount, on an interval, and when the tab becomes visible again.
 */
export function useChangeWatcher(intervalMs = 5 * 60_000): void {
  const { session, notifyPref, setRecentChanges } = useApp();
  const target = useEffectiveTarget();
  const busy = useRef(false);

  useEffect(() => {
    if (!session || notifyPref !== 'on' || !target) return;
    let disposed = false;

    const tick = async () => {
      if (busy.current || disposed) return;
      busy.current = true;
      try {
        const weekStart = mondayOf(todayIso());
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
          const changes = diffLessons(prev, lessons);
          if (changes.length > 0) {
            setRecentChanges(changes);
            emitModEvent('changes', changes);
            pushNotification(changes);
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
