import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizeName, normalizePhone, normalizeRows, parseScholarship, sportKey, type SportMapping } from '../src/services/studentImport/normalize';
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

const TEAMS = ['baseball', 'cheerleader', 'dazzler', 'football', 'golf', 'mens basketball', 'mens soccer', 'mens track and field', 'sand volleyball', 'softball', 'swimming', 'tennis', 'volleyball', 'womens basketball', 'womens soccer', 'womens track and field'];
/** The mapping the migrations install, keyed the way the importer keys it. */
function defaultMappings(): Map<string, SportMapping> {
  const m = new Map<string, SportMapping>(TEAMS.map((t) => [sportKey(t), { kind: 'ATHLETE', teamId: `team-${t}` }]));
  m.set(sportKey('Staff'), { kind: 'STAFF', teamId: null });
  m.set(sportKey('Staff (tutor)'), { kind: 'STAFF', teamId: null });
  m.set(sportKey('Graduate Assistant'), { kind: 'GRAD_ASSISTANT', teamId: null });
  m.set(sportKey('GA'), { kind: 'GRAD_ASSISTANT', teamId: null });
  m.set(sportKey('5th Year'), { kind: 'ATHLETE', teamId: null });
  for (const [alias, team] of [
    ["Men's Track/Field", 'mens track and field'],
    ["Women's Track/Field", 'womens track and field'],
    ['Swimming/Diving', 'swimming'],
    ['Beach Volleyball', 'sand volleyball'],
    ['M.Soccer', 'mens soccer'],
  ] as const) {
    m.set(sportKey(alias), { kind: 'ATHLETE', teamId: `team-${team}` });
  }
  return m;
}

describe('header and team matching', () => {
  it('ignores case, spaces and punctuation', () => {
    expect(sportKey("Men's Soccer")).toBe(sportKey('Mens Soccer'));
    expect(sportKey('  MENS   soccer ')).toBe(sportKey('Mens Soccer'));
  });
});

describe('a per-team scholarship workbook (fake copy of the real layout)', async () => {
  const buffer = await readFile(new URL('../../../fixtures/scholarship-list.sample.xlsx', import.meta.url));
  const parsed = await parseStudentFile('scholarship-list.sample.xlsx', buffer);

  it('reads every team sheet, finds the header in row 2, and skips the email-only sheet', () => {
    expect(parsed.sheetsRead).toEqual(['Football', 'M.Soccer', 'Beach Volleyball', 'Swimming', 'W.Track', 'Esports']);
    expect(parsed.sheetsSkipped).toEqual(['Master']);
    expect(parsed.rows).toHaveLength(12);
    expect(parsed.rows[0]).toMatchObject({ sheet: 'Football', row: 3 });
  });

  it('knows "Panther ID #" is the PID, and leaves the other columns alone', () => {
    expect(parsed.columns.sort()).toEqual(['email', 'firstName', 'lastName', 'pid']);
    expect(parsed.ignoredHeaders).toEqual(['Comments', 'Book Stack', 'Missing Laptop/Charger']);
  });

  it('takes the team from the sheet title, then the tab name', () => {
    expect(parsed.rows.find((r) => r.sheet === 'M.Soccer')?.sportCandidates).toEqual(["Men's Soccer", 'M.Soccer']);
  });

  it('marks everyone on scholarship only when asked, and places each team', () => {
    const plain = normalizeRows(parsed.rows, defaultMappings());
    expect(plain.people.every((p) => p.onScholarship === undefined)).toBe(true);

    const r = normalizeRows(parsed.rows, defaultMappings(), { allOnScholarship: true });
    expect(r.people).toHaveLength(11);
    expect(r.people.every((p) => p.onScholarship === true)).toBe(true);
    const team = (last: string) => r.people.find((p) => p.lastName === last)?.teamId;
    expect(team('Fakeman')).toBe('team-football');
    expect(team('Kickman')).toBe('team-mens soccer');
    expect(team('Sandy')).toBe('team-sand volleyball');
    expect(team('Laps')).toBe('team-swimming');
    expect(team('Sprint')).toBe('team-womens track and field');
  });

  it('reports problems with the sheet and row, and cleans the small slips', () => {
    const r = normalizeRows(parsed.rows, defaultMappings(), { allOnScholarship: true });
    expect(r.review).toEqual([
      { sheet: 'Football', row: 5, pid: null, reason: 'PID has 3 digits, expected 7', scope: 'row' },
      { sheet: 'Esports', row: 3, pid: '9800051', reason: expect.stringContaining('does not name a known team'), scope: 'field' },
    ]);
    expect(r.people.find((p) => p.lastName === 'Textpid')).toMatchObject({ pid: '9800004', email: 'fake.tq4@fiu.edu' });
  });
});

describe('the fake sample file', async () => {
  const buffer = await readFile(new URL('../../../fixtures/students.sample.xlsx', import.meta.url));
  const parsed = await parseStudentFile('students.sample.xlsx', buffer);
  const mappings = defaultMappings();
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
        { sheet: null, row: 2, values: { pid: '1234567', lastName: 'A', firstName: 'B' } },
        { sheet: null, row: 3, values: { pid: '1234567', lastName: 'C', firstName: 'D' } },
      ],
      mappings,
    );
    expect(r.people).toHaveLength(0);
    expect(r.review.map((x) => x.row)).toEqual([2, 3]);
  });
});
