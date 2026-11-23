import { useState } from 'react';
import { PageHeader, SectionCard } from '../components/CommandCenter';
import { streamResearch } from '../lib/sse';
import { useAppStore } from '../lib/store';
import type { ResearchEvent } from '../types';

/** Deep research over the existing /api/research streaming endpoint. */
export function ResearchPage() {
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<ResearchEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedModel = useAppStore((s) => s.selectedModel);

  const synthesis = events
    .filter((e): e is Extract<ResearchEvent, { type: 'synthesis' }> => e.type === 'synthesis')
    .map((e) => e.text)
    .join('\n');

  const run = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    setEvents([]);
    try {
      for await (const event of streamResearch(query.trim(), selectedModel || undefined)) {
        setEvents((current) => [...current, event]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fj-page flex-1 overflow-y-auto">
      <div className="fj-shell">
        <PageHeader
          kicker="Discovery"
          title="Research"
          description="Multi-step research using the server's streaming research pipeline. Search providers are selected by the existing web-search configuration."
        />
        <SectionCard title="Research query">
          <textarea
            className="fj-input"
            rows={3}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What should JARVIS research?"
          />
          <button className="fj-button mt-3" disabled={busy || !query.trim()} onClick={() => void run()}>
            {busy ? 'Researching…' : 'Start research'}
          </button>
          {error ? <p className="fj-error mt-3">{error}</p> : null}
        </SectionCard>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <SectionCard title="Synthesis">
            {synthesis ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>{synthesis}</p>
            ) : (
              <p className="fj-note">The final answer will stream here when the research run completes.</p>
            )}
          </SectionCard>
          <SectionCard title="Event timeline" hint={`${events.length} stream event(s)`}>
            {events.map((event, index) => (
              <div className="fj-row" key={index}>
                <span className="fj-label">{event.type}</span>
                <span className="fj-mono">{JSON.stringify(event)}</span>
              </div>
            ))}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
