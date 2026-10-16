import { useEffect, useMemo, useState } from 'react';
import { addDays, ElementType, mondayOf, type Lesson } from '@untisplus/shared';
import { api, type ModuleResponse } from './api.js';
import { useApp, type Target } from './store.js';
import { useAsync, type AsyncState } from './hooks.js';
import { todayIso } from './lib.js';
import { applyLessonTransforms, emitModEvent, useModsVersion } from './mods.js';
import {
  getCachedWeekLessons,
  prefetchSurroundingWeeks,
  setCachedWeekLessons,
} from './timetable_cache.js';

/**
 * Resolve whose timetable to show:
 *  1. an explicit target the user picked,
 *  2. otherwise the logged-in person (teacher/student),
 *  3. otherwise the first class (anonymous/public schools are class-based).
 */
export function useEffectiveTarget(): Target | null {
  const { session, target, master } = useApp();
  return useMemo(() => {
    if (target) return target;
    if (session && !session.readOnly) {
      if (session.personType === 12 && session.children?.[0]) {
        const child = session.children[0];
        return { id: child.id, type: ElementType.Student, label: child.name };
      }
      if (session.personId && session.personType && session.personType !== 12) {
        return { id: session.personId, type: session.personType as ElementType };
      }
    }
    const first = master?.klassen[0];
    if (session && first) return { id: first.id, type: ElementType.Class, label: first.name };
    return null;
  }, [session, target, master]);
}

export interface WeekLessons extends AsyncState<Lesson[]> {
  /** Always an array (never undefined) for convenient rendering. */
  lessons: Lesson[];
  weekStart: string;
  weekEnd: string;
  target: Target | null;
}

/** Fetch the full Mon–Sun week containing `anchor` (defaults to this week) for the effective target. */
export function useWeekLessons(anchor?: string): WeekLessons {
  const target = useEffectiveTarget();
  const modsVersion = useModsVersion();
  const weekStart = mondayOf(anchor ?? todayIso());
  const weekEnd = addDays(weekStart, 6);

  const initialCached = useMemo(() => getCachedWeekLessons(target, weekStart), [target?.id, target?.type, weekStart]);
  const [data, setData] = useState<Lesson[] | null>(initialCached);
  const [loading, setLoading] = useState<boolean>(!initialCached);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const c = getCachedWeekLessons(target, weekStart);
    if (c) {
      setData(c);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);

    if (!target) {
      setData([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    api
      .timetable(weekStart, weekEnd, { id: target.id, type: typeName(target.type) })
      .then((r) => {
        if (cancelled) return;
        setCachedWeekLessons(target, weekStart, r.lessons);
        prefetchSurroundingWeeks(target, weekStart);
        setData(r.lessons);
        setLoading(false);
        emitModEvent('data', { target, lessons: r.lessons });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target?.id, target?.type, weekStart, weekEnd]);

  const reload = () => {
    if (!target) return;
    setLoading(true);
    api
      .timetable(weekStart, weekEnd, { id: target.id, type: typeName(target.type) })
      .then((r) => {
        setCachedWeekLessons(target, weekStart, r.lessons);
        prefetchSurroundingWeeks(target, weekStart);
        setData(r.lessons);
        setLoading(false);
        emitModEvent('data', { target, lessons: r.lessons });
      })
      .catch((err) => {
        setError(err);
        setLoading(false);
      });
  };

  const lessons = useMemo(
    () => applyLessonTransforms(data ?? []),
    [data, modsVersion],
  );

  return { data: lessons, lessons, loading, error, reload, weekStart, weekEnd, target };
}

export function typeName(type: ElementType): string {
  switch (type) {
    case ElementType.Class:
      return 'class';
    case ElementType.Teacher:
      return 'teacher';
    case ElementType.Subject:
      return 'subject';
    case ElementType.Student:
      return 'student';
    case ElementType.Room:
      return 'room';
  }
}

export interface ModuleState<T> {
  /** False when the current sign-in lacks permission for this module. */
  available: boolean;
  items: T[];
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Fetch a "module" endpoint that returns `{ available, data }`.
 * `available: false` is a normal, non-error state (e.g. public access without permission).
 */
export function useModule<T>(
  fn: () => Promise<ModuleResponse<T[]>>,
  deps: unknown[],
): ModuleState<T> {
  const state = useAsync<ModuleResponse<T[]>>(fn, deps);
  return {
    available: state.data ? state.data.available : true,
    items: state.data?.data ?? [],
    error: state.error,
    loading: state.loading,
    reload: state.reload,
  };
}
