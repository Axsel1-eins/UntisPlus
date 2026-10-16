import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { navigate } from '../router.js';
import { Icon, Skeleton } from './primitives.js';

/** Header used by every module view: back button, icon + title, optional right slot. */
export function ModuleHeader({
  title,
  icon,
  right,
}: {
  title: string;
  icon: string;
  right?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
      <button
        type="button"
        className="btn ghost icon"
        onClick={() => {
          if (typeof window !== 'undefined' && window.history.length > 1) {
            window.history.back();
          } else {
            navigate('today');
          }
        }}
        aria-label={t('onboarding.back')}
        title={t('onboarding.back')}
      >
        <Icon name="chevronLeft" size={18} />
      </button>
      <h1 className="page-title row" style={{ gap: 8, alignItems: 'center' }}>
        <Icon name={icon} size={22} />
        {title}
      </h1>
      <div className="spacer" />
      {right}
    </div>
  );
}

/** Friendly message shown when the current sign-in lacks permission for a module. */
export function ModuleUnavailable() {
  const { t } = useTranslation();
  return (
    <div className="alert warn" role="status">
      <div className="row" style={{ gap: 8, fontWeight: 650 }}>
        <Icon name="alert" size={18} />
        {t('modules.unavailableTitle')}
      </div>
      <div className="small" style={{ marginTop: 8, lineHeight: 1.5 }}>
        {t('modules.unavailableHint')}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 3, height = 74 }: { rows?: number; height?: number }) {
  return (
    <div className="col" style={{ gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </div>
  );
}

export function PageSubtitle({ children }: { children: ReactNode }) {
  return (
    <div className="small muted" style={{ marginBottom: 12 }}>
      {children}
    </div>
  );
}
