import { describe, expect, it } from 'vitest';
import { ElementType, PersonType } from './types.js';

describe('WebUntis Domain Types', () => {
  it('maps ElementType according to WebUntis JSON-RPC spec', () => {
    expect(ElementType.Class).toBe(1);
    expect(ElementType.Teacher).toBe(2);
    expect(ElementType.Subject).toBe(3);
    expect(ElementType.Room).toBe(4);
    expect(ElementType.Student).toBe(5);
  });

  it('maps PersonType according to WebUntis roles', () => {
    expect(PersonType.Teacher).toBe(2);
    expect(PersonType.Student).toBe(5);
    expect(PersonType.Parent).toBe(12);
  });
});
