import { decodeCursor, encodeCursor } from './list-appointments.schema';

describe('list-appointments cursor', () => {
  it('round-trips a (timestamp, id) pair', () => {
    const t = '2026-05-01T13:00:00.000Z';
    const i = '11111111-1111-1111-1111-111111111111';
    const cursor = encodeCursor(t, i);
    const decoded = decodeCursor(cursor);
    expect(decoded).toEqual({ t, i });
  });

  it('throws on garbage cursor', () => {
    expect(() => decodeCursor('not-base64!@#')).toThrow(/Invalid cursor/);
  });

  it('throws on cursor missing fields', () => {
    const broken = Buffer.from(JSON.stringify({ t: 'only-time' }), 'utf8').toString('base64url');
    expect(() => decodeCursor(broken)).toThrow(/Invalid cursor/);
  });
});
