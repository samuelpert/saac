import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ImportMode, StudentImportPreview, StudentImportResult } from '@saac/shared';
import { apiSend, download } from '../api/client';
import { EmptyState, ErrorText, Feedback, Field, Glyph, PageHead } from '../components/ui';
import { fmtDateTime, fmtNumber, plural } from '../lib/format';

type Tab = 'create' | 'update' | 'review' | 'warnings' | 'missing';

function form(file: File, fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  fd.set('file', file);
  return fd;
}

export function ImportStudents() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ImportMode>('CURRENT_TERM');
  const [deactivate, setDeactivate] = useState(false);
  const [tab, setTab] = useState<Tab>('review');

  const preview = useMutation({
    mutationFn: () => apiSend<StudentImportPreview>('POST', '/api/imports/students/preview', form(file!, { mode })),
    onSuccess: (p) => setTab(p.counts.review > 0 ? 'review' : p.counts.created > 0 ? 'create' : 'update'),
  });
  const apply = useMutation({
    mutationFn: () =>
      apiSend<StudentImportResult>(
        'POST',
        '/api/imports/students/apply',
        form(file!, { mode, deactivateMissing: String(deactivate), expectedSha256: preview.data!.fileSha256 }),
      ),
    onSuccess: () => void qc.invalidateQueries(),
  });
  const reviewList = useMutation({
    mutationFn: async () => {
      const p = preview.data!;
      const blob = await apiSend<Blob>('POST', '/api/imports/review-list.xlsx', { review: p.review, warnings: p.warnings });
      download(blob, `review-${p.fileName.replace(/\.[^.]+$/, '')}.xlsx`);
    },
  });

  const reset = () => {
    preview.reset();
    apply.reset();
    setDeactivate(false);
  };
  const p = preview.data;

  if (apply.data) {
    const c = apply.data.counts;
    return (
      <>
        <PageHead title="Import students" />
        <section className="card" style={{ maxWidth: 720 }}>
          <Feedback fb={{ tone: 'ok', word: 'Imported', text: `${plural(c.created, 'person', 'people')} added, ${fmtNumber(c.updated)} updated, ${fmtNumber(c.unchanged)} unchanged${c.deactivated ? `, ${fmtNumber(c.deactivated)} set inactive` : ''}.` }} />
          {c.review > 0 && <p className="secondary">{plural(c.review, 'row')} need a look. They are listed on the import page.</p>}
          <div className="row">
            <Link className="btn primary" to={`/admin/imports/${apply.data.importRunId}`}>
              Open import
            </Link>
            <button
              type="button"
              className="btn"
              onClick={() => {
                reset();
                setFile(null);
              }}
            >
              Import another file
            </button>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHead title="Import students" sub="Preview first. Nothing is saved until you apply." actions={<Link className="btn" to="/admin/imports">Import history</Link>} />

      <section className="card" style={{ maxWidth: 720 }}>
        <Field label="Student file" hint=".xlsx or .csv with PID, Last Name, First Name, OnScholarship?, Sport, E-mail Address, Mobile Phone">
          <input
            className="input"
            type="file"
            accept=".xlsx,.csv"
            style={{ paddingTop: 7 }}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              reset();
            }}
          />
        </Field>
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 0 }}>
          <legend className="small medium secondary" style={{ marginBottom: 6 }}>
            What kind of file is it?
          </legend>
          <label className="check">
            <input type="radio" name="mode" checked={mode === 'CURRENT_TERM'} onChange={() => {
                setMode('CURRENT_TERM');
                reset();
              }} />
            <span>
              <span className="medium">Current term list.</span> <span className="secondary">Everyone in the file is active.</span>
            </span>
          </label>
          <label className="check">
            <input type="radio" name="mode" checked={mode === 'HISTORICAL'} onChange={() => {
                setMode('HISTORICAL');
                reset();
              }} />
            <span>
              <span className="medium">Historical load.</span> <span className="secondary">New people come in as inactive. Nobody's status changes.</span>
            </span>
          </label>
        </fieldset>
        <div className="row">
          <button type="button" className="btn primary" disabled={!file || preview.isPending} onClick={() => preview.mutate()}>
            {preview.isPending ? 'Reading the file…' : 'Preview'}
          </button>
        </div>
        <ErrorText error={preview.error} />
      </section>

      {p && (
        <section className="card">
          <div className="card-head">
            <h2>Preview · {p.fileName}</h2>
            <span className="small muted num">{plural(p.counts.rows, 'row')} read</span>
          </div>
          {p.alreadyAppliedAt && (
            <Feedback fb={{ tone: 'info', word: 'Seen before', text: `This exact file was applied on ${fmtDateTime(p.alreadyAppliedAt)}. Applying it again changes nothing that has not changed since.` }} />
          )}
          <div className="row" style={{ gap: 6 }}>
            <span className="pill lg num">{fmtNumber(p.counts.created)} to create</span>
            <span className="pill lg num">{fmtNumber(p.counts.updated)} to update</span>
            <span className="pill lg num">{fmtNumber(p.counts.unchanged)} unchanged</span>
            <span className={`pill lg num${p.counts.review ? ' warn' : ''}`}>{fmtNumber(p.counts.review)} to review</span>
            {p.counts.rejected > 0 && <span className="pill lg err num">{fmtNumber(p.counts.rejected)} not imported</span>}
            {p.counts.pidsFixed > 0 && <span className="pill lg info num">{fmtNumber(p.counts.pidsFixed)} PIDs fixed</span>}
          </div>

          <div className="tabs" role="tablist">
            {(
              [
                ['review', `Review · ${p.review.length}`],
                ['create', `To create · ${p.counts.created}`],
                ['update', `To update · ${p.counts.updated}`],
                ['warnings', `Warnings · ${p.warnings.length}`],
                ...(p.mode === 'CURRENT_TERM' ? [['missing', `Not in file · ${p.notInFile.length}`]] : []),
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'review' &&
            (p.review.length === 0 ? (
              <EmptyState>No rows need review.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="n">Row</th>
                      <th>PID</th>
                      <th>Imported?</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.review.map((r, i) => (
                      <tr key={`${r.row}-${i}`}>
                        <td className="n">{r.row}</td>
                        <td className="pid">{r.pid ?? '—'}</td>
                        <td>{r.scope === 'row' ? <span className="pill err">No, row skipped</span> : <span className="pill warn">Yes, without this value</span>}</td>
                        <td>{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

          {(tab === 'create' || tab === 'update') && <ChangeTable rows={p.rows.filter((r) => r.action === tab)} showChanges={tab === 'update'} />}

          {tab === 'warnings' &&
            (p.warnings.length === 0 ? (
              <EmptyState>No warnings.</EmptyState>
            ) : (
              <ul className="stack" style={{ margin: 0, paddingLeft: 20, gap: 'var(--space-1)' }}>
                {p.warnings.map((w, i) => (
                  <li key={i} className="num">
                    {w.row ? `Row ${w.row}: ` : ''}
                    {w.message}
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'missing' &&
            (p.notInFile.length === 0 ? (
              <EmptyState>Every active person is in this file.</EmptyState>
            ) : (
              <div className="stack">
                <p className="secondary">These people are active but not in the file. Nobody is ever deleted. You can set them inactive as part of this import.</p>
                <div className="table-wrap" style={{ maxHeight: 360 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>PID</th>
                        <th>Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.notInFile.map((m) => (
                        <tr key={m.pid}>
                          <td className="pid">{m.pid}</td>
                          <td>{m.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

          <div className="row" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
            {p.mode === 'CURRENT_TERM' && p.notInFile.length > 0 && (
              <label className="check">
                <input type="checkbox" checked={deactivate} onChange={(e) => setDeactivate(e.target.checked)} />
                Also set the {plural(p.notInFile.length, 'person', 'people')} not in the file inactive
              </label>
            )}
            <span className="spacer" />
            {(p.review.length > 0 || p.warnings.length > 0) && (
              <button type="button" className="btn" onClick={() => reviewList.mutate()} disabled={reviewList.isPending}>
                Download review list
              </button>
            )}
            <button type="button" className="btn primary" disabled={apply.isPending} onClick={() => apply.mutate()}>
              {apply.isPending ? 'Applying…' : `Apply import`}
            </button>
          </div>
          {p.counts.review > 0 && (
            <p className="small secondary row" style={{ gap: 'var(--space-2)' }}>
              <Glyph tone="info" small /> Review rows never block the rest of the file.
            </p>
          )}
          <ErrorText error={apply.error ?? reviewList.error} />
        </section>
      )}
    </>
  );
}

function ChangeTable({ rows, showChanges }: { rows: StudentImportPreview['rows']; showChanges: boolean }) {
  if (rows.length === 0) return <EmptyState>Nothing here.</EmptyState>;
  const shown = rows.slice(0, 500);
  return (
    <div className="table-wrap" style={{ maxHeight: 480 }}>
      <table className="table">
        <thead>
          <tr>
            <th className="n">Row</th>
            <th>PID</th>
            <th>Name</th>
            {showChanges && <th>Changes</th>}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.pid}>
              <td className="n">{r.row}</td>
              <td className="pid">{r.pid}</td>
              <td>{r.name}</td>
              {showChanges && (
                <td className="small">
                  {r.changes.map((c) => (
                    <div key={c.field}>
                      <span className="medium">{c.field}:</span> <span className="muted">{String(c.from ?? 'blank')}</span> → {String(c.to ?? 'blank')}
                    </div>
                  ))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && <p className="small muted" style={{ padding: '8px 20px' }}>Showing the first 500 of {fmtNumber(rows.length)}.</p>}
    </div>
  );
}
