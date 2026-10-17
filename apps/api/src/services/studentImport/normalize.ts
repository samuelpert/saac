import { checkPid, type BorrowerKind, type ImportReviewRow, type ImportWarning } from '@saac/shared';
import type { CellValue, RawRow } from './parse';

/** A phone number shared by more than this many people is a placeholder, not a real number. */
export const PLACEHOLDER_PHONE_THRESHOLD = 5;

export interface SportMapping {
  kind: BorrowerKind;
  teamId: string | null;
}

/**
 * One person as read from the file. `undefined` means "the file has no information",
 * which never overwrites an existing value. `null` is only used where the rules say to store null.
 */
export interface NormalizedPerson {
  sheet: string | null;
  row: number;
  pid: string;
  firstName: string;
  lastName: string;
  onScholarship?: boolean;
  kind?: BorrowerKind;
  teamId?: string | null;
  email?: string;
  phone?: string;
}

export interface NormalizeResult {
  people: NormalizedPerson[];
  review: ImportReviewRow[];
  warnings: ImportWarning[];
  pidsFixed: number;
  /** Valid PIDs that appear in the file, including duplicates sent to review. */
  pidsInFile: Set<string>;
}

const text = (v: CellValue | undefined): string => (v === null || v === undefined ? '' : String(v).trim());

/** Trim, collapse inner spaces, and fix the case only when the whole value is one case. */
export function normalizeName(raw: CellValue | undefined): string {
  const v = text(raw).replace(/\s+/g, ' ');
  if (v === '') return '';
  const isUpper = v === v.toUpperCase();
  const isLower = v === v.toLowerCase();
  if (!isUpper && !isLower) return v; // mixed case stays as typed (McDonald)
  return v.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** TRUE/FALSE, Yes/No, Y/N, 1/0 in any case. Anything else is unknown. */
export function parseScholarship(raw: CellValue | undefined): boolean | undefined {
  if (typeof raw === 'boolean') return raw;
  const v = text(raw).toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(v)) return true;
  if (['false', 'no', 'n', '0'].includes(v)) return false;
  return undefined;
}

