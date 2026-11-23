import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  Sparkles,
  Terminal,
  Globe,
  Monitor,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Cpu,
  CheckCircle2,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';
import { isTauri, checkHealth } from '../lib/api';

type DeployContext = 'hosted' | 'desktop' | 'selfhosted';

function detectContext(): DeployContext {
  if (isTauri()) return 'desktop';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
    return 'selfhosted';
  }
  return 'hosted';
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="relative group rounded-lg px-4 py-3 text-sm font-mono overflow-x-auto"
      style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text)' }}
    >
      <pre className="whitespace-pre-wrap break-all">{code}</pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}
        title="Copy"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
  defaultOpen = false,
}: {
  icon: typeof Terminal;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--color-border)' }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full px-5 py-4 text-left cursor-pointer transition-colors"
        style={{ background: open ? 'var(--color-bg-secondary)' : 'var(--color-surface)' }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = 'var(--color-bg-secondary)';
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = 'var(--color-surface)';
        }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}
        >
          <Icon size={16} />
        </div>
        <span className="text-sm font-medium flex-1" style={{ color: 'var(--color-text)' }}>
          {title}
        </span>
        <Chevron size={16} style={{ color: 'var(--color-text-tertiary)' }} />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-3 flex flex-col gap-3" style={{ background: 'var(--color-surface)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hosted view: visitor on a deployed website
