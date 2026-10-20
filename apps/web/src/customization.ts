import { useSyncExternalStore } from 'react';
import type { Route } from './router.js';

export type CancellationStyle =
  | 'strikethrough'
  | 'transparent'
  | 'textblock'
  | 'hidden'
  | 'ghost'
  | 'neon'
  | 'redacted'
  | 'minimal';

export type SubstitutionStyle =
  | 'highlight'
  | 'replaced'
  | 'textblock'
  | 'badge'
  | 'neon'
  | 'glass';

export interface CustomizationState {
  navItems: Route[];
  timetableDensity: 'compact' | 'normal' | 'spacious';
  showWeekend: boolean;
  showFreePeriods: boolean;
  teacherDisplay: 'short' | 'full';
  timeDisplay: 'period' | 'time' | 'both';
  landingPage: Route;
  showNowBar: boolean;
  privacyMode: boolean;
  uiScale: number;
  customAccent: string | null;

  // Timetable & Breaks
  showBreaks: boolean;
  breakShortLabel: string;
  breakLongLabel: string;
  breakLunchLabel: string;
  breakMinMinutes: number;
  showBreakDuration: boolean;
  breakStyle: 'bar' | 'minimal' | 'card';
  weekLayout: 'scroll' | 'fit';
  showPeriodNumber: boolean;
  showPeriodTimes: boolean;
  showRoomInWeek: boolean;
  showTeacherInWeek: boolean;
  highlightCurrentLesson: boolean;
  parallelLessonLayout: 'side-by-side' | 'stacked';
  periodHeight: number;
  trimEmptyPeriods: boolean;
  periodTimeFormat: 'start-only' | 'start-end' | 'full';

  // Navigation & Layout Customization
  navPosition: 'sidebar-left' | 'sidebar-right' | 'navbar-top' | 'taskbar-bottom' | 'compact-floating';
  navSize: 'compact' | 'normal' | 'expanded';
  logoPosition: 'left' | 'center' | 'hidden';

  // Holidays & Free Days Display
  holidayDisplayStyle: 'banner' | 'card' | 'both';
  showHolidayIllustrations: boolean;

  // Substitution & Cancellation Display
  cancellationStyle: CancellationStyle;
  substitutionStyle: SubstitutionStyle;
  splitSubstOrder: 'subst-first' | 'cancelled-first';
  substDisplayMode: 'both' | 'subst-only' | 'cancelled-only';

  // Day View Customization
  dayPeriodHeight: number;
  dayLessonLayout: 'side-by-side' | 'stacked';

  // Exam Highlighting & Badges
  examHighlight: 'pulse-glow' | 'border-bold' | 'badge-prominent' | 'card-accent' | 'none';
  showLessonBadges: boolean;
  iconInfo: string;
  iconHomework: string;
  iconExam: string;

  // Favorites (Star System)
  favorites: {
    teachers: number[];
    klassen: number[];
    rooms: number[];
  };

  // Subject Colors & Display
  subjectColors: Record<string, string>;
  subjectDisplayMode: 'code' | 'name' | 'both';
  subjectAliases: Record<string, string>;

  // Experten-Modus / Custom CSS Studio
  customCss: string;
  customFont: 'default' | 'monospace' | 'inter' | 'serif';
  cardRadius: number;

  // Today View Customization
  todayGreetingMode: 'standard' | 'time-based' | 'custom';
  todayCustomGreeting: string;
  todayShowCountdown: boolean;
  todayQuickActions: boolean;
  todayShowFreePeriods: boolean;

  // Timetable View Customization
  timetableDefaultView: 'week' | 'day';
  firstDayOfWeek: 'monday' | 'sunday';
  timetableCellFontSize: 'small' | 'medium' | 'large';

  // Substitutions View Customization
  subsFilterMode: 'all' | 'my-subjects';
  subsGrouping: 'date' | 'kind';
  subsViewMode: 'cards' | 'table';

