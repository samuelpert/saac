import { createHash, randomUUID } from 'node:crypto';
import type {
  FieldChange,
  ImportPreviewRow,
  ImportReviewRow,
  StudentImportCounts,
  StudentImportPreview,
  StudentImportResult,
} from '@saac/shared';
import type { Db, Tx } from '../../db';
import type { Borrower, Prisma } from '../../generated/prisma/client';
import { badRequest, notFound } from '../../http/errors';
import { audit, auditMany, type AuditEntry } from '../audit';
import { borrowerSnapshot } from '../borrowers.service';
import { normalizeRows, sportKey, type NormalizedPerson, type SportMapping } from './normalize';
import { parseStudentFile } from './parse';

export const STUDENT_IMPORT_KIND = 'STUDENTS';

const COMPARED = ['firstName', 'lastName', 'onScholarship', 'kind', 'teamId', 'email', 'phone'] as const;
type Compared = (typeof COMPARED)[number];
type Values = Pick<Borrower, Compared>;

interface TermInfo {
  id: string;
  code: string;
}

interface Plan {
  term: TermInfo | null;
  creates: (Values & { id: string; pid: string })[];
  /** `tag` is true when the person gets the term tag from this import. */
  updates: { before: Borrower; data: Partial<Values>; tag: boolean }[];
  /** Existing people who already carry the tag and have nothing else to change. */
  unchanged: number;
  rows: ImportPreviewRow[];
  review: ImportReviewRow[];
  warnings: StudentImportPreview['warnings'];
  /** People tagged for the term who are not in the file. */
  notInFile: Borrower[];
  pidsFixed: number;
  rowCount: number;
  file: Pick<StudentImportPreview, 'sheetsRead' | 'sheetsSkipped' | 'ignoredColumns' | 'hasScholarshipColumn' | 'allOnScholarship'>;
}

function valuesFor(p: NormalizedPerson): Values {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    onScholarship: p.onScholarship ?? false,
    kind: p.kind ?? 'ATHLETE',
    teamId: p.teamId ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
  };
}

/** Only the fields the file has information for. A blank never erases a stored value. */
function changesFor(p: NormalizedPerson, existing: Borrower): Partial<Values> {
  const incoming: Partial<Values> = { firstName: p.firstName, lastName: p.lastName };
  if (p.onScholarship !== undefined) incoming.onScholarship = p.onScholarship;
  if (p.kind !== undefined) incoming.kind = p.kind;
  if (p.teamId !== undefined) incoming.teamId = p.teamId;
  if (p.email !== undefined) incoming.email = p.email;
  if (p.phone !== undefined) incoming.phone = p.phone;
  const data: Partial<Values> = {};
  for (const key of COMPARED) {
    if (key in incoming && incoming[key] !== existing[key]) (data as Record<string, unknown>)[key] = incoming[key];
  }
  return data;
}

export class StudentImportService {
  constructor(private readonly db: Db) {}

