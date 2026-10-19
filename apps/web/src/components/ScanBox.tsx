import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BorrowerDetail, BorrowerSummary, ItemHistory, ItemMatch, SearchResponse } from '@saac/shared';
import { apiGet } from '../api/client';
import { useIsAdmin } from '../auth/AuthContext';
import { beep } from '../lib/beep';
import { fmtDate } from '../lib/format';
import { ItemStatePill, TagLink } from './ItemBits';
import { CopyButton, PersonName } from './PersonCard';
import { EligibilityPill, EmptyState, Feedback, Glyph, type FeedbackMessage } from './ui';

type Selected = { kind: 'person'; id: string } | { kind: 'item'; item: ItemMatch } | null;

/** What a scanned label looks like: one word of letters and digits, such as SAACLAPTOP942 or C-00012. */
const looksLikeBarcode = (q: string) => /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(q) && /\d/.test(q) && /[A-Za-z]/.test(q);

/**
 * The one search on Home. A Panther ID or a name finds a student and shows what they hold.
 * A tech tag ("SAACLAPTOP942", "laptop942") or a book copy tag finds the item and shows
 * who has it and its history. A barcode scanner types like a keyboard and presses Enter,
 * so Enter submits, feedback shows at once, and focus stays in the field.
 */
export function ScanBox({ term }: { term?: string }) {
  const isAdmin = useIsAdmin();
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [fb, setFb] = useState<FeedbackMessage | null>(null);
  const [people, setPeople] = useState<BorrowerSummary[]>([]);
  const [items, setItems] = useState<ItemMatch[]>([]);
  const [selected, setSelected] = useState<Selected>(null);

  useEffect(() => ref.current?.focus(), []);

  function clear() {
    setFb(null);
    setPeople([]);
    setItems([]);
    setSelected(null);
  }

  async function run(raw: string) {
    const q = raw.trim();
    clear();
    if (!q) return;
    const termQs = term ? `&term=${term}` : '';
    let r: SearchResponse;
    let found: ItemMatch[];
    try {
      // Digits are a Panther ID; anything else may be a person or an item, so ask for both.
      const digitsOnly = /^\d+$/.test(q);
      [r, found] = await Promise.all([
        apiGet<SearchResponse>(`/api/borrowers/search?q=${encodeURIComponent(q)}${termQs}`),
        digitsOnly ? Promise.resolve([]) : apiGet<ItemMatch[]>(`/api/items/lookup?q=${encodeURIComponent(q)}`),
      ]);
    } catch {
      setFb({ tone: 'err', word: 'Search failed', text: 'The server did not answer. Try again.' });
      beep('err');
      return;
    }

    const one = r.matches[0];
    if (r.kind === 'pid-short') {
      setFb({
        tone: 'warn',
        word: 'Check PID',
        text: `Panther IDs have 7 digits. Did you mean ${r.suggestedPid}?`,
        action: one ? { label: `Show ${r.suggestedPid}`, onClick: () => void submit(r.suggestedPid!) } : undefined,
      });
      beep('warn');
      return;
    }
    if (r.kind === 'pid' && !one) {
      setFb({ tone: 'err', word: 'Not found', text: `No student has Panther ID ${q}.`, action: isAdmin ? { label: 'Add person', href: `/people/new?pid=${q}` } : undefined });
      beep('err');
      return;
    }
    if (r.matches.length === 1 && found.length === 0) {
      setSelected({ kind: 'person', id: one!.id });
      beep(one!.eligibility === 'ELIGIBLE' || one!.eligibility === 'TECH_ONLY' ? 'ok' : 'warn');
      return;
    }
    if (found.length === 1 && r.matches.length === 0) {
      setSelected({ kind: 'item', item: found[0]! });
      beep('ok');
      return;
    }
    if (r.matches.length === 0 && found.length === 0) {
      // An unknown label never offers to register an item; the scan is just tried again.
      setFb(looksLikeBarcode(q) ? { tone: 'err', word: 'Not found', text: 'Barcode not recognized. Please try again.' } : { tone: 'err', word: 'Not found', text: `No student or item matches “${q}”.` });
      beep('err');
      return;
    }
    setPeople(r.matches.slice(0, 8));
    setItems(found);
    const parts = [r.matches.length && `${r.matches.length === 20 ? '20+' : r.matches.length} ${r.matches.length === 1 ? 'person' : 'people'}`, found.length && `${found.length} ${found.length === 1 ? 'item' : 'items'}`].filter(Boolean);
    setFb({
      tone: 'ok',
      word: parts.join(' · '),
      text: `matching “${q}”. Pick one.`,
      action: r.matches.length > 8 ? { label: 'See all people', href: `/people?q=${encodeURIComponent(q)}` } : undefined,
    });
    beep('ok');
  }

  async function submit(q: string) {
    setValue(q);
    await run(q);
    // Keep focus and select the text, so the next scan replaces it instead of adding to it.
    ref.current?.focus();
    ref.current?.select();
  }

  return (
    <>
      <div className="scan">
        <Search size={18} strokeWidth={1.75} aria-hidden="true" />
        <input
          ref={ref}
          value={value}
          aria-label="Search students and items"
          placeholder="Type a Panther ID, a name, or a tech tag, then press Enter"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit(value);
            } else if (e.key === 'Escape') {
              clear();
              setValue('');
            }
          }}
        />
      </div>
      {(fb || selected) && (
        <div className="stack" style={{ flexBasis: '100%' }}>
          {fb && <Feedback fb={fb} />}
          {(people.length > 0 || items.length > 0) && (
            <div className="results" aria-label="Matches">
              {people.map((m) => (
                <div key={m.id} className="result-row">
                  <span className="num secondary">{m.pid}</span>
                  <PersonName person={{ ...m, team: m.team?.name ?? null }} />
                  <span className="muted small">{m.team?.name ?? ''}</span>
                  <span className="spacer" />
                  <EligibilityPill status={m.eligibility} term={m.eligibilityTerm} />
                  <button type="button" className="btn tertiary small" onClick={() => setSelected({ kind: 'person', id: m.id })}>
                    Show items ›
                  </button>
                </div>
              ))}
              {items.map((it) => (
                <div key={`${it.kind}-${it.id}`} className="result-row">
                  <TagLink kind={it.kind} id={it.id} tag={it.tag} />
                  {it.kind === 'book' && <span className="medium">{it.name}</span>}
                  <span className="muted small">{it.typeName}</span>
                  <span className="spacer" />
                  <ItemStatePill state={it.state} pastDue={it.pastDue} />
                  <button type="button" className="btn tertiary small" onClick={() => setSelected({ kind: 'item', item: it })}>
                    Show ›
                  </button>
                </div>
              ))}
            </div>
          )}
          {selected?.kind === 'person' && <PersonPanel id={selected.id} />}
          {selected?.kind === 'item' && <ItemPanel item={selected.item} />}
        </div>
      )}
    </>
  );
}

