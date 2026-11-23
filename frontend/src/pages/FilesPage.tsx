import { useState } from 'react';
import { PageHeader, SectionCard } from '../components/CommandCenter';
import { apiFetch } from '../lib/api';

/** File ingestion through the real upload endpoint. */
export function FilesPage() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async () => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      for (const file of Array.from(files)) form.append('files', file);
      if (title.trim()) form.append('title', title.trim());
      const response = await apiFetch('/v1/connectors/upload/ingest/files', {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({ detail: response.statusText })) as { detail?: string };
        throw new Error(detail.detail || `Upload failed: ${response.status}`);
      }
      const data = await response.json() as { chunks_added?: number };
      setResult(`Indexed ${data.chunks_added ?? 0} chunk(s) from ${files.length} file(s).`);
      setFiles(null);
      setTitle('');
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
          kicker="Knowledge"
          title="Files & Documents"
          description="Index local documents into persistent memory. Files are processed by the running server and remain in your local data directory."
        />
        <SectionCard title="Upload documents" hint="Text, PDF and other formats supported by the existing ingestion pipeline.">
          <input
            type="file"
            multiple
            className="fj-input"
            onChange={(e) => setFiles(e.target.files)}
          />
          <input
            className="fj-input mt-3"
            placeholder="Optional source title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button className="fj-button mt-3" disabled={busy || !files || files.length === 0} onClick={() => void upload()}>
            {busy ? 'Indexing…' : 'Index files'}
          </button>
          {result ? <p className="fj-note mt-4">{result}</p> : null}
          {error ? <p className="fj-error mt-4">{error}</p> : null}
        </SectionCard>
      </div>
    </div>
  );
}
