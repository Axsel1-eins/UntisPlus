import { useMemo, useSyncExternalStore } from 'react';

/** A tiny toast store so mods (and the app) can surface non-blocking notices. */

export interface ToastItem {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

let items: ToastItem[] = [];
let nextId = 1;
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version += 1;
  for (const l of listeners) l();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toast(message: string, tone: ToastItem['tone'] = 'info'): void {
  const id = nextId;
  nextId += 1;
  items = [...items, { id, message, tone }];
  emit();
  setTimeout(() => dismissToast(id), 4200);
}

export function dismissToast(id: number): void {
  items = items.filter((i) => i.id !== id);
  emit();
}

export function useToasts(): ToastItem[] {
  const v = useSyncExternalStore(subscribe, () => version, () => version);
  return useMemo(() => items, [v]);
}
