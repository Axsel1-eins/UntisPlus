import {
  useEffect,
  type ReactNode,
} from 'react';

const ICONS: Record<string, string[]> = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5'],
  calendar: ['M3 5h18v16H3z', 'M3 9.5h18', 'M8 3v4', 'M16 3v4'],
  bell: ['M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6', 'M10.5 20a1.5 1.5 0 0 0 3 0'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  refresh: ['M21 12a9 9 0 1 1-3-6.7', 'M21 4v5h-5'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-3.5-3.5'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  check: ['M20 6 9 17l-5-5'],
  sun: ['M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z', 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19'],
  moon: ['M20 14a8 8 0 1 1-9.9-7.8A6.5 6.5 0 0 0 20 14z'],
  monitor: ['M3 4h18v11H3z', 'M8 20h8', 'M12 15v5'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
  wifiOff: ['M3 3l18 18', 'M8.5 15.5a5 5 0 0 1 7 0', 'M5 12a10 10 0 0 1 3-2', 'M12 19h.01'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0'],
  chevronRight: ['M9 6l6 6-6 6'],
  chevronLeft: ['M15 6l-6 6 6 6'],
  chevronUp: ['M18 15l-6-6-6 6'],
  arrowUp: ['M12 19V5', 'M5 12l7-7 7 7'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  mapPin: ['M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z', 'M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  book: ['M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z', 'M17 7h3v13H7'],
  alert: ['M12 3l9 16H3z', 'M12 9v5M12 17h.01'],
  logout: ['M15 4h4v16h-4', 'M10 12H3', 'M6 8l-4 4 4 4'],
  plus: ['M12 5v14M5 12h14'],
  filter: ['M4 5h16l-6 7v6l-4 2v-8z'],
  grid: ['M3 3h8v8H3z', 'M13 3h8v8h-8z', 'M3 13h8v8H3z', 'M13 13h8v8h-8z'],
  mail: ['M3 6h18v12H3z', 'M3 7.5l9 6 9-6'],
  clipboard: ['M9 4h6v3H9z', 'M7 5.5H5V21h14V5.5h-2', 'M9 12h6', 'M9 16h4'],
  gradCap: ['M2 9l10-5 10 5-10 5z', 'M6 11.2V16c0 1.2 2.7 2 6 2s6-.8 6-2v-4.8', 'M22 9v6'],
  calendarX: ['M3 5h18v16H3z', 'M3 9.5h18', 'M8 3v4', 'M16 3v4', 'M10 13.5l4 4', 'M14 13.5l-4 4'],
  pencil: ['M4 20h4L20 8l-4-4L4 16z', 'M14 6l4 4'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  share: ['M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7', 'M12 3v12', 'M8 7l4-4 4 4'],
  palette: [
    'M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h6a3 3 0 0 0 3-3 9 9 0 0 0-9-9z',
    'M7.5 10.5h.01',
    'M12 7.5h.01',
    'M16.5 10.5h.01',
  ],
  copy: ['M9 9h10v10H9z', 'M5 15V5h10'],
  upload: ['M12 21V9', 'M7 14l5-5 5 5', 'M5 3h14'],
  puzzle: [
    'M10 4a2 2 0 1 1 4 0v1h3a1 1 0 0 1 1 1v3h1a2 2 0 1 1 0 4h-1v3a1 1 0 0 1-1 1h-3v-1a2 2 0 1 0-4 0v1H6a1 1 0 0 1-1-1v-3H4a2 2 0 1 1 0-4h1V6a1 1 0 0 1 1-1h4z',
  ],
  link: ['M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1'],
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  eye: ['M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  eyeOff: ['M9.88 9.88a3 3 0 1 0 4.24 4.24', 'M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68', 'M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61', 'M2 2l20 20'],
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths = ICONS[name] ?? [];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Chip({ children, accent, title }: { children: ReactNode; accent?: boolean; title?: string }) {
  return (
    <span className={accent ? 'chip accent' : 'chip'} title={title}>
      {children}
    </span>
  );
}

export function Badge({ tone, children }: { tone: 'cancelled' | 'irregular' | 'exam' | 'ok'; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function EmptyState({ icon = 'calendar', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="big" aria-hidden="true">
        <Icon name={icon} size={34} />
      </div>
      <div style={{ fontWeight: 700, color: 'var(--text)' }}>{title}</div>
      {hint && <div className="small" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="alert error" role="alert">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 650 }}>
        <Icon name="alert" size={18} />
        {message}
      </div>
      {onRetry && (
        <button className="btn sm" style={{ marginTop: 10 }} onClick={onRetry}>
          <Icon name="refresh" size={16} />
          {retryLabel}
        </button>
      )}
    </div>
  );
}

export function Skeleton({ height = 64 }: { height?: number }) {
  return <div className="skel" style={{ height }} aria-hidden="true" />;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          aria-label={o.title}
          title={o.title}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={onClose} role="presentation">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle show-on-mobile" />
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800 }}>{title}</h2>
          <div className="spacer" />
          <button className="btn ghost icon" onClick={onClose} aria-label="close">
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
