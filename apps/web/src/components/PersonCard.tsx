import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Copy, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Eligibility } from '@saac/shared';
import { copyText } from '../lib/clipboard';
import { EligibilityPill } from './ui';

/** What the card needs. Lists pass what they already have; nothing is fetched. */
export interface CardPerson {
  id: string;
  pid: string;
  firstName: string;
  lastName: string;
  team?: string | null;
  eligibility?: Eligibility | null;
  eligibilityTerm?: string | null;
}

interface Open {
  person: CardPerson;
  anchor: HTMLElement;
}

const CardContext = createContext<(person: CardPerson, anchor: HTMLElement) => void>(() => undefined);

/** One card at a time, for the whole app. */
export function PersonCardProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const show = useCallback((person: CardPerson, anchor: HTMLElement) => setOpen({ person, anchor }), []);
  return (
    <CardContext.Provider value={show}>
      {children}
      {open && <PersonCard key={open.person.id} {...open} onClose={() => setOpen(null)} />}
    </CardContext.Provider>
  );
}

/** A student's name that opens their card. Use it wherever a list shows a person. */
export function PersonName({ person, children }: { person: CardPerson; children?: ReactNode }) {
  const show = useContext(CardContext);
  return (
    <button type="button" className="linkish person-name" aria-haspopup="dialog" onClick={(e) => show(person, e.currentTarget)}>
      {children ?? `${person.lastName}, ${person.firstName}`}
    </button>
  );
}

const CARD_WIDTH = 320;
const GAP = 8;

function PersonCard({ person, anchor, onClose }: Open & { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Place the card under the name, or above it when there is no room below, inside the window.
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 260;
    const below = r.bottom + GAP + h <= window.innerHeight;
    const top = below ? r.bottom + GAP : Math.max(GAP, r.top - GAP - h);
    const left = Math.min(Math.max(GAP, r.left), window.innerWidth - CARD_WIDTH - GAP);
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      anchor.focus();
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={ref}
      className="person-card"
      role="dialog"
      aria-label={`${person.firstName} ${person.lastName}`}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: CARD_WIDTH }}
    >
      <div className="person-card-head">
        <div className="photo" aria-label="No photo">
          <UserRound size={32} strokeWidth={1.5} aria-hidden="true" />
        </div>
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <span className="strong">
            {person.firstName} {person.lastName}
          </span>
          {person.team && <span className="small secondary">{person.team}</span>}
          {person.eligibility && <EligibilityPill status={person.eligibility} term={person.eligibilityTerm} />}
        </div>
      </div>
      <dl className="person-card-fields">
        <CopyField label="First name" value={person.firstName} />
        <CopyField label="Last name" value={person.lastName} />
        <CopyField label="Panther ID" value={person.pid} numeric />
      </dl>
      <Link className="small medium" to={`/people/${person.id}`} onClick={onClose}>
        Open person page ›
      </Link>
    </div>
  );
}

function CopyField({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="copy-field">
      <dt>{label}</dt>
      <dd className={numeric ? 'num' : undefined}>{value}</dd>
      <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
    </div>
  );
}

/** A small button that copies one value and says "Copied" for a moment. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);
  return (
    <button type="button" className="copy-button" aria-label={label} title={label} onClick={async () => setCopied(await copyText(value))}>
      {copied ? <Check size={16} strokeWidth={1.75} aria-hidden="true" /> : <Copy size={16} strokeWidth={1.75} aria-hidden="true" />}
      <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