  private async plan(client: Db | Tx, fileName: string, buffer: Buffer, termCode: string, allOnScholarship: boolean): Promise<Plan> {
    const parsed = await parseStudentFile(fileName, buffer);
    const hasScholarshipColumn = parsed.columns.includes('onScholarship');
    if (parsed.rows.length === 0) throw badRequest('The file has a header row but no people');

    let term: TermInfo | null = null;
    if (termCode !== '') {
      const t = await client.semester.findUnique({ where: { code: termCode } });
      if (!t) throw notFound(`No term ${termCode}. Add it on the Terms screen first.`);
      term = { id: t.id, code: t.code };
    }

    const [mappingRows, teams, existingRows, tagged] = await Promise.all([
      client.groupMapping.findMany(),
      client.team.findMany({ select: { id: true, name: true } }),
      client.borrower.findMany(),
      term ? client.borrowerTerm.findMany({ where: { semesterId: term.id }, select: { borrowerId: true } }) : Promise.resolve([]),
    ]);
    const taggedIds = new Set(tagged.map((t) => t.borrowerId));
    const mappings = new Map<string, SportMapping>(mappingRows.map((m) => [sportKey(m.sourceValue), { kind: m.kind, teamId: m.teamId }]));
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const existing = new Map(existingRows.map((b) => [b.pid, b]));

    const norm = normalizeRows(parsed.rows, mappings, { allOnScholarship });
    const plan: Plan = {
      term,
      creates: [],
      updates: [],
      unchanged: 0,
      rows: [],
      review: norm.review,
      warnings: norm.warnings,
      notInFile: [],
      pidsFixed: norm.pidsFixed,
      rowCount: parsed.rows.length,
      file: {
        sheetsRead: parsed.sheetsRead,
        sheetsSkipped: parsed.sheetsSkipped,
        ignoredColumns: parsed.ignoredHeaders,
        hasScholarshipColumn,
        allOnScholarship: allOnScholarship && !hasScholarshipColumn,
      },
    };

    const display = (field: string, v: unknown): string | boolean | null => {
      if (v === null || v === undefined) return null;
      if (field === 'teamId') return teamName.get(String(v)) ?? null;
      return typeof v === 'boolean' ? v : String(v);
    };
    const fieldLabel: Record<Compared, string> = {
      firstName: 'First name',
      lastName: 'Last name',
      onScholarship: 'Scholarship',
      kind: 'Role',
      teamId: 'Team',
      email: 'Email',
      phone: 'Phone',
    };

    for (const p of norm.people) {
      const name = `${p.lastName}, ${p.firstName}`;
      const before = existing.get(p.pid);
      if (!before) {
        plan.creates.push({ id: randomUUID(), pid: p.pid, ...valuesFor(p) });
        plan.rows.push({ sheet: p.sheet, row: p.row, pid: p.pid, name, action: 'create', changes: [] });
        continue;
      }
      const data = changesFor(p, before);
      const keys = Object.keys(data) as Compared[];
      const tag = term !== null && !taggedIds.has(before.id);
      if (keys.length === 0 && !tag) {
        plan.unchanged++;
        continue;
      }
      plan.updates.push({ before, data, tag });
      const changes: FieldChange[] = keys.map((k) => ({ field: fieldLabel[k], from: display(k, before[k]), to: display(k, data[k]) }));
      if (tag) changes.push({ field: 'Term tag', from: null, to: term!.code });
      plan.rows.push({ sheet: p.sheet, row: p.row, pid: p.pid, name, action: 'update', changes });
    }

    // Possible duplicates against people already on file.
    const fileNames = new Map(norm.people.map((p) => [`${p.lastName.toLowerCase()}|${p.firstName.toLowerCase()}`, p]));
    for (const b of existingRows) {
      const match = fileNames.get(`${b.lastName.toLowerCase()}|${b.firstName.toLowerCase()}`);
      if (match && match.pid !== b.pid && !norm.pidsInFile.has(b.pid)) {
        plan.warnings.push({
          sheet: match.sheet,
          row: match.row,
          pid: match.pid,
          message: `Possible duplicate: ${b.lastName}, ${b.firstName} is already on file with PID ${b.pid}. Not merged.`,
        });
      }
    }

    if (term) {
      plan.notInFile = existingRows
        .filter((b) => taggedIds.has(b.id) && !norm.pidsInFile.has(b.pid))
        .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
    }
    return plan;
  }

  private counts(plan: Plan, untagged: number): StudentImportCounts {
    return {
      rows: plan.rowCount,
      created: plan.creates.length,
      updated: plan.updates.length,
      unchanged: plan.unchanged,
      review: new Set(plan.review.map((r) => r.row)).size,
      rejected: plan.review.filter((r) => r.scope === 'row').length,
      pidsFixed: plan.pidsFixed,
      warnings: plan.warnings.length,
      notInFile: plan.notInFile.length,
      tagged: plan.term ? plan.creates.length + plan.updates.filter((u) => u.tag).length : 0,
      untagged,
    };
  }

  /** Dry run. Reads only; nothing is saved. */
  async preview(fileName: string, buffer: Buffer, termCode: string, allOnScholarship = false): Promise<StudentImportPreview> {
    const fileSha256 = createHash('sha256').update(buffer).digest('hex');
    const plan = await this.plan(this.db, fileName, buffer, termCode, allOnScholarship);
    // The same file for another term is a different import, so match the term too.
    const runs = await this.db.importRun.findMany({
      where: { kind: STUDENT_IMPORT_KIND, fileSha256, appliedAt: { not: null } },
      orderBy: { appliedAt: 'desc' },
    });
    const previous = runs.find((r) => ((r.counts as { termCode?: string | null } | null)?.termCode ?? '') === termCode);
    return {
      fileName,
      fileSha256,
      termCode: plan.term?.code ?? null,
      counts: this.counts(plan, 0),
      rows: plan.rows,
      review: plan.review,
      warnings: plan.warnings,
      notInFile: plan.notInFile.map((b) => ({ pid: b.pid, name: `${b.lastName}, ${b.firstName}` })),
      alreadyAppliedAt: previous?.appliedAt?.toISOString() ?? null,
      ...plan.file,
    };
  }

