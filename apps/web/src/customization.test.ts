import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUSTRIAN_SUBJECT_PRESET,
  DEFAULT_CUSTOMIZATION,
  PASTEL_SUBJECT_PRESET,
  applyCustomizationToDom,
  getCustomization,
  resetCustomization,
  subscribeCustomization,
  updateCustomization,
} from './customization.js';

describe('customization module', () => {
  beforeEach(() => {
    resetCustomization();
  });

  afterEach(() => {
    resetCustomization();
  });

  it('provides comprehensive default customization state', () => {
    const state = getCustomization();
    expect(state.navItems).toEqual(['today', 'timetable', 'subs', 'exams', 'settings']);
    expect(state.showBreaks).toBe(true);
    expect(state.breakShortLabel).toBe('Pause');
    expect(state.breakLongLabel).toBe('Große Pause');
    expect(state.breakLunchLabel).toBe('Mittagspause');
    expect(state.breakMinMinutes).toBe(5);
    expect(state.showBreakDuration).toBe(true);
    expect(state.breakStyle).toBe('bar');
    expect(state.subjectDisplayMode).toBe('code');
    expect(state.subjectAliases).toEqual({});
    expect(state.cancellationStyle).toBe('strikethrough');
    expect(state.substitutionStyle).toBe('highlight');
    expect(state.splitSubstOrder).toBe('subst-first');
    expect(state.showLessonBadges).toBe(true);
    expect(state.iconInfo).toBe('ℹ️');
    expect(state.iconHomework).toBe('📝');
    expect(state.iconExam).toBe('🎓');
    expect(state.weekLayout).toBe('scroll');
    expect(state.privacyMode).toBe(false);
    expect(state.parallelLessonLayout).toBe('side-by-side');
    expect(state.periodHeight).toBe(84);
  });

  it('contains standard Austrian school colors in AUSTRIAN_SUBJECT_PRESET', () => {
    expect(AUSTRIAN_SUBJECT_PRESET.D).toBe('#dc2626'); // Deutsch = Rot
    expect(AUSTRIAN_SUBJECT_PRESET.M).toBe('#2563eb'); // Mathe = Blau
    expect(AUSTRIAN_SUBJECT_PRESET.E).toBe('#eab308'); // Englisch = Gelb
    expect(AUSTRIAN_SUBJECT_PRESET.BIO).toBe('#16a34a'); // Biologie = Grün
    expect(AUSTRIAN_SUBJECT_PRESET.BSP).toBe('#059669'); // Sport = Smaragdgrün
  });

  it('contains pastel palette in PASTEL_SUBJECT_PRESET', () => {
    expect(PASTEL_SUBJECT_PRESET.D).toBe('#f87171');
    expect(PASTEL_SUBJECT_PRESET.M).toBe('#60a5fa');
    expect(PASTEL_SUBJECT_PRESET.E).toBe('#facc15');
  });

  it('updateCustomization updates state and notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCustomization(listener);

    updateCustomization({
      breakShortLabel: 'Kleine Pause',
      subjectDisplayMode: 'both',
      subjectAliases: { BSP: 'Sport', PH: 'Physik LK' },
    });

    const state = getCustomization();
    expect(state.breakShortLabel).toBe('Kleine Pause');
    expect(state.subjectDisplayMode).toBe('both');
    expect(state.subjectAliases).toEqual({ BSP: 'Sport', PH: 'Physik LK' });
    expect(listener).toHaveBeenCalled();

    unsubscribe();
  });

  it('resetCustomization reverts back to DEFAULT_CUSTOMIZATION', () => {
    updateCustomization({
      timetableDensity: 'compact',
      privacyMode: true,
      breakShortLabel: 'Schnellpause',
    });

    expect(getCustomization().privacyMode).toBe(true);
    expect(getCustomization().breakShortLabel).toBe('Schnellpause');

    resetCustomization();

    expect(getCustomization().privacyMode).toBe(false);
    expect(getCustomization().breakShortLabel).toBe('Pause');
  });

  it('applyCustomizationToDom safely handles environments without document', () => {
    expect(() => applyCustomizationToDom(DEFAULT_CUSTOMIZATION)).not.toThrow();
  });

  it('applyCustomizationToDom applies root attributes and CSS variables when document is present', () => {
    const attrs = new Map<string, string>();
    const styles = new Map<string, string>();

    const fakeDoc = {
      documentElement: {
        setAttribute: (k: string, v: string) => attrs.set(k, v),
        getAttribute: (k: string) => attrs.get(k),
        style: {
          setProperty: (k: string, v: string) => styles.set(k, v),
          removeProperty: (k: string) => styles.delete(k),
          getPropertyValue: (k: string) => styles.get(k) ?? '',
          fontSize: '',
          fontFamily: '',
        },
      },
      getElementById: () => null,
      createElement: () => ({ id: '', textContent: '' }),
      head: { appendChild: () => {} },
    };

    (globalThis as unknown as { document: typeof fakeDoc }).document = fakeDoc;

    try {
      const testState = {
        ...DEFAULT_CUSTOMIZATION,
        timetableDensity: 'compact' as const,
        privacyMode: true,
        weekLayout: 'fit' as const,
        cancellationStyle: 'transparent' as const,
        substitutionStyle: 'replaced' as const,
        customAccent: '#06b6d4',
        cardRadius: 14,
        customFont: 'monospace' as const,
      };

      applyCustomizationToDom(testState);

      expect(attrs.get('data-density')).toBe('compact');
      expect(attrs.get('data-privacy')).toBe('true');
      expect(attrs.get('data-week-layout')).toBe('fit');
      expect(attrs.get('data-parallel-layout')).toBe('side-by-side');
      expect(attrs.get('data-cancellation-style')).toBe('transparent');
      expect(attrs.get('data-substitution-style')).toBe('replaced');
      expect(styles.get('--accent')).toBe('#06b6d4');
      expect(styles.get('--period-height')).toBe('84px');
      expect(styles.get('--accent-soft')).toBe(
        'color-mix(in srgb, #06b6d4 15%, transparent)',
      );
      expect(styles.get('--card-radius')).toBe('14px');
      expect(fakeDoc.documentElement.style.fontFamily).toContain('ui-monospace');
    } finally {
      delete (globalThis as unknown as { document?: typeof fakeDoc }).document;
    }
  });
});
