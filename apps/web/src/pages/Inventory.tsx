import { useState, type FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  bulkItems,
  itemBulkInputSchema,
  itemInputSchema,
  type BookListResponse,
  type InventoryItemRow,
  type ItemState,
  type ItemTypeRow,
} from '@saac/shared';
import { apiGet, apiSend } from '../api/client';
import { ItemStatePill, TagLink } from '../components/ItemBits';
import { PersonName } from '../components/PersonCard';
import { Dialog, EmptyState, ErrorText, Field, PageHead } from '../components/ui';
import { fmtDate, fmtNumber, plural } from '../lib/format';

/** Admin only. Tech items and book titles. Nothing is ever deleted: items and copies are retired. */
export function Inventory() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'books' ? 'books' : 'tech';
  return (
    <>
      <PageHead title="Inventory" sub="Every laptop, charger and book SAAC owns. Labels come with the barcode step." />
      <div className="tabs" role="tablist">
        {(
          [
            ['tech', 'Tech'],
            ['books', 'Books'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParams({ tab: key })}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'tech' ? <TechTab /> : <BooksTab />}
    </>
  );
}

// ---- Tech ---------------------------------------------------------------------------------

type Dialogs = { kind: 'add' } | { kind: 'bulk' } | { kind: 'types' } | { kind: 'edit'; item: InventoryItemRow } | { kind: 'status'; item: InventoryItemRow } | { kind: 'retire'; item: InventoryItemRow } | null;

function TechTab() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [typeId, setTypeId] = useState('');
  const [state, setState] = useState<'' | ItemState>('');
  const [dialog, setDialog] = useState<Dialogs>(null);
  const types = useQuery({ queryKey: ['item-types'], queryFn: () => apiGet<ItemTypeRow[]>('/api/item-types') });
  const items = useQuery({
    queryKey: ['inventory-items', q, typeId, state],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q.trim()) p.set('q', q.trim());
      if (typeId) p.set('typeId', typeId);
      if (state) p.set('state', state);
      return apiGet<InventoryItemRow[]>(`/api/items?${p}`);
    },
    placeholderData: keepPreviousData,
  });
  const restore = useMutation({
    mutationFn: (id: string) => apiSend('POST', `/api/items/${id}/restore`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['inventory-items'] }),
  });
  const close = () => setDialog(null);
  const rows = items.data ?? [];

  return (
    <section className="card">
      <div className="row">
        <div className="search-input">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by tag or name" aria-label="Search tech" />
        </div>
        <select className="select" aria-label="Type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">Every type</option>
          {types.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select className="select" aria-label="State" value={state} onChange={(e) => setState(e.target.value as '' | ItemState)}>
          <option value="">Any state</option>
          <option value="AVAILABLE">Available</option>
          <option value="OUT">Out</option>
          <option value="IN_REPAIR">In repair</option>
          <option value="SURPLUS">Surplus</option>
          <option value="RETIRED">Retired</option>
        </select>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => setDialog({ kind: 'types' })}>
          Types
        </button>
        <button type="button" className="btn" onClick={() => setDialog({ kind: 'bulk' })}>
          Add several
        </button>
        <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'add' })}>
          Add item
        </button>
      </div>
      <ErrorText error={items.error ?? restore.error} />
      {items.data && <span className="small muted num">{plural(rows.length, 'item')}</span>}
      {items.data && rows.length === 0 ? (
        <EmptyState action={<button type="button" className="btn primary" onClick={() => setDialog({ kind: 'add' })}>Add item</button>}>
          No tech items match.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Name</th>
                <th>Type</th>
                <th>State</th>
                <th>With</th>
                <th>Note</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td className="tag">
                    <TagLink kind="tech" id={i.id} tag={i.assetTag} />
                  </td>
                  <td>{i.name}</td>
                  <td>{i.typeName}</td>
                  <td>
                    <ItemStatePill state={i.state} pastDue={i.pastDue} />
                  </td>
                  <td>
                    {i.holder ? (
                      <span className="stack" style={{ gap: 0 }}>
                        <PersonName person={i.holder} />
                        <span className={`xsmall ${i.pastDue ? 'danger-text' : 'muted'}`}>due {fmtDate(i.dueDate!, { month: 'short', day: 'numeric' })}</span>
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="small secondary">{[i.statusNote, i.notes].filter(Boolean).join(' · ')}</td>
                  <td className="actions">
                    {i.state === 'RETIRED' ? (
                      <button type="button" className="btn tertiary" onClick={() => restore.mutate(i.id)}>
                        Restore
                      </button>
                    ) : (
                      <>
                        <button type="button" className="btn tertiary" onClick={() => setDialog({ kind: 'status', item: i })}>
                          Status
                        </button>
                        <button type="button" className="btn tertiary" onClick={() => setDialog({ kind: 'edit', item: i })}>
                          Edit
                        </button>
                        <button type="button" className="btn tertiary" onClick={() => setDialog({ kind: 'retire', item: i })}>
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
      {dialog?.kind === 'add' && <ItemForm types={types.data ?? []} onClose={close} />}
      {dialog?.kind === 'edit' && <ItemForm types={types.data ?? []} item={dialog.item} onClose={close} />}
      {dialog?.kind === 'bulk' && <BulkForm types={types.data ?? []} onClose={close} />}
      {dialog?.kind === 'types' && <TypesDialog types={types.data ?? []} onClose={close} />}
      {dialog?.kind === 'status' && <StatusDialog item={dialog.item} onClose={close} />}
      {dialog?.kind === 'retire' && <RetireDialog item={dialog.item} onClose={close} />}
    </section>
  );
}

function useInventoryMutation<T>(fn: (body: T) => Promise<unknown>, onClose: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inventory-items'] });
      void qc.invalidateQueries({ queryKey: ['item-types'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });
}

function ItemForm({ types, item, onClose }: { types: ItemTypeRow[]; item?: InventoryItemRow; onClose: () => void }) {
  const [form, setForm] = useState({ typeId: item?.typeId ?? types[0]?.id ?? '', name: item?.name ?? '', assetTag: item?.assetTag ?? '', notes: item?.notes ?? '' });
  const [error, setError] = useState<unknown>(null);
  const save = useInventoryMutation((body: unknown) => (item ? apiSend('PUT', `/api/items/${item.id}`, body) : apiSend('POST', '/api/items', body)), onClose);
  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = itemInputSchema.safeParse(form);
    if (!parsed.success) return setError(new Error(parsed.error.issues[0]?.message));
    setError(null);
    save.mutate(form);
  }
  return (
    <Dialog title={item ? `Edit ${item.assetTag}` : 'Add a tech item'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Type">
          <select className="select" value={form.typeId} onChange={(e) => setForm({ ...form, typeId: e.target.value })}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name" hint="e.g. SAAC Laptop 942">
          <input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Tag" hint="The number on the item's label, e.g. L-0942">
          <input className="input num" value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} />
        </Field>
        <Field label="Notes (optional)">
          <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <ErrorText error={error ?? save.error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={save.isPending}>
            {item ? 'Save' : 'Add item'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function BulkForm({ types, onClose }: { types: ItemTypeRow[]; onClose: () => void }) {
  const [form, setForm] = useState({ typeId: types[0]?.id ?? '', namePrefix: '', tagPrefix: '', first: '1', count: '10', digits: '3' });
  const [error, setError] = useState<unknown>(null);
  const save = useInventoryMutation((body: unknown) => apiSend('POST', '/api/items/bulk', body), onClose);
  const parsed = itemBulkInputSchema.safeParse(form);
  const preview = parsed.success ? bulkItems(parsed.data) : [];
  return (
    <Dialog title="Add several items" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!parsed.success) return setError(new Error(parsed.error.issues[0]?.message));
          setError(null);
          save.mutate(form);
        }}
      >
        <Field label="Type">
          <select className="select" value={form.typeId} onChange={(e) => setForm({ ...form, typeId: e.target.value })}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field label="Name" hint="e.g. SAAC Charger">
            <input className="input" autoFocus value={form.namePrefix} onChange={(e) => setForm({ ...form, namePrefix: e.target.value })} />
          </Field>
          <Field label="Tag starts with" hint="e.g. H-">
            <input className="input num" value={form.tagPrefix} onChange={(e) => setForm({ ...form, tagPrefix: e.target.value })} />
          </Field>
          <Field label="First number">
            <input className="input num" inputMode="numeric" value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} />
          </Field>
          <Field label="How many">
            <input className="input num" inputMode="numeric" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
          </Field>
        </div>
        <Field label="Digits in the tag number" hint="3 makes H-001; 4 makes H-0001">
          <input className="input num" inputMode="numeric" value={form.digits} onChange={(e) => setForm({ ...form, digits: e.target.value })} />
        </Field>
        {preview.length > 0 && (
          <p className="small secondary num">
            Adds {plural(preview.length, 'item')}: {preview[0]!.name} ({preview[0]!.assetTag})
            {preview.length > 1 && ` to ${preview.at(-1)!.name} (${preview.at(-1)!.assetTag})`}.
          </p>
        )}
        <ErrorText error={error ?? save.error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={save.isPending || !parsed.success}>
            Add {preview.length > 0 ? fmtNumber(preview.length) : ''} items
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function TypesDialog({ types, onClose }: { types: ItemTypeRow[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const add = useMutation({
    mutationFn: () => apiSend('POST', '/api/item-types', { name }),
    onSuccess: () => {
      setName('');
      void qc.invalidateQueries({ queryKey: ['item-types'] });
    },
  });
  return (
    <Dialog title="Tech types" onClose={onClose}>
      <ul className="stack" style={{ margin: 0, paddingLeft: 20, gap: 'var(--space-1)' }}>
        {types.map((t) => (
          <li key={t.id}>
            {t.name} <span className="muted small num">· {plural(t.itemCount, 'item')}</span>
          </li>
        ))}
      </ul>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <input className="input" style={{ flex: 1 }} placeholder="New type, e.g. Calculators" value={name} onChange={(e) => setName(e.target.value)} aria-label="New type" />
        <button type="submit" className="btn" disabled={!name.trim() || add.isPending}>
          Add type
        </button>
      </form>
      <ErrorText error={add.error} />
      <div className="actions">
        <button type="button" className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}

function StatusDialog({ item, onClose }: { item: InventoryItemRow; onClose: () => void }) {
  const current = item.state === 'IN_REPAIR' || item.state === 'SURPLUS' ? item.state : 'IN_SERVICE';
  const [status, setStatus] = useState<'IN_SERVICE' | 'IN_REPAIR' | 'SURPLUS'>(current);
  const [note, setNote] = useState(item.statusNote ?? '');
  const save = useInventoryMutation(() => apiSend('POST', `/api/items/${item.id}/status`, { status, note }), onClose);
  return (
    <Dialog title={`Status of ${item.assetTag}`} onClose={onClose}>
      {item.state === 'OUT' && <p className="secondary">This item is checked out. It must be checked in before it can go to repair or surplus.</p>}
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 0 }}>
        <legend className="visually-hidden">Status</legend>
        {(
          [
            ['IN_SERVICE', 'In service', 'Can be lent'],
            ['IN_REPAIR', 'In repair', 'Cannot be lent until it is back'],
            ['SURPLUS', 'Surplus', 'Kept but no longer lent'],
          ] as const
        ).map(([value, label, hint]) => (
          <label key={value} className="check">
            <input type="radio" name="status" checked={status === value} onChange={() => setStatus(value)} />
            <span>
              <span className="medium">{label}.</span> <span className="secondary">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {status !== 'IN_SERVICE' && (
        <Field label="Why" hint="e.g. broken screen">
          <input className="input" autoFocus value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      )}
      <ErrorText error={save.error} />
      <div className="actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={save.isPending} onClick={() => save.mutate(undefined)}>
          Save status
        </button>
      </div>
    </Dialog>
  );
}

function RetireDialog({ item, onClose }: { item: InventoryItemRow; onClose: () => void }) {
  const [note, setNote] = useState('');
  const save = useInventoryMutation(() => apiSend('POST', `/api/items/${item.id}/retire`, { note }), onClose);
  return (
    <Dialog title={`Retire ${item.assetTag}?`} onClose={onClose}>
      <p className="secondary">Retired items are never lent again, but their history stays. You can restore one later.</p>
      <Field label="Why (optional)" hint="e.g. lost, broken beyond repair">
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

// ---- Books --------------------------------------------------------------------------------

function BooksTab() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ['inventory-books', q, page],
    queryFn: () => apiGet<BookListResponse>(`/api/books?page=${page}&pageSize=50${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <section className="card">
      <div className="row">
        <div className="search-input">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          <input
            className="input"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search by title, author or ISBN"
            aria-label="Search books"
          />
        </div>
        <span className="spacer" />
        <Link className="btn primary" to="/admin/inventory/books/new">
          Add title
        </Link>
      </div>
      <ErrorText error={list.error} />
      {data && <span className="small muted num">{plural(data.total, 'title')}</span>}
      {data && data.rows.length === 0 ? (
        <EmptyState action={<Link className="btn primary" to="/admin/inventory/books/new">Add title</Link>}>No titles match.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>ISBN</th>
                <th>Author</th>
                <th>Ed.</th>
                <th className="n">Copies</th>
                <th className="n">Available</th>
                <th className="n">Assigned</th>
                <th className="n">Out</th>
                <th className="n">Retired</th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link to={`/admin/inventory/books/${b.id}`}>{b.title}</Link>
                  </td>
                  <td className="num">{b.isbn}</td>
                  <td>{b.author ?? <span className="muted">—</span>}</td>
                  <td>{b.edition ?? ''}</td>
                  <td className="n">{fmtNumber(b.total)}</td>
                  <td className="n">{fmtNumber(b.available)}</td>
                  <td className="n">{fmtNumber(b.assigned)}</td>
                  <td className="n">{fmtNumber(b.out)}</td>
                  <td className="n muted">{fmtNumber(b.retired)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && pages > 1 && (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <span className="small muted num">
            Page {page} of {pages}
          </span>
          <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <button type="button" className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      )}
    </section>
  );
}