  // Exams View Customization
  examGradeScale: 'austrian' | 'german' | 'swiss' | 'points';
  examGradeTarget: number;
  examShowPast: boolean;

  // Rooms View Customization
  roomsDefaultCategory: 'all' | 'computer' | 'gym' | 'science' | 'special';
  roomsOnlyFreeDefault: boolean;

  // Global Animations & Motion
  animationsLevel: 'full' | 'subtle' | 'none';
}

const STORAGE_KEY = 'up.customization';

/** Standard Austrian notebook & school colors (Schulhefte-Farben & HTL/AHS/BHS) */
export const AUSTRIAN_SUBJECT_PRESET: Record<string, string> = {
  D: '#dc2626', // Deutsch - Rot
  DEUTSCH: '#dc2626',
  M: '#2563eb', // Mathematik - Blau
  AM: '#2563eb', // Angewandte Mathematik - Blau
  MATH: '#2563eb',
  E: '#eab308', // Englisch - Gelb
  E1: '#eab308',
  ENGLISCH: '#eab308',
  POS: '#10b981', // Programmieren / SEW - Smaragdgrün
  POS1: '#10b981',
  SEW: '#10b981',
  PRG: '#10b981',
  INF: '#059669', // Informatik
  INFORMATIK: '#059669',
  DBI: '#f97316', // Datenbanken - Orange
  DBI_1: '#f97316',
  NSCS: '#6366f1', // Netzwerksicherheit & Cloud - Indigo
  NSCS_1: '#6366f1',
  SYT: '#6366f1',
  SYS: '#6366f1',
  NW: '#06b6d4', // Naturwissenschaften / Netzwerke - Cyan
  NW2: '#06b6d4',
  WMC: '#14b8a6', // Web & Mobile Computing - Teal
  WMC_1: '#14b8a6',
  MEDT: '#14b8a6',
  SYP: '#8b5cf6', // Systemplanung - Violett
  SYP1: '#8b5cf6',
  PRE: '#8b5cf6',
  BWM: '#ca8a04', // Betriebswirtschaft - Gold
  BWM_1: '#ca8a04',
  BWM_2: '#a16207',
  BW: '#ca8a04',
  BWL: '#ca8a04',
  RW: '#d97706',
  GGP: '#ec4899', // Geschichte & Politische Bildung - Rose
  GPB: '#ec4899',
  GS: '#7c3aed', // Geschichte & Sozialkunde - Violett
  GSP: '#7c3aed',
  BIO: '#16a34a', // Biologie - Grün
  BU: '#16a34a', // Biologie & Umweltkunde
  GWK: '#ea580c', // Geographie & Wirtschaftskunde - Orange
  GEO: '#ea580c',
  PH: '#0891b2', // Physik - Cyan
  PHYSIK: '#0891b2',
  CH: '#db2777', // Chemie - Pink/Magenta
  REL: '#4b5563', // Religion - Grau
  RK: '#4b5563',
  RKA: '#4b5563',
  REV: '#4b5563',
  ETH: '#9333ea', // Ethik
  BE: '#f43f5e', // Bildnerische Erziehung - Rose/Bunt
  ME: '#8b5cf6', // Musikerziehung - Lila
  BSP: '#059669', // Bewegung und Sport - Smaragdgrün
  BSPK: '#059669',
  BSPM: '#059669',
  SPORT: '#059669',
  F: '#0284c7', // Französisch
  L: '#9333ea', // Latein
  IT: '#0d9488', // Italienisch
  ITA: '#0d9488',
  SP: '#d97706', // Spanisch
  WE: '#b45309', // Werken
};

export const PASTEL_SUBJECT_PRESET: Record<string, string> = {
  D: '#f87171',
  M: '#60a5fa',
  E: '#facc15',
  BIO: '#4ade80',
  BU: '#4ade80',
  GWK: '#fb923c',
  GEO: '#fb923c',
  GS: '#a78bfa',
  GSP: '#a78bfa',
  PH: '#38bdf8',
  CH: '#f472b6',
  REL: '#9ca3af',
  BE: '#fb7185',
  ME: '#c084fc',
  BSP: '#34d399',
  INF: '#38bdf8',
  F: '#38bdf8',
  L: '#c084fc',
  IT: '#2dd4bf',
  SP: '#fbbf24',
};

