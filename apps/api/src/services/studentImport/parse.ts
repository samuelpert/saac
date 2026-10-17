import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { badRequest } from '../../http/errors';

export type ImportField = 'pid' | 'lastName' | 'firstName' | 'onScholarship' | 'sport' | 'email' | 'phone';

/**
 * Header names accepted for each field. Headers are compared after `headerKey`, which drops case,
 * spaces and punctuation, so "Panther ID #", "PANTHER ID" and "PantherID" are the same header.
 * If a new list uses other headers, add them here and nowhere else.
 */
export const HEADER_ALIASES: Record<ImportField, string[]> = {
  pid: ['PID', 'PID #', 'PID Number', 'Panther ID', 'Panther ID #', 'Panther ID Number', 'Panther ID No'],
  lastName: ['Last Name', 'Last', 'Surname'],
  firstName: ['First Name', 'First', 'Given Name'],
  onScholarship: ['OnScholarship?', 'On Scholarship', 'Scholarship'],
  sport: ['Sport', 'Team'],
  email: ['E-mail Address', 'Email Address', 'Email', 'FIU Email'],
  phone: ['Mobile Phone', 'Mobile', 'Cell Phone', 'Cell', 'Phone'],
};

const REQUIRED: ImportField[] = ['pid', 'lastName', 'firstName'];

/** Rows searched for the header row, so a title line above the headers is fine. */
const HEADER_SEARCH_ROWS = 10;

export const headerKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIAS_LOOKUP = new Map<string, ImportField>(
  (Object.entries(HEADER_ALIASES) as [ImportField, string[]][]).flatMap(([field, aliases]) => aliases.map((a) => [headerKey(a), field] as const)),
);

/** A value read from one cell: text, a real boolean, or nothing. Numbers become their digits. */
export type CellValue = string | boolean | null;

export interface RawRow {
  /** Sheet the row came from. Null for a CSV file. */
  sheet: string | null;
  /** Row number as the spreadsheet shows it. */
  row: number;
  values: Partial<Record<ImportField, CellValue>>;
  /**
   * For a sheet with no Sport column: the labels that may name the team, best first
   * (a title above the header row, then the sheet tab name).
   */
  sportCandidates?: string[];
}

export interface ParsedFile {
  rows: RawRow[];
  /** Headers in the file that matched no field. Ignored on purpose (Photo, Comments, ...). */
  ignoredHeaders: string[];
  /** Fields that have a column somewhere in the file. */
  columns: ImportField[];
  sheetsRead: string[];
  /** Sheets with no header row naming a Panther ID, last name and first name, such as a list of emails. */
  sheetsSkipped: string[];
}

interface HeaderMatch {
  columns: Map<number, ImportField>;
  ignored: string[];
}

/** Map one row of header cells to fields. Null when the row is not a header row. */
function matchHeaders(cells: string[]): HeaderMatch | null {
  const columns = new Map<number, ImportField>();
  const seen = new Set<ImportField>();
  const ignored: string[] = [];
  cells.forEach((h, i) => {
    const field = ALIAS_LOOKUP.get(headerKey(h));
    if (field && !seen.has(field)) {
      columns.set(i, field);
      seen.add(field);
    } else if (h.trim() !== '') {
      ignored.push(h.trim());
    }
  });
  return REQUIRED.every((f) => seen.has(f)) ? { columns, ignored } : null;
}

const missingColumnsError = () =>
  badRequest('No sheet has a header row with Panther ID (or PID), Last Name and First Name. Check the header row.');

/** Read an exceljs cell as text without trusting Excel's number formatting. */
function excelCellValue(value: ExcelJS.CellValue): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    // Whole numbers keep every digit. Excel never stores a PID with a fraction.
    return Number.isInteger(value) ? value.toFixed(0) : String(value);
  }
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('text' in value && typeof value.text === 'string') return value.text; // hyperlink
    if ('result' in value) return excelCellValue(value.result as ExcelJS.CellValue); // formula
    if ('error' in value) return null;
  }
  return null;
}

