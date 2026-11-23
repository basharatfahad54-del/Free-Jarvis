import { useCallback, useState } from 'react';
import {
  PageHeader,
  SectionCard,
  Stat,
  JsonBlock,
  LoadingRow,
  Rows,
  useResource,
} from '../components/CommandCenter';
import {
  apiFetch,
  checkHealth,
  deleteModel,
  fetchAvailableTools,
  fetchEnergy,
  fetchManagedAgents,
  fetchModels,
  fetchRecommendedModel,
  fetchServerInfo,
  fetchTelemetry,
  fetchTraces,
  getMemoryStats,
  indexMemoryPath,
  pullModel,
  searchMemory,
  storeMemory,
} from '../lib/api';
import { useAppStore } from '../lib/store';

type Json = Record<string, unknown>;

const asRows = (value: unknown): Json[] =>
  Array.isArray(value) ? (value.filter((v) => v && typeof v === 'object') as Json[]) : [];

/** Tools backed by the real /v1/tools endpoint. */
export function ToolsPage() {
  const tools = useResource<Json>(() => apiFetch('/v1/tools').then((r) => {
    if (!r.ok) throw new Error(`Tools request failed: ${r.status}`);
    return r.json();
  }));
  const list = asRows(tools.data?.tools ?? tools.data);

  return (
    <div className="fj-page flex-1 overflow-y-auto">
      <div className="fj-shell">
        <PageHeader
          kicker="Capabilities"
          title="Tools"
          description="Tools registered with the running Free Jarvis server. Credentials and MCP tools are managed through the existing server APIs."
          actions={<button className="fj-button" onClick={tools.refresh}>Refresh</button>}
        />
        <SectionCard title="Registered tools" hint={`${list.length} tool(s) reported by the local server`}>
          {tools.loading ? <LoadingRow /> : tools.error ? <p className="fj-error">{tools.error}</p> : <Rows items={list} />}
        </SectionCard>
      </div>
    </div>
  );
}

/** Skill discovery. Installation stays file-based upstream and is not faked. */
export function SkillsPage() {
  const skills = useResource<Json>(() => apiFetch('/v1/skills').then((r) => {
    if (!r.ok) throw new Error(`Skills request failed: ${r.status}`);
    return r.json();
  }));

  return (
    <div className="fj-page flex-1 overflow-y-auto">
      <div className="fj-shell">
        <PageHeader
          kicker="Capabilities"
          title="Skills"
          description="Skills discovered from local TOML manifests. Installation/removal is performed with local files and `jarvis skill`, not with a placeholder API button."
          actions={<button className="fj-button" onClick={skills.refresh}>Refresh</button>}
        />
        <SectionCard title="Installed skills">
          {skills.loading ? <LoadingRow /> : skills.error ? <p className="fj-error">{skills.error}</p> : <Rows items={asRows(skills.data?.skills)} />}
        </SectionCard>
        <p className="fj-note mt-4">
          Add skills as TOML files in the Free Jarvis data directory, then refresh. The upstream API reports file-based management as its supported path.
        </p>
      </div>
    </div>
  );
}

