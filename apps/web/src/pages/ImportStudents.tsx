import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { StudentImportPreview, StudentImportResult, TermRow } from '@saac/shared';
import { apiGet, apiSend, download } from '../api/client';
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
  const terms = useQuery({ queryKey: ['terms'], queryFn: () => apiGet<TermRow[]>('/api/terms') });
  // The term this file is for. Empty means "add people only, no term tag".
  const [pickedTerm, setPickedTerm] = useState<string | null>(null);
  const [removeMissing, setRemoveMissing] = useState(false);
  const [tab, setTab] = useState<Tab>('review');
  const term = pickedTerm ?? terms.data?.find((t) => t.isCurrent)?.code ?? '';

  const preview = useMutation({
    mutationFn: () => apiSend<StudentImportPreview>('POST', '/api/imports/students/preview', form(file!, { term })),
    onSuccess: (p) => setTab(p.counts.review > 0 ? 'review' : p.counts.created > 0 ? 'create' : 'update'),
  });
  const apply = useMutation({
    mutationFn: () =>
      apiSend<StudentImportResult>(
        'POST',
        '/api/imports/students/apply',
        form(file!, { term, removeMissingTags: String(removeMissing), expectedSha256: preview.data!.fileSha256 }),
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
    setRemoveMissing(false);
  };
  const p = preview.data;

  if (apply.data) {
    const c = apply.data.counts;
    return (
      <>
        <PageHead title="Import students" />
        <section className="card" style={{ maxWidth: 720 }}>
          <Feedback fb={{ tone: 'ok', word: 'Imported', text: `${plural(c.created, 'person', 'people')} added, ${fmtNumber(c.updated)} updated, ${fmtNumber(c.unchanged)} unchanged. ${term ? `${plural(c.tagged, 'person', 'people')} tagged for ${term}${c.untagged ? `, ${fmtNumber(c.untagged)} tags removed` : ''}.` : 'No term tag was added.'}` }} />
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
        <Field label="Which term is this list for?" hint="Everyone in the file gets this term's tag. A person can borrow only in a term they are tagged for, and athletes also need a scholarship.">
          <select
            className="select"
            value={term}
            onChange={(e) => {
              setPickedTerm(e.target.value);
              reset();
            }}
          >
            {terms.data?.map((t) => (
              <option key={t.id} value={t.code}>
                {t.code}
                {t.isCurrent ? ' (current)' : ''}
              </option>
            ))}
            <option value="">No term. Add people only, no tag.</option>
          </select>
        </Field>
        {terms.data?.length === 0 && (
          <p className="secondary small">
            No term exists yet. <Link to="/admin/terms">Add one on the Terms screen</Link> first, or choose "No term" to add people without a tag.
          </p>
        )}
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
            <span className="small muted num">
              {plural(p.counts.rows, 'row')} read · {p.termCode ? `tagging ${p.termCode}` : 'no term tag'}
            </span>
          </div>
          {p.alreadyAppliedAt && (
            <Feedback fb={{ tone: 'info', word: 'Seen before', text: `This exact file was applied on ${fmtDateTime(p.alreadyAppliedAt)}. Applying it again changes nothing that has not changed since.` }} />
          )}
          <div className="row" style={{ gap: 6 }}>
            <span className="pill lg num">{fmtNumber(p.counts.created)} to create</span>
            <span className="pill lg num">{fmtNumber(p.counts.updated)} to update</span>
            <span className="pill lg num">{fmtNumber(p.counts.unchanged)} unchanged</span>
            {p.termCode && <span className="pill lg ok num">{fmtNumber(p.counts.tagged)} get the {p.termCode} tag</span>}
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
                ...(p.termCode ? [['missing', `Tagged but not in file · ${p.notInFile.length}`]] : []),
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
              <EmptyState>Everyone tagged for {p.termCode} is in this file.</EmptyState>
            ) : (
              <div className="stack">
                <p className="secondary">These people carry the {p.termCode} tag but are not in this file. Nobody is ever deleted. You can remove just their {p.termCode} tag as part of this import.</p>
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
            {p.termCode && p.notInFile.length > 0 && (
              <label className="check">
                <input type="checkbox" checked={removeMissing} onChange={(e) => setRemoveMissing(e.target.checked)} />
                Also remove the {p.termCode} tag from the {plural(p.notInFile.length, 'person', 'people')} not in the file
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
