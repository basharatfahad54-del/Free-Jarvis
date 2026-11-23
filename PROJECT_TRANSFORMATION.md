# Free Jarvis — Project Transformation Record

This document records how the existing **OpenJarvis** repository was transformed into **Free Jarvis** without rebuilding it from scratch. It is both the transformation plan (Phases 1–2 of the master prompt) and the change log of what was actually implemented.

For current pass/fail status of verification, see [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md).

---

## 1. Governing principles

1. **Preserve the foundation.** No working engine, agent, tool, skill, memory, scheduler, channel, security or telemetry implementation was removed or replaced with a mock.
2. **Stable internals.** Import paths, the `openjarvis` Python package, the `jarvis` CLI command, `OPENJARVIS_*` environment variables, database/store keys and WebSocket subprotocols were left intact.
3. **New identity at the boundary.** User-visible strings, metadata, docs, UI, setup and deployment defaults use Free Jarvis naming.
4. **Aliases, not renames.** `FREE_JARVIS_HOME`, `FREE_JARVIS_CONFIG` and the `free-jarvis` console script were *added*; legacy names still work.
5. **Local-first, not cloud-free-by-force.** Ollama is recommended and no key is required; optional cloud integrations remain available and are labelled external.
6. **Non-destructive upgrades.** Existing config is backed up before the setup wizard writes defaults; data is never moved or deleted.
7. **Attribution preserved.** Apache-2.0 notices, upstream copyright and the research citation remain.

---

## 2. Phase 1 — Repository audit

Four read-only audits were performed before edits:

| Audit | Scope | Outcome |
|---|---|---|
| Frontend | `frontend/src` tree, router, API client, styling, branding, tests | Mapped all existing pages/components; identified 11 missing UI areas and the shared API/SSE patterns to reuse |
| Backend config/CLI | `core/config.py`, `core/paths.py`, CLI commands, hardware detection, model recommendation, Ollama engine, system composition | Confirmed single-root data dir resolution, upstream `recommend_engine`/`recommend_model` behaviour, bootstrap config writer and lazy CLI imports |
| Branding | root docs, docs tree, frontend, Tauri, pyproject, deploy, scripts, `.github` | Classified strings into (a) safe display strings, (b) internal identifiers to keep, (c) license/attribution to preserve verbatim |
| Deployment/CI | workflows, Docker, systemd/launchd/Windows service files, installers | Identified localhost defaults, persistent volumes and places needing Free Jarvis labels |

Source-level reference: `readme1.md` (generated before the transformation).

### Dependency map (abridged)

```
CLI (openjarvis.cli) ──> core.config / core.paths ──> local_setup (new)
        │                      │
        │                      └──> engines (Ollama default; vLLM/llama.cpp/MLX/cloud)
        ├──> sdk.JarvisSystem / SystemBuilder ──> agents ──> tools ──> skills
        ├──> memory ──> SQLite / FAISS / configured backends
        ├──> scheduler / managed agents / digests
        └──> server.app ──> FastAPI routes ──> frontend (HTTP, SSE, WS)

Frontend: App.tsx (router) ──> Layout ──> Sidebar
                         ──> pages/* ──> lib/api.ts + lib/sse.ts ──> server
```

---

## 3. Phase 2 — Transformation plan and compatibility decisions

| Decision | Rationale |
|---|---|
| Keep `openjarvis` package name | Hundreds of imports, docs, SDK users and tests depend on it; renaming would be a breaking change with no functional benefit |
| Keep `jarvis` CLI command | Existing scripts/installers/docs and muscle memory; added `free-jarvis` as an alias script |
| Keep `~/.openjarvis` default data dir | Silent relocation would break existing installs; added `FREE_JARVIS_HOME` as preferred override |
| Keep `OPENJARVIS_*` env vars | Backwards compatibility; `FREE_JARVIS_*` aliases take precedence |
| Keep upstream `recommend_engine()` / `recommend_model()` | Existing tests encode their exact tier behaviour; added a separate Ollama-first policy in `openjarvis.local_setup` |
| Keep Tauri crate name; change product name and license metadata | Crate rename would break build scripts; product/bundle identity is what users see |
| Keep upstream skills install/remove API as-is | It is explicitly a file-based placeholder upstream; UI explains this rather than faking buttons |
| Keep DB filenames, store keys and WS subprotocols | Avoids migrations and data loss |

**Migration strategy:** additive aliases, dynamic path resolution, config backup before writes, no schema changes, no data movement. Documented in `docs/free-jarvis/migration.md`.

---

## 4. Phase 3 — Rebranding

### Backend / Python

| File | Change |
|---|---|
| `src/openjarvis/branding.py` | **New.** Canonical product strings, env var names, upstream attribution notice |
| `src/openjarvis/__init__.py` | Free Jarvis docstring; version lookup tries `free-jarvis` then legacy `openjarvis` |
| `src/openjarvis/core/paths.py` | `FREE_JARVIS_HOME` precedence, legacy fallback, Free Jarvis messages, `free-jarvis` recognised in source-tree detection |
| `src/openjarvis/core/config.py` | `FREE_JARVIS_CONFIG` precedence, JARVIS default persona, updated docs/messages |
| `src/openjarvis/cli/_banner.py` | New Free Jarvis wordmark and tagline |
| `src/openjarvis/cli/__init__.py` | Help text, version prog name, `setup` command registration |
| `src/openjarvis/cli/config_cmd.py` | New env aliases in `config path`, `config set` and config resolution |
| `src/openjarvis/cli/setup_cmd.py` | **New.** Resumable first-run wizard |
| `src/openjarvis/server/routes.py` | **New** `GET /v1/setup/hardware` read-only endpoint |
| `pyproject.toml` | Distribution renamed `free-jarvis`, both console scripts, Apache-2.0, placeholders + upstream URL |

