import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ELIGIBILITY_LABEL, type Eligibility, type Widget } from '@saac/shared';

export type Tone = 'ok' | 'warn' | 'err' | 'info';

const GLYPH: Record<Tone, string> = { ok: '✓', warn: '!', err: '×', info: 'i' };

/** Status icon in a ring, so meaning never relies on color alone. */
export function Glyph({ tone, small }: { tone: Tone; small?: boolean }) {
  return (
    <span className={`glyph${small ? ' sm' : ''}`} aria-hidden="true">
      {GLYPH[tone]}
    </span>
  );
}

export interface FeedbackMessage {
  tone: Tone;
  word: string;
  text: string;
  action?: { label: string; href?: string; onClick?: () => void };
}

export function Feedback({ fb }: { fb: FeedbackMessage }) {
  return (
    <div role="status" className={`feedback ${fb.tone}`}>
      <Glyph tone={fb.tone} />
      <span className="word">{fb.word}</span>
      <span className="text">{fb.text}</span>
      {fb.action?.href && <Link to={fb.action.href}>{fb.action.label} ›</Link>}
      {fb.action?.onClick && (
        <button type="button" className="linkish" onClick={fb.action.onClick}>
          {fb.action.label} ›
        </button>
      )}
    </div>
  );
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span>{children}</span>
      {action}
    </div>
  );
}

export function WidgetError({ message }: { message: string }) {
  return (
    <div className="widget-error" role="alert">
      <Glyph tone="err" small />
      <span>{message}</span>
    </div>
  );
}

/** Render a widget's data, or its own error, so one broken widget never blanks the page. */
export function WidgetBody<T>({ widget, children }: { widget: Widget<T> | undefined; children: (data: T) => ReactNode }) {
  if (!widget) return null;
  if (!widget.ok) return <WidgetError message={widget.error} />;
  return <>{children(widget.data)}</>;
}

const ELIGIBILITY_TONE: Record<Eligibility, Tone> = { ELIGIBLE: 'ok', NO_SCHOLARSHIP: 'warn', TERM_ENDED: 'warn', NOT_IN_TERM: 'info' };
const ELIGIBILITY_MARK: Record<Eligibility, string> = { ELIGIBLE: '✓', NO_SCHOLARSHIP: '!', TERM_ENDED: '!', NOT_IN_TERM: '–' };

/** Whether a person can borrow in a term. Always an icon and words, never color alone. */
export function EligibilityPill({ status, term }: { status: Eligibility | null; term?: string | null }) {
  if (!status) return <span className="muted">—</span>;
  const label = status === 'NOT_IN_TERM' && term ? `Not in ${term}` : status === 'TERM_ENDED' && term ? `${term} ended` : ELIGIBILITY_LABEL[status];
  return (
    <span className={`pill ${ELIGIBILITY_TONE[status]}`}>
      <span aria-hidden="true">{ELIGIBILITY_MARK[status]}</span> {label}
    </span>
  );
}

export function TermTags({ terms }: { terms: string[] }) {
  if (terms.length === 0) return <span className="muted">No term yet</span>;
  return (
    <span className="row" style={{ gap: 4 }}>
      {terms.map((t) => (
        <span key={t} className="pill num">
          {t}
        </span>
      ))}
    </span>
  );
}

export function Chevron() {
  return <ChevronRight className="chevron" size={16} strokeWidth={1.75} aria-hidden="true" />;
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="titles">
        <h1>{title}</h1>
        {sub && <span className="sub">{sub}</span>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </label>
  );
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Loading() {
  return <p className="muted">Loading…</p>;
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <div className="feedback err" role="alert">
      <Glyph tone="err" />
      <span className="text">{message}</span>
    </div>
  );
}
