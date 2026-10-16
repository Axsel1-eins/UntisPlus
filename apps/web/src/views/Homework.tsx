import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, type Homework } from '@untisplus/shared';
import { api } from '../api.js';
import { useModule } from '../data.js';
import { useLocalSet } from '../hooks.js';
import { formatDay, subjectColor, todayIso } from '../lib.js';
import { EmptyState, ErrorState, Icon } from '../components/primitives.js';
import { ListSkeleton, ModuleHeader, ModuleUnavailable, PageSubtitle } from '../components/module-ui.js';

/** Homework for the next three weeks, with local completion tracking. */
export function HomeworkView() {
  const { t, i18n } = useTranslation();
  const start = todayIso();
  const end = addDays(start, 21);
  const mod = useModule<Homework>(() => api.homework(start, end), [start, end]);
  const done = useLocalSet('up.hw.done');

  const items = useMemo(
    () => [...mod.items].sort((a, b) => (a.dueDate ?? a.date).localeCompare(b.dueDate ?? b.date)),
    [mod.items],
  );
  const doneCount = items.filter((h) => h.completed || done.has(h.id)).length;

  return (
    <div>
      <ModuleHeader
        title={t('homework.title')}
        icon="clipboard"
        right={
          items.length > 0 ? (
            <span className="chip">
              {t('homework.completedOf', { done: doneCount, total: items.length })}
            </span>
          ) : undefined
        }
      />
      <PageSubtitle>{t('homework.subtitle')}</PageSubtitle>

      {mod.loading && <ListSkeleton rows={3} />}
      {!mod.loading && mod.error ? (
        <ErrorState message={t('common.error')} onRetry={mod.reload} retryLabel={t('common.retry')} />
      ) : null}
      {!mod.loading && !mod.error && !mod.available && <ModuleUnavailable />}
      {!mod.loading && !mod.error && mod.available && items.length === 0 && (
        <EmptyState icon="clipboard" title={t('homework.none')} />
      )}

      {!mod.loading && !mod.error && mod.available && items.length > 0 && (
        <div className="day-list">
          {items.map((h) => {
            const isDone = h.completed || done.has(h.id);
            const due = h.dueDate ?? h.date;
            const color = subjectColor(h.subject?.id, h.subject?.name);
            return (
              <div
                key={h.id}
                className={isDone ? 'item dim' : 'item'}
                style={{ ['--subj' as string]: color }}
              >
                <button
                  className="checkbox"
                  aria-pressed={isDone}
                  aria-label={isDone ? t('homework.done') : t('homework.open')}
                  title={isDone ? t('homework.done') : t('homework.open')}
                  onClick={() => done.toggle(h.id)}
                  type="button"
                >
                  <Icon name="check" size={16} />
                </button>
                <div className="item-body">
                  <div className="row" style={{ gap: 8 }}>
                    <span className={isDone ? 'item-title strike' : 'item-title'}>
                      {h.subject?.name ?? '—'}
                    </span>
                    <div className="spacer" />
                    <span className={`badge ${isDone ? 'ok' : 'irregular'}`}>
                      {isDone ? t('homework.done') : t('homework.open')}
                    </span>
                  </div>
                  <div className="item-text">{h.text}</div>
                  <div className="item-meta">
                    <span>
                      <Icon name="clock" size={13} /> {t('homework.due')}:{' '}
                      {h.dueDate ? formatDay(due, i18n.language) : t('homework.noDue')}
                    </span>
                    {h.teacher && (
                      <span>
                        <Icon name="user" size={13} /> {h.teacher.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
