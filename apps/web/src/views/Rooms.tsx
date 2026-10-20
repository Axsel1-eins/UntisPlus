import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addDays,
  computeRoomOccupancy,
  ElementType,
  type Lesson,
  type Ref,
  type RoomOccupancy,
} from '@untisplus/shared';
import { useApp } from '../store.js';
import { navigate } from '../router.js';
import { api } from '../api.js';
import { formatDay, todayIso } from '../lib.js';
import { useCustomization, isFavorite, toggleFavorite } from '../customization.js';
import { Icon, EmptyState, Segmented, Spinner } from '../components/primitives.js';

type FilterMode = 'all' | 'freeNow' | 'favorites' | 'computer' | 'gym' | 'special';

export function RoomsView() {
  const { t, i18n } = useTranslation();
  const { master, setTarget } = useApp();
  const customization = useCustomization();
  const [selectedDate, setSelectedDate] = useState<string>(todayIso());
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>(() => {
    if (customization.roomsOnlyFreeDefault) return 'freeNow';
    if (customization.roomsDefaultCategory && customization.roomsDefaultCategory !== 'all') {
      return customization.roomsDefaultCategory as FilterMode;
    }
    return 'all';
  });
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | 'now'>('now');
  const [viewMode, setViewMode] = useState<'cards' | 'matrix'>('cards');
  const [serverOccupancies, setServerOccupancies] = useState<RoomOccupancy[] | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    api
      .roomsOccupancy(selectedDate)
      .then((res) => {
        if (active && Array.isArray(res.occupancies) && res.occupancies.length > 0) {
          setServerOccupancies(res.occupancies);
        }
      })
      .catch(() => {
        // Fall back to student timetable if occupancy endpoint fails
        return api.timetable(selectedDate, selectedDate).then((res) => {
          if (active) setLessons(res.lessons ?? []);
        });
      })
      .catch(() => {
        // Silently tolerate
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedDate]);

  const currentMin = useMemo(() => {
    if (selectedDate !== todayIso()) return 480; // 08:00 for past/future days
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }, [selectedDate]);

  const occupancies = useMemo<RoomOccupancy[]>(() => {
    // Filter out invalid or question-mark placeholder rooms
    const validRooms = (master?.rooms ?? []).filter(
      (r) => r.name && r.name !== '?' && r.name.trim() !== '',
    );

    if (serverOccupancies && serverOccupancies.length > 0) {
      return serverOccupancies.filter(
        (o) => o.room.name && o.room.name !== '?' && o.room.name.trim() !== '',
      );
    }
    const grid =
      master?.timeGrid && master.timeGrid.length > 0
        ? master.timeGrid
        : [
            { name: '0', startMin: 420, endMin: 470 },
            { name: '1', startMin: 470, endMin: 520 },
            { name: '2', startMin: 520, endMin: 570 },
            { name: '3', startMin: 580, endMin: 630 },
            { name: '4', startMin: 630, endMin: 680 },
            { name: '5', startMin: 680, endMin: 730 },
            { name: '6', startMin: 740, endMin: 790 },
            { name: '7', startMin: 790, endMin: 840 },
            { name: '8', startMin: 840, endMin: 890 },
            { name: '9', startMin: 900, endMin: 950 },
            { name: '10', startMin: 950, endMin: 1000 },
          ];
    return computeRoomOccupancy(validRooms, grid, lessons, currentMin);
  }, [serverOccupancies, master?.rooms, master?.timeGrid, lessons, currentMin]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return occupancies.filter((occ) => {
      const isFav = isFavorite('rooms', occ.room.id);
      if (filterMode === 'favorites' && !isFav) return false;
      if (filterMode === 'freeNow') {
        if (!occ.isFreeNow) return false;
      }
      if (filterMode === 'computer' && occ.category !== 'computer') return false;
      if (filterMode === 'gym' && occ.category !== 'gym') return false;
      if (filterMode === 'special' && occ.category !== 'special') return false;

      // Slot-specific filter if a slot is selected
      if (selectedSlotIndex !== 'now') {
        const slot = occ.slots[selectedSlotIndex];
        if (!slot || slot.occupied) return false;
      }

      if (!q) return true;
      return (
        occ.room.name.toLowerCase().includes(q) ||
        Boolean(occ.room.longName && occ.room.longName.toLowerCase().includes(q))
      );
    });
  }, [occupancies, filterMode, selectedSlotIndex, query, customization.favorites]);

  function selectRoom(r: { id: number; name: string; longName?: string }) {
    setTarget({
      id: r.id,
      type: ElementType.Room,
      label: r.name,
    });
    navigate('timetable');
  }

  const freeCount = occupancies.filter((o) => o.isFreeNow).length;
  const timeSlots = occupancies[0]?.slots ?? [];
  const favCount = occupancies.filter((o) => isFavorite('rooms', o.room.id)).length;

  return (
    <div>
      {/* Title & Controls Bar */}
      <div className="row wrap" style={{ gap: 12, marginBottom: 14 }}>
        <div>
          <h1 className="page-title">{t('rooms.title')}</h1>
          <div className="muted small">{t('rooms.subtitle')}</div>
        </div>
        <div className="spacer" />
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          {loading && <Spinner size={16} />}
          <Segmented
            label="View"
            value={viewMode}
            onChange={(v) => setViewMode(v as 'cards' | 'matrix')}
            options={[
              { value: 'cards', label: t('rooms.viewCards') },
              { value: 'matrix', label: t('rooms.viewMatrix') },
            ]}
          />
        </div>
      </div>

      {/* Date Navigation Strip */}
      <div className="row wrap" style={{ gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <button
          type="button"
          className={`btn sm ${selectedDate === todayIso() ? 'primary' : 'ghost'}`}
          onClick={() => setSelectedDate(todayIso())}
        >
          <span>Heute</span>
        </button>
        <button
          type="button"
          className={`btn sm ${selectedDate === addDays(todayIso(), 1) ? 'primary' : 'ghost'}`}
          onClick={() => setSelectedDate(addDays(todayIso(), 1))}
        >
          <span>Morgen</span>
        </button>
        <input
          type="date"
          className="date-picker-input"
          value={selectedDate}
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
          aria-label="Datum wählen"
        />
        <div className="small muted" style={{ fontWeight: 600 }}>
          {formatDay(selectedDate, i18n.language)}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="col" style={{ gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative' }}>
          <input
            className="input"
            style={{ paddingLeft: 38 }}
            placeholder={t('rooms.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted)' }}>
            <Icon name="search" size={17} />
          </span>
          {query && (
            <button
              type="button"
              className="btn ghost icon sm"
              style={{ position: 'absolute', right: 8, top: 8, minWidth: 28, height: 28, padding: 0 }}
              onClick={() => setQuery('')}
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        {/* Quick Filter Chips */}
        <div className="row wrap" style={{ gap: 8 }}>
          <button
            type="button"
            className={`btn small ${filterMode === 'all' && selectedSlotIndex === 'now' ? 'primary' : 'ghost'}`}
            onClick={() => {
              setFilterMode('all');
              setSelectedSlotIndex('now');
            }}
          >
            {t('rooms.filterAll')} ({occupancies.length})
          </button>
          <button
            type="button"
            className={`btn small ${filterMode === 'freeNow' ? 'primary' : 'ghost'}`}
            onClick={() => {
              setFilterMode('freeNow');
              setSelectedSlotIndex('now');
            }}
          >
            <span>🟢 {t('rooms.filterFreeNow')} ({freeCount})</span>
          </button>
          {favCount > 0 && (
            <button
              type="button"
              className={`btn small ${filterMode === 'favorites' ? 'primary' : 'ghost'}`}
              onClick={() => setFilterMode('favorites')}
            >
              <span>⭐ Favoriten ({favCount})</span>
            </button>
          )}
          <button
            type="button"
            className={`btn small ${filterMode === 'computer' ? 'primary' : 'ghost'}`}
            onClick={() => setFilterMode('computer')}
          >
            <span>💻 {t('rooms.filterComputer')}</span>
          </button>
          <button
            type="button"
            className={`btn small ${filterMode === 'gym' ? 'primary' : 'ghost'}`}
            onClick={() => setFilterMode('gym')}
          >
            <span>🏃 {t('rooms.filterGym')}</span>
          </button>
          <button
            type="button"
            className={`btn small ${filterMode === 'special' ? 'primary' : 'ghost'}`}
            onClick={() => setFilterMode('special')}
          >
            <span>🎨 {t('rooms.filterSpecial')}</span>
          </button>
        </div>

        {/* Period slot pills selector */}
        {timeSlots.length > 0 && (
          <div className="row wrap" style={{ gap: 4, alignItems: 'center' }}>
            <span className="tiny muted" style={{ fontWeight: 700, marginRight: 4 }}>
              {t('rooms.freeInPeriod')}:
            </span>
            <button
              type="button"
              className={`btn sm ${selectedSlotIndex === 'now' ? 'primary' : 'ghost'}`}
              style={{ fontSize: 11, padding: '2px 8px', minHeight: 26 }}
              onClick={() => setSelectedSlotIndex('now')}
            >
              Jetzt
            </button>
            {timeSlots.map((s, idx) => (
              <button
                key={idx}
                type="button"
                className={`btn sm ${selectedSlotIndex === idx ? 'primary' : 'ghost'}`}
                style={{ fontSize: 11, padding: '2px 8px', minHeight: 26 }}
                onClick={() => setSelectedSlotIndex(idx)}
              >
                {s.slotName}. Std
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="grid"
          title={t('rooms.emptyTitle')}
          hint={t('rooms.emptyHint')}
        />
      ) : viewMode === 'cards' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {filtered.map((occ) => {
            const isFav = isFavorite('rooms', occ.room.id);
            return (
              <div
                key={occ.room.id}
                className="card col"
                style={{
                  padding: '14px 16px',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, transform 0.1s',
                  gap: 10,
                  position: 'relative',
                }}
                onClick={() => selectRoom(occ.room)}
              >
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: 16 }}>{occ.room.name}</span>
                    {occ.category === 'computer' && <span className="chip" style={{ fontSize: 10 }}>💻 EDV</span>}
                    {occ.category === 'gym' && <span className="chip" style={{ fontSize: 10 }}>🏃 Turn</span>}
                    {occ.category === 'special' && <span className="chip" style={{ fontSize: 10 }}>🎨 Lab</span>}
                  </div>

                  <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn ghost icon sm"
                      style={{
                        minWidth: 26,
                        height: 26,
                        padding: 0,
                        color: isFav ? '#f59e0b' : 'var(--muted)',
                        fontSize: 14,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite('rooms', occ.room.id);
                      }}
                      title={isFav ? t('rooms.removeFromFav') : t('rooms.addToFav')}
                    >
                      {isFav ? '⭐' : '☆'}
                    </button>

                    {occ.isFreeNow ? (
                      <span
                        className="badge ok"
                        style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <span>●</span> {t('rooms.freeNow')}
                      </span>
                    ) : (
                      <span
                        className="badge warn"
                        style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <span>●</span> {t('rooms.occupiedNow')}
                      </span>
                    )}
                  </div>
                </div>

                {occ.room.longName && occ.room.longName !== occ.room.name && (
                  <div className="muted small" style={{ marginTop: -4 }}>
                    {occ.room.longName}
                  </div>
                )}

                {/* Status Note */}
                <div
                  className="small"
                  style={{
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    background: occ.isFreeNow ? 'var(--ok-soft)' : 'var(--warn-soft)',
                    color: occ.isFreeNow ? 'var(--ok)' : 'var(--warn)',
                  }}
                >
                  {occ.isFreeNow
                    ? occ.freeUntilFormatted
                      ? `${t('rooms.freeUntil')} ${occ.freeUntilFormatted}`
                      : t('rooms.freeAllDay')
                    : `${t('rooms.occupiedBy')} ${occ.currentLesson?.subject ?? 'Unterricht'} ${
                        occ.currentLesson?.klasse ? `(${occ.currentLesson.klasse})` : ''
                      }`}
                </div>

                {/* Mini Period Strip */}
                {occ.slots.length > 0 && (
                  <div className="col" style={{ gap: 4 }}>
                    <div className="row" style={{ gap: 3 }}>
                      {occ.slots.map((s, idx) => (
                        <div
                          key={idx}
                          title={`${t('timetable.periodNum')} ${s.slotName}: ${s.occupied ? s.lesson?.subject ?? t('rooms.legendOccupied') : t('rooms.legendFree')}`}
                          style={{
                            flex: 1,
                            height: 6,
                            borderRadius: 2,
                            background: s.occupied ? 'var(--accent)' : 'var(--ok)',
                            opacity: s.occupied ? 0.8 : 0.4,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className="row" style={{ marginTop: 2, alignItems: 'center', gap: 6 }}>
                  <button
                    type="button"
                    className="btn ghost small"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectRoom(occ.room);
                    }}
                  >
                    <Icon name="calendar" size={14} />
                    <span>{t('rooms.viewTimetable')}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Timeline Matrix Grid View */
        <div
          className="card"
          style={{
            overflowX: 'auto',
            padding: 0,
            borderRadius: 'var(--radius)',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                <th
                  style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    position: 'sticky',
                    left: 0,
                    background: 'var(--surface-2)',
                    zIndex: 2,
                    fontWeight: 700,
                  }}
                >
                  {t('rooms.tableRoom')}
                </th>
                <th style={{ padding: '10px 8px', fontWeight: 700 }}>Status</th>
                {timeSlots.map((s, idx) => (
                  <th key={idx} style={{ padding: '10px 6px', fontWeight: 700, minWidth: 46 }}>
                    {s.slotName}.
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((occ) => (
                <tr
                  key={occ.room.id}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onClick={() => selectRoom(occ.room)}
                >
                  <td
                    style={{
                      padding: '8px 14px',
                      textAlign: 'left',
                      fontWeight: 700,
                      position: 'sticky',
                      left: 0,
                      background: 'var(--surface)',
                      zIndex: 1,
                    }}
                  >
                    <div className="row" style={{ gap: 6 }}>
                      <span>{occ.room.name}</span>
                      {occ.category === 'computer' && <span style={{ fontSize: 10 }}>💻</span>}
                      {occ.category === 'gym' && <span style={{ fontSize: 10 }}>🏃</span>}
                    </div>
                  </td>
                  <td style={{ padding: '8px' }}>
                    {occ.isFreeNow ? (
                      <span className="badge ok" style={{ fontSize: 10, padding: '2px 6px' }}>
                        Frei
                      </span>
                    ) : (
                      <span className="badge warn" style={{ fontSize: 10, padding: '2px 6px' }}>
                        Belegt
                      </span>
                    )}
                  </td>
                  {occ.slots.map((s, idx) => (
                    <td
                      key={idx}
                      style={{
                        padding: '6px 4px',
                        background: s.occupied
                          ? 'color-mix(in srgb, var(--accent) 15%, transparent)'
                          : 'color-mix(in srgb, var(--ok) 12%, transparent)',
                      }}
                      title={`${occ.room.name} · Std ${s.slotName}: ${s.occupied ? s.lesson?.subject ?? 'Belegt' : 'Frei'}`}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          background: s.occupied ? 'var(--accent)' : 'var(--ok)',
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
