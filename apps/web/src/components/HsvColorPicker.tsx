import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hexToHsv, hsvToHex, type Hsv } from '@untisplus/shared';
import { subjectTextColor } from '../lib.js';
import { Icon } from './primitives.js';

interface Props {
  color: string;
  onChange: (hex: string) => void;
  label?: string;
  presetPalette?: string[];
  onClose?: () => void;
}

export function HsvColorPicker({
  color,
  onChange,
  label,
  presetPalette = [
    '#dc2626',
    '#ea580c',
    '#eab308',
    '#16a34a',
    '#059669',
    '#0891b2',
    '#2563eb',
    '#7c3aed',
    '#db2777',
    '#4b5563',
  ],
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(color));
  const [hexInput, setHexInput] = useState(color);

  useEffect(() => {
    setHsv(hexToHsv(color));
    setHexInput(color);
  }, [color]);

  function updateHsv(partial: Partial<Hsv>) {
    const next: Hsv = {
      h: partial.h !== undefined ? Math.min(360, Math.max(0, Math.round(partial.h))) : hsv.h,
      s: partial.s !== undefined ? Math.min(100, Math.max(0, Math.round(partial.s))) : hsv.s,
      v: partial.v !== undefined ? Math.min(100, Math.max(0, Math.round(partial.v))) : hsv.v,
    };
    setHsv(next);
    const newHex = hsvToHex(next);
    setHexInput(newHex);
    onChange(newHex);
  }

  function handleHexChange(val: string) {
    setHexInput(val);
    if (/^#[0-9a-fA-F]{6}$/.test(val.trim())) {
      const clean = val.trim();
      setHsv(hexToHsv(clean));
      onChange(clean);
    }
  }

  const currentHex = hsvToHex(hsv);
  const textColor = subjectTextColor(currentHex);

  return (
    <div
      className="card pad col hsv-picker-box"
      style={{
        gap: 12,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--card-radius, 9px)',
        maxWidth: 360,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
      }}
    >
      {/* Header */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
          🎨 {label || t('customize.hsvTitle')}
        </span>
        {onClose && (
          <button
            type="button"
            className="btn ghost icon"
            onClick={onClose}
            style={{ width: 24, height: 24, padding: 0 }}
            aria-label={t('common.close')}
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      {/* Live Sample Tile */}
      <div
        className="row"
        style={{
          background: currentHex,
          color: textColor,
          padding: '10px 14px',
          borderRadius: 'var(--card-radius, 8px)',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
          transition: 'background 0.1s ease',
        }}
      >
        <div className="col" style={{ gap: 2 }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>
            {label ? `${label}` : 'D · Deutsch'}
          </span>
          <span style={{ fontSize: 11, opacity: 0.9 }}>R102 · Fr. Berger</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(0,0,0,0.2)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {currentHex.toUpperCase()}
          </span>
        </div>
      </div>

      {/* 1. Hue Slider (0 - 360°) */}
      <div className="col" style={{ gap: 4 }}>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
          <span className="muted" style={{ fontWeight: 600 }}>
            {t('customize.hsvHue')} (H)
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{hsv.h}°</span>
        </div>
        <input
          type="range"
          min="0"
          max="360"
          value={hsv.h}
          onChange={(e) => updateHsv({ h: Number(e.target.value) })}
          style={{
            appearance: 'none',
            height: 14,
            borderRadius: 7,
            outline: 'none',
            cursor: 'pointer',
            background:
              'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
          }}
        />
      </div>

      {/* 2. Saturation Slider (0 - 100%) */}
      <div className="col" style={{ gap: 4 }}>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
          <span className="muted" style={{ fontWeight: 600 }}>
            {t('customize.hsvSaturation')} (S)
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{hsv.s}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={hsv.s}
          onChange={(e) => updateHsv({ s: Number(e.target.value) })}
          style={{
            appearance: 'none',
            height: 14,
            borderRadius: 7,
            outline: 'none',
            cursor: 'pointer',
            background: `linear-gradient(to right, hsl(${hsv.h}, 0%, ${hsv.v * 0.5}%), hsl(${hsv.h}, 100%, ${hsv.v * 0.5}%))`,
          }}
        />
      </div>

      {/* 3. Value / Brightness Slider (0 - 100%) */}
      <div className="col" style={{ gap: 4 }}>
        <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
          <span className="muted" style={{ fontWeight: 600 }}>
            {t('customize.hsvValue')} (V)
          </span>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{hsv.v}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={hsv.v}
          onChange={(e) => updateHsv({ v: Number(e.target.value) })}
          style={{
            appearance: 'none',
            height: 14,
            borderRadius: 7,
            outline: 'none',
            cursor: 'pointer',
            background: `linear-gradient(to right, #000000, hsl(${hsv.h}, ${hsv.s}%, 50%))`,
          }}
        />
      </div>

      {/* Direct HSV & Hex inputs */}
      <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
        <div className="row" style={{ gap: 4, flex: 1 }}>
          <div className="col" style={{ flex: 1, gap: 2 }}>
            <span className="tiny muted">H°</span>
            <input
              type="number"
              min="0"
              max="360"
              value={hsv.h}
              onChange={(e) => updateHsv({ h: Number(e.target.value) })}
              style={{
                width: '100%',
                padding: '4px 6px',
                borderRadius: 5,
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                fontSize: 12,
                textAlign: 'center',
              }}
            />
          </div>

          <div className="col" style={{ flex: 1, gap: 2 }}>
            <span className="tiny muted">S%</span>
            <input
              type="number"
              min="0"
              max="100"
              value={hsv.s}
              onChange={(e) => updateHsv({ s: Number(e.target.value) })}
              style={{
                width: '100%',
                padding: '4px 6px',
                borderRadius: 5,
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                fontSize: 12,
                textAlign: 'center',
              }}
            />
          </div>

          <div className="col" style={{ flex: 1, gap: 2 }}>
            <span className="tiny muted">V%</span>
            <input
              type="number"
              min="0"
              max="100"
              value={hsv.v}
              onChange={(e) => updateHsv({ v: Number(e.target.value) })}
              style={{
                width: '100%',
                padding: '4px 6px',
                borderRadius: 5,
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                fontSize: 12,
                textAlign: 'center',
              }}
            />
          </div>
        </div>

        <div className="col" style={{ minWidth: 100, gap: 2 }}>
          <span className="tiny muted">HEX</span>
          <input
            type="text"
            value={hexInput}
            onChange={(e) => handleHexChange(e.target.value)}
            style={{
              width: '100%',
              padding: '4px 8px',
              borderRadius: 5,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text)',
              fontSize: 12,
              fontFamily: 'monospace',
              textTransform: 'uppercase',
            }}
          />
        </div>
      </div>

      {/* Quick Palette Dots */}
      {presetPalette.length > 0 && (
        <div className="row wrap" style={{ gap: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
          {presetPalette.map((p) => (
            <button
              key={p}
              type="button"
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                background: p,
                border: currentHex.toLowerCase() === p.toLowerCase() ? '2px solid var(--text)' : '1px solid rgba(0,0,0,0.2)',
                cursor: 'pointer',
                padding: 0,
              }}
              onClick={() => handleHexChange(p)}
              title={p}
            />
          ))}
        </div>
      )}
    </div>
  );
}