/** Local model management using existing /v1/models and Ollama endpoints. */
export function ModelsPage() {
  const models = useResource(() => fetchModels());
  const recommended = useResource(() => fetchRecommendedModel());
  const info = useResource(() => fetchServerInfo());
  const selectedModel = useAppStore((s) => s.selectedModel);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(() => {
    models.refresh();
    recommended.refresh();
    info.refresh();
  }, [models, recommended, info]);

  const run = async (action: 'pull' | 'delete') => {
    const name = target.trim();
    if (!name) {
      setError('Enter a model name first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (action === 'pull') await pullModel(name);
      else await deleteModel(name);
      setTarget('');
      refreshAll();
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
          kicker="Inference"
          title="Models"
          description="Discover, download, switch and remove models on the local engine. Ollama models download without any API key."
          actions={<button className="fj-button" onClick={refreshAll}>Refresh</button>}
        />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Active engine" value={info.data?.engine || '—'} />
          <Stat label="Active model" value={selectedModel || info.data?.model || '—'} />
          <Stat label="Available models" value={models.data?.length ?? '—'} />
          <Stat label="Server suggestion" value={recommended.data?.model || '—'} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <SectionCard title="Installed models" hint="Select a model for new chats">
            {models.loading ? <LoadingRow /> : models.error ? <p className="fj-error">{models.error}</p> : (
              <div>
                {(models.data ?? []).map((m) => (
                  <div className="fj-row" key={m.id}>
                    <button className="fj-button" onClick={() => setSelectedModel(m.id)}>Use</button>
                    <span className="fj-mono">{m.id}</span>
                  </div>
                ))}
                {(models.data ?? []).length === 0 ? <p className="fj-note">No local models found. Pull one below or run `ollama pull qwen3.5:2b`.</p> : null}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Model library" hint="Pull and delete models through the configured engine">
            <input
              className="fj-input"
              placeholder="qwen3.5:2b"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <div className="mt-3 flex gap-2">
              <button className="fj-button" disabled={busy || !target.trim()} onClick={() => void run('pull')}>Pull model</button>
              <button className="fj-button" disabled={busy || !target.trim()} onClick={() => void run('delete')}>Delete model</button>
            </div>
            {error ? <p className="fj-error mt-3">{error}</p> : null}
            <p className="fj-note mt-4">{recommended.data?.reason || 'Model recommendations come from the local server.'}</p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/** Persistent memory backed by the real memory endpoints. */
export function MemoryPage() {
  const stats = useResource(() => getMemoryStats());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Json[] | null>(null);
  const [content, setContent] = useState('');
  const [path, setPath] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    try { setResults((await searchMemory(query.trim(), 10)) as unknown as Json[]); }
    catch (err) { setMessage(err instanceof Error ? err.message : String(err)); }
  };
  const remember = async () => {
    if (!content.trim()) return;
    try {
      await storeMemory(content.trim());
      setContent('');
      setMessage('Stored in local memory.');
      stats.refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : String(err)); }
  };
  const ingest = async () => {
    if (!path.trim()) return;
    try {
      const result = await indexMemoryPath(path.trim());
      setMessage(`Indexed ${result.chunks_indexed ?? 0} chunk(s).`);
      stats.refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : String(err)); }
  };

  return (
    <div className="fj-page flex-1 overflow-y-auto">
      <div className="fj-shell">
        <PageHeader
          kicker="Recall"
          title="Memory"
          description="Persistent local memory, conversation recall and document indexing. Data stays in the Free Jarvis home directory."
          actions={<button className="fj-button" onClick={stats.refresh}>Refresh</button>}
        />
        <SectionCard title="Storage statistics">
          {stats.loading ? <LoadingRow /> : stats.error ? <p className="fj-error">{stats.error}</p> : <JsonBlock value={stats.data} />}
        </SectionCard>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <SectionCard title="Search memory">
            <input className="fj-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What should JARVIS recall?" />
            <button className="fj-button mt-3" onClick={() => void search()}>Search</button>
            {results ? <div className="mt-3"><Rows items={results} /></div> : null}
          </SectionCard>
          <SectionCard title="Store a memory">
            <textarea className="fj-input" rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="A fact, preference or note…" />
            <button className="fj-button mt-3" onClick={() => void remember()}>Remember</button>
          </SectionCard>
          <SectionCard title="Index documents">
            <input className="fj-input" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/absolute/path/to/documents" />
            <button className="fj-button mt-3" onClick={() => void ingest()}>Index path</button>
            <p className="fj-note mt-3">Indexing respects the configured workspace and sandbox permissions.</p>
          </SectionCard>
        </div>
        {message ? <p className="fj-note mt-4">{message}</p> : null}
      </div>
    </div>
  );
}

/** Active sessions (workflow state) from the real sessions API. */
export function WorkflowsPage() {
  const sessions = useResource<Json>(() => apiFetch('/v1/sessions').then((r) => {
    if (!r.ok) throw new Error(`Sessions request failed: ${r.status}`);
    return r.json();
  }));
  return (
    <div className="fj-page flex-1 overflow-y-auto">
      <div className="fj-shell">
        <PageHeader
          kicker="Continuity"
          title="Workflows"
          description="Active and recent sessions persisted by the session store. Agents and recipes build on these sessions to keep long-running work resumable."
          actions={<button className="fj-button" onClick={sessions.refresh}>Refresh</button>}
        />
        <SectionCard title="Sessions">
          {sessions.loading ? <LoadingRow /> : sessions.error ? <p className="fj-error">{sessions.error}</p> : <Rows items={asRows(sessions.data?.sessions)} />}
        </SectionCard>
      </div>
    </div>
  );
}

/** Schedules that really exist: managed agents with cron/interval schedules + digest schedule. */
export function AutomationPage() {
  const agents = useResource(() => fetchManagedAgents());
  const digest = useResource<Json>(() => apiFetch('/api/digest/schedule').then((r) => {
    if (!r.ok) throw new Error(`Digest schedule request failed: ${r.status}`);
    return r.json();
  }));
  const scheduled = (agents.data ?? []).filter(
    (a) => Boolean(a.config?.schedule_type),
  );
  return (
    <div className="fj-page flex-1 overflow-y-auto">
      <div className="fj-shell">
        <PageHeader
          kicker="Automation"
          title="Scheduler"
          description="Managed agents with cron or interval schedules, plus the morning-digest schedule. Create and edit schedules on the Agents page."
          actions={<button className="fj-button" onClick={() => { agents.refresh(); digest.refresh(); }}>Refresh</button>}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Scheduled agents" hint={`${scheduled.length} agent(s) have a schedule`}>
            {agents.loading ? <LoadingRow /> : agents.error ? <p className="fj-error">{agents.error}</p> : scheduled.length === 0 ? (
              <p className="fj-note">No scheduled agents yet. Schedules are created from the Agents page.</p>
            ) : (
              scheduled.map((agent) => (
                <div className="fj-row" key={agent.id}>
                  <span className="fj-label">{agent.name}</span>
                  <span className="fj-mono">{agent.config.schedule_type} · {String(agent.config.schedule_value ?? '')}</span>
                </div>
              ))
            )}
          </SectionCard>
          <SectionCard title="Digest schedule">
            {digest.loading ? <LoadingRow /> : digest.error ? <p className="fj-error">{digest.error}</p> : <JsonBlock value={digest.data} />}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export function SystemMonitorPage() {
  const health = useResource(() => checkHealth());
  const info = useResource(() => fetchServerInfo());
  const metrics = useResource<string>(() => apiFetch('/metrics').then(async (r) => {
    if (!r.ok) throw new Error(`Metrics request failed: ${r.status}`);
    return r.text();
  }));
  const security = useResource<Json>(() => apiFetch('/v1/security/scan', { method: 'POST' }).then((r) => {
    if (!r.ok) throw new Error(`Security scan failed: ${r.status}`);
    return r.json();
  }));

  return (
    <div className="fj-page flex-1 overflow-y-auto">
      <div className="fj-shell">
        <PageHeader
          kicker="Operations"
          title="System Monitor"
          description="Live health, engine information, Prometheus metrics and the local security scan."
          actions={<button className="fj-button" onClick={() => { health.refresh(); info.refresh(); metrics.refresh(); security.refresh(); }}>Refresh all</button>}
        />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Server" value={health.loading ? '…' : health.data ? 'Online' : 'Offline'} />
          <Stat label="Engine" value={info.data?.engine || '—'} />
          <Stat label="Model" value={info.data?.model || '—'} />
          <Stat label="Security scan" value={security.loading ? '…' : security.error ? 'Error' : 'Complete'} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <SectionCard title="Security scan"><JsonBlock value={security.data ?? { error: security.error }} /></SectionCard>
          <SectionCard title="Prometheus metrics"><JsonBlock value={metrics.data ?? metrics.error ?? 'No metrics returned'} /></SectionCard>
        </div>
      </div>
    </div>
  );
}

export function TelemetryPage() {
  const telemetry = useResource(() => fetchTelemetry());
  const traces = useResource(() => fetchTraces(50));
  const energy = useResource(() => fetchEnergy());
  return (
    <div className="fj-page flex-1 overflow-y-auto">
      <div className="fj-shell">
        <PageHeader
          kicker="Insights"
          title="Telemetry & Usage"
          description="Local traces, energy samples and inference telemetry. Telemetry is stored locally and is never uploaded unless you explicitly opt in."
          actions={<button className="fj-button" onClick={() => { telemetry.refresh(); traces.refresh(); energy.refresh(); }}>Refresh all</button>}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title="Telemetry">{telemetry.loading ? <LoadingRow /> : <JsonBlock value={telemetry.data ?? telemetry.error} />}</SectionCard>
          <SectionCard title="Energy">{energy.loading ? <LoadingRow /> : <JsonBlock value={energy.data ?? energy.error} />}</SectionCard>
          <SectionCard title="Recent traces">{traces.loading ? <LoadingRow /> : <JsonBlock value={traces.data ?? traces.error} />}</SectionCard>
        </div>
      </div>
    </div>
  );
}

export function AboutPage() {
  const info = useResource(() => fetchServerInfo());
  return (
    <div className="fj-page flex-1 overflow-y-auto">
      <div className="fj-shell">
        <PageHeader
          kicker="Free Jarvis"
          title="About"
          description="Your Personal AI. Your Device. Your Rules."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Product">
            <div className="fj-row"><span className="fj-label">Name</span><span className="fj-mono">Free Jarvis</span></div>
            <div className="fj-row"><span className="fj-label">Repository</span><span className="fj-mono">free-jarvis</span></div>
            <div className="fj-row"><span className="fj-label">Default persona</span><span className="fj-mono">JARVIS</span></div>
            <div className="fj-row"><span className="fj-label">License</span><span className="fj-mono">Apache-2.0</span></div>
            <div className="fj-row"><span className="fj-label">Local runtime</span><span className="fj-mono">{info.data?.engine || 'detecting…'}</span></div>
          </SectionCard>
          <SectionCard title="Attribution">
            <p className="fj-note">
              Free Jarvis is a local-first downstream distribution of OpenJarvis, an Apache-2.0 licensed research framework. Copyright 2025 The OpenJarvis Authors. Free Jarvis adds branding, setup tooling, local-first defaults and interface changes; it does not claim authorship of the upstream implementation.
            </p>
            <p className="fj-subtitle mt-4">
              Internal package names (openjarvis), the jarvis command and OPENJARVIS_* environment variables are retained for compatibility. See the migration guide in the repository.
            </p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export function AvailableToolsProbe() {
  const tools = useResource(() => fetchAvailableTools());
  return <JsonBlock value={tools.data ?? tools.error ?? []} />;
}
