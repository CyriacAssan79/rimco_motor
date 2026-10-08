import { describe, expect, it } from 'vitest';
import { mockStatusAt } from './mock-status';

describe('persisted mock generation status', () => {
  const createdAt = '2026-10-08T00:00:00.000Z';
  const createdMs = Date.parse(createdAt);
  it('reconstructs queue state independently from process memory', () => {
    expect(mockStatusAt(createdAt, createdMs + 6_999)).toBe('queued');
    expect(mockStatusAt(createdAt, createdMs + 7_000)).toBe('generating');
    expect(mockStatusAt(createdAt, createdMs + 18_000)).toBe('ready');
  });
  it('does not return a negative elapsed state when clocks differ', () => {
    expect(mockStatusAt(createdAt, createdMs - 1)).toBe('queued');
  });
});
