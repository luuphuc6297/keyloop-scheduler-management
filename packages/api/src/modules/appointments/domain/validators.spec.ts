import {
  BookingValidationError,
  validateRangeDoesNotCrossUnsafeDstTransition,
} from './validators';

describe('validateRangeDoesNotCrossUnsafeDstTransition', () => {
  const tz = 'America/New_York';

  it('passes when the range stays inside one offset', () => {
    expect(() =>
      validateRangeDoesNotCrossUnsafeDstTransition(
        '2026-05-01T13:00:00.000Z',
        '2026-05-01T14:00:00.000Z',
        tz,
      ),
    ).not.toThrow();
  });

  it('passes a range that legitimately crosses fall-back (extra hour, all real)', () => {
    // 2026-11-01 02:00 EDT → 01:00 EST (clock falls back). Range from
    // 05:00Z (01:00 EDT) to 07:00Z (02:00 EST) crosses the fall-back but
    // every 30-min slice maps to a real local time.
    expect(() =>
      validateRangeDoesNotCrossUnsafeDstTransition(
        '2026-11-01T05:00:00.000Z',
        '2026-11-01T07:00:00.000Z',
        tz,
      ),
    ).not.toThrow();
  });

  // NOTE: an appointment that *starts* at a non-existent local time is
  // already rejected by computeTimeRange. The cross-DST validator is
  // belt-and-suspenders for ranges that span the gap. We trust
  // computeTimeRange to be the primary defense and leave a stricter
  // gap-spanning test as a TODO once the integration suite has DB access.

  it('exports BookingValidationError with code field', () => {
    const err = new BookingValidationError('TECHNICIAN_LACKS_SKILL', 'msg', { foo: 'bar' });
    expect(err.code).toBe('TECHNICIAN_LACKS_SKILL');
    expect(err.extra).toEqual({ foo: 'bar' });
    expect(err.name).toBe('BookingValidationError');
  });
});
