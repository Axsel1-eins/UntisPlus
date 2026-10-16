import { addDays, mondayOf, type Lesson } from '@untisplus/shared';
import { api } from './api.js';
import type { Target } from './store.js';
import { typeName } from './data.js';

interface CachedWeek {
  lessons: Lesson[];
  timestamp: number;
}

const CACHE_PREFIX = 'up.week_cache:';
const MAX_LOCAL_CACHE_ENTRIES = 12;
const memoryCache = new Map<string, CachedWeek>();

function getCacheKey(target: Target | null, weekStart: string): string {
  const tType = target ? typeName(target.type) : 'default';
  const tId = target ? target.id : 0;
  return `${CACHE_PREFIX}${tType}:${tId}:${weekStart}`;
}

/** Synchronously retrieve cached lessons for a given target and week start (0ms instant render). */
export function getCachedWeekLessons(target: Target | null, weekStart: string): Lesson[] | null {
  const key = getCacheKey(target, weekStart);

  // 1. Check memory cache first
  const mem = memoryCache.get(key);
  if (mem) {
    return mem.lessons;
  }

  // 2. Check localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as CachedWeek;
        if (Array.isArray(parsed.lessons)) {
          memoryCache.set(key, parsed);
          return parsed.lessons;
        }
      }
    }
  } catch {
    // Ignore storage parse errors
  }

  return null;
}

/** Store fetched lessons in memory and localStorage for instant subsequent loads. */
export function setCachedWeekLessons(target: Target | null, weekStart: string, lessons: Lesson[]): void {
  const key = getCacheKey(target, weekStart);
  const entry: CachedWeek = {
    lessons,
    timestamp: Date.now(),
  };

  memoryCache.set(key, entry);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(entry));
      pruneOldCacheEntries();
    }
  } catch {
    // Ignore quota errors
  }
}

/** Prune excess week cache entries from localStorage to keep storage clean. */
function pruneOldCacheEntries(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const keys: Array<{ key: string; ts: number }> = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) {
        try {
          const raw = localStorage.getItem(k);
          const parsed = raw ? (JSON.parse(raw) as CachedWeek) : null;
          keys.push({ key: k, ts: parsed?.timestamp ?? 0 });
        } catch {
          keys.push({ key: k, ts: 0 });
        }
      }
    }

    if (keys.length > MAX_LOCAL_CACHE_ENTRIES) {
      keys.sort((a, b) => b.ts - a.ts);
      const toRemove = keys.slice(MAX_LOCAL_CACHE_ENTRIES);
      for (const item of toRemove) {
        localStorage.removeItem(item.key);
        memoryCache.delete(item.key);
      }
    }
  } catch {
    // Ignore storage pruning errors
  }
}

/** Prefetch previous week (W-1) and next week (W+1) in the background. */
const prefetchInProgress = new Set<string>();

export function prefetchSurroundingWeeks(target: Target | null, currentWeekStart: string): void {
  if (!target) return;

  const prevWeek = mondayOf(addDays(currentWeekStart, -7));
  const nextWeek = mondayOf(addDays(currentWeekStart, 7));

  [prevWeek, nextWeek].forEach((wStart) => {
    const key = getCacheKey(target, wStart);
    // Skip if already in memory or if already prefetching
    if (memoryCache.has(key) || prefetchInProgress.has(key)) return;

    prefetchInProgress.add(key);
    const wEnd = addDays(wStart, 6);

    api
      .timetable(wStart, wEnd, { id: target.id, type: typeName(target.type) })
      .then((res) => {
        setCachedWeekLessons(target, wStart, res.lessons);
      })
      .catch(() => {
        // Silently tolerate background prefetch errors
      })
      .finally(() => {
        prefetchInProgress.delete(key);
      });
  });
}
