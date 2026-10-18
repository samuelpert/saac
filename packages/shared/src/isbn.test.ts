import { describe, expect, it } from 'vitest';
import { checkIsbn } from './isbn';

describe('checkIsbn', () => {
  it('keeps a valid ISBN-13 and converts the matching ISBN-10 to the same value', () => {
    expect(checkIsbn('978-0-306-40615-7')).toEqual({ ok: true, isbn: '9780306406157', converted: false });
    expect(checkIsbn('0306406152')).toEqual({ ok: true, isbn: '9780306406157', converted: true });
    expect(checkIsbn(' 0 306 40615 2 ')).toEqual({ ok: true, isbn: '9780306406157', converted: true });
  });
  it('accepts an X check character on an ISBN-10', () => {
    expect(checkIsbn('080442957X')).toMatchObject({ ok: true, isbn: '9780804429573' });
  });
  it('rejects a bad check digit, a wrong prefix, a wrong length, and Excel notation', () => {
    expect(checkIsbn('9780306406158').ok).toBe(false);
    expect(checkIsbn('0306406153').ok).toBe(false);
    expect(checkIsbn('1234567890123').ok).toBe(false);
    expect(checkIsbn('12345').ok).toBe(false);
    expect(checkIsbn('9.78030640615E+12').ok).toBe(false);
    expect(checkIsbn('').ok).toBe(false);
  });
});
