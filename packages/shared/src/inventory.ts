import { z } from 'zod';
import type { ItemState, PersonRef } from './dashboard';

/** Tags are typed by hand until the barcode step decides their format. Case and extra spaces do not matter. */
export const tagSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ' ').toUpperCase())
  .pipe(z.string().min(1, 'Enter a tag').max(32, 'A tag has at most 32 characters').regex(/^[A-Z0-9][A-Z0-9 ._/-]*$/, 'Use letters, digits, spaces, dots, dashes or slashes'));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const itemTypeInputSchema = z.object({ name: z.string().trim().min(1, 'Enter a name').max(60) });

export const itemInputSchema = z.object({
  typeId: z.uuid('Pick a type'),
  name: z.string().trim().min(1, 'Enter a name').max(100),
  assetTag: tagSchema,
  notes: optionalText(500),
});
export type ItemInput = z.input<typeof itemInputSchema>;

/** Add a numbered run of items, such as 40 chargers: "Charger 1".."Charger 40", tags "H-001".."H-040". */
export const itemBulkInputSchema = z.object({
  typeId: z.uuid('Pick a type'),
  namePrefix: z.string().trim().min(1, 'Enter a name').max(80),
  tagPrefix: z.string().trim().toUpperCase().max(16).regex(/^[A-Z0-9 ._/-]*$/, 'Use letters, digits, spaces, dots, dashes or slashes'),
  first: z.coerce.number().int().min(0).max(999_999),
  count: z.coerce.number().int().min(1, 'Add at least one').max(200, 'Add at most 200 at a time'),
  digits: z.coerce.number().int().min(1).max(8).default(3),
});
export type ItemBulkInput = z.input<typeof itemBulkInputSchema>;

/** The names and tags a bulk add will create. Shared so the screen can preview exactly what the server makes. */
export function bulkItems(input: z.output<typeof itemBulkInputSchema>): { name: string; assetTag: string }[] {
  return Array.from({ length: input.count }, (_, i) => {
    const n = input.first + i;
    return { name: `${input.namePrefix} ${n}`, assetTag: `${input.tagPrefix}${String(n).padStart(input.digits, '0')}` };
  });
}

export const itemStatusInputSchema = z
  .object({
    status: z.enum(['IN_SERVICE', 'IN_REPAIR', 'SURPLUS']),
    note: optionalText(500),
  })
  .refine((v) => v.status === 'IN_SERVICE' || (v.note ?? '') !== '', { message: 'Say why, for example "broken screen"', path: ['note'] });

export const retireInputSchema = z.object({ note: optionalText(500) });

export const bookInputSchema = z.object({
  isbn: z.string().trim().min(1, 'Enter the ISBN'),
  title: z.string().trim().min(1, 'Enter the title').max(300),
  author: optionalText(200),
  edition: optionalText(40),
  publisher: optionalText(200),
  publishedYear: optionalText(10),
  notes: optionalText(500),
});
export type BookInput = z.input<typeof bookInputSchema>;

export const COPY_CONDITIONS = ['New', 'Good', 'Fair', 'Damaged'] as const;

export const copiesInputSchema = z.object({
  count: z.coerce.number().int().min(1, 'Add at least one copy').max(500, 'Add at most 500 copies at a time'),
  condition: z.enum(COPY_CONDITIONS).optional(),
  /** Only for a single copy whose label already exists. Otherwise tags are numbered C-00001, C-00002, ... */
  copyTag: tagSchema.optional(),
});

export const copyUpdateSchema = z.object({ condition: z.enum(COPY_CONDITIONS).nullable().optional(), notes: optionalText(500) });

export interface ItemTypeRow {
  id: string;
  name: string;
  itemCount: number;
}

export interface InventoryItemRow {
  id: string;
  assetTag: string;
  name: string;
  typeId: string;
  typeName: string;
  state: ItemState;
  statusNote: string | null;
  notes: string | null;
  holder: PersonRef | null;
  dueDate: string | null;
  pastDue: boolean;
}

export interface CopyCounts {
  total: number;
  available: number;
  assigned: number;
  out: number;
  retired: number;
}

export interface BookRow extends CopyCounts {
  id: string;
  isbn: string;
  title: string;
  author: string | null;
  edition: string | null;
}

export interface BookListResponse {
  rows: BookRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CopyRow {
  id: string;
  copyTag: string;
  state: ItemState;
  condition: string | null;
  notes: string | null;
  acquiredAt: string;
  holder: PersonRef | null;
  dueDate: string | null;
  pastDue: boolean;
  /** The student a copy is reserved for (phase 3 assigns copies to needs). */
  assignedTo: PersonRef | null;
}

export interface BookDetail {
  id: string;
  isbn: string;
  title: string;
  author: string | null;
  edition: string | null;
  publisher: string | null;
  publishedYear: string | null;
  notes: string | null;
  counts: CopyCounts;
  copies: CopyRow[];
}

export interface IsbnLookupResult {
  isbn: string;
  /** The title already in the catalog with this ISBN, if any. */
  existingBookId: string | null;
  /** Where the details came from. "offline" means Open Library could not be reached: type them in. */
  source: 'cache' | 'openlibrary' | 'offline' | 'disabled';
  found: boolean;
  details: { title: string; author: string | null; publisher: string | null; publishedYear: string | null } | null;
}

/** A status change or retirement, shown in item history next to the checkouts. */
export interface ItemEvent {
  at: string;
  user: string;
  action: string;
  note: string | null;
}
