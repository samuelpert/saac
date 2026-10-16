import ExcelJS from 'exceljs';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { importModeSchema, type ImportRunRow } from '@saac/shared';
import { badRequest, notFound } from '../http/errors';
import type { Services } from '../services';
import { shortName } from '../services/dashboard.service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

const previewBody = z.object({ mode: importModeSchema });
const applyBody = z.object({
  mode: importModeSchema,
  deactivateMissing: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  expectedSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});
const reviewListBody = z.object({
  review: z.array(z.object({ row: z.number().int(), pid: z.string().nullable(), reason: z.string(), scope: z.enum(['row', 'field']) })).max(20_000),
  warnings: z.array(z.object({ row: z.number().int().nullable(), pid: z.string().nullable(), message: z.string() })).max(20_000),
});

function requireFile(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) throw badRequest('Choose a file to import');
  return file;
}

/** Mounted behind requireAdmin. */
export function importRoutes(s: Services) {
  const r = Router();

  r.post('/imports/students/preview', upload.single('file'), async (req, res) => {
    const file = requireFile(req.file);
    const { mode } = previewBody.parse(req.body);
    res.json(await s.studentImport.preview(file.originalname, file.buffer, mode));
  });

  r.post('/imports/students/apply', upload.single('file'), async (req, res) => {
    const file = requireFile(req.file);
    const { mode, deactivateMissing, expectedSha256 } = applyBody.parse(req.body);
    res.json(await s.studentImport.apply(req.user!.id, file.originalname, file.buffer, mode, { deactivateMissing, expectedSha256 }));
  });

  // The review list as a spreadsheet. PIDs are written as text so Excel keeps their leading zeros.
  r.post('/imports/review-list.xlsx', async (req, res) => {
    const { review, warnings } = reviewListBody.parse(req.body);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Review');
    sheet.columns = [
      { header: 'Row', key: 'row', width: 8 },
      { header: 'PID', key: 'pid', width: 12, style: { numFmt: '@' } },
      { header: 'Imported?', key: 'scope', width: 22 },
      { header: 'Reason', key: 'reason', width: 70 },
    ];
    for (const rv of review) {
      sheet.addRow({ row: rv.row, pid: rv.pid ?? '', scope: rv.scope === 'row' ? 'No, row skipped' : 'Yes, without this value', reason: rv.reason });
    }
    const warn = wb.addWorksheet('Warnings');
    warn.columns = [
      { header: 'Row', key: 'row', width: 8 },
      { header: 'PID', key: 'pid', width: 12, style: { numFmt: '@' } },
      { header: 'Warning', key: 'message', width: 100 },
    ];
    for (const w of warnings) warn.addRow({ row: w.row ?? '', pid: w.pid ?? '', message: w.message });
    for (const ws of [sheet, warn]) ws.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="import-review-list.xlsx"');
    res.end(Buffer.from(await wb.xlsx.writeBuffer()));
  });

  r.get('/imports', async (_req, res) => {
    const runs = await s.db.importRun.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { user: true } });
    const rows: ImportRunRow[] = runs.map((run) => {
      const { reviewRows: _omit, ...counts } = (run.counts ?? {}) as Record<string, unknown>;
      return {
        id: run.id,
        kind: run.kind,
        fileName: run.fileName,
        fileSha256: run.fileSha256,
        user: shortName(run.user.name),
        createdAt: run.createdAt.toISOString(),
        appliedAt: run.appliedAt?.toISOString() ?? null,
        counts: counts as ImportRunRow['counts'],
      };
    });
    res.json(rows);
  });

  r.get('/imports/:id', async (req, res) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const run = await s.db.importRun.findUnique({ where: { id }, include: { user: true } });
    if (!run) throw notFound('No such import');
    const { reviewRows, ...counts } = (run.counts ?? {}) as Record<string, unknown>;
    res.json({
      id: run.id,
      kind: run.kind,
      fileName: run.fileName,
      fileSha256: run.fileSha256,
      user: shortName(run.user.name),
      createdAt: run.createdAt.toISOString(),
      appliedAt: run.appliedAt?.toISOString() ?? null,
      counts,
      review: Array.isArray(reviewRows) ? reviewRows : [],
    });
  });

  return r;
}
