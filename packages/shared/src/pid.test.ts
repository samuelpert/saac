import { describe, expect, it } from 'vitest';
import { checkPid } from './pid';

describe('checkPid', () => {
  it('accepts 7 digits as text and keeps leading zeros', () => {
    expect(checkPid('0123456')).toEqual({ ok: true, pid: '0123456', fixed: false });
    expect(checkPid(' 9000100 ')).toEqual({ ok: true, pid: '9000100', fixed: false });
  });
  it('pads 6 digits with one leading zero and reports it as fixed', () => {
    expect(checkPid('900001')).toEqual({ ok: true, pid: '0900001', fixed: true });
  });
  it('rejects other lengths, non-digits and blanks', () => {
    expect(checkPid('90000099').ok).toBe(false);
    expect(checkPid('12345').ok).toBe(false);
    expect(checkPid('12a4567').ok).toBe(false);
    expect(checkPid('').ok).toBe(false);
    expect(checkPid(null).ok).toBe(false);
  });
});
