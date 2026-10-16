import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ElementType, type Ref } from '@untisplus/shared';
import { useApp, type Target } from '../store.js';
import { useCustomization, isFavorite, toggleFavorite } from '../customization.js';
import { Dialog, Icon } from './primitives.js';

type Tab = 'me' | 'favorites' | 'teachers' | 'classes' | 'rooms';

export function TargetModal({
  open,
  onClose,
  currentTarget,
  onSelectTarget,
}: {
  open: boolean;
  onClose: () => void;
  currentTarget: Target | null;
  onSelectTarget: (t: Target | null) => void;
}) {
  const { t } = useTranslation();
  const { session, master, refresh } = useApp();
  const customization = useCustomization();
  const [tab, setTab] = useState<Tab>('teachers');
  const [search, setSearch] = useState('');

  // When opened, if school blocked teachers list initially, trigger refresh to fetch harvested teachers
  useEffect(() => {
    if (open && (!master?.teachers || master.teachers.length === 0)) {
      void refresh();
    }
  }, [open, master?.teachers?.length, refresh]);

  const teachers = useMemo(() => master?.teachers ?? [], [master?.teachers]);
  const klassen = useMemo(() => master?.klassen ?? [], [master?.klassen]);
  // Exclude placeholder '?' rooms
  const rooms = useMemo(
    () => (master?.rooms ?? []).filter((r) => r.name && r.name !== '?' && r.name.trim() !== ''),
    [master?.rooms],
  );

  const query = search.trim().toLowerCase();

  const filteredTeachers = useMemo(() => {
    if (!query) return teachers;
    return teachers.filter(
      (te) =>
        te.name.toLowerCase().includes(query) ||
        (te.longName && te.longName.toLowerCase().includes(query)),
    );
  }, [teachers, query]);

  const filteredKlassen = useMemo(() => {
    if (!query) return klassen;
    return klassen.filter(
      (k) =>
        k.name.toLowerCase().includes(query) ||
        (k.longName && k.longName.toLowerCase().includes(query)),
    );
  }, [klassen, query]);

  const filteredRooms = useMemo(() => {
    if (!query) return rooms;
    return rooms.filter(
      (r) =>
        r.name.toLowerCase().includes(query) ||
        (r.longName && r.longName.toLowerCase().includes(query)),
    );
  }, [rooms, query]);

  // Starred favorites subsets
  const favTeachers = useMemo(
    () => teachers.filter((te) => isFavorite('teachers', te.id)),
    [teachers, customization.favorites],
  );
  const favKlassen = useMemo(
    () => klassen.filter((k) => isFavorite('klassen', k.id)),
    [klassen, customization.favorites],
  );
  const favRooms = useMemo(
    () => rooms.filter((r) => isFavorite('rooms', r.id)),
    [rooms, customization.favorites],
  );

  const totalFavs = favTeachers.length + favKlassen.length + favRooms.length;

  function pickTarget(target: Target | null) {
    onSelectTarget(target);
    onClose();
  }

  const isMyPlanActive = currentTarget === null;

  return (
    <Dialog open={open} onClose={onClose} title={t('targetModal.title')}>
      <div className="col" style={{ gap: 12, maxHeight: '72vh', overflowY: 'auto' }}>
        {/* Navigation Tabs */}
        <div className="segmented wrap" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'me'}
            onClick={() => setTab('me')}
          >
            <span>👤</span>
            <span>{t('targetModal.tabMyPlan')}</span>
          </button>
          {totalFavs > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'favorites'}
              onClick={() => setTab('favorites')}
            >
              <span>⭐</span>
              <span>Favoriten</span>
              <span className="badge small ok">{totalFavs}</span>
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'teachers'}
            onClick={() => setTab('teachers')}
          >
            <span>👨‍🏫</span>
            <span>{t('targetModal.tabTeachers')}</span>
            <span className="badge small">{teachers.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'classes'}
            onClick={() => setTab('classes')}
          >
            <span>👥</span>
            <span>{t('targetModal.tabClasses')}</span>
            <span className="badge small">{klassen.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'rooms'}
            onClick={() => setTab('rooms')}
          >
            <span>🏛️</span>
            <span>{t('targetModal.tabRooms')}</span>
            <span className="badge small">{rooms.length}</span>
          </button>
        </div>

        {/* Tab 1: Mein Plan */}
        {tab === 'me' && (
          <div className="col" style={{ gap: 12 }}>
            <div
              className="card pad col"
              style={{
                gap: 10,
                background: isMyPlanActive ? 'var(--surface-3)' : 'var(--surface)',
                borderColor: isMyPlanActive ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 28 }}>👤</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>
                    {session?.displayName || t('timetable.me')}
                  </div>
                  <div className="small muted">
                    {session?.school.displayName || session?.school.loginName || '—'}
                  </div>
                </div>
                {isMyPlanActive && <span className="badge ok">{t('targetModal.currentActive')}</span>}
              </div>

              <div className="small muted" style={{ lineHeight: 1.5 }}>
                {t('targetModal.myPlanDesc')}
              </div>

              <button
                type="button"
                className={`btn ${isMyPlanActive ? 'ghost' : 'primary'}`}
                onClick={() => pickTarget(null)}
                style={{ justifyContent: 'center' }}
              >
                <Icon name="check" size={16} />
                <span>{t('targetModal.restoreMyPlan')}</span>
              </button>
            </div>

            {/* Parent child profiles if any */}
            {session?.children && session.children.length > 0 && (
              <div className="col" style={{ gap: 8, marginTop: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{t('targetModal.childrenTitle')}</span>
                <div className="col" style={{ gap: 6 }}>
                  {session.children.map((c) => {
                    const isChildActive =
                      currentTarget?.type === ElementType.Student && currentTarget.id === c.id;
                    return (
                      <div
                        key={c.id}
                        className="card pad row"
                        style={{
                          gap: 10,
                          alignItems: 'center',
                          cursor: 'pointer',
                          borderColor: isChildActive ? 'var(--accent)' : 'var(--border)',
                        }}
                        onClick={() =>
                          pickTarget({
                            id: c.id,
                            type: ElementType.Student,
                            label: c.name || `Kind (${c.id})`,
                          })
                        }
                      >
                        <span style={{ fontSize: 20 }}>🎒</span>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 700 }}>{c.name || `Kind (ID ${c.id})`}</span>
                        </div>
                        {isChildActive && <span className="badge ok">{t('targetModal.currentActive')}</span>}
                        <button type="button" className="btn sm">
                          {t('targetModal.viewTimetable')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Favorites Hub */}
        {tab === 'favorites' && (
          <div className="col" style={{ gap: 14 }}>
            {totalFavs === 0 ? (
              <div className="small muted center" style={{ padding: '24px 0' }}>
                Noch keine Favoriten gespeichert. Klicke auf den Stern (⭐) bei einer Lehrkraft, Klasse oder einem Raum!
              </div>
            ) : (
              <>
                {favTeachers.length > 0 && (
                  <div className="col" style={{ gap: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 13 }}>👨‍🏫 Favorisierte Lehrkräfte</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                      {favTeachers.map((te) => (
                        <TeacherCard
                          key={te.id}
                          teacher={te}
                          isActive={currentTarget?.type === ElementType.Teacher && currentTarget.id === te.id}
                          onPick={() =>
                            pickTarget({
                              id: te.id,
                              type: ElementType.Teacher,
                              label: te.longName ? `${te.name} (${te.longName})` : te.name,
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}

                {favKlassen.length > 0 && (
                  <div className="col" style={{ gap: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 13 }}>👥 Favorisierte Klassen</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                      {favKlassen.map((k) => (
                        <KlasseCard
                          key={k.id}
                          klasse={k}
                          isActive={currentTarget?.type === ElementType.Class && currentTarget.id === k.id}
                          onPick={() => pickTarget({ id: k.id, type: ElementType.Class, label: k.name })}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {favRooms.length > 0 && (
                  <div className="col" style={{ gap: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 13 }}>🏛️ Favorisierte Räume</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                      {favRooms.map((r) => (
                        <RoomCard
                          key={r.id}
                          room={r}
                          isActive={currentTarget?.type === ElementType.Room && currentTarget.id === r.id}
                          onPick={() => pickTarget({ id: r.id, type: ElementType.Room, label: r.name })}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Search input for Teachers, Classes, Rooms */}
        {tab !== 'me' && tab !== 'favorites' && (
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <div
              className="row"
              style={{
                flex: 1,
                alignItems: 'center',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                gap: 8,
              }}
            >
              <Icon name="search" size={16} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  tab === 'teachers'
                    ? t('targetModal.searchTeachersPlaceholder')
                    : tab === 'classes'
                      ? t('targetModal.searchClassesPlaceholder')
                      : t('targetModal.searchRoomsPlaceholder')
                }
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text)',
                  fontSize: 13,
                }}
              />
              {search && (
                <button
                  type="button"
                  className="btn ghost icon sm"
                  style={{ minWidth: 24, padding: 0 }}
                  onClick={() => setSearch('')}
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Lehrkräfte */}
        {tab === 'teachers' && (
          <div className="col" style={{ gap: 10 }}>
            {/* Show Quick Favorites Bar on top if any and not searching */}
            {!query && favTeachers.length > 0 && (
              <div className="col" style={{ gap: 6, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                <span className="small muted" style={{ fontWeight: 700 }}>⭐ Deine Favoriten</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                  {favTeachers.map((te) => (
                    <TeacherCard
                      key={`fav-${te.id}`}
                      teacher={te}
                      isActive={currentTarget?.type === ElementType.Teacher && currentTarget.id === te.id}
                      onPick={() =>
                        pickTarget({
                          id: te.id,
                          type: ElementType.Teacher,
                          label: te.longName ? `${te.name} (${te.longName})` : te.name,
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredTeachers.length === 0 ? (
              <div className="small muted" style={{ textAlign: 'center', padding: '24px 0' }}>
                {t('targetModal.noResults')}
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: 8,
                }}
              >
                {filteredTeachers.map((te) => (
                  <TeacherCard
                    key={te.id}
                    teacher={te}
                    isActive={currentTarget?.type === ElementType.Teacher && currentTarget.id === te.id}
                    onPick={() =>
                      pickTarget({
                        id: te.id,
                        type: ElementType.Teacher,
                        label: te.longName ? `${te.name} (${te.longName})` : te.name,
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Klassen */}
        {tab === 'classes' && (
          <div className="col" style={{ gap: 10 }}>
            {!query && favKlassen.length > 0 && (
              <div className="col" style={{ gap: 6, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                <span className="small muted" style={{ fontWeight: 700 }}>⭐ Deine Favoriten</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                  {favKlassen.map((k) => (
                    <KlasseCard
                      key={`fav-${k.id}`}
                      klasse={k}
                      isActive={currentTarget?.type === ElementType.Class && currentTarget.id === k.id}
                      onPick={() => pickTarget({ id: k.id, type: ElementType.Class, label: k.name })}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredKlassen.length === 0 ? (
              <div className="small muted" style={{ textAlign: 'center', padding: '24px 0' }}>
                {t('targetModal.noResults')}
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 8,
                }}
              >
                {filteredKlassen.map((k) => (
                  <KlasseCard
                    key={k.id}
                    klasse={k}
                    isActive={currentTarget?.type === ElementType.Class && currentTarget.id === k.id}
                    onPick={() => pickTarget({ id: k.id, type: ElementType.Class, label: k.name })}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Räume */}
        {tab === 'rooms' && (
          <div className="col" style={{ gap: 10 }}>
            {!query && favRooms.length > 0 && (
              <div className="col" style={{ gap: 6, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                <span className="small muted" style={{ fontWeight: 700 }}>⭐ Deine Favoriten</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                  {favRooms.map((r) => (
                    <RoomCard
                      key={`fav-${r.id}`}
                      room={r}
                      isActive={currentTarget?.type === ElementType.Room && currentTarget.id === r.id}
                      onPick={() => pickTarget({ id: r.id, type: ElementType.Room, label: r.name })}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredRooms.length === 0 ? (
              <div className="small muted" style={{ textAlign: 'center', padding: '24px 0' }}>
                {t('targetModal.noResults')}
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 8,
                }}
              >
                {filteredRooms.map((r) => (
                  <RoomCard
                    key={r.id}
                    room={r}
                    isActive={currentTarget?.type === ElementType.Room && currentTarget.id === r.id}
                    onPick={() => pickTarget({ id: r.id, type: ElementType.Room, label: r.name })}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function TeacherCard({
  teacher,
  isActive,
  onPick,
}: {
  teacher: Ref;
  isActive: boolean;
  onPick: () => void;
}) {
  const isFav = isFavorite('teachers', teacher.id);
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      style={{
        padding: '10px 12px',
        background: isActive ? 'var(--surface-3)' : 'var(--surface-2)',
        borderColor: isActive ? 'var(--accent)' : 'var(--border)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        position: 'relative',
      }}
      onClick={onPick}
    >
      <span
        style={{
          background: 'var(--accent)',
          color: 'var(--accent-ink)',
          fontWeight: 800,
          fontSize: 12,
          padding: '4px 8px',
          borderRadius: 6,
          minWidth: 44,
          textAlign: 'center',
        }}
      >
        {teacher.name}
      </span>

      <div className="col" style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }} className="nowrap">
          {teacher.longName || teacher.name}
        </span>
        <span className="tiny muted nowrap">Code: {teacher.name}</span>
      </div>

      <button
        type="button"
        className="btn ghost icon sm"
        style={{
          minWidth: 28,
          height: 28,
          padding: 0,
          color: isFav ? '#f59e0b' : 'var(--muted)',
          fontSize: 15,
        }}
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite('teachers', teacher.id);
        }}
        title={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
      >
        {isFav ? '⭐' : '☆'}
      </button>

      {isActive && <Icon name="check" size={16} />}
    </div>
  );
}

function KlasseCard({
  klasse,
  isActive,
  onPick,
}: {
  klasse: Ref;
  isActive: boolean;
  onPick: () => void;
}) {
  const isFav = isFavorite('klassen', klasse.id);
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      style={{
        padding: '10px 12px',
        background: isActive ? 'var(--surface-3)' : 'var(--surface-2)',
        borderColor: isActive ? 'var(--accent)' : 'var(--border)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
      onClick={onPick}
    >
      <span style={{ fontSize: 18 }}>👥</span>
      <div className="col" style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }} className="nowrap">
          {klasse.name}
        </span>
        {klasse.longName && klasse.longName !== klasse.name && (
          <span className="tiny muted nowrap">{klasse.longName}</span>
        )}
      </div>

      <button
        type="button"
        className="btn ghost icon sm"
        style={{
          minWidth: 28,
          height: 28,
          padding: 0,
          color: isFav ? '#f59e0b' : 'var(--muted)',
          fontSize: 15,
        }}
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite('klassen', klasse.id);
        }}
        title={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
      >
        {isFav ? '⭐' : '☆'}
      </button>

      {isActive && <Icon name="check" size={16} />}
    </div>
  );
}

function RoomCard({
  room,
  isActive,
  onPick,
}: {
  room: Ref;
  isActive: boolean;
  onPick: () => void;
}) {
  const isFav = isFavorite('rooms', room.id);
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      style={{
        padding: '10px 12px',
        background: isActive ? 'var(--surface-3)' : 'var(--surface-2)',
        borderColor: isActive ? 'var(--accent)' : 'var(--border)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
      onClick={onPick}
    >
      <span style={{ fontSize: 18 }}>🏛️</span>
      <div className="col" style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }} className="nowrap">
          {room.name}
        </span>
        {room.longName && room.longName !== room.name && (
          <span className="tiny muted nowrap">{room.longName}</span>
        )}
      </div>

      <button
        type="button"
        className="btn ghost icon sm"
        style={{
          minWidth: 28,
          height: 28,
          padding: 0,
          color: isFav ? '#f59e0b' : 'var(--muted)',
          fontSize: 15,
        }}
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite('rooms', room.id);
        }}
        title={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
      >
        {isFav ? '⭐' : '☆'}
      </button>

      {isActive && <Icon name="check" size={16} />}
    </div>
  );
}
