import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BORROWER_KIND_LABEL, type BorrowerListResponse, type TeamRef } from '@saac/shared';
import { apiGet } from '../api/client';
import { useIsAdmin } from '../auth/AuthContext';
import { EmptyState, ErrorText, PageHead } from '../components/ui';
import { fmtNumber, plural } from '../lib/format';

export function People() {
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const q = params.get('q') ?? '';
  const active = params.get('active') ?? 'true';
  const kind = params.get('kind') ?? '';
  const teamId = params.get('teamId') ?? '';
  const holding = params.get('holding') ?? '';
  const page = Number(params.get('page') ?? '1');

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Search as you type, a moment after the last key.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (text.trim() !== q) set({ q: text.trim() });
    }, 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const teams = useQuery({ queryKey: ['teams'], queryFn: () => apiGet<TeamRef[]>('/api/teams') });
  const list = useQuery({
    queryKey: ['borrowers', q, active, kind, teamId, holding, page],
    queryFn: () => {
      const p = new URLSearchParams({ active, page: String(page), pageSize: '50' });
      if (q) p.set('q', q);
      if (kind) p.set('kind', kind);
      if (teamId) p.set('teamId', teamId);
      if (holding) p.set('holding', holding);
      return apiGet<BorrowerListResponse>(`/api/borrowers?${p}`);
    },
    placeholderData: keepPreviousData,
  });
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHead
        title={holding ? `People holding items · ${holding}` : 'People'}
        sub={data ? plural(data.total, 'person', 'people') : undefined}
        actions={
          isAdmin && (
            <Link className="btn primary" to="/people/new">
              Add person
            </Link>
          )
        }
      />
      <section className="card">
        <div className="row">
          <div className="search-input">
            <Search size={16} strokeWidth={1.75} aria-hidden="true" />
            <input
              className="input"
              value={text}
              autoFocus
              aria-label="Search by PID or name"
              placeholder="Search by PID or name"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && data?.rows.length === 1) navigate(`/people/${data.rows[0]!.id}`);
              }}
            />
          </div>
          <select className="select" aria-label="Status" value={active} onChange={(e) => set({ active: e.target.value })}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="all">Everyone</option>
          </select>
          <select className="select" aria-label="Role" value={kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="">Any role</option>
            {Object.entries(BORROWER_KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <select className="select" aria-label="Team" value={teamId} onChange={(e) => set({ teamId: e.target.value })}>
            <option value="">Any team</option>
            {teams.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {holding && (
            <button type="button" className="pill lg info" style={{ border: 0, cursor: 'pointer' }} onClick={() => set({ holding: '' })}>
              Holding items in {holding} ×
            </button>
          )}
        </div>
        <ErrorText error={list.error} />
        {data && data.rows.length === 0 ? (
          <EmptyState>Nobody matches these filters.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>PID</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Team</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((b) => (
                  <tr key={b.id}>
                    <td className="pid">{b.pid}</td>
                    <td>
                      <Link to={`/people/${b.id}`}>
                        {b.lastName}, {b.firstName}
                      </Link>
                    </td>
                    <td>{BORROWER_KIND_LABEL[b.kind]}</td>
                    <td>{b.team?.name ?? <span className="muted">—</span>}</td>
                    <td>{b.active ? <span className="pill ok">Active</span> : <span className="pill">Inactive</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && pages > 1 && (
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <span className="small muted num">
              Page {fmtNumber(page)} of {fmtNumber(pages)}
            </span>
            <button type="button" className="btn" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>
              Previous
            </button>
            <button type="button" className="btn" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>
              Next
            </button>
          </div>
        )}
      </section>
    </>
  );
}