/** A student and everything they hold now, books and tech. */
function PersonPanel({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['borrower', id], queryFn: () => apiGet<BorrowerDetail>(`/api/borrowers/${id}`) });
  const p = q.data;
  if (!p) return <section className="card">{q.isError ? 'This person could not load.' : 'Loading…'}</section>;
  return (
    <section className="card" aria-label="Student">
      <div className="card-head">
        <div className="stack" style={{ gap: 2 }}>
          <h2>
            {p.firstName} {p.lastName}
          </h2>
          <span className="row small secondary" style={{ gap: 'var(--space-2)' }}>
            <span className="num">Panther ID {p.pid}</span>
            <CopyButton value={p.pid} label="Copy Panther ID" />
            {p.team && <span>· {p.team.name}</span>}
            <EligibilityPill status={p.eligibility} term={p.eligibilityTerm} />
          </span>
        </div>
        <div className="row">
          <Link className="btn" to="/check-out">
            Check out
          </Link>
          <Link className="btn" to="/check-in">
            Check in
          </Link>
          <Link to={`/people/${p.id}`}>Person page ›</Link>
        </div>
      </div>
      {p.holding.length === 0 ? (
        <EmptyState>Nothing out right now.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Holding now</th>
                <th>Type</th>
                <th>Term</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {p.holding.map((h) => (
                <tr key={h.id}>
                  <td>
                    <TagLink kind={h.kind} id={h.itemId} tag={h.tag} />
                    {h.kind === 'book' && <div className="small">{h.label}</div>}
                  </td>
                  <td>{h.kind === 'book' ? 'Book' : h.typeName}</td>
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
  );
}

/** An item: who has it now and its latest checkouts. */
function ItemPanel({ item }: { item: ItemMatch }) {
  const q = useQuery({ queryKey: ['item', item.kind, item.id], queryFn: () => apiGet<ItemHistory>(`/api/items/${item.kind}/${item.id}`) });
  const h = q.data;
  return (
    <section className="card" aria-label="Item">
      <div className="card-head">
        <div className="stack" style={{ gap: 2 }}>
          <h2>{item.kind === 'book' ? item.name : item.tag}</h2>
          <span className="row small secondary" style={{ gap: 'var(--space-2)' }}>
            {item.kind === 'book' && <span className="num">{item.tag} ·</span>}
            <span>{item.typeName}</span>
            <ItemStatePill state={item.state} pastDue={item.pastDue} />
          </span>
        </div>
        <Link to={`/items/${item.kind}/${item.id}`}>Full history ›</Link>
      </div>
      {item.holder ? (
        <p>
          With <PersonName person={item.holder} /> <span className="num secondary">· {item.holder.pid}</span>
          {item.dueDate && <span className={item.pastDue ? 'danger-text' : 'secondary'}> · due {fmtDate(item.dueDate)}</span>}
        </p>
      ) : (
        <p className="secondary">Nobody has it right now.</p>
      )}
      {h && h.loans.length > 0 && <HistoryTable loans={h.loans.slice(0, 5)} />}
      {h && h.loans.length === 0 && <EmptyState>Never checked out.</EmptyState>}
    </section>
  );
}

export function HistoryTable({ loans }: { loans: ItemHistory['loans'] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Person</th>
            <th>Panther ID</th>
            <th>Term</th>
            <th>Out</th>
            <th>Due</th>
            <th>Back</th>
            <th>Condition</th>
          </tr>
        </thead>
        <tbody>
          {loans.map((l) => (
            <tr key={l.id}>
              <td>
                <PersonName person={l.borrower} />
              </td>
              <td className="pid">{l.borrower.pid}</td>
              <td>{l.termCode}</td>
              <td className="num">{fmtDate(l.checkedOutAt)}</td>
              <td className="num">{fmtDate(l.dueDate)}</td>
              <td className="num">
                {l.closedAt ? (
                  `${l.outcome === 'NOT_FOR_RETURN' ? 'Not for return · ' : ''}${fmtDate(l.closedAt)}`
                ) : (
                  <span className="pill warn">Still out</span>
                )}
              </td>
              <td className="small secondary">{[l.conditionOut && `Out: ${l.conditionOut}`, l.conditionIn && `In: ${l.conditionIn}`, l.notes].filter(Boolean).join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
