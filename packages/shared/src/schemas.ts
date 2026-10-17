import { z } from 'zod';
import type { Eligibility } from './eligibility';
import { PID_PATTERN } from './pid';

export const roleSchema = z.enum(['ADMIN', 'STAFF']);
export type Role = z.infer<typeof roleSchema>;

export const borrowerKindSchema = z.enum(['ATHLETE', 'STAFF', 'GRAD_ASSISTANT']);
export type BorrowerKind = z.infer<typeof borrowerKindSchema>;

export const BORROWER_KIND_LABEL: Record<BorrowerKind, string> = {
  ATHLETE: 'Athlete',
  STAFF: 'Staff',
  GRAD_ASSISTANT: 'Graduate assistant',
};

export const termCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^(FALL|SPRING|SUMMER)[0-9]{2}$/, 'Use a code like FALL26, SPRING27 or SUMMER27');

// ---- Auth and users -------------------------------------------------------

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
});

export const passwordSchema = z.string().min(10, 'Use at least 10 characters').max(200);

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: passwordSchema,
});

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, 'Use 3 to 40 letters, digits, dots, dashes or underscores');

export const createUserSchema = z.object({
  username: usernameSchema,
  name: z.string().trim().min(1, 'Enter a name').max(100),
  email: z.union([z.literal(''), z.email('Enter a valid email')]).optional(),
  role: roleSchema,
  temporaryPassword: passwordSchema,
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.union([z.literal(''), z.email()]).optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({ temporaryPassword: passwordSchema });

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface UserRow {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

// ---- Terms ------------------------------------------------------------------

const isoDate = z.iso.date('Use a date like 2026-12-18');

export const termInputSchema = z
  .object({
    code: termCodeSchema,
    startsOn: isoDate,
    endsOn: isoDate,
    returnDeadline: isoDate,
  })
  .refine((t) => t.startsOn <= t.endsOn, { message: 'The term must end after it starts', path: ['endsOn'] })
  .refine((t) => t.returnDeadline >= t.startsOn, {
    message: 'The return deadline must be after the term starts',
    path: ['returnDeadline'],
  });
export type TermInput = z.infer<typeof termInputSchema>;

export interface TermRow {
  id: string;
  code: string;
  startsOn: string;
  endsOn: string;
  returnDeadline: string;
  isCurrent: boolean;
}

// ---- People -----------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const borrowerInputSchema = z.object({
  pid: z.string().trim().regex(PID_PATTERN, 'A PID is 7 digits, leading zeros kept'),
  firstName: z.string().trim().min(1, 'Enter a first name').max(100),
  lastName: z.string().trim().min(1, 'Enter a last name').max(100),
  kind: borrowerKindSchema,
  teamId: z.uuid().nullable().optional(),
  email: z
    .union([z.literal(''), z.email('Enter a valid email')])
    .transform((v) => (v === '' ? null : v.toLowerCase()))
    .nullable()
    .optional(),
  phone: optionalText(20).refine((v) => v == null || /^[0-9]{10}$/.test(v), 'A phone number has 10 digits'),
  onScholarship: z.boolean(),
  /** Staff and graduate assistants only. Ignored for athletes. */
  staffActive: z.boolean().default(true),
  /** The terms this person is tagged for. Replaces the whole set. */
  termCodes: z.array(termCodeSchema).max(40).default([]),
});
export type BorrowerInput = z.input<typeof borrowerInputSchema>;

export const borrowerListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  /** Only people tagged for this term. */
  term: termCodeSchema.optional(),
  /** Only staff and graduate assistants who are active (true) or inactive (false). */
  staffActive: z.enum(['true', 'false']).optional(),
  kind: borrowerKindSchema.optional(),
  teamId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
});

export interface TeamRef {
  id: string;
  name: string;
}

export interface BorrowerSummary {
  id: string;
  pid: string;
  firstName: string;
  lastName: string;
  kind: BorrowerKind;
  team: TeamRef | null;
  onScholarship: boolean;
  /** Staff and graduate assistants only. */
  staffActive: boolean;
  /** Term tags, newest term first. */
  terms: string[];
  /** Eligibility in `eligibilityTerm`: the term asked for, else the current term. Null when no term exists. */
  eligibility: Eligibility | null;
  eligibilityTerm: string | null;
}