export const DEFAULT_CUSTOMIZATION: CustomizationState = {
  navItems: ['today', 'timetable', 'subs', 'exams', 'settings'],
  timetableDensity: 'normal',
  showWeekend: false,
  showFreePeriods: true,
  teacherDisplay: 'full',
  timeDisplay: 'both',
  landingPage: 'today',
  showNowBar: true,
  privacyMode: false,
  uiScale: 100,
  customAccent: null,

  // Timetable defaults
  showBreaks: true,
  breakShortLabel: 'Pause',
  breakLongLabel: 'Große Pause',
  breakLunchLabel: 'Mittagspause',
  breakMinMinutes: 5,
  showBreakDuration: true,
  breakStyle: 'bar',
  weekLayout: 'scroll',
  showPeriodNumber: true,
  showPeriodTimes: true,
  showRoomInWeek: true,
  showTeacherInWeek: true,
  highlightCurrentLesson: true,
  parallelLessonLayout: 'side-by-side',
  periodHeight: 84,
  trimEmptyPeriods: true,
  periodTimeFormat: 'start-end',

  // Navigation & Layout defaults
  navPosition: 'sidebar-left',
  navSize: 'normal',
  logoPosition: 'left',

  // Holidays & Free Days defaults
  holidayDisplayStyle: 'both',
  showHolidayIllustrations: true,

  // Substitution & Cancellation defaults
  cancellationStyle: 'strikethrough',
  substitutionStyle: 'highlight',
  splitSubstOrder: 'subst-first',
  substDisplayMode: 'both',

  // Day View defaults
  dayPeriodHeight: 88,
  dayLessonLayout: 'side-by-side',

  // Configurable Lesson Badges & Exams defaults
  examHighlight: 'pulse-glow',
  showLessonBadges: true,
  iconInfo: 'ℹ️',
  iconHomework: '📝',
  iconExam: '🎓',

  // Favorites (Star System) defaults
  favorites: {
    teachers: [],
    klassen: [],
    rooms: [],
  },

  // Subject colors & display defaults
  subjectColors: { ...AUSTRIAN_SUBJECT_PRESET },
  subjectDisplayMode: 'code',
  subjectAliases: {},

  // Experten-Modus / Custom CSS Studio defaults
  customCss: '',
  customFont: 'default',
  cardRadius: 9,

  // Today View defaults
  todayGreetingMode: 'time-based',
  todayCustomGreeting: '',
  todayShowCountdown: true,
  todayQuickActions: true,
  todayShowFreePeriods: true,

  // Timetable View defaults
  timetableDefaultView: 'week',
  firstDayOfWeek: 'monday',
  timetableCellFontSize: 'medium',

  // Substitutions View defaults
  subsFilterMode: 'all',
  subsGrouping: 'date',
  subsViewMode: 'cards',

  // Exams View defaults
  examGradeScale: 'austrian',
  examGradeTarget: 1,
  examShowPast: false,

  // Rooms View defaults
  roomsDefaultCategory: 'all',
  roomsOnlyFreeDefault: false,

  // Global Animations & Motion defaults
  animationsLevel: 'full',
};

let currentState: CustomizationState = loadState();
let version = 0;
const listeners = new Set<() => void>();

