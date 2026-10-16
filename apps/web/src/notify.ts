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

function pushNotification(changes: LessonChange[]): void {
  if (!notificationSupported() || Notification.permission !== 'granted') return;
  const lines = changes.slice(0, 3).map(describeChange);
  if (changes.length > 3) lines.push(`+${changes.length - 3} …`);
  try {
    new Notification(i18n.t('changes.title'), {
      body: lines.join('\n'),
      tag: 'untisplus-changes',
      icon: '/icons/icon-192.png',
    });
  } catch {
    /* some environments disallow constructing notifications */
  }
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
