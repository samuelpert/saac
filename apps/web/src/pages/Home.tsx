import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AttentionRow, DashboardResponse, TeamProgressRow } from '@saac/shared';
import { apiGet } from '../api/client';
import { useIsAdmin } from '../auth/AuthContext';
import { ScanBox } from '../components/ScanBox';
import { PastTermPill, TermSelect } from '../components/TermSelect';
import { Chevron, EmptyState, ErrorText, Glyph, WidgetBody } from '../components/ui';
import { fmtBytes, fmtDay, fmtDuration, fmtNumber, fmtRelativeDay, fmtTime, plural, todayLabel } from '../lib/format';

const TEAMS_SHOWN = 7;

export function Home() {
  const isAdmin = useIsAdmin();
  const [params, setParams] = useSearchParams();
  const termParam = params.get('term') ?? '';
  const q = useQuery({
    queryKey: ['dashboard', termParam],
    queryFn: () => apiGet<DashboardResponse>(`/api/dashboard${termParam ? `?term=${encodeURIComponent(termParam)}` : ''}`),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev,
  });
  const d = q.data;
  const term = d?.term?.code ?? '';
  const withTerm = (path: string, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ ...(term ? { term } : {}), ...extra });
    const s = p.toString();
    return s ? `${path}?${s}` : path;
  };

  return (
    <>
      <div className="page-head">
        <div className="titles">
          <h1>Home</h1>
          <span className="sub">
            {todayLabel()}
            {d && ` · Updated ${fmtTime(d.generatedAt)}`} · refreshes every 60&nbsp;s
          </span>
        </div>
      </div>

      <div className="row">
        {d && d.terms.length > 0 && <TermSelect terms={d.terms} value={term} onChange={(code) => setParams(code ? { term: code } : {})} />}
        {d?.isPast && <PastTermPill />}
        <ScanBox term={term || undefined} />
      </div>

      {q.isError && !d && <ErrorText error={q.error} />}
      {d && !d.term && (
        <EmptyState action={isAdmin ? <Link className="btn primary" to="/admin/terms">Set up a term</Link> : undefined}>
          No term has been set up yet, so term numbers show zero.
        </EmptyState>
      )}
      {d && <Dashboard d={d} isAdmin={isAdmin} withTerm={withTerm} />}
    </>
  );
}

