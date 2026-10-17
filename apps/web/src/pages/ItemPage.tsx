import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import type { ItemHistory } from '@saac/shared';
import { apiGet } from '../api/client';
import { ItemStatePill } from '../components/ItemBits';
import { PersonName } from '../components/PersonCard';
import { HistoryTable } from '../components/ScanBox';
import { EmptyState, ErrorText, Loading, PageHead } from '../components/ui';
import { fmtDate } from '../lib/format';

/** Item history: who has it now, then every earlier checkout and check-in. Opened from any tag. */
export function ItemPage() {
  const { kind = 'tech', id = '' } = useParams();
  const q = useQuery({ queryKey: ['item', kind, id], queryFn: () => apiGet<ItemHistory>(`/api/items/${kind}/${id}`) });
  if (q.isLoading) return <Loading />;
  if (!q.data) return <ErrorText error={q.error} />;
  const h = q.data;
  return (
    <>
      <PageHead
        title={h.name}
        sub={
          <span className="row" style={{ gap: 'var(--space-2)' }}>
            <span className="num">{h.tag}</span>
            <span>· {h.typeName}</span>
            <ItemStatePill state={h.state} pastDue={h.pastDue} />
          </span>
        }
      />
      <section className="card">
        <h2>Who has it now</h2>
        {h.holder ? (
          <p>
            <PersonName person={h.holder} /> <span className="num secondary">· Panther ID {h.holder.pid}</span>
            {h.holder.team && <span className="secondary"> · {h.holder.team}</span>}
            {h.dueDate && <span className={h.pastDue ? 'danger-text' : 'secondary'}> · due {fmtDate(h.dueDate)}</span>}
          </p>
        ) : (
          <p className="secondary">Nobody. {h.state === 'AVAILABLE' ? 'It is on the shelf.' : ''}</p>
        )}
        {h.statusNote && <p className="small secondary">Note: {h.statusNote}</p>}
      </section>
      <section className="card">
        <h2>History</h2>
        {h.loans.length === 0 ? <EmptyState>Never checked out.</EmptyState> : <HistoryTable loans={h.loans} />}
      </section>
    </>
  );
}
