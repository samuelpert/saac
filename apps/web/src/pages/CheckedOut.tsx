import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { HoldListRow, LoanListRow, TeamRef, TermRow } from '@saac/shared';
import { apiGet } from '../api/client';
import { TagLink } from '../components/ItemBits';
import { PersonName } from '../components/PersonCard';
import { EmptyState, ErrorText, Glyph, PageHead } from '../components/ui';
import { fmtDate, plural } from '../lib/format';

type Kind = 'items' | 'books' | 'all';
type View = 'open' | 'pastdue' | 'holds' | 'holdlist';

const TITLE: Record<Kind, string> = { items: 'Checked-out items', books: 'Checked-out books', all: 'Checked out' };

/**
 * The lists behind the dashboard numbers. Phase 5 adds the by-student view, the hold list
 * workflow, and Excel export; the rows and their definitions are already the final ones.
 */
export function CheckedOut() {
  const { kind = 'items' } = useParams() as { kind: Kind };
  const [params, setParams] = useSearchParams();
  const term = params.get('term') ?? '';
  const view = (params.get('view') ?? 'open') as View;
  const teamId = params.get('teamId') ?? '';

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  const teams = useQuery({ queryKey: ['teams'], queryFn: () => apiGet<TeamRef[]>('/api/teams') });
  const apiView = view === 'holdlist' ? 'open' : view;
  const q = useQuery({
    queryKey: ['loans', kind, term, apiView, teamId],
    queryFn: () => {
      const p = new URLSearchParams({ view: apiView });
      if (term) p.set('term', term);
      if (teamId) p.set('teamId', teamId);
      return apiGet<{ term: TermRow; rows?: LoanListRow[]; holds?: HoldListRow[] }>(`/api/loans/${kind}?${p}`);
    },
  });
  const termCode = q.data?.term.code ?? term;

  const tabs: [View, string][] = [
    ['open', 'Now'],
    ['pastdue', 'Past due'],
    ['holdlist', 'Hold list'],
    ['holds', 'Holds'],
  ];
  const teamName = teams.data?.find((t) => t.id === teamId)?.name;

  return (
    <>
      <PageHead
        title={TITLE[kind]}
        sub={[termCode, teamName].filter(Boolean).join(' · ')}
        actions={
          kind !== 'all' && (
            <Link className="btn" to={`/checked-out/${kind === 'items' ? 'books' : 'items'}${term ? `?term=${term}` : ''}`}>
              {kind === 'items' ? 'Checked-out books' : 'Checked-out items'}
            </Link>
          )
        }
      />
      <section className="card">
        <div className="row">
          <div className="tabs" role="tablist">
            {tabs.map(([v, label]) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => set({ view: v === 'open' ? '' : v })}>
                {label}
              </button>
            ))}
          </div>
          {view !== 'holds' && (
            <select className="select" aria-label="Team" value={teamId} onChange={(e) => set({ teamId: e.target.value })}>
              <option value="">All teams</option>
              {teams.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <span className="spacer" />
          {q.data?.rows && <span className="small muted num">{plural(q.data.rows.length, kind === 'books' ? 'book' : 'item')}</span>}
        </div>
        {view === 'holdlist' && q.data && <HoldListNote deadline={q.data.term.returnDeadline} />}
        <ErrorText error={q.error} />
        {q.data?.holds && <HoldsTable rows={q.data.holds} />}
        {q.data?.rows && (q.data.rows.length === 0 ? <EmptyState>{view === 'pastdue' ? 'Nothing is past due.' : 'Nothing is checked out.'}</EmptyState> : <LoanTable rows={q.data.rows} showKind={kind === 'all'} />)}
      </section>
    </>
  );
}

function HoldListNote({ deadline }: { deadline: string }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return today > deadline ? (
    <p className="secondary small">Everyone below still has books or tech out after the return deadline. Check each person against the signed paper agreement. Only an admin applies a hold.</p>
  ) : (
    <p className="secondary small">The hold list is ready the day after the return deadline. Until then this shows everything that is out.</p>
  );
}

function LoanTable({ rows, showKind }: { rows: LoanListRow[]; showKind: boolean }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Person</th>
            <th>PID</th>
            <th>Team</th>
            {showKind && <th>Kind</th>}
            <th>Item</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.kind}-${r.id}`}>
              <td>
                <PersonName person={r.borrower} />
              </td>
              <td className="pid">{r.borrower.pid}</td>
              <td>{r.borrower.team ?? <span className="muted">—</span>}</td>
              {showKind && <td>{r.kind === 'book' ? 'Book' : r.typeName}</td>}
              <td>
                <TagLink kind={r.kind} id={r.itemId} tag={r.tag} />
                {r.kind === 'book' && <div className="small">{r.label}</div>}
              </td>
              <td className="num">
                {r.pastDue ? (
                  <span className="pill err">
                    <Glyph tone="warn" small /> Past due · {fmtDate(r.dueDate, { month: 'short', day: 'numeric' })}
                  </span>
                ) : (
                  fmtDate(r.dueDate, { month: 'short', day: 'numeric' })
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HoldsTable({ rows }: { rows: HoldListRow[] }) {
  if (rows.length === 0) return <EmptyState>Nobody is pending review or on hold this term.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Person</th>
            <th>PID</th>
            <th>Team</th>
            <th>Stage</th>
            <th className="n">Still out</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.borrower.id}>
              <td>
                <PersonName person={r.borrower} />
              </td>
              <td className="pid">{r.borrower.pid}</td>
              <td>{r.borrower.team ?? <span className="muted">—</span>}</td>
              <td>{r.stage === 'ON_HOLD' ? <span className="pill err">On hold</span> : <span className="pill warn">Pending review</span>}</td>
              <td className="n">{r.openItems}</td>
              <td className="secondary">{r.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