function Dashboard({ d, isAdmin, withTerm }: { d: DashboardResponse; isAdmin: boolean; withTerm: (p: string, e?: Record<string, string>) => string }) {
  const w = d.widgets;
  return (
    <>
      <div className="grid-tiles">
        <Link className="tile" to={withTerm('/people')}>
          <span className="label">People</span>
          <WidgetBody widget={w.people}>
            {(p) => (
              <>
                <span className="value">{fmtNumber(p.total)}</span>
                <span className="sub">
                  {fmtNumber(p.athletes)} athletes{p.gradAssistants > 0 && ` · ${fmtNumber(p.gradAssistants)} grad assistants`} · {fmtNumber(p.staff)} staff
                </span>
              </>
            )}
          </WidgetBody>
        </Link>
        <Link className="tile" to={withTerm('/checked-out/books')}>
          <span className="label">Books out</span>
          <WidgetBody widget={w.booksOut}>
            {(n) => (
              <>
                <span className="value">{fmtNumber(n)}</span>
                <span className="sub">open book loans</span>
              </>
            )}
          </WidgetBody>
        </Link>
        <Link className="tile" to={withTerm('/checked-out/items')}>
          <span className="label">Tech out</span>
          <WidgetBody widget={w.techOut}>
            {(n) => (
              <>
                <span className="value">{fmtNumber(n)}</span>
                <span className="sub">open tech loans</span>
              </>
            )}
          </WidgetBody>
        </Link>
        <Link className={`tile${w.pastDue.ok && w.pastDue.data.total > 0 ? ' danger' : ''}`} to={withTerm('/checked-out/all', { view: 'pastdue' })}>
          <span className="label">Past due</span>
          <WidgetBody widget={w.pastDue}>
            {(p) => (
              <>
                <span className="value">
                  {p.total > 0 && <Glyph tone="warn" small />}
                  {fmtNumber(p.total)}
                </span>
                <span className="sub">{p.total > 0 ? 'past due, books and tech' : 'nothing past due'}</span>
              </>
            )}
          </WidgetBody>
        </Link>
        <Link className="tile" to={withTerm('/checked-out/all', { view: 'holds' })}>
          <span className="label">Holds</span>
          <WidgetBody widget={w.holds}>
            {(h) => (
              <>
                <span className="value">{fmtNumber(h.total)}</span>
                <span className="sub">
                  {h.total === 0 ? 'none' : [h.pending && `${h.pending} pending`, h.onHold && `${h.onHold} on hold`].filter(Boolean).join(', ')}
                </span>
              </>
            )}
          </WidgetBody>
        </Link>
        <Link className="tile accent" to={withTerm('/people', { holding: d.term?.code ?? '' })}>
          <span className="label">Deadline</span>
          <WidgetBody widget={w.deadline}>
            {(dl) =>
              dl ? (
                <>
                  <span className="value">{dl.daysLeft > 0 ? plural(dl.daysLeft, 'day') : dl.daysLeft === 0 ? 'Today' : 'Passed'}</span>
                  <span className="sub">
                    {fmtDay(dl.returnDeadline)} · {dl.peopleHolding === 0 ? 'nobody holds items' : `${plural(dl.peopleHolding, 'person', 'people')} hold items`}
                  </span>
                </>
              ) : (
                <span className="sub">No term set up</span>
              )
            }
          </WidgetBody>
        </Link>
      </div>

      <div className="grid-2">
        {w.attention && (
          <section className="card tight">
            <div className="card-head" style={{ marginBottom: 'var(--space-2)' }}>
              <h2>Needs attention</h2>
              {w.attention.ok && <span className="small muted num">{w.attention.data.length || ''}</span>}
            </div>
            <WidgetBody widget={w.attention}>
              {(rows) =>
                rows.length === 0 ? <p className="secondary" style={{ margin: 'var(--space-2) 0' }}>Nothing needs you right now.</p> : rows.map((r) => <AttentionLink key={r.key} r={r} />)
              }
            </WidgetBody>
          </section>
        )}
        <TeamProgress widget={w.teams} withTerm={withTerm} />
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Books this term</h2>
            <Link to="/student-books">Student books ›</Link>
          </div>
          <WidgetBody widget={w.books}>
            {(b) =>
              b.hasBookList ? (
                <>
                  <div className="chips">
                    {(
                      [
                        ['Needed', b.needed],
                        ['Assigned', b.assigned],
                        ['Issued', b.issued],
                        ['Waived', b.waived],
                      ] as const
                    ).map(([label, value]) => (
                      <Link key={label} className="chip" to="/student-books">
                        <span className="label">{label}</span>
                        <span className="value">{fmtNumber(value)}</span>
                      </Link>
                    ))}
                  </div>
                  {b.shortTitles > 0 && (
                    <Link className="banner" to="/student-books">
                      <Glyph tone="warn" />
                      <span className="text">
                        <span className="strong num">{plural(b.shortTitles, 'title')} short</span> · {plural(b.shortNeeds, 'need')} {b.shortNeeds === 1 ? 'has' : 'have'} no copy
                      </span>
                      <span className="small medium">Shortage report ›</span>
                    </Link>
                  )}
                </>
              ) : (
                <EmptyState action={isAdmin ? <Link className="btn primary" to="/admin/imports">Import books</Link> : undefined}>
                  No book list imported for {d.term?.code ?? 'this term'} yet.
                </EmptyState>
              )
            }
          </WidgetBody>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Inventory health</h2>
            {isAdmin && <Link to="/admin/inventory">Inventory ›</Link>}
          </div>
          <WidgetBody widget={w.inventory}>
            {(inv) => (
              <>
                {inv.tech.length === 0 ? (
                  <EmptyState>No tech items in inventory yet.</EmptyState>
                ) : (
                  <div className="mini-table">
                    <span className="th first">Tech</span>
                    <span className="th">Available</span>
                    <span className="th">Out</span>
                    <span className="th">In repair</span>
                    <span className="th">Surplus</span>
                    <span className="th">Retired</span>
                    {inv.tech.map((t) => (
                      <TechRow key={t.typeId} t={t} />
                    ))}
                  </div>
                )}
                <div className="stack" style={{ gap: 'var(--space-2)' }}>
                  <span className="small medium secondary">Book copies · {fmtNumber(inv.copies.total)}</span>
                  {inv.copies.total === 0 ? (
                    <EmptyState>No book copies in inventory yet.</EmptyState>
                  ) : (
                    <div className="chips">
                      {(
                        [
                          ['Available', inv.copies.available],
                          ['Assigned', inv.copies.assigned],
                          ['Out', inv.copies.out],
                          ['Retired', inv.copies.retired],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label} className="chip sm">
                          <span className="label">{label}</span>
                          <span className="value">{fmtNumber(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </WidgetBody>
        </section>
      </div>

      <BottomRow d={d} isAdmin={isAdmin} />
    </>
  );
}

function TechRow({ t }: { t: { type: string; available: number; out: number; inRepair: number; surplus: number; retired: number } }) {
  return (
    <>
      <span className="first">{t.type}</span>
      <span>{fmtNumber(t.available)}</span>
      <span>{fmtNumber(t.out)}</span>
      <span>{fmtNumber(t.inRepair)}</span>
      <span>{fmtNumber(t.surplus)}</span>
      <span className="muted">{fmtNumber(t.retired)}</span>
    </>
  );
}

function AttentionLink({ r }: { r: AttentionRow }) {
  return (
    <Link className="attn-row" to={r.href}>
      <span className={`attn-icon${r.tone === 'danger' ? ' danger' : r.tone === 'info' ? ' info' : ''}`} aria-hidden="true">
        !
      </span>
      <span className="text">{r.text}</span>
      <span className="count-pill">{fmtNumber(r.count)}</span>
      <Chevron />
    </Link>
  );
}

function TeamProgress({ widget, withTerm }: { widget: DashboardResponse['widgets']['teams']; withTerm: (p: string, e?: Record<string, string>) => string }) {
  const [all, setAll] = useState(false);
  const pct = (n: number, total: number) => `${total ? ((n / total) * 100).toFixed(1) : 0}%`;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Return progress by team</h2>
        <div className="legend" aria-hidden="true">
          <span>
            <i className="swatch-returned" />
            Returned
          </span>
          <span>
            <i className="swatch-out" />
            Still out
          </span>
          <span>
            <i className="swatch-pastdue" />
            Past due
          </span>
        </div>
      </div>
      <WidgetBody widget={widget}>
        {(teams) =>
          teams.length === 0 ? (
            <EmptyState>No loans this term yet.</EmptyState>
          ) : (
            <>
              <div className="team-grid">
                {(all ? teams : teams.slice(0, TEAMS_SHOWN)).map((t: TeamProgressRow) => (
                  <TeamBar key={t.teamId} t={t} pct={pct} href={withTerm('/checked-out/all', { teamId: t.teamId })} />
                ))}
              </div>
              {teams.length > TEAMS_SHOWN && (
                <button type="button" className="linkish small medium" style={{ alignSelf: 'flex-start', color: 'var(--color-link)' }} onClick={() => setAll(!all)}>
                  {all ? 'Show fewer ›' : `All ${teams.length} teams ›`}
                </button>
              )}
            </>
          )
        }
      </WidgetBody>
    </section>
  );
}

function TeamBar({ t, pct, href }: { t: TeamProgressRow; pct: (n: number, total: number) => string; href: string }) {
  return (
    <>
      <Link to={href}>{t.name}</Link>
      <div className="bar" role="img" aria-label={`${t.name}: ${t.returned} returned, ${t.out} still out, ${t.pastDue} past due, of ${t.total}`}>
        <span className="swatch-returned" style={{ width: pct(t.returned, t.total) }} />
        <span className="swatch-out" style={{ width: pct(t.out, t.total) }} />
        <span className="swatch-pastdue" style={{ width: pct(t.pastDue, t.total) }} />
      </div>
      <span className="count">
        {fmtNumber(t.returned)} of {fmtNumber(t.total)} returned
      </span>
    </>
  );
}

/** Recent activity for everyone; imports and system health for admins only. */
function BottomRow({ d, isAdmin }: { d: DashboardResponse; isAdmin: boolean }) {
  const w = d.widgets;
  const health = w.health;
  const stale = health?.ok ? health.data.stale : false;
  return (
    <div className="grid-3">
      <section className="card tight">
        <div className="card-head" style={{ marginBottom: 6 }}>
          <h2>Recent activity</h2>
          {isAdmin && <Link to="/admin/audit">Audit log ›</Link>}
        </div>
        <WidgetBody widget={w.activity}>
          {(rows) =>
            rows.length === 0 ? (
              <p className="secondary small">No changes recorded yet.</p>
            ) : (
              rows.slice(0, 8).map((a) => (
                <div key={a.id} className="activity-row">
                  <span className="muted num">{fmtTime(a.at)}</span>
                  <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                    <span className="medium num">
                      {a.action}
                      {a.label && ` · ${a.label}`}
                    </span>
                    <span className="muted">{a.user}</span>
                  </span>
                </div>
              ))
            )
          }
        </WidgetBody>
      </section>

      {isAdmin && (
        <section className="card">
          <div className="card-head">
            <h2>Imports</h2>
            <Link to="/admin/imports">History ›</Link>
          </div>
          <WidgetBody widget={w.imports}>
            {(rows) =>
              rows.length === 0 ? (
                <EmptyState action={<Link className="btn primary" to="/admin/imports/students">Import students</Link>}>No imports yet.</EmptyState>
              ) : (
                rows.map((im) => (
                  <div key={im.kind} className="import-box">
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span className="strong">{im.kind}</span>
                      <span className="xsmall secondary num">
                        {fmtRelativeDay(im.at)} · {im.user}
                      </span>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="pill on-subtle num">{fmtNumber(im.created)} created</span>
                      <span className="pill on-subtle num">{fmtNumber(im.updated)} updated</span>
                      <span className="pill on-subtle num">{fmtNumber(im.unchanged)} unchanged</span>
                      {im.review > 0 && <span className="pill warn num">{fmtNumber(im.review)} to review</span>}
                    </div>
                  </div>
                ))
              )
            }
          </WidgetBody>
        </section>
      )}

      {isAdmin && (
        <section className={`card${stale ? ' danger' : ''}`}>
          <div className="card-head">
            <h2>System health</h2>
            <Link to="/admin/backups">Backup details ›</Link>
          </div>
          <WidgetBody widget={health}>
            {(h) => (
              <>
                <div className="row" style={{ gap: 10, color: stale ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {stale ? <Glyph tone="warn" /> : <CheckCircle2 size={22} strokeWidth={1.75} aria-hidden="true" />}
                  <span className="strong">{stale ? 'Backup is old' : 'Backups are current'}</span>
                </div>
                <div className="health-grid">
                  <span>Last backup</span>
                  <span className="health-value">{h.lastSuccess ? fmtRelativeDay(h.lastSuccess.at) : 'Never'}</span>
                  {h.lastAttempt && !h.lastAttempt.ok && (
                    <>
                      <span>Last attempt</span>
                      <span className="health-value">Failed {fmtRelativeDay(h.lastAttempt.at)}</span>
                    </>
                )}
                <span>Backup location</span>
                <span>{h.lastSuccess?.location ?? '—'}</span>
                <span>Free disk space</span>
                <span>{h.disk ? `${fmtBytes(h.disk.freeBytes)} of ${fmtBytes(h.disk.totalBytes)}` : '—'}</span>
                <span>Database size</span>
                <span>{fmtBytes(h.databaseBytes)}</span>
                <span>App uptime</span>
                <span>{fmtDuration(h.uptimeSeconds)}</span>
              </div>
            </>
          )}
        </WidgetBody>
      </section>
      )}
    </div>
  );
}