// ---------------------------------------------------------------------------
function HostedView() {
  const navigate = useNavigate();
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    checkHealth().then(setHealthy);
  }, []);

  return (
    <div className="text-center mb-14">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
        style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}
      >
        <Sparkles size={32} />
      </div>
      <h1 className="text-3xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>
        Free Jarvis
      </h1>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
        Your Personal AI. Your Device. Your Rules.
      </p>
      <p
        className="text-sm mb-6 leading-relaxed max-w-md mx-auto"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        Private AI that runs on your hardware. Chat, tools, agents, and
        energy profiling &mdash; no cloud required.
      </p>

      {healthy === true && (
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-accent)' }}>
            <CheckCircle2 size={16} />
            <span>Server is running</span>
          </div>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-medium transition-opacity cursor-pointer"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
          >
            <MessageSquare size={18} />
            Start Chatting
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {healthy === false && (
        <div
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
          style={{ background: 'color-mix(in srgb, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }}
        >
          Server is not responding. The backend may be starting up.
        </div>
      )}

      {healthy === null && (
        <div className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          Checking server...
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop view: running in the Tauri app
// ---------------------------------------------------------------------------
function DesktopView() {
  const navigate = useNavigate();

  return (
    <>
      <div className="text-center mb-14">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}
        >
          <Sparkles size={32} />
        </div>
        <h1 className="text-3xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>
          Free Jarvis Desktop
        </h1>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
          Your Personal AI. Your Device. Your Rules.
        </p>
        <p
          className="text-sm mb-4 leading-relaxed max-w-md mx-auto"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Your local AI is ready. Everything runs on your device &mdash; no
          data leaves your machine.
        </p>
        <span
          className="inline-block text-[11px] font-mono px-2.5 py-1 rounded-full"
          style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
        >
          v2.8
        </span>
      </div>

      <div
        className="rounded-xl p-6 mb-8 text-center"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center justify-center gap-2 mb-2" style={{ color: 'var(--color-accent)' }}>
          <CheckCircle2 size={18} />
          <span className="text-sm font-medium">All systems running</span>
        </div>
        <p className="text-xs mb-5" style={{ color: 'var(--color-text-tertiary)' }}>
          Ollama inference engine, API server, and AI model are active.
        </p>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl text-sm font-medium transition-opacity cursor-pointer"
          style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <MessageSquare size={18} />
          Start Chatting
          <ArrowRight size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-3 mb-8">
        <Section icon={Cpu} title="Keyboard Shortcuts" defaultOpen>
          <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <div><kbd className="font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>Cmd+K</kbd> Model picker</div>
            <div><kbd className="font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>Cmd+I</kbd> System panel</div>
            <div><kbd className="font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-tertiary)' }}>Cmd+N</kbd> New chat</div>
          </div>
        </Section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Self-hosted view: running on localhost (manual setup)
// ---------------------------------------------------------------------------
function SelfHostedView() {
  return (
    <>
      {/* Hero */}
      <div className="text-center mb-14">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent)' }}
        >
          <Sparkles size={32} />
        </div>
        <h1 className="text-3xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>
          Free Jarvis
        </h1>
        <p className="text-xs mb-3" style={{ color: 'var(--color-text-tertiary)' }}>
          Your Personal AI. Your Device. Your Rules.
        </p>
        <p
          className="text-sm mb-4 leading-relaxed max-w-md mx-auto"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Private AI that runs on your hardware. Chat, tools, agents, and
          energy profiling &mdash; no cloud required.
        </p>
        <span
          className="inline-block text-[11px] font-mono px-2.5 py-1 rounded-full"
          style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
        >
          v2.8
        </span>
      </div>

      {/* Desktop builds from source */}
      <div className="mb-10">
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <Monitor size={18} style={{ color: 'var(--color-text-secondary)' }} />
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
              Desktop App
            </h2>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--color-text-tertiary)' }}>
            Build the desktop app from source, or install the CLI from source below.
          </p>
          <CodeBlock
            code={"git clone https://github.com/<your-github-username>/free-jarvis.git\ncd free-jarvis/frontend\nnpm install\nnpm run tauri build"}
          />
          <p className="text-xs mt-4 leading-relaxed" style={{ color: 'var(--color-text-tertiary)' }}>
            Free Jarvis release links will be added by the repository owner. Until then,
            use the source-install steps below or build the desktop app locally.
          </p>
        </div>
      </div>

      {/* CLI + Browser sections */}
      <div className="flex flex-col gap-3 mb-10">
        <Section icon={Terminal} title="Command Line (macOS / Linux)" defaultOpen>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Clone and install (Python 3.10+ required):
          </p>
          <CodeBlock code={"git clone https://github.com/<your-github-username>/free-jarvis.git\ncd free-jarvis\nuv sync"} />
          <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Then get started:
          </p>
          <CodeBlock code={"jarvis setup\njarvis doctor\njarvis chat"} />
        </Section>

        <Section icon={Globe} title="Browser App (Self-Hosted)">
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Launch the API server to get the full UI in your browser:
          </p>
          <CodeBlock code={"git clone https://github.com/<your-github-username>/free-jarvis.git\ncd free-jarvis\nuv sync --extra desktop\njarvis serve --port 8000"} />
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            The chat, dashboard, energy profiling, and cost comparison all run
            locally on your machine.
          </p>
        </Section>

        <Section icon={Globe} title="Docker (Cloud / VPS Deploy)">
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            Deploy with Docker Compose for a zero-setup hosted instance:
          </p>
          <CodeBlock code={"git clone https://github.com/<your-github-username>/free-jarvis.git\ncd free-jarvis\ndocker compose -f deploy/docker/docker-compose.yml up -d"} />
          <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            This starts both the API server and Ollama. The web UI is bundled and
            served automatically at port 8000.
          </p>
        </Section>
      </div>

      {/* System Requirements */}
      <div
        className="rounded-xl px-6 py-5"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Cpu size={14} style={{ color: 'var(--color-text-tertiary)' }} />
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-tertiary)' }}>
            System Requirements
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          <div>
            <div className="font-medium mb-0.5" style={{ color: 'var(--color-text)' }}>Desktop App (from source)</div>
            Node.js 22+, npm 11+, and the Rust toolchain for a local Tauri build
          </div>
          <div>
            <div className="font-medium mb-0.5" style={{ color: 'var(--color-text)' }}>CLI / Self-Hosted</div>
            Python 3.10+ and an inference engine (Ollama recommended)
          </div>
          <div>
            <div className="font-medium mb-0.5" style={{ color: 'var(--color-text)' }}>Memory</div>
            8 GB+ RAM recommended
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page — delegates to the context-appropriate view
// ---------------------------------------------------------------------------

export function GetStartedPage() {
  const context = useMemo(detectContext, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-16">
        {context === 'hosted' && <HostedView />}
        {context === 'desktop' && <DesktopView />}
        {context === 'selfhosted' && <SelfHostedView />}
      </div>
    </div>
  );
}