  /**
   * Apply in one transaction. The plan is rebuilt inside the transaction from the same file,
   * so it reflects the database at the moment of applying, not at the moment of the preview.
   */
  async apply(
    actorId: string,
    fileName: string,
    buffer: Buffer,
    termCode: string,
    opts: { removeMissingTags: boolean; allOnScholarship?: boolean; expectedSha256?: string },
  ): Promise<StudentImportResult> {
    const fileSha256 = createHash('sha256').update(buffer).digest('hex');
    if (opts.expectedSha256 && opts.expectedSha256 !== fileSha256) {
      throw badRequest('This is not the file that was previewed. Preview it again.');
    }
    if (opts.removeMissingTags && termCode === '') {
      throw badRequest('Pick a term to remove term tags');
    }

    return this.db.$transaction(
      async (tx) => {
        // One student import at a time.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('saac:student-import'))`;
        const plan = await this.plan(tx, fileName, buffer, termCode, opts.allOnScholarship ?? false);
        const entries: AuditEntry[] = [];

        const term = plan.term;
        const tags: { borrowerId: string; semesterId: string }[] = [];
        if (plan.creates.length > 0) {
          await tx.borrower.createMany({ data: plan.creates });
          for (const c of plan.creates) {
            const { id, ...after } = c;
            if (term) tags.push({ borrowerId: id, semesterId: term.id });
            entries.push({ userId: actorId, action: 'borrower.import_create', entityType: 'Borrower', entityId: id, after: { ...after, ...(term ? { addedTerm: term.code } : {}) } });
          }
        }
        for (const u of plan.updates) {
          const after = Object.keys(u.data).length > 0 ? await tx.borrower.update({ where: { id: u.before.id }, data: u.data }) : u.before;
          if (u.tag && term) tags.push({ borrowerId: u.before.id, semesterId: term.id });
          entries.push({
            userId: actorId,
            action: 'borrower.import_update',
            entityType: 'Borrower',
            entityId: after.id,
            before: borrowerSnapshot(u.before),
            after: { ...borrowerSnapshot(after), ...(u.tag && term ? { addedTerm: term.code } : {}) },
          });
        }
        if (tags.length > 0) await tx.borrowerTerm.createMany({ data: tags, skipDuplicates: true });

        let untagged = 0;
        if (opts.removeMissingTags && term && plan.notInFile.length > 0) {
          const ids = plan.notInFile.map((b) => b.id);
          untagged = (await tx.borrowerTerm.deleteMany({ where: { semesterId: term.id, borrowerId: { in: ids } } })).count;
          for (const b of plan.notInFile) {
            entries.push({
              userId: actorId,
              action: 'borrower.import_untag',
              entityType: 'Borrower',
              entityId: b.id,
              before: { term: term.code, tagged: true },
              after: { term: term.code, tagged: false },
            });
          }
        }
        await auditMany(tx, entries);

        const counts = this.counts(plan, untagged);
        const stored: Prisma.InputJsonObject = {
          ...counts,
          termCode: term?.code ?? null,
          allOnScholarship: plan.file.allOnScholarship,
          // Review rows hold a row number, a PID and a reason only, never names or contact details.
          reviewRows: plan.review.map((r) => ({ sheet: r.sheet, row: r.row, pid: r.pid, reason: r.reason, scope: r.scope })),
        };
        const run = await tx.importRun.create({
          data: { kind: STUDENT_IMPORT_KIND, fileName, fileSha256, userId: actorId, counts: stored, appliedAt: new Date() },
        });
        await audit(tx, { userId: actorId, action: 'import.students', entityType: 'ImportRun', entityId: run.id, after: { fileName, termCode: term?.code ?? null, ...counts } });
        return { importRunId: run.id, counts };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }
}
