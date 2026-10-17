import { Link } from 'react-router-dom';
import type { ItemState } from '@saac/shared';
import type { Tone } from './ui';

const STATE: Record<ItemState, { tone: Tone | 'plain'; label: string }> = {
  AVAILABLE: { tone: 'ok', label: '✓ Available' },
  OUT: { tone: 'warn', label: 'Out' },
  ASSIGNED: { tone: 'info', label: 'Assigned to a student' },
  IN_REPAIR: { tone: 'warn', label: '! In repair' },
  SURPLUS: { tone: 'info', label: 'Surplus' },
  RETIRED: { tone: 'plain', label: 'Retired' },
};

/** An item's state in words, with past due called out. Never color alone. */
export function ItemStatePill({ state, pastDue }: { state: ItemState; pastDue?: boolean }) {
  if (state === 'OUT' && pastDue) return <span className="pill err">! Out · past due</span>;
  const s = STATE[state];
  return <span className={`pill${s.tone === 'plain' ? '' : ` ${s.tone}`}`}>{s.label}</span>;
}

/** A tag that opens the item's history page. */
export function TagLink({ kind, id, tag }: { kind: 'tech' | 'book'; id: string; tag: string }) {
  return (
    <Link className="num" to={`/items/${kind}/${id}`}>
      {tag}
    </Link>
  );
}
