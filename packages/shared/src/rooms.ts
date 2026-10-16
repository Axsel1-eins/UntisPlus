import { minutesToTime } from './dates.js';
import type { Lesson, Ref, TimeGridSlot } from './types.js';

export type RoomCategory = 'all' | 'computer' | 'gym' | 'special' | 'regular';

export interface RoomSlotOccupancy {
  slotName: string;
  startMin: number;
  endMin: number;
  occupied: boolean;
  lesson?: {
    id: string;
    subject?: string;
    teacher?: string;
    klasse?: string;
    status: string;
  };
}

export interface RoomOccupancy {
  room: Ref;
  category: RoomCategory;
  isFreeNow: boolean;
  occupiedNow: boolean;
  currentLesson?: RoomSlotOccupancy['lesson'];
  freeUntilMin?: number;
  freeUntilFormatted?: string;
  slots: RoomSlotOccupancy[];
}

/**
 * Classifies a room into a category based on its name and longName.
 */
export function classifyRoom(room: Ref): RoomCategory {
  const text = `${room.name} ${room.longName ?? ''}`.toLowerCase();
  if (/edv|inf|lab|pc|comput|it\b/.test(text)) return 'computer';
  if (/turn|sport|gym|halle|platz/.test(text)) return 'gym';
  if (/phys|chem|bio|mus|zeich|werk|kunst|biblio|saal/.test(text)) return 'special';
  return 'regular';
}

/**
 * Computes occupancy for a list of rooms against a time grid and scheduled lessons.
 */
export function computeRoomOccupancy(
  rooms: Ref[],
  timeGrid: TimeGridSlot[],
  lessons: Lesson[],
  currentMin: number,
): RoomOccupancy[] {
  const sortedGrid = [...timeGrid].sort((a, b) => a.startMin - b.startMin);

  return rooms.map((room) => {
    const category = classifyRoom(room);
    const roomLessons = lessons.filter(
      (l) => l.rooms.some((r) => r.id === room.id) && l.status !== 'CANCELLED',
    );

    const slots: RoomSlotOccupancy[] = sortedGrid.map((slot) => {
      // Find any lesson overlapping with this slot
      const activeLesson = roomLessons.find(
        (l) => l.startMin < slot.endMin && l.endMin > slot.startMin,
      );

      if (activeLesson) {
        return {
          slotName: slot.name,
          startMin: slot.startMin,
          endMin: slot.endMin,
          occupied: true,
          lesson: {
            id: activeLesson.id,
            subject: activeLesson.subjects.map((s) => s.name).join(', '),
            teacher: activeLesson.teachers.map((t) => t.name).join(', '),
            klasse: activeLesson.klassen.map((k) => k.name).join(', '),
            status: activeLesson.status,
          },
        };
      }

      return {
        slotName: slot.name,
        startMin: slot.startMin,
        endMin: slot.endMin,
        occupied: false,
      };
    });

    // Determine current occupancy status
    // If currentMin is outside school hours, check if any lesson is running right now
    const currentLessonMatch = roomLessons.find(
      (l) => currentMin >= l.startMin && currentMin < l.endMin,
    );

    const occupiedNow = Boolean(currentLessonMatch);
    const isFreeNow = !occupiedNow;

    // Calculate freeUntil: find the start of the next lesson scheduled after currentMin
    const upcomingLessons = roomLessons
      .filter((l) => l.startMin > currentMin)
      .sort((a, b) => a.startMin - b.startMin);

    let freeUntilMin: number | undefined;
    let freeUntilFormatted: string | undefined;

    if (isFreeNow) {
      if (upcomingLessons.length > 0 && upcomingLessons[0]) {
        freeUntilMin = upcomingLessons[0].startMin;
        freeUntilFormatted = minutesToTime(freeUntilMin);
      }
    }

    return {
      room,
      category,
      isFreeNow,
      occupiedNow,
      currentLesson: currentLessonMatch
        ? {
            id: currentLessonMatch.id,
            subject: currentLessonMatch.subjects.map((s) => s.name).join(', '),
            teacher: currentLessonMatch.teachers.map((t) => t.name).join(', '),
            klasse: currentLessonMatch.klassen.map((k) => k.name).join(', '),
            status: currentLessonMatch.status,
          }
        : undefined,
      freeUntilMin,
      freeUntilFormatted,
      slots,
    };
  });
}
