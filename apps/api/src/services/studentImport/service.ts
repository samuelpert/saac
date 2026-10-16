import { createHash, randomUUID } from 'node:crypto';
import type {
  FieldChange,
  ImportMode,
  ImportPreviewRow,
  ImportReviewRow,
  StudentImportCounts,
  StudentImportPreview,
  StudentImportResult,
} from '@saac/shared';
import type { Db, Tx } from '../../db';
import type { Borrower, Prisma } from '../../generated/prisma/client';
import { badRequest } from '../../http/errors';
import { audit, auditMany, type AuditEntry } from '../audit';
import { borrowerSnapshot } from '../borrowers.service';
import { normalizeRows, sportKey, type NormalizedPerson, type SportMapping } from './normalize';
import { parseStudentFile } from './parse';

export const STUDENT_IMPORT_KIND = 'STUDENTS';

const COMPARED = ['firstName', 'lastName', 'onScholarship', 'kind', 'teamId', 'email', 'phone', 'active'] as const;
type Compared = (typeof COMPARED)[number];
type Values = Pick<Borrower, Compared>;

interface Plan {
  creates: (Values & { id: string; pid: string })[];
  updates: { before: Borrower; data: Partial<Values> }[];
  unchanged: number;
  rows: ImportPreviewRow[];
  review: ImportReviewRow[];
  warnings: StudentImportPreview['warnings'];
  notInFile: Borrower[];
  pidsFixed: number;
  rowCount: number;
}

function valuesFor(p: NormalizedPerson, mode: ImportMode): Values {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    onScholarship: p.onScholarship ?? false,
    kind: p.kind ?? 'ATHLETE',
    teamId: p.teamId ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
    active: mode === 'CURRENT_TERM',
  };
}

/** Only the fields the file has information for. A blank never erases a stored value. */
function changesFor(p: NormalizedPerson, existing: Borrower, mode: ImportMode): Partial<Values> {
  const incoming: Partial<Values> = { firstName: p.firstName, lastName: p.lastName };
  if (p.onScholarship !== undefined) incoming.onScholarship = p.onScholarship;
  if (p.kind !== undefined) incoming.kind = p.kind;
  if (p.teamId !== undefined) incoming.teamId = p.teamId;
  if (p.email !== undefined) incoming.email = p.email;
  if (p.phone !== undefined) incoming.phone = p.phone;
  if (mode === 'CURRENT_TERM') incoming.active = true; // a historical load never changes who is active
  const data: Partial<Values> = {};
  for (const key of COMPARED) {
    if (key in incoming && incoming[key] !== existing[key]) (data as Record<string, unknown>)[key] = incoming[key];
  }
  return data;
}

export class StudentImportService {
  constructor(private readonly db: Db) {}

  private async plan(client: Db | Tx, fileName: string, buffer: Buffer, mode: ImportMode): Promise<Plan> {
    const parsed = await parseStudentFile(fileName, buffer);
    if (parsed.rows.length === 0) throw badRequest('The file has a header row but no people');

    const [mappingRows, teams, existingRows] = await Promise.all([
      client.groupMapping.findMany(),
      client.team.findMany({ select: { id: true, name: true } }),
      client.borrower.findMany(),
    ]);
    const mappings = new Map<string, SportMapping>(mappingRows.map((m) => [sportKey(m.sourceValue), { kind: m.kind, teamId: m.teamId }]));
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const existing = new Map(existingRows.map((b) => [b.pid, b]));

    const norm = normalizeRows(parsed.rows, mappings);
    const plan: Plan = {
      creates: [],
      updates: [],
      unchanged: 0,
      rows: [],
      review: norm.review,
      warnings: norm.warnings,
      notInFile: [],
      pidsFixed: norm.pidsFixed,
      rowCount: parsed.rows.length,
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
      active: 'Active',
    };

    for (const p of norm.people) {
      const name = `${p.lastName}, ${p.firstName}`;
      const before = existing.get(p.pid);
      if (!before) {
        plan.creates.push({ id: randomUUID(), pid: p.pid, ...valuesFor(p, mode) });
        plan.rows.push({ row: p.row, pid: p.pid, name, action: 'create', changes: [] });
        continue;
      }
      const data = changesFor(p, before, mode);
      const keys = Object.keys(data) as Compared[];
      if (keys.length === 0) {
        plan.unchanged++;
        continue;
      }
      plan.updates.push({ before, data });
      const changes: FieldChange[] = keys.map((k) => ({ field: fieldLabel[k], from: display(k, before[k]), to: display(k, data[k]) }));
      plan.rows.push({ row: p.row, pid: p.pid, name, action: 'update', changes });
    }

    // Possible duplicates against people already on file.
    const fileNames = new Map(norm.people.map((p) => [`${p.lastName.toLowerCase()}|${p.firstName.toLowerCase()}`, p]));
    for (const b of existingRows) {
      const match = fileNames.get(`${b.lastName.toLowerCase()}|${b.firstName.toLowerCase()}`);
      if (match && match.pid !== b.pid && !norm.pidsInFile.has(b.pid)) {
        plan.warnings.push({
          row: match.row,
          pid: match.pid,
          message: `Possible duplicate: ${b.lastName}, ${b.firstName} is already on file with PID ${b.pid}. Not merged.`,
        });
      }
    }

    if (mode === 'CURRENT_TERM') {
      plan.notInFile = existingRows
        .filter((b) => b.active && !norm.pidsInFile.has(b.pid))
        .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
    }
    return plan;
  }

