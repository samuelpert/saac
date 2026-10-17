import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { BorrowerSummary, SearchResponse } from '@saac/shared';
import { apiGet } from '../api/client';
import { useIsAdmin } from '../auth/AuthContext';
import { beep } from '../lib/beep';
import { EligibilityPill, Feedback, type FeedbackMessage } from './ui';

/**
 * The scan or search field. A barcode scanner types like a keyboard and presses Enter,
 * so Enter submits, feedback shows at once, and focus stays in the field.
 */
export function ScanBox({ term }: { term?: string }) {
  const isAdmin = useIsAdmin();
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [fb, setFb] = useState<FeedbackMessage | null>(null);
  const [matches, setMatches] = useState<BorrowerSummary[]>([]);

  useEffect(() => ref.current?.focus(), []);

  async function run(raw: string) {
    const q = raw.trim();
    if (!q) return;
    let r: SearchResponse;
    try {
      r = await apiGet<SearchResponse>(`/api/borrowers/search?q=${encodeURIComponent(q)}${term ? `&term=${term}` : ''}`);
    } catch {
      setFb({ tone: 'err', word: 'Search failed', text: 'The server did not answer. Try again.' });
      beep('err');
      return;
    }
    let next: FeedbackMessage;
    let list: BorrowerSummary[] = [];
    const one = r.matches[0];
    switch (r.kind) {
      case 'pid':
        next = one
          ? {
              tone: one.eligibility === 'ELIGIBLE' ? 'ok' : 'warn',
              word: one.eligibility === 'ELIGIBLE' ? 'Found' : one.eligibility === 'NO_SCHOLARSHIP' ? 'Not on scholarship' : `Not in ${one.eligibilityTerm ?? 'this term'}`,
              text: `PID ${one.pid} · ${one.firstName} ${one.lastName}${one.eligibility === 'ELIGIBLE' ? ` · can borrow in ${one.eligibilityTerm}` : ''}`,
              action: { label: 'Open person page', href: `/people/${one.id}` },
            }
          : { tone: 'err', word: 'Not found', text: `No person has PID ${q}.`, action: isAdmin ? { label: 'Add person', href: `/people/new?pid=${q}` } : undefined };
        break;
      case 'pid-short':
        next = {
          tone: 'warn',
          word: 'Check PID',
          text: `PIDs have 7 digits. Did you mean ${r.suggestedPid}?${one ? ` That is ${one.firstName} ${one.lastName}.` : ''}`,
          action: one ? { label: 'Open person page', href: `/people/${one.id}` } : { label: `Search ${r.suggestedPid}`, onClick: () => void submit(r.suggestedPid!) },
        };
        break;
      case 'digits':
        list = r.matches;
        next = list.length
          ? { tone: 'info', word: `${list.length} PIDs start with ${q}`, text: 'Keep typing, or pick a person below.' }
          : { tone: 'err', word: 'Not found', text: `“${q}” is not a PID or a known tag.` };
        break;
      case 'tag':
        next = { tone: 'info', word: 'Tags not ready', text: 'Item and copy tags work once the barcode step is done.' };
        break;
      case 'name':
        list = r.matches;
        next = list.length
          ? { tone: 'ok', word: `${list.length === 20 ? '20+' : list.length} ${list.length === 1 ? 'match' : 'matches'}`, text: `People matching “${q}”`, action: { label: 'See all results', href: `/people?q=${encodeURIComponent(q)}&active=all` } }
          : { tone: 'err', word: 'Not found', text: `Nobody matches “${q}”.` };
        break;
      default:
        return;
    }
    setFb(next);
    setMatches(list.slice(0, 8));
    beep(next.tone);
  }

  async function submit(q: string) {
    setValue(q);
    await run(q);
    ref.current?.focus();
  }

  return (
    <>
      <div className="scan">
        <Search size={18} strokeWidth={1.75} aria-hidden="true" />
        <input
          ref={ref}
          value={value}
          aria-label="Scan or search"
          placeholder="Scan a tag, or type a PID or name, then press Enter"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit(value);
            } else if (e.key === 'Escape') {
              setFb(null);
              setMatches([]);
              setValue('');
            }
          }}
        />
      </div>
      {fb && (
        <div className="stack" style={{ flexBasis: '100%' }}>
          <Feedback fb={fb} />
          {matches.length > 0 && (
            <div className="results" aria-label="Matching people">
              {matches.map((m) => (
                <Link key={m.id} to={`/people/${m.id}`}>
                  <span className="num secondary">{m.pid}</span>
                  <span className="medium">
                    {m.lastName}, {m.firstName}
                  </span>
                  <span className="muted small">{m.team?.name ?? ''}</span>
                  <span className="spacer" />
                  <EligibilityPill status={m.eligibility} term={m.eligibilityTerm} />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
