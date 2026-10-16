import {
  computeRoomOccupancy,
  ElementType,
  type Lesson,
  type Ref,
  type RoomOccupancy,
  type TimeGridSlot,
} from '@untisplus/shared';
import type { WebUntisClient } from './client.js';
import type { RawRef } from './normalize.js';

export class SchoolIndexer {
  private lessons: Lesson[] = [];
  private teachersMap = new Map<number, Ref>();
  private roomsMap = new Map<number, Ref>();
  private harvestedRanges = new Map<string, number>();
  private lastHarvestTime = 0;
  private runningHarvest: Promise<void> | null = null;
  private readonly ttlMs = 30 * 60 * 1000; // 30 minutes cache

  get isFresh(): boolean {
    return Date.now() - this.lastHarvestTime < this.ttlMs && this.teachersMap.size > 0;
  }

  isRangeFresh(start: string, end: string): boolean {
    const key = `${start}_${end}`;
    const ts = this.harvestedRanges.get(key);
    return Boolean(ts && Date.now() - ts < this.ttlMs);
  }

  getTeachers(): Ref[] {
    return Array.from(this.teachersMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  getRooms(): Ref[] {
    return Array.from(this.roomsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  getTeacherLessons(teacherId: number, start: string, end: string): Lesson[] {
    const list = this.lessons.filter(
      (l) =>
        l.date >= start &&
        l.date <= end &&
        l.teachers.some((t) => t.id === teacherId),
    );
    // Deduplicate lessons by key/id
    const seen = new Set<string>();
    const out: Lesson[] = [];
    for (const l of list) {
      if (!seen.has(l.id)) {
        seen.add(l.id);
        out.push(l);
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  }

  getRoomLessons(roomId: number, start: string, end: string): Lesson[] {
    const list = this.lessons.filter(
      (l) =>
        l.date >= start &&
        l.date <= end &&
        l.rooms.some((r) => r.id === roomId),
    );
    // Deduplicate lessons by key/id
    const seen = new Set<string>();
    const out: Lesson[] = [];
    for (const l of list) {
      if (!seen.has(l.id)) {
        seen.add(l.id);
        out.push(l);
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  }

  getLessonsForDate(date: string): Lesson[] {
    return this.lessons.filter((l) => l.date === date);
  }

  getRoomOccupancy(
    date: string,
    rooms: Ref[],
    timeGrid: TimeGridSlot[],
    currentMin: number,
  ): RoomOccupancy[] {
    const dayLessons = this.getLessonsForDate(date);
    const targetRooms = rooms.length > 0 ? rooms : this.getRooms();
    return computeRoomOccupancy(targetRooms, timeGrid, dayLessons, currentMin);
  }

  async harvest(
    client: WebUntisClient,
    klassen: (RawRef | Ref)[],
    dateRange?: { start: string; end: string },
  ): Promise<void> {
    if (dateRange && this.isRangeFresh(dateRange.start, dateRange.end)) return;
    if (!dateRange && this.isFresh) return;
    if (this.runningHarvest) return this.runningHarvest;

    this.runningHarvest = this.doHarvest(client, klassen, dateRange).finally(() => {
      this.runningHarvest = null;
    });
    return this.runningHarvest;
  }

  private async doHarvest(
    client: WebUntisClient,
    klassen: (RawRef | Ref)[],
    dateRange?: { start: string; end: string },
  ): Promise<void> {
    const today = new Date();
    // Default to current week Monday through Friday
    const dayOfWeek = today.getDay(); // 0 is Sunday
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    const pad = (n: number) => String(n).padStart(2, '0');
    const startIso = dateRange?.start ?? `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
    const endIso = dateRange?.end ?? `${friday.getFullYear()}-${pad(friday.getMonth() + 1)}-${pad(friday.getDate())}`;

    const chunkSize = 15;
    const allLessons: Lesson[] = [];

    for (let i = 0; i < klassen.length; i += chunkSize) {
      const chunk = klassen.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (k) => {
          try {
            const lessons = await client.getTimetable(
              { id: k.id, type: ElementType.Class },
              startIso,
              endIso,
            );
            for (const l of lessons) {
              allLessons.push(l);
              for (const te of l.teachers) {
                if (te.id && te.name && !this.teachersMap.has(te.id)) {
                  this.teachersMap.set(te.id, {
                    id: te.id,
                    name: te.name,
                    longName: te.longName ?? te.name,
                  });
                }
              }
              for (const ro of l.rooms) {
                if (ro.id && ro.name && ro.name !== '?' && !this.roomsMap.has(ro.id)) {
                  this.roomsMap.set(ro.id, {
                    id: ro.id,
                    name: ro.name,
                    longName: ro.longName ?? ro.name,
                  });
                }
              }
            }
          } catch {
            // Tolerate individual class timetable failures
          }
        }),
      );
    }

    const existingById = new Map<string, Lesson>();
    for (const l of this.lessons) {
      existingById.set(l.id, l);
    }
    for (const l of allLessons) {
      existingById.set(l.id, l);
    }
    this.lessons = Array.from(existingById.values());
    this.lastHarvestTime = Date.now();
    this.harvestedRanges.set(`${startIso}_${endIso}`, Date.now());
  }
}
