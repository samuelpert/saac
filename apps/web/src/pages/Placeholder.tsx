import { Link } from 'react-router-dom';
import { EmptyState, PageHead } from '../components/ui';

/** Screens planned for a later phase. Linked from the menu so the layout is final from day one. */
export function Placeholder({ title, phase, what }: { title: string; phase: number; what: string }) {
  return (
    <>
      <PageHead title={title} />
      <EmptyState action={<Link className="btn" to="/">Back to Home</Link>}>
        {what} This screen is built in phase {phase}.
      </EmptyState>
    </>
  );
}
