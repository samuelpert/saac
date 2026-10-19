import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { bookInputSchema, checkIsbn, COPY_CONDITIONS, type BookDetail, type CopyRow, type IsbnLookupResult } from '@saac/shared';
import { apiGet, apiSend } from '../api/client';
import { ItemStatePill, TagLink } from '../components/ItemBits';
import { PersonName } from '../components/PersonCard';
import { Dialog, EmptyState, ErrorText, Feedback, Field, Loading, PageHead } from '../components/ui';
import { fmtDate, fmtNumber, plural } from '../lib/format';

interface BookForm {
  isbn: string;
  title: string;
  author: string;
  edition: string;
  publisher: string;
  publishedYear: string;
  notes: string;
}

const emptyForm: BookForm = { isbn: '', title: '', author: '', edition: '', publisher: '', publishedYear: '', notes: '' };

/** Add a title: type or scan the ISBN, look it up, check the details, save. Works offline by typing the details. */
export function BookNew() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState<BookForm>(emptyForm);
  const [lookup, setLookup] = useState<IsbnLookupResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const look = useMutation({
    mutationFn: (isbn: string) => apiGet<IsbnLookupResult>(`/api/books/lookup/${encodeURIComponent(isbn)}`),
    onSuccess: (r) => {
      setLookup(r);
      setForm((f) => ({
        ...f,
        isbn: r.isbn,
        ...(r.details && !r.existingBookId
          ? { title: r.details.title, author: r.details.author ?? '', publisher: r.details.publisher ?? '', publishedYear: r.details.publishedYear ?? '' }
          : {}),
      }));
    },
  });
  const save = useMutation({
    mutationFn: (body: unknown) => apiSend<{ id: string }>('POST', '/api/books', body),
    onSuccess: (b) => {
      void qc.invalidateQueries({ queryKey: ['inventory-books'] });
      navigate(`/admin/inventory/books/${b.id}`);
    },
  });

  function runLookup() {
    const c = checkIsbn(form.isbn);
    if (!c.ok) return setError(new Error(c.reason));
    setError(null);
    look.mutate(c.isbn);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = bookInputSchema.safeParse(form);
    if (!parsed.success) return setError(new Error(parsed.error.issues[0]?.message));
    const c = checkIsbn(form.isbn);
    if (!c.ok) return setError(new Error(c.reason));
    setError(null);
    save.mutate(form);
  }

  return (
    <>
      <PageHead title="Add a book title" sub="One title per ISBN. Add its copies on the next screen." actions={<Link className="btn" to="/admin/inventory?tab=books">Back to books</Link>} />
      <form className="card" style={{ maxWidth: 720 }} onSubmit={submit} noValidate>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Field label="ISBN" hint="10 or 13 digits, dashes are fine. A 10-digit ISBN is stored as 13 digits.">
              <input
                className="input num"
                autoFocus
                value={form.isbn}
                onChange={(e) => {
                  setForm({ ...form, isbn: e.target.value });
                  setLookup(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    runLookup();
                  }
                }}
              />
            </Field>
          </div>
          <button type="button" className="btn" style={{ marginBottom: 22 }} disabled={look.isPending || !form.isbn.trim()} onClick={runLookup}>
            {look.isPending ? 'Looking up…' : 'Look up'}
          </button>
        </div>
        {lookup?.existingBookId && (
          <Feedback fb={{ tone: 'info', word: 'Already in the catalog', text: lookup.details?.title ?? '', action: { label: 'Open it', href: `/admin/inventory/books/${lookup.existingBookId}` } }} />
        )}
        {lookup && !lookup.existingBookId && lookup.found && <Feedback fb={{ tone: 'ok', word: 'Found', text: 'Details filled in from Open Library. Check them, then save.' }} />}
        {lookup && !lookup.found && lookup.source === 'openlibrary' && <Feedback fb={{ tone: 'warn', word: 'Not found', text: 'Open Library does not know this ISBN. Type the details.' }} />}
        {lookup && (lookup.source === 'offline' || lookup.source === 'disabled') && (
          <Feedback fb={{ tone: 'info', word: 'Offline', text: 'Open Library could not be reached. Type the details; nothing else needs the network.' }} />
        )}
        <BookFields form={form} setForm={setForm} />
        <ErrorText error={error ?? look.error ?? save.error} />
        <div className="row">
          <button type="submit" className="btn primary" disabled={save.isPending || Boolean(lookup?.existingBookId)}>
            Save title
          </button>
        </div>
      </form>
    </>
  );
}

