import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { badRequest } from '../../http/errors';

export type ImportField = 'pid' | 'lastName' | 'firstName' | 'onScholarship' | 'sport' | 'email' | 'phone';

/**
 * Header names accepted for each field, compared lowercased with surrounding spaces trimmed.
 * If the supervisor's scholarship list uses other headers, add them here and nowhere else.
 */
export const HEADER_ALIASES: Record<ImportField, string[]> = {
  pid: ['pid', 'panther id', 'pantherid', 'panther id number'],
  lastName: ['last name', 'lastname', 'last'],
  firstName: ['first name', 'firstname', 'first'],
  onScholarship: ['onscholarship?', 'onscholarship', 'on scholarship', 'on scholarship?', 'scholarship'],
  sport: ['sport', 'team'],
  email: ['e-mail address', 'email address', 'email', 'e-mail'],
  phone: ['mobile phone', 'mobile', 'cell phone', 'cell', 'phone'],
};

const REQUIRED: ImportField[] = ['pid', 'lastName', 'firstName'];

const FIELD_LABEL: Record<ImportField, string> = {
  pid: 'PID',
  lastName: 'Last Name',
  firstName: 'First Name',
  onScholarship: 'OnScholarship?',
  sport: 'Sport',
  email: 'E-mail Address',
  phone: 'Mobile Phone',
};

const headerKey = (h: string) => h.trim().replace(/\s+/g, ' ').toLowerCase();

/** A value read from one cell: text, a real boolean, or nothing. Numbers become their digits. */
export type CellValue = string | boolean | null;

export interface RawRow {
  /** Spreadsheet row number, header is row 1. */
  row: number;
  values: Partial<Record<ImportField, CellValue>>;
}

export interface ParsedFile {
  rows: RawRow[];
  /** Headers in the file that matched no field. Ignored on purpose (Photo, Address, ...). */
  ignoredHeaders: string[];
}

function mapHeaders(headers: string[]): { columns: Map<number, ImportField>; ignored: string[] } {
  const lookup = new Map<string, ImportField>();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ImportField, string[]][]) {
    for (const a of aliases) lookup.set(a, field);
  }
  const columns = new Map<number, ImportField>();
  const seen = new Set<ImportField>();
  const ignored: string[] = [];
  headers.forEach((h, i) => {
    const field = lookup.get(headerKey(h));
    if (field && !seen.has(field)) {
      columns.set(i, field);
      seen.add(field);
    } else if (h.trim() !== '') {
      ignored.push(h.trim());
    }
  });
  const missing = REQUIRED.filter((f) => !seen.has(f));
  if (missing.length > 0) {
    throw badRequest(`The file has no ${missing.map((f) => `"${FIELD_LABEL[f]}"`).join(', ')} column. Check the header row.`);
  }
  return { columns, ignored };
}

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

async function parseXlsx(buffer: Buffer): Promise<ParsedFile> {
  const wb = new ExcelJS.Workbook();
  try {
    // exceljs's types predate Node's generic Buffer.
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw badRequest('The file could not be read as an Excel workbook. Save it as .xlsx or .csv and try again.');
  }
  const sheet = wb.worksheets[0];
  if (!sheet) throw badRequest('The workbook has no sheets');

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  for (let c = 1; c <= sheet.columnCount; c++) {
    const v = excelCellValue(headerRow.getCell(c).value);
    headers.push(typeof v === 'string' ? v : v === null ? '' : String(v));
  }
  const { columns, ignored } = mapHeaders(headers);

  const rows: RawRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values: RawRow['values'] = {};
    let any = false;
    for (const [i, field] of columns) {
      const v = excelCellValue(row.getCell(i + 1).value);
      if (v !== null && !(typeof v === 'string' && v.trim() === '')) any = true;
      values[field] = v;
    }
    if (any) rows.push({ row: r, values });
  }
  return { rows, ignoredHeaders: ignored };
}

function parseCsvFile(buffer: Buffer): ParsedFile {
  let records: string[][];
  try {
    records = parseCsv(buffer, { bom: true, relax_column_count: true, skip_empty_lines: false });
  } catch {
    throw badRequest('The CSV file could not be read. Check that it is comma separated.');
  }
  const [header, ...data] = records;
  if (!header) throw badRequest('The file is empty');
  const { columns, ignored } = mapHeaders(header);
  const rows: RawRow[] = [];
  data.forEach((rec, idx) => {
    const values: RawRow['values'] = {};
    let any = false;
    for (const [i, field] of columns) {
      const v = rec[i] ?? '';
      if (v.trim() !== '') any = true;
      values[field] = v;
    }
    if (any) rows.push({ row: idx + 2, values });
  });
  return { rows, ignoredHeaders: ignored };
}

export async function parseStudentFile(fileName: string, buffer: Buffer): Promise<ParsedFile> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) return parseXlsx(buffer);
  if (lower.endsWith('.csv')) return parseCsvFile(buffer);
  throw badRequest('Upload an .xlsx or .csv file');
}
