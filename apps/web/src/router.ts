import { useEffect, useState } from 'react';

export type Route =
  | 'today'
  | 'timetable'
  | 'subs'
  | 'rooms'
  | 'homework'
  | 'exams'
  | 'absences'
  | 'messages'
  | 'settings'
  | 'appearance'
  | 'customize'
  | 'theme-studio'
  | 'mods'
  | 'x';

const ROUTES: Route[] = [
  'today',
  'timetable',
  'subs',
  'rooms',
  'homework',
  'exams',
  'absences',
  'messages',
  'settings',
  'appearance',
  'customize',
  'theme-studio',
  'mods',
  'x',
];

export interface RouteInfo {
  route: Route;
  /** Everything after the route segment, e.g. a mod page id for `#/x/<id>`. */
  param: string | null;
  query: URLSearchParams;
  raw: string;
}

function defaultLanding(): Route {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('up.customization') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.landingPage && (ROUTES as string[]).includes(parsed.landingPage)) {
        return parsed.landingPage;
      }
    }
  } catch {
    // fallback
  }
  return 'today';
}

function parse(hash: string): RouteInfo {
  const withoutHash = hash.replace(/^#/, '');
  const [pathname = '', query = ''] = withoutHash.split('?');
  const segments = pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  const fallback = defaultLanding();
  const head = segments[0] ?? fallback;
  const param = segments.length > 1 ? decodeURIComponent(segments.slice(1).join('/')) : null;
  const route = (ROUTES as string[]).includes(head) ? (head as Route) : fallback;
  return { route, param, query: new URLSearchParams(query), raw: hash };
}

export function navigate(route: Route, param?: string): void {
  const tail = param ? `/${param.split('/').map(encodeURIComponent).join('/')}` : '';
  const target = `#/${route}${tail}`;
  if (location.hash !== target) location.hash = target;
}

export function routeInfo(): RouteInfo {
  return parse(location.hash || `#/${defaultLanding()}`);
}

/** Full route information (name, param, query) — use when you need more than the route name. */
export function useRouteInfo(): RouteInfo {
  const [info, setInfo] = useState<RouteInfo>(() => routeInfo());
  useEffect(() => {
    const onChange = () => setInfo(parse(location.hash));
    window.addEventListener('hashchange', onChange);
    if (!location.hash) location.hash = `#/${defaultLanding()}`;
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return info;
}

/** A tiny hash router — no dependency, works when installed as a PWA. */
export function useRoute(): Route {
  return useRouteInfo().route;
}