/** Lowercased address, or undefined when there is none (blank, or nothing before the @). */
export function normalizeEmail(raw: CellValue | undefined): { email?: string; invalid?: boolean } {
  const v = text(raw).toLowerCase();
  if (v === '' || v.startsWith('@')) return {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { invalid: true };
  return { email: v };
}

/** Digits only. 10 digits is valid. */
export function normalizePhone(raw: CellValue | undefined): { phone?: string; invalid?: boolean } {
  const digits = text(raw).replace(/\D/g, '');
  if (digits === '') return {};
  if (digits.length !== 10) return { invalid: true };
  return { phone: digits };
}

/** Case, spaces and punctuation do not matter: "Men's Soccer" and "Mens Soccer" are the same value. */
export const sportKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface NormalizeOptions {
  /**
   * The file is a scholarship list with no scholarship column: everyone in it is on scholarship.
   * A file that has the column always uses the column.
   */
  allOnScholarship?: boolean;
}

/** "Football row 7", or "Row 7" for a CSV. */
export const rowLabel = (sheet: string | null, row: number) => (sheet ? `${sheet} row ${row}` : `Row ${row}`);

export function normalizeRows(rows: RawRow[], mappings: Map<string, SportMapping>, opts: NormalizeOptions = {}): NormalizeResult {
  const review: ImportReviewRow[] = [];
  const warnings: ImportWarning[] = [];
  let pidsFixed = 0;

  // Pass 1: PIDs and names. Rows without a usable identity are not imported.
  const candidates: { raw: RawRow; pid: string; firstName: string; lastName: string }[] = [];
  for (const r of rows) {
    const check = checkPid(r.values.pid);
    if (!check.ok) {
      review.push({ sheet: r.sheet, row: r.row, pid: null, reason: check.reason, scope: 'row' });
      continue;
    }
    const firstName = normalizeName(r.values.firstName);
    const lastName = normalizeName(r.values.lastName);
    if (firstName === '' || lastName === '') {
      review.push({ sheet: r.sheet, row: r.row, pid: check.pid, reason: 'First or last name is blank', scope: 'row' });
      continue;
    }
    if (check.fixed) {
      pidsFixed++;
      warnings.push({ sheet: r.sheet, row: r.row, pid: check.pid, message: 'PID had 6 digits, a leading zero was added' });
    }
    candidates.push({ raw: r, pid: check.pid, firstName, lastName });
  }

  // A PID that appears more than once is ambiguous: none of its rows are imported.
  const byPid = new Map<string, number>();
  for (const c of candidates) byPid.set(c.pid, (byPid.get(c.pid) ?? 0) + 1);
  const pidsInFile = new Set(byPid.keys());

  // Phones used by many people are placeholders.
  const phoneUse = new Map<string, number>();
  for (const c of candidates) {
    const p = normalizePhone(c.raw.values.phone).phone;
    if (p) phoneUse.set(p, (phoneUse.get(p) ?? 0) + 1);
  }
  const placeholders = new Set([...phoneUse].filter(([, n]) => n > PLACEHOLDER_PHONE_THRESHOLD).map(([p]) => p));
  for (const p of placeholders) {
    warnings.push({ sheet: null, row: null, pid: null, message: `Phone ${p} is on ${phoneUse.get(p)} people. Treated as a placeholder and not stored.` });
  }

  const people: NormalizedPerson[] = [];
  for (const c of candidates) {
    const { raw } = c;
    const count = byPid.get(c.pid) ?? 0;
    if (count > 1) {
      review.push({ sheet: raw.sheet, row: raw.row, pid: c.pid, reason: `PID appears ${count} times in the file`, scope: 'row' });
      continue;
    }
    const person: NormalizedPerson = { sheet: raw.sheet, row: raw.row, pid: c.pid, firstName: c.firstName, lastName: c.lastName };
    const fieldIssue = (reason: string) => review.push({ sheet: raw.sheet, row: raw.row, pid: c.pid, reason, scope: 'field' });

    if ('onScholarship' in raw.values) {
      const s = parseScholarship(raw.values.onScholarship);
      if (s === undefined) fieldIssue('Scholarship is blank or not yes/no');
      else person.onScholarship = s;
    } else if (opts.allOnScholarship) {
      person.onScholarship = true;
    }

    if (raw.sportCandidates) {
      // No Sport column: the sheet names the team, through its title or its tab name.
      const found = raw.sportCandidates.map((label) => mappings.get(sportKey(label))).find(Boolean);
      if (!found) {
        fieldIssue(`Sheet "${raw.sheet}" does not name a known team. Add it to the Sport mapping or pick the team by hand.`);
      } else {
        person.kind = found.kind;
        if (found.kind === 'ATHLETE' && found.teamId === null) fieldIssue(`Sheet "${raw.sheet}" does not name a team. Pick the team by hand.`);
        else person.teamId = found.teamId;
      }
    } else if ('sport' in raw.values) {
      const sport = text(raw.values.sport);
      if (sport === '') {
        fieldIssue('Sport is blank');
      } else {
        const m = mappings.get(sportKey(sport));
        if (!m) {
          fieldIssue(`Sport value "${sport}" is not in the mapping`);
        } else {
          person.kind = m.kind;
          if (m.kind === 'ATHLETE' && m.teamId === null) fieldIssue(`Sport "${sport}" does not name a team. Pick the team by hand.`);
          else person.teamId = m.teamId;
        }
      }
    }

    if ('email' in raw.values) {
      const e = normalizeEmail(raw.values.email);
      if (e.invalid) fieldIssue('Email is not a valid address');
      else if (e.email) person.email = e.email;
    }

    if ('phone' in raw.values) {
      const p = normalizePhone(raw.values.phone);
      if (p.invalid) fieldIssue('Mobile phone does not have 10 digits');
      else if (p.phone && !placeholders.has(p.phone)) person.phone = p.phone;
    }

    people.push(person);
  }

  // Warnings that never block: shared emails and the same name on different PIDs.
  const byEmail = new Map<string, NormalizedPerson[]>();
  const byName = new Map<string, NormalizedPerson[]>();
  for (const p of people) {
    if (p.email) byEmail.set(p.email, [...(byEmail.get(p.email) ?? []), p]);
    const nameKey = `${p.lastName.toLowerCase()}|${p.firstName.toLowerCase()}`;
    byName.set(nameKey, [...(byName.get(nameKey) ?? []), p]);
  }
  for (const [email, list] of byEmail) {
    if (list.length > 1) warnings.push({ sheet: null, row: null, pid: null, message: `Email ${email} is used by ${list.length} people (PIDs ${list.map((p) => p.pid).join(', ')})` });
  }
  for (const list of byName.values()) {
    if (list.length > 1) {
      const first = list[0]!;
      warnings.push({
        sheet: null,
        row: null,
        pid: null,
        message: `Possible duplicate: ${first.lastName}, ${first.firstName} is on ${list.length} PIDs (${list.map((p) => p.pid).join(', ')}). Not merged.`,
      });
    }
  }

  // File order: sheets as they come, then rows.
  const sheetOrder = new Map<string | null, number>();
  for (const r of rows) if (!sheetOrder.has(r.sheet)) sheetOrder.set(r.sheet, sheetOrder.size);
  review.sort((a, b) => (sheetOrder.get(a.sheet) ?? 0) - (sheetOrder.get(b.sheet) ?? 0) || a.row - b.row);
  return { people, review, warnings, pidsFixed, pidsInFile };
}
