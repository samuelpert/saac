import type { TermRow } from '@saac/shared';

export function TermSelect({ terms, value, onChange }: { terms: TermRow[]; value: string; onChange: (code: string) => void }) {
  return (
    <label className="term-pill">
      <span className="word">Term</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Term">
        {terms.map((t) => (
          <option key={t.code} value={t.code}>
            {t.code}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PastTermPill() {
  return (
    <span className="pill lg info">
      <span className="dot" />
      Past term · read-only
    </span>
  );
}
