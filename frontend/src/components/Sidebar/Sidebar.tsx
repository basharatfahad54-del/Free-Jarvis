import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  MessageSquare,
  Plus,
  BarChart3,
  Settings,
  Search,
  PanelLeftClose,
  PanelLeft,
  Cpu,
  Bot,
  Sun,
  Moon,
  Monitor,
  Loader2,
  ScrollText,
  Database,
  Mic,
  Wrench,
  Sparkles,
  Brain,
  GitBranch,
  Clock,
  Plug,
  FolderOpen,
  Telescope,
  Activity,
  Gauge,
  Info,
  Home,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ConversationList } from './ConversationList';
import { useAppStore } from '../../lib/store';

interface NavItem {
  path: string;
  icon: LucideIcon;
  label: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

/** All 18 Free Jarvis areas, grouped by purpose. */
const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Assistant',
    items: [
      { path: '/', icon: MessageSquare, label: 'AI Chat' },
      { path: '/voice', icon: Mic, label: 'Voice Assistant' },
      { path: '/research', icon: Telescope, label: 'Research' },
      { path: '/agents', icon: Bot, label: 'Agents' },
    ],
  },
  {
    label: 'Capabilities',
    items: [
      { path: '/tools', icon: Wrench, label: 'Tools' },
      { path: '/skills', icon: Sparkles, label: 'Skills' },
      { path: '/memory', icon: Brain, label: 'Memory' },
      { path: '/models', icon: Cpu, label: 'Models' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: '/workflows', icon: GitBranch, label: 'Workflows' },
      { path: '/automation', icon: Clock, label: 'Automation' },
      { path: '/data-sources', icon: Plug, label: 'Integrations' },
      { path: '/files', icon: FolderOpen, label: 'Files & Documents' },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/dashboard', icon: Home, label: 'Dashboard' },
      { path: '/system', icon: Activity, label: 'System Monitor' },
      { path: '/logs', icon: ScrollText, label: 'Activity History' },
      { path: '/telemetry', icon: Gauge, label: 'Telemetry & Usage' },
      { path: '/settings', icon: Settings, label: 'Settings' },
      { path: '/about', icon: Info, label: 'About Free Jarvis' },
    ],
  },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const createConversation = useAppStore((s) => s.createConversation);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const serverInfo = useAppStore((s) => s.serverInfo);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const modelLoading = useAppStore((s) => s.modelLoading);
  const deepResearch = useAppStore((s) => s.deepResearch);

  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const ThemeIcon = settings.theme === 'light' ? Sun : settings.theme === 'dark' ? Moon : Monitor;
  const nextTheme = settings.theme === 'light' ? 'dark' : settings.theme === 'dark' ? 'system' : 'light';

  const messages = useAppStore((s) => s.messages);
  const handleNewChat = () => {
    if (messages.length === 0) {
      navigate('/');
      return;
    }
    createConversation(selectedModel);
    navigate('/');
  };

  return (
    <>
      {!sidebarOpen && (
        <button
          onClick={toggleSidebar}
          className="fixed top-3 left-3 z-30 p-2 rounded-lg transition-colors cursor-pointer"
          style={{ color: 'var(--color-text-secondary)', background: 'var(--color-bg-secondary)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-secondary)')}
          aria-label="Open sidebar"
        >
          <PanelLeft size={18} />
        </button>
      )}

      <aside
        className={`
          flex flex-col h-full shrink-0 transition-all duration-200 ease-in-out overflow-hidden
          fixed md:relative z-30
          ${sidebarOpen ? 'w-[268px]' : 'w-0'}
        `}
        style={{
          background: 'var(--color-sidebar)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: sidebarOpen ? '1px solid var(--color-border)' : 'none',
        }}
      >
        <div className="flex flex-col h-full w-[268px]">
          {/* Brand header */}
          <div className="flex items-center justify-between px-3 pt-3 pb-2">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 px-1 cursor-pointer"
              title="Free Jarvis dashboard"
            >
              <span
                className="flex items-center justify-center rounded-lg"
                style={{
                  width: 28,
                  height: 28,
                  border: '1px solid var(--color-accent)',
                  color: 'var(--color-accent)',
                  fontFamily: 'var(--font-hud)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                }}
              >
                FJ
              </span>
              <span className="flex flex-col leading-none">
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    color: 'var(--color-text)',
                  }}
                >
                  FREE JARVIS
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--color-text-tertiary)' }}>
                  Your device. Your rules.
                </span>
              </span>
            </button>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => updateSettings({ theme: nextTheme })}
                className="p-2 rounded-lg transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                title={`Theme: ${settings.theme} (click for ${nextTheme})`}
              >
                <ThemeIcon size={16} />
              </button>
              <button
                onClick={handleNewChat}
                className="p-2 rounded-lg transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                title="New chat"
              >
                <Plus size={18} />
              </button>
              <button
                onClick={toggleSidebar}
                className="p-2 rounded-lg transition-colors cursor-pointer"
                style={{ color: 'var(--color-text-secondary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                title="Collapse sidebar"
              >
                <PanelLeftClose size={18} />
              </button>
            </div>
          </div>

          {/* Model badge */}
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="mx-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer"
            style={{
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-tertiary)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-secondary)')}
          >
            {modelLoading ? (
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
            ) : (
              <Cpu size={14} />
            )}
            <div className="flex-1 min-w-0">
              <span
                className="truncate block text-left"
                style={{ color: deepResearch ? 'var(--color-accent)' : 'var(--color-text)' }}
              >
                {deepResearch
                  ? 'Deep Research'
                  : selectedModel || serverInfo?.model || 'Select model'}
              </span>
              {modelLoading && (
                <span className="text-[10px] block text-left" style={{ color: 'var(--color-accent)' }}>
                  Loading model...
                </span>
              )}
            </div>
            {!modelLoading && (
              <kbd
                className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }}
              >
                ⌘K
              </kbd>
            )}
          </button>

          {/* Navigation — all 18 areas, scrollable */}
          <nav
            className="px-2 pb-2 pt-1 flex flex-col gap-3 overflow-y-auto min-h-0 flex-1"
            style={{ borderTop: '1px solid var(--color-border)' }}
          >
            {NAV_SECTIONS.map((section) => (
              <div key={section.label}>
                <div
                  className="px-3 pb-1 text-[0.6rem] uppercase"
                  style={{ letterSpacing: '0.14em', color: 'var(--color-text-tertiary)' }}
                >
                  {section.label}
                </div>
                {section.items.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => navigate(item.path)}
                      className="relative flex items-center gap-3 px-3 py-1.5 rounded-lg text-[0.8rem] transition-colors w-full text-left cursor-pointer"
                      style={{
                        background: isActive ? 'var(--color-accent-subtle)' : 'transparent',
                        color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
                        fontWeight: isActive ? 500 : 400,
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'var(--color-bg-secondary)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {isActive && (
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
                          style={{
                            background: 'var(--color-accent)',
                            boxShadow: '0 0 8px var(--color-accent-glow)',
                          }}
                        />
                      )}
                      <item.icon size={15} style={isActive ? { color: 'var(--color-accent)' } : undefined} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Conversations */}
          <div className="px-2 pb-2" style={{ borderTop: '1px solid var(--color-border)' }}>
            <div className="px-3 pt-2 pb-1 text-[0.6rem] uppercase" style={{ letterSpacing: '0.14em', color: 'var(--color-text-tertiary)' }}>
              Conversations
            </div>
            <div
              className="flex items-center gap-2 px-3 py-1.5 mb-1 rounded-lg text-sm"
              style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
            >
              <Search size={14} style={{ color: 'var(--color-text-tertiary)' }} />
              <input
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: 'var(--color-text)' }}
              />
            </div>
            <div className="max-h-[150px] overflow-y-auto">
              <ConversationList searchQuery={searchQuery} />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
