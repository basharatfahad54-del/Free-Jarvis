import { useCallback, useEffect, useState, type ReactNode } from 'react';

/** Shared building blocks for the Free Jarvis command-center pages. */
export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="fj-kicker">{kicker}</div>
        <h1 className="fj-title">{title}</h1>
        <p className="fj-subtitle">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionCard({
  title,
  hint,
  children,
  className = '',
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`fj-card ${className}`}>
      <div className="fj-card-title">{title}</div>
      {hint ? <p className="fj-subtitle mt-1 !mt-1 text-xs">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="fj-card">
      <div className="fj-card-title">{label}</div>
      <div className="fj-value">{value}</div>
    </div>
  );
}

export function Rows({ items }: { items: Record<string, unknown>[] }) {
  if (items.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No records returned by the server.</p>;
  }
  return (
    <div>
      {items.map((item, index) => (
        <div className="fj-row" key={index}>
          <span className="fj-label">{String(item.name ?? item.id ?? item.status ?? `Item ${index + 1}`)}</span>
          <span className="fj-mono">{JSON.stringify(item)}</span>
        </div>
      ))}
    </div>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre
      className="fj-mono overflow-x-auto whitespace-pre-wrap rounded-lg p-3 text-left"
      style={{ background: 'var(--color-code-bg)', border: '1px solid var(--color-border-subtle)' }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export interface ResourceState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

/** Load a backend resource on mount; surfaces real errors, never mock data. */
export function useResource<T>(loader: () => Promise<T>): ResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loader()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // loader is supplied fresh by callers; nonce drives explicit refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  return { data, error, loading, refresh };
}

export function LoadingRow() {
  return (
    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
      <span className="fj-spinner" aria-hidden="true" /> Loading from local server…
    </div>
  );
}