export interface BorrowerListResponse {
  rows: BorrowerSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HeldLoan {
  id: string;
  kind: 'book' | 'tech';
  /** The tech item or book copy, for its history page. */
  itemId: string;
  label: string;
  tag: string;
  typeName: string;
  termCode: string;
  checkedOutAt: string;
  dueDate: string;
  pastDue: boolean;
}

export interface PastLoan {
  id: string;
  kind: 'book' | 'tech';
  label: string;
  tag: string;
  termCode: string;
  checkedOutAt: string;
  closedAt: string;
  outcome: 'RETURNED' | 'NOT_FOR_RETURN';
}

export interface BorrowerDetail extends BorrowerSummary {
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
  classes: { termCode: string; subject: string; catalog: string; section: string }[];
  holding: HeldLoan[];
  holdingCounts: { label: string; count: number }[];
  past: { termCode: string; loans: PastLoan[] }[];
}

// ---- Search -----------------------------------------------------------------

export interface SearchResponse {
  /** What the query looked like, so the UI can word its feedback. */
  kind: 'pid' | 'pid-short' | 'digits' | 'tag' | 'name' | 'empty';
  /** For a 6-digit query, the PID with its leading zero back. */
  suggestedPid?: string;
  matches: BorrowerSummary[];
}

// ---- Student import ---------------------------------------------------------

/** The term a student file is for, or an empty string to add people without any term tag. */
export const importTermSchema = z.union([z.literal(''), termCodeSchema]).default('');

export interface ImportReviewRow {
  /** Sheet name for a workbook with several sheets. Null for a CSV or a single-sheet file. */
  sheet: string | null;
  row: number;
  pid: string | null;
  reason: string;
  /** "row" means the row was not imported. "field" means the row was imported without that value. */
  scope: 'row' | 'field';
}

export interface ImportWarning {
  sheet: string | null;
  row: number | null;
  pid: string | null;
  message: string;
}

export interface FieldChange {
  field: string;
  from: string | boolean | null;
  to: string | boolean | null;
}

export interface ImportPreviewRow {
  sheet: string | null;
  row: number;
  pid: string;
  name: string;
  action: 'create' | 'update' | 'unchanged';
  changes: FieldChange[];
}

export interface StudentImportCounts {
  rows: number;
  created: number;
  updated: number;
  unchanged: number;
  review: number;
  rejected: number;
  pidsFixed: number;
  warnings: number;
  /** People tagged for the term who are not in this file. */
  notInFile: number;
  /** People who got the term tag from this import. */
  tagged: number;
  /** People whose term tag was removed because they were not in the file. */
  untagged: number;
}

export interface StudentImportPreview {
  fileName: string;
  fileSha256: string;
  /** Null when the import adds people without a term tag. */
  termCode: string | null;
  counts: StudentImportCounts;
  rows: ImportPreviewRow[];
  review: ImportReviewRow[];
  warnings: ImportWarning[];
  notInFile: { pid: string; name: string }[];
  /** Set when this exact file was already applied. */
  alreadyAppliedAt: string | null;
  /** Sheets read, and sheets skipped because they have no Panther ID header row. */
  sheetsRead: string[];
  sheetsSkipped: string[];
  /** Column headers present in the file but not imported (Comments, Photo, ...). */
  ignoredColumns: string[];
  /** False when the file has no scholarship column, so `allOnScholarship` decides. */
  hasScholarshipColumn: boolean;
  /** Everyone in the file was treated as on scholarship (a scholarship list without that column). */
  allOnScholarship: boolean;
}

export interface StudentImportResult {
  importRunId: string;
  counts: StudentImportCounts;
}

export interface ImportRunRow {
  id: string;
  kind: string;
  fileName: string;
  fileSha256: string;
  user: string;
  createdAt: string;
  appliedAt: string | null;
  counts: Partial<StudentImportCounts> & { termCode?: string | null };
}