function BookFields({ form, setForm }: { form: BookForm; setForm: (f: BookForm) => void }) {
  const set = (k: keyof BookForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
      <div style={{ gridColumn: '1 / -1' }}>
        <Field label="Title">
          <input className="input" style={{ width: '100%' }} value={form.title} onChange={set('title')} />
        </Field>
      </div>
      <Field label="Author">
        <input className="input" value={form.author} onChange={set('author')} />
      </Field>
      <Field label="Edition">
        <input className="input" value={form.edition} onChange={set('edition')} />
      </Field>
      <Field label="Publisher">
        <input className="input" value={form.publisher} onChange={set('publisher')} />
      </Field>
      <Field label="Year">
        <input className="input num" value={form.publishedYear} onChange={set('publishedYear')} />
      </Field>
      <div style={{ gridColumn: '1 / -1' }}>
        <Field label="Notes (optional)">
          <input className="input" style={{ width: '100%' }} value={form.notes} onChange={set('notes')} />
        </Field>
      </div>
    </div>
  );
}

type CopyDialog = { kind: 'add' } | { kind: 'edit'; copy: CopyRow } | { kind: 'retire'; copy: CopyRow } | { kind: 'details' } | null;

/** One title: its details and every copy SAAC owns, with who has each. */
export function BookTitle() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<CopyDialog>(null);
  const q = useQuery({ queryKey: ['book', id], queryFn: () => apiGet<BookDetail>(`/api/books/${id}`) });
  const restore = useMutation({
    mutationFn: (copyId: string) => apiSend('POST', `/api/copies/${copyId}/restore`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['book', id] }),
  });
  if (q.isLoading) return <Loading />;
  if (!q.data) return <ErrorText error={q.error} />;
  const b = q.data;
  const close = () => setDialog(null);
  const c = b.counts;

  return (
    <>
      <PageHead
        title={b.title}
        sub={[b.author, b.edition && `${b.edition} ed.`, `ISBN ${b.isbn}`].filter(Boolean).join(' · ')}
        actions={
          <>
            <Link className="btn" to="/admin/inventory?tab=books">
              All books
            </Link>
            <button type="button" className="btn" onClick={() => setDialog({ kind: 'details' })}>
              Edit details
            </button>
          </>
        }
      />
      <section className="card">
        <div className="card-head">
          <h2>Copies · {fmtNumber(c.total)}</h2>
          <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'add' })}>
            Add copies
          </button>
        </div>
        <div className="chips">
          {(
            [
              ['Available', c.available],
              ['Assigned', c.assigned],
              ['Out', c.out],
              ['Retired', c.retired],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="chip sm">
              <span className="label">{label}</span>
              <span className="value">{fmtNumber(value)}</span>
            </div>
          ))}
        </div>
        <ErrorText error={restore.error} />
        {b.copies.length === 0 ? (
          <EmptyState action={<button type="button" className="btn primary" onClick={() => setDialog({ kind: 'add' })}>Add copies</button>}>
            SAAC owns no copies of this title yet.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Copy</th>
                  <th>State</th>
                  <th>With</th>
                  <th>Condition</th>
                  <th>Notes</th>
                  <th>Added</th>
                  <th className="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {b.copies.map((cp) => (
                  <tr key={cp.id}>
                    <td className="tag">
                      <TagLink kind="book" id={cp.id} tag={cp.copyTag} />
                    </td>
                    <td>
                      <ItemStatePill state={cp.state} pastDue={cp.pastDue} />
                    </td>
                    <td>
                      {cp.holder ? (
                        <span className="stack" style={{ gap: 0 }}>
                          <PersonName person={cp.holder} />
                          <span className={`xsmall ${cp.pastDue ? 'danger-text' : 'muted'}`}>due {fmtDate(cp.dueDate!, { month: 'short', day: 'numeric' })}</span>
                        </span>
                      ) : cp.assignedTo ? (
                        <span className="stack" style={{ gap: 0 }}>
                          <PersonName person={cp.assignedTo} />
                          <span className="xsmall muted">reserved</span>
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{cp.condition ?? <span className="muted">—</span>}</td>
                    <td className="small secondary">{cp.notes}</td>
                    <td className="num">{fmtDate(cp.acquiredAt)}</td>
                    <td className="actions">
                      {cp.state === 'RETIRED' ? (
                        <button type="button" className="btn tertiary" onClick={() => restore.mutate(cp.id)}>
                          Restore
                        </button>
                      ) : (
                        <>
                          <button type="button" className="btn tertiary" onClick={() => setDialog({ kind: 'edit', copy: cp })}>
                            Edit
                          </button>
                          <button type="button" className="btn tertiary" onClick={() => setDialog({ kind: 'retire', copy: cp })}>
                            Retire
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {dialog?.kind === 'add' && <AddCopies bookId={b.id} onClose={close} />}
      {dialog?.kind === 'edit' && <EditCopy bookId={b.id} copy={dialog.copy} onClose={close} />}
      {dialog?.kind === 'retire' && <RetireCopy bookId={b.id} copy={dialog.copy} onClose={close} />}
      {dialog?.kind === 'details' && <EditDetails book={b} onClose={close} />}
    </>
  );
}

function useBookMutation<T, R = unknown>(bookId: string, fn: (body: T) => Promise<R>, onDone: (saved: R) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ['book', bookId] });
      void qc.invalidateQueries({ queryKey: ['inventory-books'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      onDone(saved);
    },
  });
}

function AddCopies({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  const [count, setCount] = useState('1');
  const [condition, setCondition] = useState<string>('New');
  const save = useBookMutation(bookId, () => apiSend('POST', `/api/books/${bookId}/copies`, { count: Number(count), condition }), onClose);
  const n = Number(count) || 0;
  return (
    <Dialog title="Add copies" onClose={onClose}>
      <p className="secondary">Books need no labels: at the desk a copy is found by the ISBN barcode on its cover. Each copy is still counted on its own, so the app knows how many are on the shelf.</p>
      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Field label="How many">
          <input className="input num" inputMode="numeric" autoFocus value={count} onChange={(e) => setCount(e.target.value)} />
        </Field>
        <Field label="Condition">
          <select className="select" value={condition} onChange={(e) => setCondition(e.target.value)}>
            {COPY_CONDITIONS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <ErrorText error={save.error} />
      <div className="actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={save.isPending || n < 1} onClick={() => save.mutate(undefined)}>
          Add {n > 0 ? plural(n, 'copy', 'copies') : 'copies'}
        </button>
      </div>
    </Dialog>
  );
}

function EditCopy({ bookId, copy, onClose }: { bookId: string; copy: CopyRow; onClose: () => void }) {
  const [condition, setCondition] = useState(copy.condition ?? 'Good');
  const [notes, setNotes] = useState(copy.notes ?? '');
  const save = useBookMutation(bookId, () => apiSend('PUT', `/api/copies/${copy.id}`, { condition, notes }), onClose);
  return (
    <Dialog title={`Copy ${copy.copyTag}`} onClose={onClose}>
      <Field label="Condition">
        <select className="select" value={condition} onChange={(e) => setCondition(e.target.value)}>
          {COPY_CONDITIONS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Notes" hint="e.g. highlighting in chapter 2">
        <input className="input" autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorText error={save.error} />
      <div className="actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={save.isPending} onClick={() => save.mutate(undefined)}>
          Save
        </button>
      </div>
    </Dialog>
  );
}

function RetireCopy({ bookId, copy, onClose }: { bookId: string; copy: CopyRow; onClose: () => void }) {
  const [note, setNote] = useState('');
  const save = useBookMutation(bookId, () => apiSend('POST', `/api/copies/${copy.id}/retire`, { note }), onClose);
  return (
    <Dialog title={`Retire copy ${copy.copyTag}?`} onClose={onClose}>
      <p className="secondary">A retired copy is never lent again, but its history stays. You can restore it later.</p>
      <Field label="Why (optional)" hint="e.g. lost, water damage">
        <input className="input" autoFocus value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ErrorText error={save.error} />
      <div className="actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn destructive" disabled={save.isPending} onClick={() => save.mutate(undefined)}>
          Retire
        </button>
      </div>
    </Dialog>
  );
}

function EditDetails({ book, onClose }: { book: BookDetail; onClose: () => void }) {
  const [form, setForm] = useState<BookForm>({
    isbn: book.isbn,
    title: book.title,
    author: book.author ?? '',
    edition: book.edition ?? '',
    publisher: book.publisher ?? '',
    publishedYear: book.publishedYear ?? '',
    notes: book.notes ?? '',
  });
  const [error, setError] = useState<unknown>(null);
  const save = useBookMutation(book.id, (body: unknown) => apiSend('PUT', `/api/books/${book.id}`, body), onClose);
  return (
    <Dialog title="Edit title details" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const c = checkIsbn(form.isbn);
          if (!c.ok) return setError(new Error(c.reason));
          setError(null);
          save.mutate(form);
        }}
      >
        <Field label="ISBN">
          <input className="input num" value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
        </Field>
        <BookFields form={form} setForm={setForm} />
        <ErrorText error={error ?? save.error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={save.isPending}>
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
