import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModRender } from '@untisplus/shared';
import { getModRoutes, getNavItems, useModsVersion } from '../mods.js';
import { EmptyState } from './primitives.js';

/** Mounts a mod's DOM renderer into a React tree, and cleans it up on unmount. */
export function ModHost({ render, className }: { render: ModRender; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '';
    const cleanup = render(el);
    return () => {
      if (typeof cleanup === 'function') cleanup();
      el.innerHTML = '';
    };
  }, [render]);
  return <div ref={ref} className={className ?? 'mod-host'} />;
}

/** Resolves `#/x/<param>` to a mod-provided page (nav page or explicit route). */
export function ModPageView({ param }: { param: string }) {
  const { t } = useTranslation();
  useModsVersion();
  const navItem = getNavItems().find((n) => n.id === param);
  const route = getModRoutes().find((r) => r.path === param);
  const render = navItem?.render ?? route?.render;

  if (!render) {
    return <EmptyState icon="grid" title={t('mods.pageMissing')} hint={param} />;
  }
  return <ModHost render={render} />;
}