### Frontend / desktop

| File | Change |
|---|---|
| `index.html`, `vite.config.ts` | Title, description, PWA manifest, cyan/navy theme colours |
| `src/index.css` | Dark-first command-center tokens and shared `.fj-*` surface styles |
| `src/lib/store.ts` | Dark theme default |
| `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` | Free Jarvis product/window/descriptions; Apache-2.0 metadata |
| `package.json` | Package name `free-jarvis-desktop` |
| `src/components/Sidebar/Sidebar.tsx` | Brand header + grouped navigation for all 18 areas |
| `src/components/CommandCenter.tsx` | **New.** Shared page primitives and `useResource` loader (real errors, no mock data) |

### Repository policy and GitHub presentation

`CONTRIBUTING.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` (new), `.env.example` (new), `.gitignore`, `README.md` (full rewrite), plus deployment/CI/docs branding handled by parallel work streams.

---

## 5. Phase 4 — UI redesign

The upstream router was extended, not replaced. Existing Chat, Dashboard, Settings, Get Started, Data Sources, Agents and Logs pages remain. New routed pages:

| Route | Page | Real backend used |
|---|---|---|
| `/voice` | `VoicePage.tsx` | `useSpeech` + `useTts`, `/v1/chat/completions`, speech health |
| `/tools` | `ToolsPage` | `/v1/tools` |
| `/skills` | `SkillsPage` | `/v1/skills` (file-based management explained) |
| `/memory` | `MemoryPage` | memory stats/search/store/index endpoints |
| `/models` | `ModelsPage` | models list, recommendation, server info, pull/delete |
| `/workflows` | `WorkflowsPage` | `/v1/sessions` |
| `/automation` | `AutomationPage` | managed agents + digest schedule |
| `/files` | `FilesPage.tsx` | `/v1/connectors/upload/ingest/files` |
| `/research` | `ResearchPage.tsx` | `/api/research` SSE stream |
| `/system` | `SystemMonitorPage` | health, server info, metrics, security scan |
| `/telemetry` | `TelemetryPage` | telemetry, traces, energy endpoints |
| `/about` | `AboutPage` | server info + identity/attribution |

Every new page loads from a live endpoint and displays real errors. No placeholder buttons or fake data were added. Where the upstream API is a documented placeholder (skills install/remove), the UI says so.

---

## 6. Phase 5 — Local AI setup

- `openjarvis.local_setup` implements Ollama-first engine selection, memory-aware Qwen tier selection, hardware tier labels, host resolution, socket probe and platform-specific install hints.
- `GET /v1/setup/hardware` exposes the read-only plan for the wizard/UI.
- `jarvis setup` walks 12 steps (welcome, hardware, dependencies, Ollama, model, download, engine, storage, voice, integrations, security, finish), stores progress in `setup-state.json`, supports `--non-interactive`, `--skip-download`, `--engine`, `--model`, `--reset`, `--open`, and never asks for cloud credentials.
- Existing config is copied to `config.toml.before-free-jarvis-<UTC timestamp>` before any wizard write.
- JARVIS persona prompt set as the default while preserving the anti-identity-hardening wording (`not Claude`, etc.).

---

## 7. Phase 6 — Feature integration

All inherited capabilities were retained: engine registry (Ollama/vLLM/llama.cpp/MLX/cloud), agents (simple, tool-using, orchestrator, research, coding, persistent, managed), tool/skill registries and MCP, memory and document indexing, scheduler/digest/monitor, voice, HTTP/OpenAI-compatible API, desktop/browser clients, channels and connectors, security (auth, sandbox, capability policy, audit, approvals), telemetry/traces/evals and learning/optimization. The new UI surfaces the ones with real endpoints and documents the rest.

---

## 8. Phase 7 — Personal deployment

- Loopback binding retained and documented as the default; remote access explicitly opt-in with API key + HTTPS.
- Docker Compose persists state and maps `127.0.0.1:8000:8000`; GPU compose variants preserved.
- Docs cover install, configuration, backup/restore, update, uninstall, systemd/launchd/Windows services and health checks.
- `FREE_JARVIS_WEB_HOST` is documented in `.env.example` but is **not yet consumed by application code**; it is not presented as a working feature.

---

## 9. Phase 8 — GitHub preparation

README rewritten with the required 16 sections; policy files updated; `.env.example` contains no secrets; `.gitignore` expanded; CI workflows, issue templates, Docker and service definitions rebranded without disabling checks; no invented badges, release links or deployment URLs.

---

## 10. Files intentionally left unchanged

- `src/openjarvis/**` engine, agent, memory, scheduler, channel and security implementations (except the specific files listed above).
- Database filenames, store keys, WebSocket subprotocols, XDG fallback directory name.
- Upstream research docs under `docs/design/`, `docs/development/` and `docs/learning/` except for product-name corrections where visible.
- Upstream license and copyright text.

---

## 11. Known limitations

- Skills install/remove remains an upstream file-based placeholder; the UI does not fake it.
- `FREE_JARVIS_WEB_HOST` is documentation-only.
- Hardware detection is best-effort (no GPU libraries required); users can override model selection manually.
- Packaged Free Jarvis installers/screenshots do not exist yet; placeholders are explicit.
- See `IMPLEMENTATION_STATUS.md` for verification results and environment-specific test caveats.
