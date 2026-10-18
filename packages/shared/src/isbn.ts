/**
 * ISBN rules (references/term-books.md section 3). Strip spaces and hyphens, uppercase.
 * A valid ISBN-13 (978/979 and a good check digit) is kept. A valid ISBN-10 is converted to
 * ISBN-13 by prefixing 978. Only ISBN-13 is stored. Anything else is rejected with a reason.
 */
export type IsbnCheck = { ok: true; isbn: string; converted: boolean } | { ok: false; reason: string };

const isbn13CheckDigit = (first12: string) => {
  const sum = [...first12].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
};

const isbn10Valid = (v: string) => {
  const sum = [...v].reduce((s, ch, i) => s + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0);
  return sum % 11 === 0;
};

export function checkIsbn(raw: unknown): IsbnCheck {
  if (raw === null || raw === undefined) return { ok: false, reason: 'ISBN is blank' };
  const v = String(raw).replace(/[\s-]/g, '').toUpperCase();
  if (v === '') return { ok: false, reason: 'ISBN is blank' };
  if (/E\+?\d+$/.test(v) || v.includes('.')) return { ok: false, reason: 'ISBN looks like a number Excel shortened. Retype it as text.' };
  if (/^\d{13}$/.test(v)) {
    if (!v.startsWith('978') && !v.startsWith('979')) return { ok: false, reason: 'A 13-digit ISBN starts with 978 or 979' };
    if (isbn13CheckDigit(v.slice(0, 12)) !== v[12]) return { ok: false, reason: 'The ISBN check digit is wrong. Check for a typo.' };
    return { ok: true, isbn: v, converted: false };
  }
  if (/^\d{9}[\dX]$/.test(v)) {
    if (!isbn10Valid(v)) return { ok: false, reason: 'The ISBN check digit is wrong. Check for a typo.' };
    const body = `978${v.slice(0, 9)}`;
    return { ok: true, isbn: body + isbn13CheckDigit(body), converted: true };
  }
  return { ok: false, reason: 'An ISBN has 10 or 13 digits' };
}