  private counts(plan: Plan, deactivated: number): StudentImportCounts {
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
      deactivated,
    };
  }

  /** Dry run. Reads only; nothing is saved. */
  async preview(fileName: string, buffer: Buffer, mode: ImportMode): Promise<StudentImportPreview> {
    const fileSha256 = createHash('sha256').update(buffer).digest('hex');
    const plan = await this.plan(this.db, fileName, buffer, mode);
    const previous = await this.db.importRun.findFirst({
      where: { kind: STUDENT_IMPORT_KIND, fileSha256, appliedAt: { not: null } },
      orderBy: { appliedAt: 'desc' },
    });
    return {
      fileName,
      fileSha256,
      mode,
      counts: this.counts(plan, 0),
      rows: plan.rows,
      review: plan.review,
      warnings: plan.warnings,
      notInFile: plan.notInFile.map((b) => ({ pid: b.pid, name: `${b.lastName}, ${b.firstName}` })),
      alreadyAppliedAt: previous?.appliedAt?.toISOString() ?? null,
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
    mode: ImportMode,
    opts: { deactivateMissing: boolean; expectedSha256?: string },
  ): Promise<StudentImportResult> {
    const fileSha256 = createHash('sha256').update(buffer).digest('hex');
    if (opts.expectedSha256 && opts.expectedSha256 !== fileSha256) {
      throw badRequest('This is not the file that was previewed. Preview it again.');
    }
    if (opts.deactivateMissing && mode !== 'CURRENT_TERM') {
      throw badRequest('Only a current-term import can set people inactive');
    }

    return this.db.$transaction(
      async (tx) => {
        // One student import at a time.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('saac:student-import'))`;
        const plan = await this.plan(tx, fileName, buffer, mode);
        const entries: AuditEntry[] = [];

        if (plan.creates.length > 0) {
          await tx.borrower.createMany({ data: plan.creates });
          for (const c of plan.creates) {
            const { id, ...after } = c;
            entries.push({ userId: actorId, action: 'borrower.import_create', entityType: 'Borrower', entityId: id, after });
          }
        }
        for (const u of plan.updates) {
          const after = await tx.borrower.update({ where: { id: u.before.id }, data: u.data });
          entries.push({
            userId: actorId,
            action: 'borrower.import_update',
            entityType: 'Borrower',
            entityId: after.id,
            before: borrowerSnapshot(u.before),
            after: borrowerSnapshot(after),
          });
        }
        let deactivated = 0;
        if (opts.deactivateMissing && plan.notInFile.length > 0) {
          const ids = plan.notInFile.map((b) => b.id);
          deactivated = (await tx.borrower.updateMany({ where: { id: { in: ids }, active: true }, data: { active: false } })).count;
          for (const b of plan.notInFile) {
            entries.push({
              userId: actorId,
              action: 'borrower.import_deactivate',
              entityType: 'Borrower',
              entityId: b.id,
              before: { active: true },
              after: { active: false },
            });
          }
        }
        await auditMany(tx, entries);

        const counts = this.counts(plan, deactivated);
        const stored: Prisma.InputJsonObject = {
          ...counts,
          mode,
          // Review rows hold a row number, a PID and a reason only, never names or contact details.
          reviewRows: plan.review.map((r) => ({ row: r.row, pid: r.pid, reason: r.reason, scope: r.scope })),
        };
        const run = await tx.importRun.create({
          data: { kind: STUDENT_IMPORT_KIND, fileName, fileSha256, userId: actorId, counts: stored, appliedAt: new Date() },
        });
        await audit(tx, { userId: actorId, action: 'import.students', entityType: 'ImportRun', entityId: run.id, after: { fileName, mode, ...counts } });
        return { importRunId: run.id, counts };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }
}
