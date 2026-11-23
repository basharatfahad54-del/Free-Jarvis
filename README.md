<div align="center">

# FREE JARVIS

### Your Personal AI. Your Device. Your Rules.

*A local-first personal JARVIS-style assistant — built on the upstream OpenJarvis research framework.*

<!-- TODO(you): add Free Jarvis logo at docs/assets/free-jarvis-logo.png and a short demo GIF. Do not publish invented screenshots or release links. -->

| Python | License | Upstream research |
|---|---|---|
| 3.11–3.13 | Apache-2.0 | [OpenJarvis paper](https://arxiv.org/abs/2605.17172) · [Project site](https://openjarvis.stanford.edu/) |

<br>

[![Fiverr - Custom AI Services](https://img.shields.io/badge/Fiverr-Custom%20AI%20Web%20App%20%7C%20Chatbot%20%7C%20SaaS-1DBF73?style=for-the-badge&logo=fiverr&logoColor=white)](https://www.fiverr.com/fahadvine1/develop-custom-ai-web-app-chatgpt-chatbot-or-ai-saas-application)
[![LinkedIn - Muhammad Fahad](https://img.shields.io/badge/LinkedIn-Muhammad%20Fahad-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/muhammad-fahad-8b6258370/)

</div>

---

## 1. Introduction

**Free Jarvis** is a personal AI assistant that runs on *your* computer. It is a downstream, local-first distribution of the existing [OpenJarvis](https://github.com/open-jarvis/OpenJarvis) repository — not a rewrite. The inherited engine registry, agents, tools, skills, memory, scheduler, channels, security system, telemetry, desktop shell and OpenAI-compatible API are all preserved.

What changes is the product experience: a Free Jarvis identity, a dark-first "personal AI command center" interface covering 18 areas, an Ollama-first local setup wizard with hardware-aware model recommendations, a JARVIS default persona, and personal-deployment documentation.

No OpenAI key, Anthropic key, paid database or paid hosting is required. Cloud providers remain available as *optional* integrations and are clearly labelled as external (and potentially costly) services.

> **Attribution:** Free Jarvis is based on OpenJarvis, an Apache-2.0 licensed research framework. Copyright 2025 The OpenJarvis Authors. Free Jarvis adds branding, setup tooling, local-first defaults and interface changes; it does not claim authorship of the upstream implementation. See [License and attribution](#16-license-and-attribution).

## 2. Features

- **Local-first inference** — Ollama recommended by default; vLLM, llama.cpp, MLX and other upstream engines remain available and switchable at runtime.
- **JARVIS persona** — calm, concise, professional, technically capable; fully customisable without breaking tool calling or agent orchestration.
- **18-area command center** — chat, voice, agents, tools, skills, memory, models, workflows, scheduler, integrations, files, research, system monitor, activity history, telemetry, settings, about and dashboard.
- **Persistent memory** — conversation history, memory search and document indexing stored in your local data directory.
- **Agents and automation** — simple, tool-using, orchestrator, research and persistent managed agents; scheduled jobs, digest and monitoring workflows.
- **Voice** — microphone capture, server STT/TTS where configured, and browser speech fallback; no key needed for the browser path.
- **Security by default** — loopback-only server, capability policy, sandboxing where supported, approvals for dangerous actions, audit logs and input validation.
- **Personal deployment** — local install, source/dev install, desktop app, Docker and Docker Compose, with persistent data and documented backup/restore.
- **Backwards compatibility** — the `openjarvis` Python package, `jarvis` CLI command, `OPENJARVIS_*` env vars and `~/.openjarvis` data directory keep working.

## 3. Screenshots

<!-- TODO(you): capture Free Jarvis screenshots from your own running instance and place them under docs/assets/screenshots/. -->
<!-- Placeholder structure:
| Dashboard | Chat | Models |
|---|---|---|
| docs/assets/screenshots/dashboard.png | docs/assets/screenshots/chat.png | docs/assets/screenshots/models.png |
-->

Inherited upstream showcase captures are available in [`docs/assets/showcase/`](docs/assets/showcase/) and [`docs/showcase/`](docs/showcase/) for reference. Replace them with your own before publishing.

## 4. Architecture overview

Free Jarvis keeps the upstream layered architecture:

```
Browser / Desktop (React + Vite + Tauri)
        │  HTTP / SSE / WebSocket
        ▼
FastAPI server  ──  OpenAI-compatible /v1 API, /api routes, auth, audit
        │
        ▼
JarvisSystem / SystemBuilder  ──  Engine registry, agents, tools, skills
        │
        ├── Engines: Ollama (default), vLLM, llama.cpp, MLX, cloud (optional)
        ├── Memory: SQLite / configured backends, document index
        ├── Automation: scheduler, managed agents, digests
        └── Local state: ~/.openjarvis (config, DBs, caches, logs, credentials)
```

Key entry points:

| Area | Entry point |
|---|---|
| CLI | `openjarvis.cli:main` (commands `jarvis` and `free-jarvis`) |
| HTTP server | `openjarvis.server.app:create_app` |
| SDK | `openjarvis.sdk` (`Jarvis`, `JarvisSystem`, `SystemBuilder`, `MemoryHandle`) |
| Setup policy | `openjarvis.local_setup` |
| Identity strings | `openjarvis.branding` |
| Frontend | `frontend/src/App.tsx` |

Full architecture notes live in [`docs/architecture/`](docs/architecture/overview.md).

## 5. Requirements

| Requirement | Notes |
|---|---|
| Python 3.11–3.13 | 3.14 is not supported by the current dependency pins |
| [uv](https://docs.astral.sh/uv/) | Used for environment and dependency management |
| 8 GB RAM minimum | 16 GB+ recommended for a comfortable local model |
| [Ollama](https://ollama.com/download) | Recommended local runtime; not required if you bring another engine |
| Node.js 22+ / npm 11+ | Only needed for the browser/desktop frontend from source |
| Rust toolchain | Only needed for the Tauri desktop build and optional native extension |
| Docker / Docker Compose | Only needed for container deployment |

A GPU is **not** required: CPU-only model recommendations are included.

## 6. Installation instructions

### Source install (recommended for contributors)

```bash
git clone https://github.com/<your-github-username>/free-jarvis.git
cd free-jarvis
uv sync --extra dev
uv run jarvis setup          # resumable first-run wizard
```

The old distribution name still installs too:

```bash
uv pip install -e .          # distribution is now `free-jarvis`
```

Both `jarvis` and `free-jarvis` console scripts point to the same CLI.

### Shell installers (source checkout)

```bash
# macOS / Linux / WSL2
bash scripts/install/install.sh

# Native Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File deploy/windows/install.ps1
```

Set `FREE_JARVIS_HOME` (or legacy `OPENJARVIS_HOME`) before installing to keep all runtime state outside the source tree.

## 7. Ollama setup

1. Install Ollama from <https://ollama.com/download> (macOS app, Windows installer, or `curl -fsSL https://ollama.com/install.sh | sh` on Linux).
2. Start it (`ollama serve`, or let the desktop app auto-start it) and confirm `ollama list` works.
3. Run `jarvis setup`. It probes `OLLAMA_HOST` (default `http://localhost:11434`), detects your hardware and recommends a model that fits.
4. Let the wizard pull the model, or do it yourself:

```bash
ollama pull qwen3.5:2b        # 8 GB / CPU-only
ollama pull qwen3.5:4b        # 16 GB
ollama pull qwen3.5:9b        # 32 GB / 8–12 GB GPU
ollama pull qwen3.5:27b       # 64 GB+ / 16 GB+ GPU
```

If Ollama is not running, the wizard prints platform-specific install instructions and lets you continue without a model. The same information is available from `GET /v1/setup/hardware`.

## 8. Model configuration

The wizard writes `config.toml` into the resolved Free Jarvis home. You can switch engines and models at any time without rebuilding:

```toml
[engine]
default = "ollama"

[ollama]
host = "http://localhost:11434"
# model is selected per chat/session, or via `jarvis config set ...`
```

Useful commands:

```bash
jarvis model list
jarvis model pull qwen3.5:4b
jarvis config set engine.default ollama
jarvis config hardware            # detect CPU / RAM / GPU
jarvis config path                # show resolved data, config and cache dirs
```

Hardware-aware recommendations used by the wizard:

| Hardware | Recommended model |
|---|---|
| CPU-only / 8 GB RAM | `qwen3.5:2b` |
| 16 GB RAM | `qwen3.5:4b` |
| 32 GB RAM | `qwen3.5:9b` |
| 64 GB+ RAM | `qwen3.5:27b` |
| NVIDIA GPU | `qwen3.5:9b` (scale to 27b with 16 GB+ VRAM) |
| AMD GPU | `qwen3.5:9b` (scale to 27b with 16 GB+ VRAM) |
| Apple Silicon | `qwen3.5:9b` on 16 GB unified memory; 27b on 64 GB+ |

`JARVIS_NUM_CTX` controls context length. Streaming is enabled by default.

## 9. Running Free Jarvis

```bash
jarvis                    # interactive terminal chat
jarvis setup              # first-run / resume setup
jarvis doctor             # verify local installation
jarvis serve --engine ollama --model qwen3.5:4b
jarvis gui                # local API server + browser command center
```

The HTTP server binds to `127.0.0.1` by default. Health check: `GET /health`. OpenAI-compatible endpoint: `POST /v1/chat/completions`. Local setup facts: `GET /v1/setup/hardware`.

For remote access, explicitly set a host, generate an API key and use HTTPS — see [Security](#13-security-information).

## 10. Desktop application instructions

From a source checkout with Node.js 22+ and Rust installed:

```bash
cd frontend
npm install
npm run tauri dev                 # development
npm run tauri build               # produce local installer bundles
```

The Tauri app is branded **Free Jarvis**, uses Apache-2.0 metadata, and embeds the same browser command center. Packaged installers will be published by the repository owner; no download links are included here until real releases exist.

## 11. Docker deployment

Docker files live in [`deploy/docker/`](deploy/docker/):

```bash
cd deploy/docker
docker compose up -d
curl http://127.0.0.1:8000/health
```

The compose file maps `127.0.0.1:8000:8000` and persists configuration, databases, memory and caches in named volumes / a bound data directory. GPU variants are provided (`docker-compose.gpu.nvidia.yml`, `docker-compose.gpu.rocm.yml`). To use your host Ollama from the container, set `OLLAMA_HOST` appropriately (for example `http://host.docker.internal:11434` on Docker Desktop).

See [`docs/deployment/docker.md`](docs/deployment/docker.md) for health checks, backups and remote-access requirements.

## 12. Configuration

| Variable | Purpose |
|---|---|
| `FREE_JARVIS_HOME` | Preferred data/config/cache root |
| `OPENJARVIS_HOME` | Legacy alias, still honoured |
| `FREE_JARVIS_CONFIG` | Preferred config file path |
| `OPENJARVIS_CONFIG` | Legacy config file alias |
| `OLLAMA_HOST` | Ollama endpoint (default `http://localhost:11434`) |
| `JARVIS_NUM_CTX` | Local context length |
| `OPENJARVIS_API_KEY` | API key; required when the server is not bound to loopback |
| `FREE_JARVIS_WEB_HOST` | Optional frontend bind host (documentation-only; do not expose publicly without auth) |

Persistence, backup/restore, update and uninstall instructions: [`docs/free-jarvis/backup-restore.md`](docs/free-jarvis/backup-restore.md). Configuration reference: [`docs/getting-started/configuration.md`](docs/getting-started/configuration.md).

## 13. Security information

- Local server binds to `127.0.0.1`; remote access is opt-in and requires an API key and HTTPS.
- Never commit `.env`, keys, certificates, databases or personal data. `.gitignore` covers these.
- Tool inputs are validated, filesystem access follows the configured workspace/capability policy, sandboxing is kept enabled where supported, and dangerous actions require explicit approval.
- Audit logs and traces stay local; analytics sharing is opt-in.
- Prompt-injection and malicious-tool-instruction defences are inherited from upstream and preserved.
- Cloud credentials, if you add them, are stored outside the source tree and are never required for local use.

Report vulnerabilities privately through GitHub private vulnerability reporting — see [`SECURITY.md`](SECURITY.md).

## 14. Troubleshooting

| Symptom | What to check |
|---|---|
| `Ollama is not running` | Start Ollama, verify `ollama list`, check `OLLAMA_HOST` |
| No models listed | Pull a model (above) or run `jarvis setup --reset` |
| Server refuses remote connections | Expected: loopback-only by default; configure API key + HTTPS |
| `config.toml` looks unchanged | The wizard backs it up before writing; inspect `config.toml.before-free-jarvis-*` |
| Frontend cannot reach API | Confirm `jarvis gui` is running; check `VITE_API_URL` / proxy target |
| Missing optional deps | `uv sync --extra dev`; some tests need `respx` and `fastapi` from the dev set |

More: [`docs/getting-started/`](docs/getting-started/) and [`docs/deployment/`](docs/deployment/).

## 15. Development instructions

```bash
uv sync --extra dev
uv run pytest
uv run ruff check src tests
uv run ruff format --check src tests

cd frontend
npm install
npm test
npm run build
```

CI workflows under `.github/workflows/` cover Python tests, lint/format, frontend build, Rust/desktop checks, Docker validation, docs and dependency/SAST checks. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 16. License and attribution

Free Jarvis is licensed under the **Apache License 2.0** — see [`LICENSE`](LICENSE).

This repository is a modified downstream distribution of [OpenJarvis](https://github.com/open-jarvis/OpenJarvis), Copyright 2025 The OpenJarvis Authors, also licensed under Apache-2.0. The upstream research is described in the [OpenJarvis paper](https://arxiv.org/abs/2605.17172) and at <https://openjarvis.stanford.edu/>. All upstream copyright and license notices are preserved. Free Jarvis modifications are documented in [`PROJECT_TRANSFORMATION.md`](PROJECT_TRANSFORMATION.md) and tracked in [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md).

Internal identifiers (`openjarvis` package, `jarvis` command, `OPENJARVIS_*` variables, `~/.openjarvis` data dir) are intentionally retained for compatibility. See [`docs/free-jarvis/identity.md`](docs/free-jarvis/identity.md) and [`docs/free-jarvis/migration.md`](docs/free-jarvis/migration.md).
