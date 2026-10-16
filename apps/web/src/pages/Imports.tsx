import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { ImportReviewRow, ImportRunRow } from '@saac/shared';
import { apiGet } from '../api/client';
import { EmptyState, ErrorText, Loading, PageHead } from '../components/ui';
import { fmtDateTime, fmtNumber } from '../lib/format';

const KIND: Record<string, string> = { STUDENTS: 'Students' };

export function Imports() {
  const q = useQuery({ queryKey: ['imports'], queryFn: () => apiGet<ImportRunRow[]>('/api/imports') });
  return (
    <>
      <PageHead
        title="Imports"
        actions={
          <>
            <Link className="btn primary" to="/admin/imports/students">
              Import students
            </Link>
            <button type="button" className="btn" disabled title="The book list import is built in phase 3">
              Import books
            </button>
          </>
        }
      />
      <section className="card">
        <h2>History</h2>
        <ErrorText error={q.error} />
        {q.data && q.data.length === 0 && <EmptyState action={<Link className="btn primary" to="/admin/imports/students">Import students</Link>}>No file has been imported yet.</EmptyState>}
        {q.data && q.data.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Kind</th>
                  <th>File</th>
                  <th>By</th>
                  <th className="n">Created</th>
                  <th className="n">Updated</th>
                  <th className="n">Unchanged</th>
                  <th className="n">To review</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((r) => (
                  <tr key={r.id}>
                    <td className="num">
                      <Link to={`/admin/imports/${r.id}`}>{fmtDateTime(r.appliedAt ?? r.createdAt)}</Link>
                    </td>
                    <td>{KIND[r.kind] ?? r.kind}</td>
                    <td>{r.fileName}</td>
                    <td>{r.user}</td>
                    <td className="n">{fmtNumber(r.counts.created ?? 0)}</td>
                    <td className="n">{fmtNumber(r.counts.updated ?? 0)}</td>
                    <td className="n">{fmtNumber(r.counts.unchanged ?? 0)}</td>
                    <td className="n">{r.counts.review ? <span className="pill warn">{fmtNumber(r.counts.review)}</span> : 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

interface ImportDetailResponse extends ImportRunRow {
  review: ImportReviewRow[];
}

export function ImportDetail() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['import', id], queryFn: () => apiGet<ImportDetailResponse>(`/api/imports/${id}`) });
  if (q.isLoading) return <Loading />;
  if (!q.data) return <ErrorText error={q.error} />;
  const r = q.data;
  const c = r.counts;
  return (
    <>
      <PageHead title={`${KIND[r.kind] ?? r.kind} import`} sub={`${r.fileName} · ${fmtDateTime(r.appliedAt ?? r.createdAt)} · ${r.user}`} actions={<Link className="btn" to="/admin/imports">All imports</Link>} />
      <section className="card">
        <div className="row" style={{ gap: 6 }}>
          <span className="pill lg num">{fmtNumber(c.rows ?? 0)} rows</span>
          <span className="pill lg num">{fmtNumber(c.created ?? 0)} created</span>
          <span className="pill lg num">{fmtNumber(c.updated ?? 0)} updated</span>
          <span className="pill lg num">{fmtNumber(c.unchanged ?? 0)} unchanged</span>
          <span className={`pill lg num${c.review ? ' warn' : ''}`}>{fmtNumber(c.review ?? 0)} to review</span>
          {Boolean(c.deactivated) && <span className="pill lg num">{fmtNumber(c.deactivated ?? 0)} set inactive</span>}
        </div>
        <p className="xsmall muted num">SHA-256 {r.fileSha256}</p>
      </section>
      <section className="card">
        <h2>Rows to review</h2>
        {r.review.length === 0 ? (
          <EmptyState>Every row went in cleanly.</EmptyState>
        ) : (
          <>
            <p className="secondary small">Fix these in the source file or on the person page. Rows marked “skipped” were not imported at all.</p>
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
                  {r.review.map((rv, i) => (
                    <tr key={`${rv.row}-${i}`}>
                      <td className="n">{rv.row}</td>
                      <td className="pid">{rv.pid ?? '—'}</td>
                      <td>{rv.scope === 'row' ? <span className="pill err">No, row skipped</span> : <span className="pill warn">Yes, without this value</span>}</td>
                      <td>{rv.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
