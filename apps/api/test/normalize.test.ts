import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizeName, normalizePhone, normalizeRows, parseScholarship, type SportMapping } from '../src/services/studentImport/normalize';
import { parseStudentFile } from '../src/services/studentImport/parse';

describe('column rules', () => {
  it('names: trim, collapse spaces, fix case only when all one case', () => {
    expect(normalizeName('  Spacey   Names ')).toBe('Spacey Names');
    expect(normalizeName('SHOUTING')).toBe('Shouting');
    expect(normalizeName('quietman')).toBe('Quietman');
    expect(normalizeName('McDonald')).toBe('McDonald');
    expect(normalizeName("o'brien-smith")).toBe("O'Brien-Smith");
  });
  it('scholarship: TRUE/FALSE, Yes/No, Y/N, 1/0 in any case', () => {
    for (const v of ['TRUE', 'yes', 'Y', '1', true]) expect(parseScholarship(v)).toBe(true);
    for (const v of ['false', 'No', 'n', '0', false]) expect(parseScholarship(v)).toBe(false);
    expect(parseScholarship('')).toBeUndefined();
    expect(parseScholarship('maybe')).toBeUndefined();
  });
  it('email: lowercase; nothing before the @ means no email', () => {
    expect(normalizeEmail(' FAKE300@FIU.EDU ')).toEqual({ email: 'fake300@fiu.edu' });
    expect(normalizeEmail('@fiu.edu')).toEqual({});
    expect(normalizeEmail('fake@example.com')).toEqual({ email: 'fake@example.com' });
    expect(normalizeEmail('not an email')).toEqual({ invalid: true });
  });
  it('phone: digits only, 10 digits valid', () => {
    expect(normalizePhone('(305) 555-0100')).toEqual({ phone: '3055550100' });
    expect(normalizePhone('130555501234')).toEqual({ invalid: true });
    expect(normalizePhone('')).toEqual({});
  });
});

describe('the fake sample file', async () => {
  const buffer = await readFile(new URL('../../../fixtures/students.sample.xlsx', import.meta.url));
  const parsed = await parseStudentFile('students.sample.xlsx', buffer);
  const mappings = new Map<string, SportMapping>([
    ...['baseball', 'cheerleader', 'dazzler', 'football', 'golf', 'mens basketball', 'mens soccer', 'mens track and field', 'sand volleyball', 'softball', 'swimming', 'tennis', 'volleyball', 'womens basketball', 'womens soccer', 'womens track and field'].map(
      (t) => [t, { kind: 'ATHLETE', teamId: `team-${t}` }] as [string, SportMapping],
    ),
    ['staff', { kind: 'STAFF', teamId: null }],
    ['staff (tutor)', { kind: 'STAFF', teamId: null }],
    ['graduate assistant', { kind: 'GRAD_ASSISTANT', teamId: null }],
    ['ga', { kind: 'GRAD_ASSISTANT', teamId: null }],
    ['5th year', { kind: 'ATHLETE', teamId: null }],
  ]);
  const result = normalizeRows(parsed.rows, mappings);

  it('reads every row and ignores the eight unused columns, Photo included', () => {
    expect(parsed.rows).toHaveLength(48);
    expect(parsed.ignoredHeaders).toEqual(expect.arrayContaining(['Home Phone', 'Address', 'Photo', 'Notes']));
  });

  it('pads the 6-digit PID and skips the 8-digit one', () => {
    expect(result.pidsFixed).toBe(1);
    expect(result.people.find((p) => p.lastName === 'Shortpid')?.pid).toBe('0900001');
    expect(result.people.find((p) => p.lastName === 'Longpid')).toBeUndefined();
    expect(result.review).toContainEqual(expect.objectContaining({ scope: 'row', reason: 'PID has 8 digits, expected 7' }));
  });

  it('sends 5th Year, blank Sport and a bad phone to review without dropping the person', () => {
    const fieldReasons = result.review.filter((r) => r.scope === 'field').map((r) => r.reason);
    expect(fieldReasons.filter((r) => r.startsWith('Sport "5th Year"'))).toHaveLength(2);
    expect(fieldReasons.filter((r) => r === 'Sport is blank')).toHaveLength(2);
    expect(fieldReasons).toContain('Mobile phone does not have 10 digits');
    expect(result.people).toHaveLength(47);
  });

  it('treats the repeated phone as a placeholder and @fiu.edu as no email', () => {
    expect(result.people.some((p) => p.phone === '3055550100')).toBe(false);
    expect(result.warnings.some((w) => w.message.startsWith('Phone 3055550100'))).toBe(true);
    expect(result.people.find((p) => p.pid === '9000101')?.email).toBeUndefined();
  });

  it('warns about shared emails and possible duplicates without merging', () => {
    expect(result.warnings.some((w) => w.message.startsWith('Email shared.fake@fiu.edu is used by 2'))).toBe(true);
    expect(result.warnings.some((w) => w.message.includes('Fakeman, Alex is on 3 PIDs'))).toBe(true);
    expect(result.people.filter((p) => p.lastName === 'Fakeman' && p.firstName === 'Alex')).toHaveLength(3);
  });

  it('fixes name case and spacing', () => {
    expect(result.people.find((p) => p.pid === '9000311')).toMatchObject({ lastName: 'Spacey Names', firstName: 'Hal' });
    expect(result.people.find((p) => p.pid === '9000312')).toMatchObject({ lastName: 'Shouting', firstName: 'Nora' });
  });

  it('sends every copy of a repeated PID to review', () => {
    const r = normalizeRows(
      [
        { row: 2, values: { pid: '1234567', lastName: 'A', firstName: 'B' } },
        { row: 3, values: { pid: '1234567', lastName: 'C', firstName: 'D' } },
      ],
      mappings,
    );
    expect(r.people).toHaveLength(0);
    expect(r.review.map((x) => x.row)).toEqual([2, 3]);
  });
});
