import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, type Message } from '@untisplus/shared';
import { api } from '../api.js';
import { useModule } from '../data.js';
import { useLocalSet } from '../hooks.js';
import { formatDay, todayIso } from '../lib.js';
import { EmptyState, ErrorState, Icon } from '../components/primitives.js';
import { ListSkeleton, ModuleHeader, ModuleUnavailable, PageSubtitle } from '../components/module-ui.js';

/** Day-by-day message inbox, with local read tracking. */
export function MessagesView() {
  const { t, i18n } = useTranslation();
  const [date, setDate] = useState(todayIso());
  const mod = useModule<Message>(() => api.messages(date), [date]);
  const read = useLocalSet('up.msg.read');

  const today = todayIso();
  const items = mod.items;
  const isRead = (m: Message) => m.read || read.has(m.id);
  const unread = items.filter((m) => !isRead(m)).length;

  const dateLabel =
    date === today
      ? t('common.today')
      : date === addDays(today, -1)
        ? t('messages.yesterday')
        : date === addDays(today, 1)
          ? t('messages.tomorrow')
          : formatDay(date, i18n.language);

  return (
    <div>
      <ModuleHeader
        title={t('messages.title')}
        icon="mail"
        right={unread > 0 ? <span className="chip accent">{unread}</span> : undefined}
      />
      <PageSubtitle>{t('messages.subtitle')}</PageSubtitle>

      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <button
          className="btn ghost icon"
          onClick={() => setDate((d) => addDays(d, -1))}
          aria-label={t('messages.yesterday')}
        >
          <Icon name="chevronLeft" size={18} />
        </button>
        <span className="chip nowrap">{dateLabel}</span>
        <button
          className="btn ghost icon"
          onClick={() => setDate((d) => addDays(d, 1))}
          aria-label={t('messages.tomorrow')}
        >
          <Icon name="chevronRight" size={18} />
        </button>
        {date !== today && (
          <button className="btn sm" onClick={() => setDate(today)} type="button">
            {t('common.today')}
          </button>
        )}
      </div>

      {mod.loading && <ListSkeleton rows={2} height={80} />}
      {!mod.loading && mod.error ? (
        <ErrorState message={t('common.error')} onRetry={mod.reload} retryLabel={t('common.retry')} />
      ) : null}
      {!mod.loading && !mod.error && !mod.available && <ModuleUnavailable />}
      {!mod.loading && !mod.error && mod.available && items.length === 0 && (
        <EmptyState icon="mail" title={t('messages.none')} />
      )}

      {!mod.loading && !mod.error && mod.available && items.length > 0 && (
        <div className="day-list">
          {items.map((m) => {
            const unreadItem = !isRead(m);
            return (
              <div key={m.id} className={unreadItem ? 'item unread' : 'item'}>
                <div className="item-body">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="item-title">{m.subject}</span>
                    <div className="spacer" />
                    {unreadItem && <span className="badge irregular">{t('messages.unread')}</span>}
                    <button
                      className="btn ghost icon"
                      aria-label={t('messages.markRead')}
                      title={t('messages.markRead')}
                      onClick={() => read.toggle(m.id)}
                      type="button"
                    >
                      <Icon name="check" size={16} />
                    </button>
                  </div>
                  <div className="item-text">{m.body}</div>
                  <div className="item-meta">
                    {m.sender && (
                      <span>
                        <Icon name="user" size={13} /> {t('messages.sender')}: {m.sender}
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
