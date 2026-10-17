import { Fragment, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createUserSchema, termInputSchema, type Role, type TermRow, type UserRow } from '@saac/shared';
import { apiGet, apiSend } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Dialog, EmptyState, ErrorText, Field, PageHead } from '../components/ui';
import { fmtBytes, fmtDateTime, fmtDay } from '../lib/format';

// ---- Users --------------------------------------------------------------------

export function Users() {
  const qc = useQueryClient();
  const me = useAuth().user;
  const q = useQuery({ queryKey: ['users'], queryFn: () => apiGet<UserRow[]>('/api/users') });
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; active?: boolean; role?: Role }) => apiSend('PATCH', `/api/users/${id}`, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <>
      <PageHead title="Users" sub="Desk staff and admins. Borrowers never sign in." actions={<button type="button" className="btn primary" onClick={() => setCreating(true)}>Add user</button>} />
      <section className="card">
        <ErrorText error={q.error ?? update.error} />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="num">{u.username}</td>
                  <td>
                    <select
                      className="select"
                      aria-label={`Role for ${u.username}`}
                      value={u.role}
                      disabled={u.id === me?.id}
                      onChange={(e) => update.mutate({ id: u.id, role: e.target.value as Role })}
                    >
                      <option value="STAFF">Front desk</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </td>
                  <td>
                    {!u.active ? <span className="pill">Disabled</span> : u.mustChangePassword ? <span className="pill warn">Must set password</span> : <span className="pill ok">Active</span>}
                  </td>
                  <td className="actions">
                    <button type="button" className="btn tertiary" onClick={() => setResetting(u)}>
                      Reset password
                    </button>
                    {u.id !== me?.id && (
                      <button type="button" className="btn tertiary" onClick={() => update.mutate({ id: u.id, active: !u.active })}>
                        {u.active ? 'Disable' : 'Enable'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {creating && <CreateUser onClose={() => setCreating(false)} />}
      {resetting && <ResetPassword user={resetting} onClose={() => setResetting(null)} />}
    </>
  );
}

function CreateUser({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ username: '', name: '', email: '', role: 'STAFF' as Role, temporaryPassword: '' });
  const [error, setError] = useState<unknown>(null);
  const create = useMutation({
    mutationFn: (body: unknown) => apiSend('POST', '/api/users', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: setError,
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = createUserSchema.safeParse(form);
    if (!parsed.success) return setError(new Error(parsed.error.issues[0]?.message));
    create.mutate(parsed.data);
  }
  return (
    <Dialog title="Add user" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Full name">
          <input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Username" hint="What they type to sign in">
          <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </Field>
        <Field label="Email (optional)">
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Role">
          <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="STAFF">Front desk</option>
            <option value="ADMIN">Admin</option>
          </select>
        </Field>
        <Field label="Temporary password" hint="At least 10 characters. They must change it at first sign-in.">
          <input className="input" type="text" autoComplete="off" value={form.temporaryPassword} onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })} />
        </Field>
        <ErrorText error={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={create.isPending}>
            Add user
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ResetPassword({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [pw, setPw] = useState('');
  const reset = useMutation({
    mutationFn: () => apiSend('POST', `/api/users/${user.id}/reset-password`, { temporaryPassword: pw }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });
  return (
    <Dialog title={`Reset password for ${user.name}`} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          reset.mutate();
        }}
      >
        <p className="secondary">They are signed out everywhere and must choose a new password at next sign-in.</p>
        <Field label="Temporary password" hint="At least 10 characters">
          <input className="input" autoFocus autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <ErrorText error={reset.error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={pw.length < 10 || reset.isPending}>
            Reset password
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---- Terms ----------------------------------------------------------------------

export function Terms() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['terms'], queryFn: () => apiGet<TermRow[]>('/api/terms') });
  const [form, setForm] = useState({ code: '', startsOn: '', endsOn: '', returnDeadline: '' });
  const [error, setError] = useState<unknown>(null);
  const create = useMutation({
    mutationFn: (body: unknown) => apiSend('POST', '/api/terms', body),
    onSuccess: () => {
      void qc.invalidateQueries();
      setForm({ code: '', startsOn: '', endsOn: '', returnDeadline: '' });
      setError(null);
    },
    onError: setError,
  });
  const makeCurrent = useMutation({ mutationFn: (id: string) => apiSend('POST', `/api/terms/${id}/current`), onSuccess: () => void qc.invalidateQueries() });

  return (
    <>
      <PageHead title="Terms" sub="The current term is what the dashboard and desk screens open on." />
      <section className="card">
        <ErrorText error={q.error ?? makeCurrent.error} />
        {q.data?.length === 0 ? (
          <EmptyState>No terms yet. Add the first one below.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th>Return deadline</th>
                  <th className="actions" />
                </tr>
              </thead>
              <tbody>
                {q.data?.map((t) => (
                  <tr key={t.id}>
                    <td className="medium">{t.code}</td>
                    <td className="num">{fmtDay(t.startsOn, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="num">{fmtDay(t.endsOn, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="num">{fmtDay(t.returnDeadline, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className="actions">
                      {t.isCurrent ? (
                        <span className="pill ok">Current</span>
                      ) : (
                        <button type="button" className="btn tertiary" onClick={() => makeCurrent.mutate(t.id)}>
                          Make current
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <form
        className="card"
        style={{ maxWidth: 720 }}
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = termInputSchema.safeParse(form);
          if (!parsed.success) return setError(new Error(parsed.error.issues[0]?.message));
          create.mutate(parsed.data);
        }}
      >
        <h2>Add a term</h2>
        <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Field label="Code">
            <input className="input" placeholder="e.g. FALL26" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Starts">
            <input className="input" type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
          </Field>
          <Field label="Ends">
            <input className="input" type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
          </Field>
          <Field label="Return deadline">
            <input className="input" type="date" value={form.returnDeadline} onChange={(e) => setForm({ ...form, returnDeadline: e.target.value })} />
          </Field>
        </div>
        <ErrorText error={error} />
        <div className="row">
          <button type="submit" className="btn primary" disabled={create.isPending}>
            Add term
          </button>
        </div>
      </form>
    </>
  );
}

// ---- Audit log -------------------------------------------------------------------

interface AuditRow {
  id: string;
  at: string;
  user: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
}

export function AuditLog() {
  const [pages, setPages] = useState<string[]>(['']);
  const [open, setOpen] = useState<string | null>(null);
  const queries = useQuery({
    queryKey: ['audit', pages],
    queryFn: async () => {
      const all: AuditRow[] = [];
      for (const before of pages) all.push(...(await apiGet<AuditRow[]>(`/api/audit?limit=100${before ? `&before=${encodeURIComponent(before)}` : ''}`)));
      return all;
    },
  });
  const rows = queries.data ?? [];
  return (
    <>
      <PageHead title="Audit log" sub="Every change, who made it and when. Entries can never be edited or deleted." />
      <section className="card">
        <ErrorText error={queries.error} />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Action</th>
                <th>Record</th>
                <th className="actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td className="num">{fmtDateTime(r.at)}</td>
                    <td>{r.user}</td>
                    <td className="num">{r.action}</td>
                    <td className="small muted num">
                      {r.entityType} · {r.entityId.slice(0, 8)}
                    </td>
                    <td className="actions">
                      {(r.before != null || r.after != null) && (
                        <button type="button" className="btn tertiary" onClick={() => setOpen(open === r.id ? null : r.id)}>
                          {open === r.id ? 'Hide' : 'Details'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === r.id && (
                    <tr>
                      <td colSpan={5}>
                        <div className="grid-2">
                          <pre className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                            Before: {JSON.stringify(r.before, null, 2)}
                          </pre>
                          <pre className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                            After: {JSON.stringify(r.after, null, 2)}
                          </pre>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length >= pages.length * 100 && (
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setPages([...pages, rows.at(-1)!.at])}>
            Load older entries
          </button>
        )}
      </section>
    </>
  );
}

// ---- Backups ----------------------------------------------------------------------

interface BackupRow {
  id: string;
  at: string;
  ok: boolean;
  location: string;
  sizeBytes: number | null;
  message: string | null;
}

export function Backups() {
  const q = useQuery({ queryKey: ['backups'], queryFn: () => apiGet<BackupRow[]>('/api/backups') });
  return (
    <>
      <PageHead title="Backups" sub="Written by the scheduled backup script. A failed attempt shows here in red." />
      <section className="card">
        <ErrorText error={q.error} />
        {q.data?.length === 0 ? (
          <EmptyState>No backup has run yet. Schedule scripts/backup.mjs as described in the runbook.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Result</th>
                  <th>Location</th>
                  <th className="n">Size</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {q.data?.map((b) => (
                  <tr key={b.id}>
                    <td className="num">{fmtDateTime(b.at)}</td>
                    <td>{b.ok ? <span className="pill ok">✓ Done</span> : <span className="pill err">× Failed</span>}</td>
                    <td className="small">{b.location}</td>
                    <td className="n">{b.sizeBytes == null ? '—' : fmtBytes(b.sizeBytes)}</td>
                    <td className="small secondary">{b.message}</td>
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
