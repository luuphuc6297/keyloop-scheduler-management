import { computeTimeRange, InvalidLocalTimeError } from './compute-time-range';

describe('computeTimeRange', () => {
  const tz = 'America/New_York';

  it('returns a half-open tstzrange literal in UTC', () => {
    const range = computeTimeRange({
      startAt: '2026-05-01T13:00:00-04:00',
      durationMinutes: 30,
      bufferMinutes: 0,
      timezone: tz,
    });
    expect(range.literal).toMatch(/^\[.*,.*\)$/);
    expect(range.literal).toContain('2026-05-01T17:00:00.000Z');
    expect(range.literal).toContain('2026-05-01T17:30:00.000Z');
    expect(range.startAtIso).toBe('2026-05-01T17:00:00.000Z');
    expect(range.endAtIso).toBe('2026-05-01T17:30:00.000Z');
  });

  it('includes buffer in upper bound', () => {
    const range = computeTimeRange({
      startAt: '2026-05-01T13:00:00-04:00',
      durationMinutes: 30,
      bufferMinutes: 10,
      timezone: tz,
    });
    expect(range.literal).toContain('2026-05-01T17:40:00.000Z');
    expect(range.endAtIso).toBe('2026-05-01T17:40:00.000Z');
  });

  it('rejects non-existent local time during DST spring-forward', () => {
    // 2026-03-08 02:30 in America/New_York is in the DST gap (clocks jump 02:00 → 03:00).
    expect(() =>
      computeTimeRange({
        startAt: '2026-03-08T02:30:00-05:00',
        durationMinutes: 30,
        bufferMinutes: 0,
        timezone: tz,
      }),
    ).toThrow(InvalidLocalTimeError);
  });

  it('rejects non-positive duration', () => {
    expect(() =>
      computeTimeRange({
        startAt: '2026-05-01T13:00:00-04:00',
        durationMinutes: 0,
        bufferMinutes: 0,
        timezone: tz,
      }),
    ).toThrow(InvalidLocalTimeError);
  });

  it('rejects negative buffer', () => {
    expect(() =>
      computeTimeRange({
        startAt: '2026-05-01T13:00:00-04:00',
        durationMinutes: 30,
        bufferMinutes: -1,
        timezone: tz,
      }),
    ).toThrow(InvalidLocalTimeError);
  });

  it('rejects unparseable start_at', () => {
    expect(() =>
      computeTimeRange({
        startAt: 'not-a-date',
        durationMinutes: 30,
        bufferMinutes: 0,
        timezone: tz,
      }),
    ).toThrow(InvalidLocalTimeError);
  });

  it('handles different dealership timezone', () => {
    const range = computeTimeRange({
      startAt: '2026-05-01T13:00:00-07:00',
      durationMinutes: 60,
      bufferMinutes: 0,
      timezone: 'America/Los_Angeles',
    });
    expect(range.literal).toContain('2026-05-01T20:00:00.000Z');
    expect(range.literal).toContain('2026-05-01T21:00:00.000Z');
  });
});
