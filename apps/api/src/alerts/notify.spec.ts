import { shouldNotify } from './notify.service';

describe('shouldNotify', () => {
  const dedupeMs = 15 * 60_000;

  it('notifies when never notified before', () => {
    expect(shouldNotify(null, new Date('2026-10-24T12:00:00Z'), dedupeMs)).toBe(true);
  });

  it('skips inside the 15m dedupe window', () => {
    const last = new Date('2026-10-24T12:00:00Z');
    const now = new Date('2026-10-24T12:10:00Z');
    expect(shouldNotify(last, now, dedupeMs)).toBe(false);
  });

  it('notifies again after the 15m window', () => {
    const last = new Date('2026-10-24T12:00:00Z');
    const now = new Date('2026-10-24T12:15:00Z');
    expect(shouldNotify(last, now, dedupeMs)).toBe(true);
  });
});