const asText = (v: CellValue) => (typeof v === 'string' ? v : v === null ? '' : String(v));
const isBlank = (v: CellValue | undefined) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

async function parseXlsx(buffer: Buffer): Promise<ParsedFile> {
  const wb = new ExcelJS.Workbook();
  try {
    // exceljs's types predate Node's generic Buffer.
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw badRequest('The file could not be read as an Excel workbook. Save it as .xlsx or .csv and try again.');
  }
  if (wb.worksheets.length === 0) throw badRequest('The workbook has no sheets');

  const out: ParsedFile = { rows: [], ignoredHeaders: [], columns: [], sheetsRead: [], sheetsSkipped: [] };
  const columns = new Set<ImportField>();
  const ignored = new Set<string>();

  // Every sheet is read, so a list split into one sheet per team works the same as one long sheet.
  for (const sheet of wb.worksheets) {
    const width = sheet.columnCount;
    const cellsOf = (r: number) => Array.from({ length: width }, (_, c) => excelCellValue(sheet.getRow(r).getCell(c + 1).value));

    let headerRow = 0;
    let match: HeaderMatch | null = null;
    for (let r = 1; r <= Math.min(HEADER_SEARCH_ROWS, sheet.rowCount); r++) {
      match = matchHeaders(cellsOf(r).map(asText));
      if (match) {
        headerRow = r;
        break;
      }
    }
    if (!match) {
      out.sheetsSkipped.push(sheet.name);
      continue;
    }
    out.sheetsRead.push(sheet.name);
    for (const f of match.columns.values()) columns.add(f);
    for (const h of match.ignored) ignored.add(h);

    // With no Sport column, the team comes from the sheet: a title above the headers, then the tab name.
    let sportCandidates: string[] | undefined;
    if (![...match.columns.values()].includes('sport')) {
      const titles: string[] = [];
      for (let r = 1; r < headerRow; r++) {
        for (const v of cellsOf(r)) {
          const t = asText(v).trim();
          if (t) titles.push(t);
        }
      }
      sportCandidates = [...titles, sheet.name];
    }

    for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
      const cells = cellsOf(r);
      const values: RawRow['values'] = {};
      let any = false;
      for (const [i, field] of match.columns) {
        const v = cells[i] ?? null;
        if (!isBlank(v)) any = true;
        values[field] = v;
      }
      if (any) out.rows.push({ sheet: sheet.name, row: r, values, ...(sportCandidates ? { sportCandidates } : {}) });
    }
  }

  if (out.sheetsRead.length === 0) throw missingColumnsError();
  out.columns = [...columns];
  out.ignoredHeaders = [...ignored];
  return out;
}

function parseCsvFile(buffer: Buffer): ParsedFile {
  let records: string[][];
  try {
    records = parseCsv(buffer, { bom: true, relax_column_count: true, skip_empty_lines: false });
  } catch {
    throw badRequest('The CSV file could not be read. Check that it is comma separated.');
  }
  if (records.length === 0) throw badRequest('The file is empty');

  let headerIndex = -1;
  let match: HeaderMatch | null = null;
  for (let i = 0; i < Math.min(HEADER_SEARCH_ROWS, records.length); i++) {
    match = matchHeaders(records[i]!);
    if (match) {
      headerIndex = i;
      break;
    }
  }
  if (!match) throw missingColumnsError();

  const rows: RawRow[] = [];
  records.slice(headerIndex + 1).forEach((rec, idx) => {
    const values: RawRow['values'] = {};
    let any = false;
    for (const [i, field] of match.columns) {
      const v = rec[i] ?? '';
      if (v.trim() !== '') any = true;
      values[field] = v;
    }
    if (any) rows.push({ sheet: null, row: headerIndex + idx + 2, values });
  });
  return { rows, ignoredHeaders: match.ignored, columns: [...match.columns.values()], sheetsRead: [], sheetsSkipped: [] };
}

export async function parseStudentFile(fileName: string, buffer: Buffer): Promise<ParsedFile> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) return parseXlsx(buffer);
  if (lower.endsWith('.csv')) return parseCsvFile(buffer);
  throw badRequest('Upload an .xlsx or .csv file');
}
