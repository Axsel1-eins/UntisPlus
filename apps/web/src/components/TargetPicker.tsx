import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ElementType } from '@untisplus/shared';
import { useApp, type Target } from '../store.js';
import { useEffectiveTarget } from '../data.js';
import { Icon } from './primitives.js';
import { TargetModal } from './TargetModal.js';

/**
 * Modern selector & explorer trigger for choosing whose timetable to view.
 * Supports quick selection via dropdown or rich explorer modal for teachers, classes & rooms.
 */
export function TargetPicker({ onChange }: { onChange: (t: Target | null) => void }) {
  const { t } = useTranslation();
  const { session, master, target } = useApp();
  const effective = useEffectiveTarget();
  const [modalOpen, setModalOpen] = useState(false);

  const me = session && !session.readOnly && session.personId && session.personType;
  const value = effective ? `${effective.type}:${effective.id}` : '';

  return (
    <>
      <div className="row wrap" style={{ gap: 6, alignItems: 'center' }}>
        <button
          type="button"
          className="btn sm"
          onClick={() => setModalOpen(true)}
          style={{ gap: 6, borderColor: target ? 'var(--accent)' : 'var(--border)' }}
          title={t('timetable.targetExplorer')}
        >
          <Icon name="search" size={15} />
          <span>
            {target?.label
              ? target.label
              : me
                ? t('timetable.me')
                : t('timetable.targetExplorer')}
          </span>
        </button>

        <select
          className="select"
          style={{ minHeight: 34, maxWidth: 170, fontSize: 13, padding: '4px 8px' }}
          aria-label={t('timetable.target')}
          value={value}
          onChange={(e) => {
            const [type, id] = e.target.value.split(':');
            if (!type || !id) return onChange(null);
            const numericType = Number(type) as ElementType;
            const label =
              numericType === ElementType.Class
                ? master?.klassen.find((k) => k.id === Number(id))?.name
                : numericType === ElementType.Teacher
                  ? master?.teachers.find((te) => te.id === Number(id))?.name
                  : numericType === ElementType.Student
                    ? session?.children?.find((c) => c.id === Number(id))?.name ??
                      master?.students.find((s) => s.id === Number(id))?.name
                    : undefined;
            onChange({ id: Number(id), type: numericType, label });
          }}
        >
          {me && (
            <option value={`${session!.personType}:${session!.personId}`}>
              {session!.displayName ? `${t('timetable.me')} (${session!.displayName})` : t('timetable.me')}
            </option>
          )}
          {session?.children?.map((c) => (
            <option key={c.id} value={`${ElementType.Student}:${c.id}`}>
              {c.name ? `${c.name}` : `Kind (ID ${c.id})`}
            </option>
          ))}
          {!me && !session?.children?.length && <option value="">{t('timetable.chooseClass')}</option>}
          {master?.klassen && master.klassen.length > 0 && (
            <optgroup label={t('timetable.classes') || 'Klassen'}>
              {master.klassen.map((k) => (
                <option key={k.id} value={`${ElementType.Class}:${k.id}`}>
                  {k.name}
                </option>
              ))}
            </optgroup>
          )}
          {master?.teachers && master.teachers.length > 0 && (
            <optgroup label={t('timetable.teachers') || 'Lehrer'}>
              {master.teachers.map((te) => (
                <option key={te.id} value={`${ElementType.Teacher}:${te.id}`}>
                  {te.name} {te.longName ? `(${te.longName})` : ''}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      <TargetModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        currentTarget={target}
        onSelectTarget={onChange}
      />
    </>
  );
}
