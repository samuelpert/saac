import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BORROWER_KIND_LABEL, borrowerInputSchema, type BorrowerDetail, type BorrowerKind, type BorrowerSummary, type TeamRef, type TermRow } from '@saac/shared';
import { ApiError, apiGet, apiSend } from '../api/client';
import { ErrorText, Field, Loading, PageHead } from '../components/ui';

interface FormState {
  pid: string;
  firstName: string;
  lastName: string;
  kind: BorrowerKind;
  teamId: string;
  email: string;
  phone: string;
  onScholarship: boolean;
  staffActive: boolean;
  termCodes: string[];
}

const blank: FormState = { pid: '', firstName: '', lastName: '', kind: 'ATHLETE', teamId: '', email: '', phone: '', onScholarship: false, staffActive: true, termCodes: [] };

/** Admin only: add a late addition by hand, or correct a person. */
export function PersonForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editing = Boolean(id);
  const [form, setForm] = useState<FormState>({ ...blank, pid: params.get('pid') ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const teams = useQuery({ queryKey: ['teams'], queryFn: () => apiGet<TeamRef[]>('/api/teams') });
  const terms = useQuery({ queryKey: ['terms'], queryFn: () => apiGet<TermRow[]>('/api/terms') });
  const existing = useQuery({ queryKey: ['borrower', id], queryFn: () => apiGet<BorrowerDetail>(`/api/borrowers/${id}`), enabled: editing });

  useEffect(() => {
    const p = existing.data;
    if (p) {
      setForm({
        pid: p.pid,
        firstName: p.firstName,
        lastName: p.lastName,
        kind: p.kind,
        teamId: p.team?.id ?? '',
        email: p.email ?? '',
        phone: p.phone ?? '',
        onScholarship: p.onScholarship,
        staffActive: p.staffActive,
        termCodes: p.terms,
      });
    }
  }, [existing.data]);

  const save = useMutation({
    mutationFn: (body: unknown) => (editing ? apiSend<BorrowerSummary>('PUT', `/api/borrowers/${id}`, body) : apiSend<BorrowerSummary>('POST', '/api/borrowers', body)),
    onSuccess: (b) => {
      void qc.invalidateQueries({ queryKey: ['borrower', b.id] });
      void qc.invalidateQueries({ queryKey: ['borrowers'] });
      navigate(`/people/${b.id}`);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const body = { ...form, teamId: form.kind === 'ATHLETE' && form.teamId ? form.teamId : null, phone: form.phone.replace(/\D/g, '') };
    const parsed = borrowerInputSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    save.mutate(body);
  }

  if (editing && existing.isLoading) return <Loading />;
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <PageHead title={editing ? 'Edit person' : 'Add person'} sub={editing ? undefined : 'For a late addition. Most people come in with the student import.'} />
      <form className="card" style={{ maxWidth: 720 }} onSubmit={submit} noValidate>
        <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Field label="PID" hint="7 digits, leading zeros kept" error={errors.pid}>
            <input className="input num" inputMode="numeric" maxLength={7} value={form.pid} onChange={(e) => set('pid', e.target.value.trim())} autoFocus={!editing} />
          </Field>
          <Field label="Role" error={errors.kind}>
            <select className="select" value={form.kind} onChange={(e) => set('kind', e.target.value as BorrowerKind)}>
              {Object.entries(BORROWER_KIND_LABEL).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="First name" error={errors.firstName}>
            <input className="input" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </Field>
          <Field label="Last name" error={errors.lastName}>
            <input className="input" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </Field>
          {form.kind === 'ATHLETE' && (
            <Field label="Team" error={errors.teamId}>
              <select className="select" value={form.teamId} onChange={(e) => set('teamId', e.target.value)}>
                <option value="">No team yet</option>
                {teams.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Email" error={errors.email}>
            <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Mobile phone" hint="10 digits" error={errors.phone}>
            <input className="input num" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>
        {form.kind === 'ATHLETE' && (
          <label className="check">
            <input type="checkbox" checked={form.onScholarship} onChange={(e) => set('onScholarship', e.target.checked)} />
            On scholarship (athletes need this to borrow)
          </label>
        )}
        {form.kind !== 'ATHLETE' && (
          <label className="check">
            <input type="checkbox" checked={form.staffActive} onChange={(e) => set('staffActive', e.target.checked)} />
            Active staff (can borrow tech, never books)
          </label>
        )}
        {form.kind === 'ATHLETE' && (
          <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 0 }}>
            <legend className="small medium secondary" style={{ marginBottom: 6 }}>
              Terms. An athlete can borrow only in a term they are tagged for.
            </legend>
            {terms.data?.length === 0 && <span className="muted">No terms yet. Add one on the Terms screen.</span>}
            {terms.data?.map((t) => (
              <label key={t.id} className="check">
                <input
                  type="checkbox"
                  checked={form.termCodes.includes(t.code)}
                  onChange={(e) => set('termCodes', e.target.checked ? [...form.termCodes, t.code] : form.termCodes.filter((c) => c !== t.code))}
                />
                {t.code}
                {t.isCurrent && <span className="pill ok">Current</span>}
              </label>
            ))}
          </fieldset>
        )}
        <ErrorText error={save.error instanceof ApiError ? save.error : null} />
        <div className="row">
          <button type="submit" className="btn primary" disabled={save.isPending}>
            {editing ? 'Save changes' : 'Add person'}
          </button>
          <Link className="btn" to={editing ? `/people/${id}` : '/people'}>
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