function loadState(): CustomizationState {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_CUSTOMIZATION;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CUSTOMIZATION;
    const parsed = JSON.parse(raw);
    let navItems: Route[] = Array.isArray(parsed.navItems) ? parsed.navItems : DEFAULT_CUSTOMIZATION.navItems;
    // If user had the old 4-item default, upgrade to include exams
    if (navItems.length === 4 && navItems.includes('today') && navItems.includes('timetable') && !navItems.includes('exams')) {
      navItems = ['today', 'timetable', 'subs', 'exams', 'settings'];
    }
    return {
      ...DEFAULT_CUSTOMIZATION,
      ...parsed,
      navItems,
      subjectColors: {
        ...DEFAULT_CUSTOMIZATION.subjectColors,
        ...(parsed.subjectColors || {}),
      },
      subjectAliases: {
        ...DEFAULT_CUSTOMIZATION.subjectAliases,
        ...(parsed.subjectAliases || {}),
      },
    };
  } catch {
    return DEFAULT_CUSTOMIZATION;
  }
}

function saveState(state: CustomizationState): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // Ignore storage quota
  }
}

export function applyCustomizationToDom(state: CustomizationState): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  root.setAttribute('data-density', state.timetableDensity);
  root.setAttribute('data-privacy', state.privacyMode ? 'true' : 'false');
  root.setAttribute('data-week-layout', state.weekLayout);
  root.setAttribute('data-parallel-layout', state.parallelLessonLayout ?? 'side-by-side');
  root.setAttribute('data-cancellation-style', state.cancellationStyle ?? 'strikethrough');
  root.setAttribute('data-substitution-style', state.substitutionStyle ?? 'highlight');
  root.setAttribute('data-split-order', state.splitSubstOrder ?? 'subst-first');

  if (state.periodHeight) {
    root.style.setProperty('--period-height', `${state.periodHeight}px`);
  } else {
    root.style.removeProperty('--period-height');
  }

  if (state.uiScale && state.uiScale !== 100) {
    root.style.fontSize = `${(state.uiScale / 100) * 15}px`;
  } else {
    root.style.fontSize = '';
  }

  if (state.customAccent) {
    root.style.setProperty('--accent', state.customAccent);
    root.style.setProperty('--accent-soft', `color-mix(in srgb, ${state.customAccent} 15%, transparent)`);
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-soft');
  }

  // Card Radius
  root.style.setProperty('--card-radius', `${state.cardRadius ?? 9}px`);

  // Custom Font
  if (state.customFont === 'monospace') {
    root.style.fontFamily =
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  } else if (state.customFont === 'inter') {
    root.style.fontFamily = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  } else if (state.customFont === 'serif') {
    root.style.fontFamily = 'Georgia, Cambria, "Times New Roman", Times, serif';
  } else {
    root.style.fontFamily = '';
  }

  // Custom CSS injection
  let styleEl = document.getElementById('up-custom-css') as HTMLStyleElement | null;
  if (state.customCss && state.customCss.trim()) {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'up-custom-css';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = state.customCss;
  } else if (styleEl) {
    styleEl.textContent = '';
  }
}

// Apply immediately upon module load
applyCustomizationToDom(currentState);

export function getCustomization(): CustomizationState {
  return currentState;
}

export function updateCustomization(partial: Partial<CustomizationState>): void {
  currentState = { ...currentState, ...partial };
  saveState(currentState);
  applyCustomizationToDom(currentState);
  version += 1;
  for (const fn of listeners) fn();
}

export function resetCustomization(): void {
  updateCustomization(DEFAULT_CUSTOMIZATION);
}

export function subscribeCustomization(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useCustomization(): CustomizationState {
  return useSyncExternalStore(subscribeCustomization, getCustomization, () => DEFAULT_CUSTOMIZATION);
}

export function isFavorite(type: 'teachers' | 'klassen' | 'rooms', id: number): boolean {
  return currentState.favorites?.[type]?.includes(id) ?? false;
}

export function toggleFavorite(type: 'teachers' | 'klassen' | 'rooms', id: number): void {
  const current = currentState.favorites?.[type] ?? [];
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  updateCustomization({
    favorites: {
      teachers: currentState.favorites?.teachers ?? [],
      klassen: currentState.favorites?.klassen ?? [],
      rooms: currentState.favorites?.rooms ?? [],
      [type]: next,
    },
  });
}
