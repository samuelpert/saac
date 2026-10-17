import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { BORROWER_KIND_LABEL, type BorrowerDetail } from '@saac/shared';
import { apiGet } from '../api/client';
import { useIsAdmin } from '../auth/AuthContext';
import { TagLink } from '../components/ItemBits';
import { CopyButton } from '../components/PersonCard';
import { EligibilityPill, EmptyState, ErrorText, Feedback, Glyph, Loading, PageHead, TermTags } from '../components/ui';
import { fmtDate } from '../lib/format';

export function Person() {
  const { id = '' } = useParams();
  const isAdmin = useIsAdmin();
  const q = useQuery({ queryKey: ['borrower', id], queryFn: () => apiGet<BorrowerDetail>(`/api/borrowers/${id}`) });
  if (q.isLoading) return <Loading />;
  if (!q.data) return <ErrorText error={q.error} />;
  const p = q.data;
  const currentClasses = p.classes;

  return (
    <>
      <PageHead
        title={`${p.firstName} ${p.lastName}`}
        sub={
          <span className="row" style={{ gap: 'var(--space-2)' }}>
            <span className="num">PID {p.pid}</span>
            <CopyButton value={p.pid} label="Copy Panther ID" />
            <span>· {BORROWER_KIND_LABEL[p.kind]}</span>
            {p.team && <span>· {p.team.name}</span>}
            <EligibilityPill status={p.eligibility} term={p.eligibilityTerm} />
            {p.kind === 'ATHLETE' && (p.onScholarship ? <span className="pill info">On scholarship</span> : <span className="pill warn">Not on scholarship</span>)}
          </span>
        }
        actions={
          isAdmin && (
            <Link className="btn" to={`/people/${p.id}/edit`}>
              Edit person
            </Link>
          )
        }
      />

      {p.eligibility === 'TERM_ENDED' && (
        <Feedback fb={{ tone: 'warn', word: `${p.eligibilityTerm} ended`, text: 'The return deadline has passed, so nobody can borrow until the next term list is imported. Returning items still works.' }} />
      )}
      {p.eligibility === 'STAFF_INACTIVE' && (
        <Feedback fb={{ tone: 'warn', word: 'Inactive staff', text: 'An admin switched this staff member off, so they cannot borrow. They can still return what they hold.' }} />
      )}
      {p.eligibility === 'NO_SCHOLARSHIP' && (
        <Feedback fb={{ tone: 'warn', word: 'Not on scholarship', text: `Athletes need a scholarship to borrow. They can still return what they hold.` }} />
      )}

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Holding now</h2>
            <span className="small muted num">{p.holding.length} open</span>
          </div>
          {p.holdingCounts.length > 0 && (
            <div className="row" style={{ gap: 6 }}>
              {p.holdingCounts.map((c) => (
                <span key={c.label} className="pill lg num">
                  {c.label} · {c.count}
                </span>
              ))}
            </div>
          )}
          {p.holding.length === 0 ? (
            <EmptyState>Nothing out right now.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Tag</th>
                    <th>Term</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {p.holding.map((h) => (
                    <tr key={h.id}>
                      <td>
                        {h.label}
                        <div className="xsmall muted">{h.typeName}</div>
                      </td>
                      <td className="tag">
                        <TagLink kind={h.kind} id={h.itemId} tag={h.tag} />
                      </td>
                      <td>{h.termCode}</td>
                      <td className="num">
                        {h.pastDue ? (
                          <span className="pill err">
                            <Glyph tone="warn" small /> Past due · {fmtDate(h.dueDate, { month: 'short', day: 'numeric' })}
                          </span>
                        ) : (
                          fmtDate(h.dueDate, { month: 'short', day: 'numeric' })
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h2>Contact</h2>
          <dl className="dl">
            <dt>Email</dt>
            <dd>{p.email ?? <span className="muted">No email on file. Reach them by phone or through the coach.</span>}</dd>
            <dt>Phone</dt>
            <dd className="num">{p.phone ?? <span className="muted">No phone on file</span>}</dd>
            <dt>Team</dt>
            <dd>{p.team?.name ?? <span className="muted">No team</span>}</dd>
            <dt>Scholarship</dt>
            <dd>{p.kind === 'ATHLETE' ? (p.onScholarship ? 'Yes' : 'No') : <span className="muted">Not applicable</span>}</dd>
            {p.kind === 'ATHLETE' ? (
              <>
                <dt>Terms</dt>
                <dd>
                  <TermTags terms={p.terms} />
                </dd>
              </>
            ) : (
              <>
                <dt>Staff status</dt>
                <dd>{p.staffActive ? 'Active · can borrow tech, not books' : 'Inactive · cannot borrow'}</dd>
              </>
            )}
            <dt>On file since</dt>
            <dd className="num">{fmtDate(p.createdAt)}</dd>
          </dl>
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Classes</h2>
          {currentClasses.length === 0 ? (
            <EmptyState>No classes on file. Class schedules come in with the term book list.</EmptyState>
          ) : (
            <div className="row" style={{ gap: 6 }}>
              {currentClasses.map((c) => (
                <span key={`${c.termCode}-${c.subject}-${c.catalog}-${c.section}`} className="pill lg num">
                  {c.termCode} · {c.subject} {c.catalog} {c.section}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2>Past terms</h2>
          {p.past.length === 0 ? (
            <EmptyState>No returned or closed items yet.</EmptyState>
          ) : (
            p.past.map((t) => (
              <div key={t.termCode} className="stack" style={{ gap: 'var(--space-1)' }}>
                <h3>{t.termCode}</h3>
                {t.loans.map((l) => (
                  <div key={l.id} className="row small" style={{ justifyContent: 'space-between' }}>
                    <span>
                      {l.label} <span className="muted num">· {l.tag}</span>
                    </span>
                    <span className="muted num">
                      {l.outcome === 'RETURNED' ? 'Returned' : 'Not for return'} {fmtDate(l.closedAt, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </section>
      </div>
    </>
  );
}
