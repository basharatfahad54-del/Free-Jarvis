# OpenJarvis — Complete Project Reference

> **Personal AI, on personal devices.** OpenJarvis is a local-first framework for building personal AI agents, developed in the spirit of PyTorch as both a research platform and a production foundation. It is organized around five primitives — **Intelligence**, **Engine**, **Agents**, **Tools & Memory**, and **Learning** — and treats energy, FLOPs, latency, and dollar cost as first-class evaluation constraints alongside accuracy. A local learning loop turns an agent's own traces into improvements while keeping the cloud optional. Licensed under Apache 2.0; Python `>=3.11,<3.14`.

This document is a source-level tour of the whole repository. It supplements (rather than replaces) the project's [README](README.md) and [documentation site](https://open-jarvis.github.io/OpenJarvis/): where the user-facing docs explain *how to use* OpenJarvis, this reference walks through *what exists in the tree and how the pieces fit together*. It covers the Python package (`src/openjarvis`), the Rust workspace (`rust/`), the React frontend (`frontend/`), the Tauri desktop app, documentation, deployment assets, examples, scripts, tests, and CI infrastructure. Generated artifacts (`__pycache__`, `.pyc`, `.venv`, `node_modules`, `target`) are intentionally not described.

## Contents

1. [Core runtime, CLI, SDK, config, build](#1-core-system-composition-cli-sdk-bridge-configuration-and-build-entry-points)
2. [Agents, hybrid orchestration, templates](#2-agents-and-templates)
3. [Model engines, intelligence catalog, telemetry, bench](#3-engine-intelligence-telemetry-and-benchmark-internals)
4. [Tool dispatch, sandboxes, skills](#4-tools-sandbox-and-skills)
5. [Memory, integrations, sessions, workflows](#5-memory-connectors-sessions-prompt-recipes-operators-and-workflow)
6. [Learning loops, routing, optimization, spec search](#6-learning-srcopenjarvislearning)
7. [Evaluation harness, datasets, scorers, CLI](#7-evaluation-framework-srcopenjarvisevals)
8. [HTTP server, channels, daemon, A2A/MCP, security](#8-server-channels-daemon-interoperability-observability-and-security)
9. [Rust workspace, PyO3, React frontend, Tauri desktop](#9-rust-frontend-and-desktop)
10. [Docs, deploy assets, tests, CI/CD](#10-documentation-deployment-tests-and-infrastructure)

Each section is self-contained and follows the same approach: architecture and data flow first, then a file-by-file or module-by-module reference with the behaviors, configuration keys, and integration points that matter.

---

## 1. Core, system composition, CLI, SDK bridge, configuration, and build entry points

### Architecture role

OpenJarvis is organized around a small `core` layer of contracts and utilities, a `system` layer that composes those contracts into a runnable assistant, and a Click-based `cli` layer that exposes setup, inference, management, and diagnostics commands. The public Python surface is deliberately narrow: `openjarvis/__init__.py` exports `Jarvis`, `JarvisSystem`, `MemoryHandle`, `SystemBuilder`, and `__version__`. SDK names are resolved through `__getattr__` so lightweight CLI paths do not pay for SDK imports. The version is read from installed distribution metadata, with `0.0.0+unknown` used in an uninstalled source tree.

`src/openjarvis/_rust_bridge.py` provides the optional native boundary. `get_rust_module()` imports `openjarvis_rust`; `_detect_rust()` sets availability. The module exposes JSON-to-Python converters including `scan_result_from_json()`, `injection_result_from_json()`, `retrieval_results_from_json()`, `optimization_store_from_rust(path)`, `trial_result_from_json()`, `optimization_run_from_json()`, and `generate_result_from_json()`. Python callers can therefore use Rust-backed scanning, retrieval, optimization, and generation results when the compiled extension is present, while the bridge keeps the JSON conversion logic in one place.

### `src/openjarvis/core/**`

The `core` package is the dependency-light foundation: shared data structures, registries, paths, configuration, credentials, events, and small cross-platform helpers. `core/__init__.py` re-exports the most common contracts (`Conversation`, `Message`, `ModelSpec`, `Role`, `Quantization`, `ToolCall`, `ToolResult`, `TelemetryRecord`), selected registries, and process/browser utilities.

- **`core/types.py`** defines the wire and execution vocabulary. `Role`, `Quantization`, and `StepType` are enums; `Message` and `ToolCall` carry OpenAI-compatible message content; `Conversation.add(message)` appends with an optional sliding cap and `Conversation.window(n)` returns the last `n` messages. `ModelSpec` describes model identity/capabilities, `ToolResult` and `TelemetryRecord` capture execution outcomes, and `TraceStep`/`Trace.add_step()` accumulate agent traces. `RoutingContext` carries query features for routing policies.
- **`core/registry.py`** defines `RegistryBase`, a class-specific registry with `register(key)`, `register_value(key, value)`, `get(key)`, `create(key, *args, **kwargs)`, `items()`, `keys()`, `contains(key)`, and `clear()`. Concrete registries include models, engines, memory, fact stores, agents, tools, router policies, benchmarks, channels, learning policies, skills, speech, compression, TTS, connectors, and Pearl miners. This registry pattern is what makes the rest of the system composable by string key.
- **`core/paths.py`** resolves OpenJarvis' data root. `get_config_dir()` honors `OPENJARVIS_HOME` first, then `XDG_DATA_HOME/openjarvis`, then `~/.openjarvis`. `_reject_source_tree(path)` raises `ConfigurationError` if the resolved root would live inside the source tree, preserving isolation between source code and user state. `get_config_path()`, `get_data_dir()`, and `get_cache_dir()` derive locations under that root.
- **`core/config.py`** is the configuration model and loader. It defines hardware metadata (`GpuInfo`, `HardwareInfo`, `detect_hardware()`), recommendation helpers (`recommend_engine(hw)`, `recommend_model(hw, engine)`, `estimated_download_gb(parameter_count_b)`), and a large set of dataclasses covering engines, intelligence, learning, storage, tools/MCP, agents, server, telemetry, traces, security, channels, sandbox, scheduler, workflows, sessions, speech, skills, digest, and agents. `EngineConfig` includes deprecated host properties that map to canonical `[engine.<name>]` keys. `load_config(path=None)` detects hardware, builds defaults, applies migrations, and overlays TOML; it is cached with `lru_cache(maxsize=1)`. `validate_config_key(dotted_key)` supports `jarvis config set`; `resolve_json_or_file()` and `resolve_mcp_servers()` allow inline JSON or file-backed MCP configuration. `generate_minimal_toml()` and `generate_default_toml()` render starter files. `apply_security_profile(security_cfg, server_cfg, *, overrides)` expands named profiles; explicit TOML keys override profile defaults.
- **`core/events.py`** supplies `EventType`, `Event`, and a thread-safe `EventBus` with `subscribe(event_type, callback)`, `unsubscribe()`, `publish(event_type, data)`, `history()`, and `clear_history()`. `get_event_bus(*, record_history=False)` returns a singleton; `reset_event_bus()` exists for tests.
- **`core/credentials.py`** manages tool credentials independently of `config.toml`. `load_credentials(path=None)` preserves malformed files as recoverable backups; `save_credential(tool_name, key, value, *, path=None)` validates, persists, and injects into `os.environ`; `delete_credential()` removes both; `inject_credentials()` is intended for server startup; `get_credential_status()` and `get_tool_credential()` report or retrieve without polluting the environment. Optional upgrade keys are separated from required keys by `is_credential_optional()` and `get_required_credentials()`.
- **`core/_network.py`** provides local-endpoint classification without DNS: `endpoint_is_loopback(endpoint)` and `endpoint_is_local_network(endpoint)` help security and server code decide whether a configured endpoint refers to this machine or a private network.
- **`core/utils.py`** contains cross-platform process helpers: `get_python_executable()`, `open_browser(url)`, `process_alive(pid)`, and `terminate_process(pid, *, grace_seconds=...)`, including a Windows process-handle path and POSIX state check.

Hardware and config policy in this layer is concrete. With no GPU the recommendation is `llamacpp`; Apple Silicon recommends `mlx`; NVIDIA datacenter GPUs recommend `vllm` while consumer GPUs recommend `ollama`; AMD datacenter GPUs recommend `vllm` and consumer GPUs recommend `lemonade`. Model tiers use `qwen3.5:2b`, `:4b`, `:9b`, and `:27b`, with Lemonade defaulting to `Qwen3.6-35B-A3B-GGUF`. The security profiles are `personal`, `shared`, and `server`; `server` binds `0.0.0.0`, uses block mode, sets 30 RPM with burst 5, and enables capability checks with default-deny behavior.

### `src/openjarvis/system/**`

The `system` package turns configuration and registries into a live object graph and then routes queries through it. `system/__init__.py` exposes `SystemBuilder`, `JarvisSystem`, `QueryOrchestrator`, `OrchestratorDeps`, and the bundle types.

- **`system/builder.py`** contains `SystemBuilder(config, *, config_path=None)`, a fluent builder with setters such as `engine(key)`, `engine_instance(engine, key)`, `model(name)`, `agent(name)`, `tools(names)`, `telemetry(enabled)`, `traces(enabled)`, `sandbox(enabled)`, `scheduler(enabled)`, `workflow(enabled)`, `sessions(enabled)`, `speech(enabled)`, and `event_bus(bus)`. `build()` resolves engine/model/security/instrumentation/memory/channel/tools/skills/sandbox/scheduler/workflow/sessions/traces/learning/agent manager/speech and constructs a `JarvisSystem`. External MCP clients are discovered through `MCPServer` plus configured servers, and their ownership is transferred to the system; `_clear_mcp_discovery_state()` keeps repeated builds from reusing stale state.
- **`system/core.py`** defines `JarvisSystem`, the authoritative composed runtime. It exposes `security()`, `observability()`, `agents()`, and `scheduling()` bundle views, lazy orchestrator creation, `ask(query, *, context=None, temperature=None, max_tokens=None, agent=None, tools=None, system_prompt=None, operator_id=None, prior_messages=None)`, `wire_channel(channel_bridge)`, and `close()`. Agent intent detection and direct/agent execution live here as delegating helpers to the orchestrator. `wire_channel()` registers a message handler so channel messages are routed into the same query pipeline.
- **`system/orchestrator.py`** defines `QueryOrchestrator(system)` and its `ask(...)` method. The orchestrator injects memory context, builds requested tools, selects an agent or calls the engine directly, and wires runtime security, tracing, and telemetry around the call. It returns the same result-dict shape consumed by CLI, server, and SDK callers.
- **`system/protocols.py`** defines `OrchestratorDeps`, the minimum `JarvisSystem` surface required by `QueryOrchestrator`; this structural contract reduces coupling between orchestration and the full system.
- **`system/bundles.py`** groups related runtime objects into `SecurityContext`, `Observability`, `AgentRuntime`, and `Scheduling` views rather than exposing every subsystem as a top-level attribute.
- **`system/_channel_kwargs.py`** converts `[channels]` configuration into constructor kwargs via `build_channel_kwargs(channel_config, key)`. It has small adapters for Telegram, Discord, Slack, webhook, email, WhatsApp, Signal, Google Chat, IRC, webchat, Teams, Matrix, Mattermost, Feishu, BlueBubbles, WhatsApp Baileys, and SendBlue.

The normal lifecycle is: `load_config()` → `SystemBuilder` resolution → `JarvisSystem` construction → optional channel wiring → lazy `QueryOrchestrator` → `ask()` → resource cleanup through `close()`/context manager. The SDK can bypass parts of this path for simple direct-engine queries, but the system is the composition source of truth.

### `src/openjarvis/sdk.py`

`Jarvis` is the high-level Python API. `Jarvis(*, config=None, config_path=None, engine_key=None, model=None)` lazily creates its engine and supports `ask(query, *, model=None, agent=None, tools=None, temperature=None, max_tokens=None, context=True, channel=None)` for text, `ask_full()` for the complete result dict, `ask_stream()` and `ask_full_stream()` for token streaming, `list_models()`, `list_engines()`, and `close()`/context-manager use. `_resolve_model()` follows config fallbacks; `_run_agent()` delegates agent execution; `_inject_context()` adds memory context. `MemoryHandle(config)` lazily initializes a backend and offers `index(path, *, chunk_size=512, chunk_overlap=64)`, `search(query, *, top_k=5)`, `stats()`, `close()`, and context-manager support.

### `src/openjarvis/cli/**`

`cli/__init__.py` defines the Click `cli` group, `--verbose`, `--quiet`, and `--pick-model`, plus `--version` from `openjarvis.__version__`. It stores flags in `ctx.obj`, configures logging through `log_config.setup_logging()`, and routes bare `jarvis` through `_first_run.check_and_route()`. Registered top-level commands are `scan`, `init`, `ask`, `chat`, `serve`, `model`, `memory`, `mine`, `pearl`, `telemetry`, `bench`, `channel`, `channels`, `scheduler`, `doctor`, `agents`, `workflow`, `skill`, `start`, `stop`, `restart`, `status`, `vault`, `add`, `operators`, `eval`, `host`, `quickstart`, `optimize`, `feedback`, `compose`, `gateway`, `gui`, `tool`, `registry`, `config`, `connect`, `digest`, `deep-research-setup` (also aliased as `research`), hidden `_bootstrap`, `auth`, and `tunnel`. `main()` reconfigures Windows streams to UTF-8 before invoking Click; `cli/__main__.py` supports `python -m openjarvis.cli`.

Important startup behavior is deliberately guarded. `scan --data-boundaries` imports only `scan_cmd` so an invalid `OPENJARVIS_HOME` can be reported as a finding. Update checks run in a daemon thread for interactive invocations and are skipped for `--research`, `scan --data-boundaries`, `--quiet`, `OPENJARVIS_NO_UPDATE_CHECK`, `CI=true`, malformed opt-out config, or `[updates] auto_update = false`. Bare `jarvis` routes to `chat` when a config exists, otherwise to hidden `init --from-bare-jarvis`; `JARVIS_SKIP_MODEL_PICK=1` skips the TTY picker and `--pick-model` forces it.

**Primary interaction and serving commands**

- `ask.py` — `jarvis ask QUERY...` accepts `-m/--model`, `-e/--engine`, `-t/--temperature`, `--max-tokens`, `--json`, `--no-stream`, `--no-context`, `-a/--agent`, `--tools`, `--profile`, `--research`, `--knowledge-db`, repeatable `-i/--image`, `-S/--screen`, `--persona`, and `--route/--router-policy`. It builds a temporary system and either streams tokens or prints a Rich-formatted response.
- `chat_cmd.py` — `jarvis chat` is the REPL, with `-e/--engine`, `-m/--model`, `--pick-model`, `-a/--agent`, `--tools`, `--system`, `--persona`, and `--voice`, plus runtime panel options from `_runtime_panel.py`.
- `serve.py` — `jarvis serve` starts the OpenAI-compatible API with `--host`, `--port`, `-e/--engine`, `-m/--model`, and `-a/--agent`. It resolves CORS from `OPENJARVIS_CORS_ORIGINS`, configures tools and MCP dependencies, and requires an API key for non-loopback binds.
- `daemon_cmd.py` — `start|stop|restart|status` manage a background server; `start` mirrors serve's host/port/engine/model/agent flags.
- `host_cmd.py` — `jarvis host MODEL` downloads and serves a model locally with `-b/--backend`, `-p/--port`, and `--trust-remote-code`.
- `gui_cmd.py` — `jarvis gui` opens the browser UI with `--frontend-port`, `--api-port`, `--no-server`, and `--no-browser`.
- `init_cmd.py` — `jarvis init` detects hardware and writes config. Flags include `--analytics/--no-analytics`, `--force`, `--config`, `--full`, `--engine`, `--no-download`, `--no-scan`, `--host`, `--digest`, `--preset`, and hidden `--from-bare-jarvis`. Preset choices are `chat-simple`, `code-assistant`, `deep-research`, `morning-digest-linux`, `morning-digest-mac`, `morning-digest-minimal`, and `scheduled-monitor`.
- `quickstart_cmd.py` — `jarvis quickstart --force` runs a guided five-step setup and checks engine health/model availability.
- `deep_research_setup_cmd.py` — `jarvis deep-research-setup`/`research` detects local sources, ingests a knowledge store, and can launch Deep Research chat; `--obsidian-vault` and `--skip-chat` control that flow.
- `doctor_cmd.py`, `scan_cmd.py` — `doctor --json --probe-remote` checks installation health; `scan --quick --json --data-boundaries --strict --show-paths` performs host privacy checks or application data-boundary checks.

**Management command groups**

- `model.py` — `list`, `info MODEL`, `pull MODEL --engine`, and `convert HF_REPO --engine --quantize --mlx-4bit --output --force`.
- `memory_cmd.py` — `index PATH --backend --chunk-size --chunk-overlap`, `search QUERY... --top-k --backend`, `list-facts`, `trust-fact INDEX`, `clear -y`, and `stats --backend`.
- `agents` (`agent_cmd.py`) — lifecycle and introspection commands `list`, `create`, `info`, `tasks`, `pause`, `resume`, `delete`, `bind`, `channels`, `search`, `templates`, `launch`, `start`, `stop`, `run`, `status`, `learning`, `trace`, `logs`, `daemon`, `watch`, `recover`, `errors`, `ask`, `instruct`, and `messages`.
- `channel_cmd.py` and `channels_cmd.py` — `channel list|send|status` with `--channel-type`; `channels status|imessage-start|imessage-stop` for SendBlue/iMessage and similar channel management.
- `scheduler_cmd.py` — `create PROMPT --type cron|interval|once --value --agent --tools`, `list --status`, `pause`, `resume`, `cancel`, `logs -n`, `run-task --dry-run`, and `start --poll-interval`.
- `operators_cmd.py` — `list`, `info`, `activate`, `deactivate`, `pause`, `resume`, `run`, `logs -n`, and `install PATH` for persistent autonomous agents.
- `workflow_cmd.py`, `skill_cmd.py`, `tool_cmd.py`, `registry_cmd.py` — workflow `list|run --input|status`; skill `list`, `info`, `run --arg`, `install`, `sync`, `sources`, `remove`, `search`, `update`, `discover`, `show-overlay`; tool `list|inspect`; registry `list|show --verbose`.
- `vault_cmd.py`, `auth_cmd.py`, `config_cmd.py`, `connect_cmd.py`, `add_cmd.py` — encrypted credential `set|get|list|remove`; API key `create-key|revoke-key`; config `show loaded|toml|json|hardware|path`, `set KEY VALUE`; data-source connection management; and `add SERVER_NAME --key --args` for MCP setup.
- `telemetry_cmd.py`, `feedback_cmd.py`, `eval_cmd.py`, `bench_cmd.py`, `optimize_cmd.py` — telemetry `stats -n|export -f -o|clear -y`; feedback `score`, `thumbs`, `evaluate`, `stats`; eval `list|run|compare|report` with backend, engine/model, output, telemetry, W&B, and Sheets flags; bench `run` and `skills`; optimize `run|status|results|best|personal|skills`.
- `compose_cmd.py`, `gateway_cmd.py`, `tunnel_cmd.py`, `mine_cmd.py`, `pearl_cmd.py`, `digest_cmd.py`, `self_update_cmd.py` — composition discovery/bench/deploy; gateway daemon lifecycle; Cloudflare tunnel `--port`/`status`; Pearl mining setup/status/model validation; morning digest display/history/scheduling; and self-update `--check --yes`.

**CLI support modules**

The underscore modules provide focused helpers rather than public commands: `_analytics_consent.py` handles terminal consent, `_banner.py` and `_chat_banner.py` render startup text, `_bg_state.py` reads `~/.openjarvis/.state/` background markers, `_chat_notifications.py` prints completion notifications, `_bootstrap.py` writes initial config from detected hardware/cloud keys, `_first_run.py` implements bare-command routing, `_install_detect.py` identifies pip/uv/git installs, `_version_check.py` polls PyPI, `_model_switch.py` resolves chat model presets, `_presets.py` locates packaged or source presets, `_runtime_panel.py` renders Ollama GPU/context controls, `_screen.py` captures a PNG for vision input, `_tool_names.py` resolves tool selections, `_voice_chat.py` handles mic/TTS chat, and `_chat_notifications.py` covers between-turn updates. `hints.py` formats common error hints; `log_config.py` controls verbose/quiet logging; `dashboard.py` is an optional textual TUI.

Background state is file-based. `~/.openjarvis/.state/` records `rust_extension` as `pending`, `ready`, or `failed`; model downloads use `.downloading`, `.ready`, and `.failed` markers, with versioned markers under `.state/models/v1` keyed by SHA-256 model IDs.

### `configs/openjarvis/**`

`configs/openjarvis/config.toml` is a checked-in evaluation-oriented example, not merely a blank template. It sets `intelligence.default_model = "zai-org/GLM-4.7-Flash"`, `preferred_engine = "vllm"`, deterministic generation (`temperature = 0.0`, `max_tokens = 2048`), a native OpenHands agent, SQLite memory, several engine hosts, disabled learning with heuristic routing, telemetry/traces databases, and a loopback server bind on port 8000. Comments warn that non-loopback binds require an API key.

`configs/openjarvis/examples/` provides starter presets: `chat-simple`, `code-assistant`, `deep-research`, `full-system-access`, `morning-digest-linux`, `morning-digest-mac`, `morning-digest-minimal`, `scheduled-monitor`, and `spec-search-quickstart`. `cli/_presets.py` searches the wheel-bundled `openjarvis/presets` copy first, then the source checkout copy. `init --preset` deliberately exposes only the seven general presets listed above. Persona markdown files under `prompts/personas/` include `jarvis.md` and `neutral.md`.

Configuration precedence is explicit argument → `OPENJARVIS_CONFIG` → `<openjarvis home>/config.toml`. CLI flags override config for the current invocation; security profile defaults are overridden by explicit TOML keys. Credentials are stored separately in `credentials.toml` and injected into the environment.

### `Makefile` and `pyproject.toml`

The `Makefile` mirrors CI. `.PHONY` targets are `setup`, `build`, `test`, `lint`, and `format`. `setup` runs `uv sync --extra dev --extra framework-comparison --extra server`; `build` runs `uv run maturin develop --manifest-path rust/crates/openjarvis-python/Cargo.toml`; `test` depends on `build` and runs `uv run pytest tests/ -n auto -q --tb=short -m "not live and not cloud and not hub"`; `lint` runs `ruff check` and `ruff format --check`; `format` runs `ruff format src/ tests/`.

`pyproject.toml` uses Hatch/Hatch-VCS with version derived from git tags and fallback `0.0.0+unknown`. The package supports Python `>=3.11,<3.14`, is Apache-2.0 licensed, and declares core dependencies including Click, Rich, HTTP clients, OpenAI, PostHog, croniter, filesystem/time-zone helpers, and websocket/telegram support. Console scripts are `jarvis = "openjarvis.cli:main"` and `openjarvis-eval = "openjarvis.evals.cli:main"`. Optional extras cover development, inference backends, memory systems, server/desktop/voice stacks, channels, browser/PDF tooling, security/sandbox integrations, learning, evaluation integrations, Pearl mining, and docs. Wheel force-includes bundle install scripts, Node helpers, server static artifacts, and `configs/openjarvis/examples` as `openjarvis/presets`. Pytest markers separate live, cloud, hub, hardware-specific, slow, and external-framework tests; Ruff is configured with `E`, `F`, `I`, and `W` rules. The `desktop-native` dependency group builds the local `openjarvis-rust` extension without publishing it in wheel metadata.

### Environment variables

Environment variables visible in this scope include `OPENJARVIS_HOME`, `XDG_DATA_HOME`, and `OPENJARVIS_CONFIG` for paths; `OPENJARVIS_NO_UPDATE_CHECK` and `CI` for update checks; `JARVIS_SKIP_MODEL_PICK` and `JARVIS_SKIP_RUNTIME_PANEL` for interactive prompts; `OPENJARVIS_CORS_ORIGINS` and `OPENJARVIS_API_KEY` for server policy; `JARVIS_BACKEND_BASE_URL` and `JARVIS_BACKEND_API_KEY` for eval backends; `OLLAMA_HOST` for local engine discovery; `PEARL_HOME` for Pearl binaries; `HF_TOKEN` for model artifact inspection; and provider keys such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and cloud API keys used by cloud-key bootstrap and credential injection.

---

## 2. Agents and Templates

The `src/openjarvis/agents/**` tree contains the agent framework, the concrete
agents, the managed-agent lifecycle layer, and the hybrid local+cloud experiment
harness. The separate `src/openjarvis/templates/**` tree supplies reusable
agent manifests. Everything below is drawn from the files in those two trees;
`__pycache__` and `.pyc` artifacts are ignored. There is no
`src/openjarvis/agents/README.md` in this checkout — the only README in scope is
`src/openjarvis/agents/hybrid/README.md` (plus the SkillOrchestra package
README).

### Architecture overview

- **Registry-driven design.** Agent classes are discovered through
  `@AgentRegistry.register("<name>")` decorators. `agents/__init__.py` imports
  the built-in modules for their side effects, each import wrapped in
  `try/except ImportError` so an optional dependency does not break package
  import. It exports `AgentContext`, `AgentResult`, `BaseAgent`, and
  `ToolUsingAgent`. Among the guarded imports is a backward-compatibility shim
  named `openjarvis.agents.react`; no `react.py` file is present in this tree,
  so that import is silently skipped.
- **Common contract.** `AgentContext` carries `conversation`, `tools`,
  `memory_results`, and `metadata`. `AgentResult` carries `content`,
  `tool_results`, `turns`, and `metadata`. `BaseAgent` defines abstract
  `run(input, context=None, **kwargs)` and provides helpers for turn events,
  message assembly, generation, max-turn results, and removing `<think>`
  blocks. Class flags describe the runtime: `agent_id`, `accepts_tools`,
  `supports_managed_tool_fallback`, `required_capabilities`, and
  `uses_direct_operations`. Temperature/max-token defaults resolve in the order
  explicit argument → config → class default → hardcoded default.
- **Two agent families.** Most agents are either plain `BaseAgent`
  subclasses (single-turn or external adapters) or `ToolUsingAgent`
  subclasses, which set `accepts_tools = True` and own a `ToolExecutor`.
  `ToolUsingAgent` also accepts loop-guard config, capability policy, rate
  limiter, interactive confirmation, skill few-shot examples, and a prompt
  builder. Hybrid paradigms subclass `LocalCloudAgent`, a `BaseAgent` variant
  that bypasses `InferenceEngine` for raw SDK calls.
- **Managed execution layer.** `AgentManager` persists agent definitions and
  state in SQLite; `AgentScheduler` fires cron/interval ticks;
  `AgentExecutor` runs one tick at a time with retries, event emission,
  tracing, budget accounting, and state finalization; `tool_resolver.py`
  binds the effective live toolkit. `loop_guard.py` and `errors.py` provide
  loop detection and typed retry/escalation decisions.
- **Prompt overrides.** `prompt_loader.py` reads
  `$OPENJARVIS_HOME/agents/{name}/system_prompt.md` and `few_shot.json`,
  treating them as templates that can contain `.format()` placeholders such as
  `{tool_descriptions}`.
- **Direct operations and security.** Agents that execute code, shells, or
  web search declare capabilities; `BaseAgent._execution_denied_result()` and
  `_authorize_direct_operation()` consult the shared security runtime before
  such work begins. Hybrid agents set `uses_direct_operations = True` because
  they call web search and shell loops without a `ToolExecutor`.

### File-by-file reference

#### Core framework and lifecycle

- **`__init__.py`** — exports the four base types and imports all built-in
  agent modules so their registry decorators run.
- **`_stubs.py`** — defines `AgentContext`, `AgentResult`, the abstract
  `BaseAgent` with its shared helpers and authorization hooks, and
  `ToolUsingAgent` with tool execution and turn-loop plumbing.
- **`executor.py`** — `AgentExecutor` supports one-shot
  `run_ephemeral()` calls and stateful `execute_tick()`. A tick acquires the
  manager's concurrency guard, publishes tick events, subscribes to tool and
  inference events for activity/trace capture, resolves the agent's toolkit,
  builds the tick input (standing instruction, prior-tick note, queued user
  messages, optional retrieved memory), calls `agent.run()`, retries once on
  empty output, retries retryable errors up to three attempts with backoff,
  finalizes budgets/status, and saves traces. When a tool-bearing ephemeral
  request targets an agent that does not accept tools, it substitutes
  `OrchestratorAgent` rather than silently dropping the tools.
- **`manager.py`** — SQLite-backed `AgentManager` with WAL mode, foreign keys,
  tables for agents, tasks, bindings, checkpoints, messages, and a learning
  log, plus runtime-column migrations. It tracks tokens, cost, run counts,
  activity strings, and stall retries; `start_tick()` can overtake zombie
  locks older than 600 seconds, while an unconditional running→idle sweep is
  reserved for the process that owns tick execution. It also loads managed
  agent templates and implements `create_from_template()`.
- **`scheduler.py`** — `AgentScheduler` reads each agent's `schedule_type`
  (`cron`, `interval`, or `manual`) and `schedule_value`, computes the next fire
  time with `croniter` when available (missing cron support is treated as
  fatal), honors an optional IANA timezone, and dispatches due ticks from a
  daemon background thread.
- **`loop_guard.py`** — `LoopGuardConfig` and `LoopGuard` detect repeated
  SHA-256 hashes of `(tool_name, arguments)`, ping-pong tool sequences, and
  polling-tool budget overruns; they also provide staged context-overflow
  compression. A Rust implementation is used when the optional bridge is
  available, with a Python fallback. `warn_before_block` warns on the first
  cycle and blocks the next.
- **`errors.py`** — defines `AgentTickError`, `RetryableError`, `FatalError`,
  and `EscalateError`, pattern-based classification of rate limits/timeouts
  versus permission/configuration failures, retry delays, and suggested
  actions for traces.
- **`tool_resolver.py`** — `resolve_agent_tools()` produces the effective
  toolkit in stable first-wins order: agent-type grants (for example the
  deep-research tool bundle), configured registry tools and custom OpenAI-style
  specs (with `browser` expanding to six browser sub-tools), then MCP adapters.
  `config["mcp_tools"] = false` excludes MCP for that agent. The resolver
  tracks owned resources so stores and clients can be closed after the turn.

#### General-purpose and specialized agents

- **`simple.py`** — `simple` agent: one query → one generation → one response;
  no tool loop. It opts into `supports_managed_tool_fallback` so the executor
  can run it with a function-calling loop when tools are requested.
- **`orchestrator.py`** — `orchestrator` agent: the main multi-turn tool
  caller. Default `function_calling` mode parses OpenAI `tool_calls`;
  `structured` mode parses a THOUGHT/TOOL/INPUT/FINAL_ANSWER text protocol from
  the canonical prompt registry, the format used by SFT/GRPO training. It can
  dispatch independent calls through a thread pool.
- **`native_react.py`** — `native_react` agent: OpenJarvis's native
  Thought/Action/Observation loop, parsing `Action:` and `Action Input:` text
  into `ToolCall` objects, with system-prompt and few-shot overrides.
- **`native_openhands.py`** — `native_openhands` agent: OpenJarvis's native
  CodeAct-style code-execution agent, with a tool-use system prompt, token
  estimation, prompt overrides, and a JSON/code-oriented action parser.
- **`deep_research.py`** — `deep_research` agent: multi-hop retrieval over
  personal sources using native function calling, cross-referencing hits and
  emitting narrative reports with inline citations. Its specialized tool grant
  is assembled by `build_deep_research_tools()` in `tool_resolver.py`.
- **`operative.py`** — `operative` agent: a persistent tool-using agent that
  restores session history from previous ticks, writes state back between
  ticks, and is designed for scheduled autonomous operation.
- **`monitor_operative.py`** — `monitor_operative` agent: long-horizon variant
  with four configurable strategy axes — `memory_extraction`,
  `observation_compression`, `retrieval_strategy`, and `task_decomposition` —
  plus the session-store/memory-backend/operator-id persistence pattern. The
  built-in managed templates configure these axes.
- **`rlm.py`** — `rlm` agent: Recursive Language Model implementation based on
  arxiv:2512.24601. Long context lives as a variable in a persistent REPL; the
  root model writes Python to inspect and decompose it and calls recursive
  sub-models through `llm_query()` / `llm_batch()`. `_RLMReplTool` exposes the
  REPL as a tool and declares `code:execute`.
- **`rlm_repl.py`** — `RLMRepl`: the persistent Python namespace with injected
  helpers (`llm_query`, `llm_batch`, `FINAL`, `FINAL_VAR`), a safe-module
  allowlist, blocked patterns (`os.system`, `subprocess`, `open(`, sockets,
  network imports, etc.), and captured stdout/stderr.
- **`research_loop.py`** — a deliberately small planner-executor loop over
  `HybridSearch.search` only. The caller supplies the planner, the loop allows
  up to `max_iterations` tool calls, trims tool results before re-entering the
  context, and requires the final reply to cite specific hits. It is decoupled
  from `ToolUsingAgent`, the event bus, and `AgentContext`.
- **`digest_store.py`** — `DigestArtifact` and `DigestStore`: SQLite storage
  for pre-computed digests, including text, audio path, sections, sources,
  model/voice, timestamps, quality score, and evaluator feedback.
- **`morning_digest.py`** — `morning_digest` agent: a thin orchestrator that
  delegates collection to `digest_collect`, writes a sectioned narrative with
  the LLM (`messages`, `calendar`, `health`, `world`, `music`), generates audio
  through `text_to_speech`, and persists through `DigestStore`.
- **`proactive_agent.py`** — `proactive` agent: a cron-oriented routine-task
  handler (default 5am) that reads `USER.md`/`MEMORY.md`, collects overnight
  data, proposes tiered actions, auto-approves trivial or learned patterns,
  queues the rest for approval, executes approved actions, and reports a
  summary. It documents an approval reply grammar (`{id} yes/no`,
  `always yes/no {id}`, `yes all`/`no all`) and a `register_cron()` helper.
- **`channel_agent.py`** — `ChannelAgent`: bridges `ChannelMessage` objects to
  any `run(input) -> AgentResult` agent. `classify_query()` marks queries deep
  on deep keywords, time ranges, or more than 20 words; deep or long responses
  (>500 characters) become a preview plus an `openjarvis://research/{session_id}`
  escalation link. Agent invocation happens on a background thread pool.

#### External coding-agent adapters

- **`claude_code.py`** — `claude_code` agent: spawns a Node.js runner that uses
  `@anthropic-ai/claude-agent-sdk`, communicating JSON over stdin/stdout with
  sentinel markers; the OpenJarvis engine is accepted but unused. It declares
  code/file capabilities and does not accept OpenJarvis tools.
- **`agents/claude_code_runner/index.mjs`** and **`package.json`** — the Node
  bridge invoked by `claude_code.py` (outside the hybrid subpackage).
- **`opencode.py`** — `opencode` agent: spawns `opencode serve`, drives a
  session through its HTTP API, and configures an OpenAI-compatible provider
  backed by the local OpenJarvis engine so the external coding agent owns the
  loop while OpenJarvis supplies the model. The binary is not bundled; `run()`
  errors clearly if it is absent from `PATH`.
- **`openhands.py`** — `openhands` agent: thin adapter to the optional
  `openhands-sdk` package for AI-driven development; declares
  `code:execute`/`file:read`/`file:write` capabilities. The native alternative
  is `native_openhands.py`.

#### Hybrid support modules

- **`hybrid/__init__.py`** — documents the six registered paradigms and states
  that callers pass formatted prompts via `run(input=...)` and task metadata
  via `context.metadata`.
- **`hybrid/README.md`** — paradigm table, repository layout, quickstart,
  cell-scaffolding instructions, and reference results. It gives two different
  result-directory defaults: the header says `$OPENJARVIS_HYBRID_EXPERIMENTS_DIR`
  defaults to `~/.openjarvis/experiments/hybrid/`, while the quickstart says
  outputs default to `~/.openjarvis-hybrid/experiments/`.
- **`hybrid/_base.py`** — `LocalCloudAgent`: raw Anthropic/OpenAI/Gemini and
  local-vLLM helpers, web-search helpers, model-family quirks, thread-local
  trace/call-count buffers, capability checks, soft-failure handling, and a
  uniform `run()` wrapper. Subclasses implement `_run_paradigm()` and return
  `(answer, metadata)`; the base adds `n_cloud_calls`, `n_local_calls`,
  `latency_s`, token totals, `cost_usd`, and `traces`, and writes a per-task
  JSON trace when `context.metadata["log_dir"]` is set.
- **`hybrid/_prompts.py`** — benchmark answer-format instructions. The GAIA
  prompt demands one short exact answer ending in `FINAL ANSWER: <answer>`
  with explicit number/string/list rules; the module also carries the
  SWE-bench-side formatting helpers.
- **`hybrid/_prices.py`** — cloud pricing in USD per million tokens
  (input/output) for Claude, GPT, and Gemini families, local models at zero,
  plus helper predicates for temperature support and GPT-5-family token
  parameters. Kept separate from engine pricing to match the reference
  harness's cost accounting.
- **`hybrid/_energy.py`** — `EnergyCollector` samples NVML GPU power at about
  2 Hz on a background thread and integrates power×time into joules for a
  whole cell. It honors `CUDA_VISIBLE_DEVICES`, covers all visible GPUs on the
  runner host (typically the local vLLM server), absorbs NVML failures as
  `0.0`, and does not measure cloud energy.
- **`hybrid/_openai_retry.py`** — process-wide idempotent monkey patch of the
  OpenAI SDK: 600-second timeout, `max_retries=8`, a default concurrency of 4,
  exponential backoff, and short retries for local-vLLM endpoints. It exists
  so libraries that construct their own clients also get hardened retries.
- **`hybrid/runner.py`** — CLI (`python -m openjarvis.agents.hybrid.runner
  --cell NAME`). It loads a cell from `registry/<method>.toml` (or
  `OPENJARVIS_HYBRID_REGISTRY_DIR`), instantiates the registered agent, loads
  tasks through OpenJarvis dataset providers, runs tasks with configurable
  concurrency and a hard wall-clock timeout enforced on daemon threads,
  scores them, and writes `runs/<cell>/{results.jsonl,summary.json,config.json,logs/}`
  in the reference harness schema. The README points to the Modal-backed
  SWE-bench scorer in `evals/scorers/swebench_harness.py`.
- **`hybrid/registry/*.toml`** — nine cell catalogs: `advisors`, `archon`,
  `baseline_local`, `conductor`, `minions`, `skillorchestra`, `mini_swe_agent`,
  `swe_agent_loop`, and `toolorchestra`. Each `[cells.<name>]` block pins
  `method`, `bench`, `n`, `local`, `cloud`, and `method_cfg`, with optional
  `subset` and `concurrency`; comments record stage-1 smokes (n=3), mid runs
  (n=30), and full ablations (n=100+).
- **`hybrid/scripts/new_experiment.sh`** — appends a new `[cells.<name>]`
  block to a method's registry TOML and prints the runner invocation.

#### Hybrid paradigm modules

- **`hybrid/minions.py`** — `minions` agent wraps HazyResearch Minions with a
  cloud supervisor and one (`minion`) or several (`minions`) local workers in
  a reactive loop until the supervisor commits a final answer. Import is lazy.
  On first `run()` it applies idempotent compatibility patches: strip
  temperature for Opus 4.7+, inject server-side JSON `output_config` on
  supervisor turns, short-circuit valid-JSON extraction, and add timeouts and
  retries to bare Anthropic clients.
- **`hybrid/conductor.py`** — `conductor` agent implements a static-DAG plan:
  a zero-shot cloud planner emits up to five `(model_id, subtasks,
  access_list)` triples; each step's worker prompt concatenates prior outputs
  selected by the access list. Plan parse failures retry with a stricter
  JSON-only prompt, then fall back to the strongest worker. Worker pools are
  explicit in `method_cfg` because the paper's default pool is cloud-only.
- **`hybrid/archon.py`** — `archon` agent performs inference-time architecture
  search: K local proposers sampled from vLLM, a cloud ranker, and a cloud
  fuser (`ensemble_rank_fuse`). `single_local` is a debug preset. The upstream
  Archon library is imported lazily, with custom `vllm_local` model wiring and
  patched SDK calls for token accounting and temperature quirks.
- **`hybrid/advisors.py`** — `advisors` agent runs cloud executor → local
  advisor critique → cloud executor rewrite. It is the inference-only lower
  bound of the advisor-models paper (the RL-trained advisor is not
  reproduced), with optional server-side web search in `method_cfg`.
- **`hybrid/toolorchestra.py`** — `toolorchestra` agent has two modes.
  `prompted` uses a cloud orchestrator emitting JSON `call_worker` /
  `final_answer` actions over a numbered pool. `rl` uses a locally served
  `nvidia/Orchestrator-8B` emitting OpenAI tool calls for `search`,
  `enhance_reasoning`, and `answer`, with `*-1/2/3` model aliases mapped to
  cloud, gpt-5-mini, and local backends. Upstream Tavily/FAISS, the code sandbox,
  and the full multi-model pool are not reproduced.
- **`hybrid/mini_swe_agent.py`** — a vendored mini-SWE-agent v2 loop. It clones
  the SWE-bench repo into a disposable tempdir and gives the model a single
  `bash` tool; the loop ends when the model emits no tool call, and the patch
  comes from `git diff`. There is no Docker sandbox and network access is
  available, so the workdir must be treated as untrusted. It is both a
  standalone `mini_swe_agent` agent and the shared `run_swe_agent_loop()`
  subroutine used as the worker loop by other paradigms on SWE-bench.
- **`hybrid/baseline_cloud.py`** and **`hybrid/baseline_local.py`** — single-model
  ablations. On GAIA each makes one call in its respective direction with the
  formatted prompt; on SWE-bench each runs `run_swe_agent_loop()` with
  `backbone="cloud"` or `"local"`. The unused side of the cell is accepted for
  schema compatibility; local-only cost is always zero.
- **`hybrid/skillorchestra.py`** — a legacy single-file `skillorchestra` agent:
  a cloud router reads a question, identifies skills from a fixed catalog,
  constrains its output with a JSON schema, scores the two pool agents as
  weighted competence minus a cost penalty, and routes to the winner. This file
  is shadowed by the `skillorchestra/` package described below.

#### SkillOrchestra package

- **`hybrid/skillorchestra/__init__.py`** — importing the package registers
  the active `skillorchestra` agent and documents its layout.
- **`hybrid/skillorchestra/agent.py`** — the registered `SkillOrchestraAgent`.
  It loads an optional handbook, validates routing strategies, requires
  `code:execute`/`file:read`/`file:write` plus search access for QA runs,
  treats malformed router/orchestrator JSON as a soft failure, calls
  `run_orchestrator()` for QA tasks, and delegates SWE cells to
  `run_swe_agent_loop()`.
- **`hybrid/skillorchestra/orchestrator.py`** — the multi-round search →
  reasoning → answer loop. Each round builds a capped context string, asks the
  orchestrator model for a stage with three tools, parses `<skill_analysis>`
  and the tool call, resolves a model alias through the routing strategy,
  executes the tool, and ends on `answer` or forces an answer on the last
  round. Configurable knobs include `max_rounds`, `context_char_cap`,
  `retriever_url`, `code_timeout_s`, `answer_max_tokens`, and
  `orchestrator_model`/`orchestrator_endpoint`.
- **`hybrid/skillorchestra/stage_router.py`** — `StageSkillHandbook` loaded
  from JSON, `Skill`/`ModelProfile` dataclasses, `parse_skill_analysis()`, and
  five `RoutingStrategy` implementations: `router_decides`,
  `analyze_model_decide`, `weighted_avg`, `weakest_skill`, and
  `strongest_skill`.
- **`hybrid/skillorchestra/types.py`** — learning-time data types including
  `BetaCompetence`, `CostStats`, `RoutingInsight`, `ModeMetadata`,
  `SkillProvenance`, `Skill`, and `AgentProfile`.
- **`hybrid/skillorchestra/pool.py`** — resolves stage aliases (`search-1/2/3`,
  `reasoner-1/2/3`, `answer-1/2/3/4`, `answer-math-1/2`) onto the cell's local
  and cloud models by cost tier, with `method_cfg.model_pool` overrides.
- **`hybrid/skillorchestra/tools.py`** — Anthropic/OpenAI/Gemini tool schemas
  and executors for `search` (FAISS retriever POST or provider web search),
  `enhance_reasoning` (model-generated Python in a timed subprocess), and
  `answer`.
- **`hybrid/skillorchestra/prompts/`** — verbatim upstream prompt packages:
  `eval_orchestrator.py`, `model_routing.py`, and `learning.py`, re-exported by
  `prompts/__init__.py`.
- **`hybrid/skillorchestra/README.md`** and **`handbook_seed.json`** — the
  fidelity notes (what is verbatim, what is degraded, and which `method_cfg`
  keys exist) and a hand-authored starter handbook.

### Hybrid paradigms in detail

- The README lists six paradigms and stresses that the OpenJarvis ports are
  **inference-only**: parentheses in its table identify what the *papers*
  train, not what these agents train. No weights are modified.
- **Minions** is a reactive local/cloud loop; the reference results quoted in
  the README are GAIA 0.576 accuracy at $0.67 and SWE-bench-Verified 0.276 at
  $0.09, versus a cloud-only baseline of 0.570/$1.09 and 0.238/$0.95.
- **SkillOrchestra** is a per-query skill router: 0.570 at $0.02 on GAIA and
  0.298 at $0.05 on SWE in the same reference table. The legacy single-file
  implementation uses a smaller two-agent catalog; the active package
  implements the full eval-orchestrator loop.
- **Conductor** is a static DAG planner (0.503/$0.03 GAIA, 0.296/$0.07 SWE in
  the README), **Advisors** a critic loop (0.497/$0.02 and 0.302/$0.07), and
  **Archon** layered sampling (0.376/$0.14 and 0.288/$0.17). **ToolOrchestra**
  is recorded as ported but untested at full N because of its heavy infra.
- Cell TOMLs mirror the reference harness's model/N/`method_cfg` choices. The
  `swe_agent_loop.toml` catalog reruns the paradigms with
  `swe_use_agent_loop = true`, so the worker step is the full bash loop rather
  than one-shot patch prediction; comments warn that those cells are expensive
  (~30–50 turns per task).
- Runner output is designed to be consumed by the existing rescore/dashboard
  tooling unchanged. Energy is attributed per cell rather than per task
  because concurrency makes per-task GPU attribution noisy; pricing is charged
  with the hybrid price table rather than the engine's pricing table.

### SkillOrchestra internals

- There are two registered agents named `skillorchestra` in source: the legacy
  root `hybrid/skillorchestra.py` and the package `hybrid/skillorchestra/
  agent.py`. Python import resolution selects the package directory over the
  same-named module file, so the package registers the active agent.
- The package is a structural port of the upstream eval orchestrator: verbatim
  prompts and router types, a real multi-round ReAct loop, real subprocess code
  execution, and an alias pool collapsed from 6+ served models onto one local
  and one cloud model.
- When no handbook (or `routing_strategy = "none"`) is configured, the
  orchestrator uses the baseline `Problem: ... Choose an appropriate tool.`
  prompt and stage-default aliases. With a handbook, it uses
  `build_skill_orchestrator_prompt()`, parses `<skill_analysis>`, and asks the
  selected strategy to pick a model alias for the current stage.
- Infrastructure gaps degrade gracefully: no FAISS retriever means provider
  web search; no learned handbook means baseline routing; no large model pool
  means alias-tier collapse. The README states that the offline
  explore→learn→select pipeline is not ported, but a learned handbook can be
  dropped in through `handbook_path` with no code change.

### Agent templates

Two distinct template systems ship in this tree:

- **`src/openjarvis/templates/`** defines the portable manifest format.
  `agent_templates.py` parses `[template]` (name, description) and `[agent]`
  (type, max_turns, temperature, tools, system_prompt) into `AgentTemplate`.
  `discover_templates()` searches built-in `templates/data/`, then
  `~/.openjarvis/templates/agents/`, then caller-supplied extra directories;
  later directories override earlier ones by name and results are sorted.
  The 16 built-ins are: `architect`, `assistant`, `code-reviewer`,
  `data-analyst`, `debugger`, `deep-researcher`, `fact-checker`,
  `inbox-triager`, `meeting-prep`, `monitor`, `note-taker`, `security-auditor`,
  `summarizer`, `translator`, `tutor`, and `writer` (orchestrator,
  `native_react`, and `simple` types, with `monitor` declaring type `monitor`).
  They range from one-turn `simple` roles
  (`summarizer`, `translator`, `note-taker`) to 15–25-turn orchestrator or
  monitor roles with web, file, memory, and knowledge-graph tools.
- **`src/openjarvis/agents/templates/`** holds four managed-agent
  manifests with a different single-table `[template]` schema: `id`, `name`,
  `description`, optional icon, `agent_type`, `schedule_type`/`schedule_value`,
  `tools`, `max_turns`, `temperature`, monitor strategy axes, and either a
  literal `system_prompt` or a `system_prompt_template` containing
  `{instruction}`. `code_reviewer` and `inbox_triager` are hourly/30-minute
  `monitor_operative` schedules; `research_monitor` is a daily cron
  (`0 9 * * *`); `personal_deep_research` is a manual `deep_research` agent.
  `AgentManager.list_templates()` reads built-in and user TOMLs under
  `templates/`, tags them with `source`, and `create_from_template()` expands
  the prompt template with the chosen instruction before creating the agent.
  The package's `__init__.py` is empty.

### Query-to-execution data flow

- **Direct agent call (SDK/CLI).** The caller selects a registered agent class
  and invokes `run(input, context=...)`. A `ToolUsingAgent` builds messages
  from the system prompt and conversation, calls the inference engine through
  `_generate()`, parses tool calls, executes each tool through its
  `ToolExecutor`, appends results, and repeats until a final answer or a
  max-turn result. Turn events flow to the event bus; prompt and few-shot
  overrides are loaded from `OPENJARVIS_HOME`.
- **Managed tick.** A user message is queued with `AgentManager.send_message()`.
  The scheduler (or an HTTP `/run` route) calls `AgentExecutor.execute_tick()`.
  The executor acquires the tick lock, builds the tick text from the standing
  instruction, last-tick summary, date, and queued messages, optionally
  prepends retrieved memory, resolves tools first-wins via
  `resolve_agent_tools()`, constructs the registered agent with the system,
  bus, capability policy, and rate limiter, and runs it. Loop guards and
  engine errors are classified into retry/escalate/fatal outcomes; successful
  results update token/cost/run statistics, responses are stored with tool
  call replay data, and trace steps are saved.
- **Hybrid experiment cell.** The runner reads a registry cell, creates the
  paradigm agent with the local endpoint/model and cloud model/endpoint from
  the cell, loads a benchmark task, formats the prompt with the benchmark's
  answer-format instructions, and passes task metadata through
  `AgentContext.metadata`. `LocalCloudAgent.run()` opens thread-local trace
  state, performs capability checks, and calls `_run_paradigm()`. Paradigm code
  makes raw SDK calls to local and cloud backends, optionally runs the shared
  SWE bash loop, accumulates tokens/cost/events, and returns through the base
  wrapper, which writes the per-task trace and the result row. The runner
  scores the row and emits the cell's JSONL, summary, config, and logs while
  the energy collector integrates GPU joules across the cell.
- **SkillOrchestra QA path specifically.** The orchestrator assembles a
  context from documents, code results, and attempts; asks the orchestrator
  model for a tool and skill analysis; routes the worker alias through the
  handbook strategy; executes `search`, `enhance_reasoning`, or `answer`; and
  repeats up to `max_rounds`, forcing `answer` at the end. SWE cells bypass
  this QA loop and use the shared mini-SWE-agent loop instead.

---

## 3. Engine, Intelligence, Telemetry, and Benchmark Internals

### Engine layer

The engine layer is the runtime boundary between OpenJarvis and a model backend. `src/openjarvis/engine/_stubs.py` defines the core `InferenceEngine` protocol with four required methods: `generate()`, `stream()`, `list_models()`, and `health()`. Engines may also implement `can_serve(model)` to declare model ownership, `prepare(model)` for setup work, and `close()` for resource cleanup. The same module defines `StreamChunk`, whose fields are `content`, `tool_calls`, `finish_reason`, `usage`, `content_blocks`, and `tool_results`; `ResponseFormat`, which supports `json_object` and a named `json_schema`; and a default `stream_full()` implementation that calls `stream()` and emits a final chunk with `finish_reason="stop"` when a backend does not do so itself.

`src/openjarvis/engine/_base.py` supplies shared error types and helpers. It marks certain errors as context-length failures through `CONTEXT_LENGTH_MARKERS` — `"context length"`, `"maximum context"`, `"context window"`, `"maximum_context"`, and `"context_length_exceeded"` — and exposes `EngineContextLengthError`. `estimate_prompt_tokens()` is a rough local estimator using approximately four characters per token plus four tokens per message; it counts message text, reasoning metadata, tool calls, and tool-call IDs. `messages_to_dicts()` normalizes message objects to plain dictionaries for HTTP payloads.

Discovery lives in `src/openjarvis/engine/_discovery.py`. `_HOST_MAP` maps registry keys such as `ollama`, `vllm`, `sglang`, `llamacpp`, `mlx`, `lmstudio`, `exo`, `nexa`, `uzu`, `apple_fm`, `lemonade`, `nim`, and `gemma_cpp` to configuration host attributes. Health probes run concurrently in a `ThreadPoolExecutor` sized to the number of keys. Fast fake and stub engines are skipped for automatic selection. Healthy results are sorted with the configured default engine first, then by preference and availability. `get_engine(engine_key=..., model=...)` treats an explicit key as authoritative and will not silently substitute a different engine; when no key is provided, the fallback prefers engines of the same local/cloud class and honors `engine.can_serve(model)`. The discovery module also registers a synthetic `vllm-pearl-mining` engine when a mining sidecar payload contains both `vllm_endpoint` and `model`; a trailing `/v1` is stripped from that endpoint.

`src/openjarvis/engine/__init__.py` eagerly imports `nim`, `ollama`, and `openai_compat_engines`, while imports of optional backends such as `cloud`, `litellm`, `gemma_cpp`, and `apple_fm` are guarded against `(ImportError, OSError)`. This lets the package load when optional SDKs or platform libraries are unavailable.

Most local HTTP backends share the OpenAI-compatible request path in `src/openjarvis/engine/_openai_compat.py` and the asynchronous streaming support in `src/openjarvis/engine/_http_async.py`. The common path posts to `/v1/chat/completions`, translates tools and `ResponseFormat` into OpenAI-style payloads, parses `usage`, and handles server-sent events. OpenAI-compatible streams map 400 responses whose bodies contain context-length markers to `EngineContextLengthError`. `AsyncHTTPEngineMixin` caches one `httpx.AsyncClient` per event loop. `STREAM_TRANSPORT_ERRORS` includes `httpx.ConnectError`, timeout exceptions, `RemoteProtocolError`, and `ReadError`, but deliberately excludes cancellation so it is not mistaken for a transport failure.

`openai_compat_engines.py` is data-driven: it registers `vllm`, `sglang`, `llamacpp`, `mlx`, `lmstudio`, `exo`, `nexa`, `uzu`, `apple_fm`, and `lemonade`. All except `uzu` use a `/v1` API prefix; `uzu` uses an empty prefix. Hosts come from `<ENGINE_ID>_HOST` and API keys from `<ENGINE_ID>_API_KEY`. The generic `OpenAICompatEngine` class itself is deliberately not registered. These engines report both `prompt_tokens` and `prompt_tokens_evaluated`, giving telemetry an explicit view of prefill work.

`src/openjarvis/engine/ollama.py` uses Ollama’s native `/api/chat` and `/api/tags` endpoints rather than its compatibility layer. It reads `prompt_eval_count` and `eval_count` for token accounting, sends `think=False` by default, filters Qwen3 control tokens, converts streamed tool-call fragments in `stream_full()`, and uses `format: "json"` for structured output requests. `OLLAMA_HOST` and `JARVIS_NUM_CTX` control endpoint and context length.

`src/openjarvis/engine/cloud.py` routes across OpenAI, Anthropic, Gemini/Google, OpenRouter, AtlasCloud, MiniMax, and DeepSeek. Provider keys are read from `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `ATLASCLOUD_API_KEY`, `MINIMAX_API_KEY`, and `DEEPSEEK_API_KEY`. The module includes provider clients, pricing information, and `can_serve()` checks. Structured output is provider-specific: OpenAI uses `response_format`; Anthropic uses a `json_output` tool plus `tool_choice`; Google uses `response_mime_type` and `response_schema`; Atlas passes structured-output fields through; OpenRouter rich streaming passes kwargs but the plain `generate()` path pops `response_format`; MiniMax and DeepSeek drop it. A special Codex path uses `OPENAI_CODEX_BASE_URL` and `OPENAI_CODEX_API_KEY` with the Responses API and does not use `response_format`.

`src/openjarvis/engine/multi.py` implements `MultiEngine`, which routes requests by model name, preserves model ownership when a discovery source is temporarily unavailable, uses `_CLOUD_PREFIXES` to recognize cloud models, and avoids silently falling back from a local engine to a cloud engine. `src/openjarvis/engine/litellm.py` wraps `litellm.completion()` and `acompletion()`, flattens tool calls, uses `completion_cost()` for cost data, and returns only the configured default model from `list_models()`. `src/openjarvis/engine/gemma_cpp.py` runs Gemma models in-process on CPU through a lazily imported `pygemma`; it validates model/tokenizer paths, applies the Gemma chat template, and estimates tokens. Paths and behavior are controlled by `GEMMA_CPP_MODEL_PATH`, `GEMMA_CPP_TOKENIZER_PATH`, `GEMMA_CPP_MODEL_TYPE`, and `GEMMA_CPP_NUM_THREADS`.

`src/openjarvis/engine/nim.py` targets NVIDIA NIM. It defaults to `https://integrate.api.nvidia.com`, uses `/v1/chat/completions`, `/v1/models`, and `/v1/health/ready`, reads `NIM_HOST` and `NIM_API_KEY`, and computes `is_cloud` dynamically from whether the host is local. `src/openjarvis/engine/apple_fm.py` is an in-process Apple Foundation Models engine. The labels `afm-3`, `afm-3-core`, and `afm-3-core-advanced` are run labels; the SDK’s dynamic profile chooses the actual variant. It uses `AsyncLoopRunner`, derives deltas from cumulative snapshots, reads SDK `token_count` usage, records `describe()` metadata, and has no Private Cloud Compute path. `apple_fm_shim.py` exposes a local HTTP compatibility surface with `/v1/chat/completions` and `/v1/models`, requires macOS 26+, uses a `SnapshotAccumulator`, and includes SDK `token_count` usage. `nexa_shim.py` reports zero prompt, completion, and total tokens because the Nexa SDK exposes no token counts; telemetry savings and leaderboard calculations exclude those sessions.

### Intelligence catalog

`src/openjarvis/intelligence/__init__.py` exports only `BUILTIN_MODELS`, `merge_discovered_models()`, `register_builtin_models()`, and `resolve_model_id_for_engine()` from `model_catalog.py`. The catalog contains 78 `ModelSpec` entries describing model families, parameter counts, context lengths, and supported engines. `register_builtin_models()` installs them into a registry, and `merge_discovered_models()` folds discovered engines into the catalog using minimal `ModelSpec` objects with `parameter_count_b=0.0`, `context_length=0`, and `supported_engines=(engine_key,)`. `resolve_model_id_for_engine()` rewrites model IDs only for MLX, using the `mlx_repo` metadata key. There is no router module anywhere under `src/openjarvis/intelligence/`; routing decisions instead appear in discovery, `MultiEngine`, and the cloud engine.

### Telemetry

Telemetry is organized around consistent energy/power bases. `energy_monitor.py` defines `BASIS_SOC` for Apple whole-SoC rails and `BASIS_GPU` for the discrete-GPU path; energy and power samples must share the same basis. `create_energy_monitor()` detects NVIDIA first, then AMD, then Apple, then CPU RAPL. `prefer_vendor` moves a requested vendor to the front, and modelled Apple `tdp_estimate` values are produced only when `allow_estimates=True`.

`energy_nvidia.py` uses NVML counters on Volta and newer GPUs via `nvmlDeviceGetTotalEnergyConsumption()` in millijoules. Older GPUs use trapezoidal integration of sampled power. The monitor also polls utilization, memory, and temperature, and labels `energy_method` as either `hw_counter` or `polling`. `energy_amd.py` uses `amdsmi_get_energy_count()` accumulator deltas multiplied by `counter_resolution` in microjoules and sets `energy_method="hw_counter"`. `energy_apple.py` uses `zeus_apple_silicon` IOReport rails for CPU, GPU, DRAM, and ANE. GPU SRAM energy is added to GPU energy. Unavailable rails are reported as `None`, not zero. Apple monitors use `BASIS_SOC`; the opt-in TDP estimate uses an active ratio of 0.60 and fixed rail ratios of 0.25 CPU, 0.55 GPU, 0.15 DRAM, and 0.05 ANE. `energy_rapl.py` reads Linux `/sys/class/powercap/intel-rapl`, including top-level and subdomains, handles counter wraps using `max_energy_range_uj`, and categorizes DRAM, core, and package domains.

`gpu_monitor.py` samples utilization, memory, and temperature. `flops.py` calculates model FLOPs and MFU from token and hardware data. `itl.py` computes inter-token-latency percentiles for streaming requests. `steady_state.py` detects stable benchmark windows using a coefficient-of-variation detector; `phase_metrics.py` splits time and energy into prefill and decode phases. `vllm_metrics.py` scrapes vLLM Prometheus metrics. `session.py` provides a ring-buffer sampler for live sessions, `efficiency.py` computes MFU, MBU, and IPJ, `batch.py` performs batch accounting, and `wrapper.py` is a simple engine generate wrapper.

`store.py` persists telemetry in SQLite. The schema covers token counts, latency, energy, per-rail energy, `energy_basis`, ITL percentiles, `is_streaming`, `token_counting_version`, `mining_session_id`, metadata, and a separate `mining_stats` table. `TelemetryStore` enables WAL, `synchronous=NORMAL`, and `busy_timeout=5000`, uses secure file creation, applies schema migrations, and flushes on batch size, time interval, reads, and close.

`instrumented_engine.py` wraps an `InferenceEngine` and publishes `INFERENCE_START`, `INFERENCE_END`, and `TELEMETRY_RECORD` events. It derives throughput, energy per token, throughput per watt, phase splits, ITL statistics, and tokens per joule, stamps `TOKEN_COUNTING_VERSION`, and injects a `_telemetry` dictionary into results. `aggregator.py` combines records across sessions; `efficiency.py` adds efficiency ratios. The hardware matrix in `flops.py` includes B200-SXM, H100-SXM/PCIE, A100-SXM/PCIE, L40S, A10, RTX 4090/3090, MI300X/MI250X, M4 Max, M2 Ultra, Arc B580/B570, Jetson Orin NX 16GB/8GB, Jetson AGX Orin, and Snapdragon X Elite/Plus.

### Bench subsystem

`src/openjarvis/bench/__init__.py` calls `ensure_registered()`, which imports each benchmark module and invokes its `BenchmarkRegistry` registration on package import. `_stubs.py` defines the benchmark protocol and `BenchmarkResult`, whose fields include benchmark/model/engine identity, metrics, metadata, samples, errors, warmup and steady-state fields, total energy, energy per token, and energy method.

`_stats.py` provides `compute_stats()`, emitting `mean_*`, `p50_*`, `p95_*`, `min_*`, `max_*`, and `std_*` for supplied values; p95 uses linear interpolation. `throughput.py` uses the prompt `"Write a short paragraph about artificial intelligence."` and measures generation throughput over multiple tokens. `latency.py` cycles through `"Hello"`, `"What is 2+2?"`, and `"Explain gravity in one sentence"` for first-token and request latency measurements. `energy.py` uses the same paragraph prompt as throughput, wraps the engine with `SteadyStateDetector()` using defaults `warmup_samples=5`, `window_size=5`, `cv_threshold=0.05`, `min_steady_samples=3`, and `metric="throughput"`, then records per-rail energy totals and the energy basis in `BenchmarkResult.metadata`. Together these modules connect engine responses, telemetry energy accounting, and statistical aggregation into repeatable CLI-registered benchmarks.

---

## 4. Tools, Sandbox, and Skills

This section describes the code under `src/openjarvis/tools/**`, `src/openjarvis/sandbox/**`, and `src/openjarvis/skills/**`. It covers the tool abstraction and dispatch path, the built-in tool modules and TOML templates, the memory/storage backends used by tools, the container and WASM sandbox implementations, and the skill system including the twenty bundled skill manifests.

### Tool architecture

#### Core abstractions

`src/openjarvis/tools/_stubs.py` defines the central tool contract. `BaseTool` is an abstract class with two required members: a `spec` property returning a `ToolSpec`, and an `execute(**params)` method returning a `ToolResult`. `BaseTool.to_openai_function()` converts the spec into an OpenAI-style function definition; it first checks `description_loader.get_tool_description_override()` so a runtime description override can replace the source-level description.

`ToolSpec` is a slotted dataclass carrying `name`, `description`, `parameters`, `category`, `cost_estimate`, `latency_estimate`, `requires_confirmation`, `timeout_seconds`, `required_capabilities`, and `metadata`. Tools are made discoverable with `@ToolRegistry.register("name")` decorators; `tools/__init__.py` imports a fixed list of built-in tool modules so those decorators execute at package import time. Each import is wrapped in `try/except ImportError`, so a missing optional dependency does not prevent the tool package from loading. `agent_tools.py` defines tools but is not present in the built-in import list.

#### ToolExecutor dispatch path

`ToolExecutor` maps tool names to `BaseTool` instances and applies a sequence of gates before invoking a tool:

- It looks up the tool by `ToolCall.name`, parses `arguments` as JSON, and rejects non-object arguments.
- Rate limiting, when a limiter is supplied, is checked first and publishes `RATE_LIMITED` with the wait interval.
- For tools whose `is_local` flag is false, an optional boundary guard can inspect and potentially redact outbound arguments.
- Capability checks combine the tool's own `required_capabilities` with `canonical_tool_capabilities(tool)` when a capability policy is present. A missing capability produces `CAPABILITY_DENIED` and stops execution. The source explicitly treats built-in canonical requirements as a security floor, so a weakened `ToolSpec` cannot silently remove a privileged tool's gate.
- Taint checking unions a per-call `_taint` value with taint accumulated across the executor session. If `check_taint()` reports a sink violation, execution stops and `TAINT_VIOLATION` is emitted. The internal `_taint` key is removed before calling the tool.
- Tools marked `requires_confirmation` need both interactive mode and a confirmation callback; otherwise execution is refused.
- `TOOL_CALL_START` is published with the tool name, arguments, and agent id.

Execution is submitted to `_BoundedToolRunner`, a process-wide pool of at most eight daemon worker threads with a bounded queue of eight pending calls. If the queue is full, the call receives a capacity-exhausted error rather than creating unbounded threads. Timeouts cancel the future, publish `TOOL_TIMEOUT`, and return a failure; the source notes that Python cannot stop an already-running function, but daemon workers prevent interpreter shutdown from hanging. `perf_counter()` is used for latency to avoid coarse Windows timing.

After execution, the result is annotated with latency and arguments. Successful results are scanned with `auto_detect_taint()`, and detected taint is stored in result metadata and folded into session taint. Output from non-local tools is scanned with `InjectionScanner`; HIGH or CRITICAL findings are wrapped in an explicit untrusted-content fence before being returned to the model, and a `SECURITY_ALERT` event is emitted. `TOOL_CALL_END` publishes result text truncated to 10,240 characters and metadata filtered by `_json_safe_metadata()` so non-serializable values such as `TaintSet` do not reach the SQLite trace store.

#### Support modules

- `description_loader.py` reads `$OPENJARVIS_HOME/tools/descriptions.toml`, caches tool-description overrides for the process, and exposes `get_tool_description_override()` and `clear_cache()`.
- `_paths.py` validates `security.allowed_dirs` as a list of non-empty path strings and supplies `file_tool_kwargs()` and `resolve_allowed_dirs()` for `file_read` and `file_write`. An explicit empty list preserves unrestricted behavior; invalid config raises rather than silently relaxing a restriction.
- `mcp_adapter.py` defines `MCPToolAdapter`, which wraps one MCP server tool as a native `BaseTool`, and `MCPToolProvider`, which calls `MCPClient.list_tools()` and returns adapters. Tool results join text content parts and use the MCP `isError` flag for success.
- `approval_store.py` is a SQLite store for proactive-agent approvals. It has `pending_actions` and `permission_memory` tables, decision constants (`always_approve`, `always_deny`, `ask`), status constants, and four default tiers: `trivial` executes immediately, `low` asks once, `medium` asks each time unless remembered, and `high` always asks. Permission keys are formatted as `action_type:fingerprint`.

### Built-in tool modules

#### Reasoning, information, and network

- `think.py` registers `think`, a reasoning scratchpad that echoes its input.
- `calculator.py` registers `calculator`, which safely evaluates arithmetic, math functions such as `sqrt`, `log`, `sin`, and `cos`, and constants.
- `llm_tool.py` registers `llm`, which sends a prompt to a language model for sub-queries or summarization.
- `retrieval.py` registers `retrieval`, searching the knowledge base and returning context with sources.
- `web_search.py` registers `web_search`; its spec describes current web search, and the module includes engine selection and SSRF-related handling.
- `http_request.py` registers `http_request`, supporting GET, POST, PUT, DELETE, PATCH, and HEAD with SSRF protection against private IPs and cloud metadata endpoints.
- `weather.py` registers a weather tool for dynamic locations, with optional forecast support.
- `fx_macro.py` registers `fx_macro_data` for official central-bank and statistics-office series, release history, and calendars across 22 currencies.
- `digest_collect.py` registers `digest_collect`, which fetches recent data from configured connectors such as email, calendar, health, and tasks and returns a sectioned summary.

#### Files, code, and databases

- `file_read.py` registers `file_read` for reading file text, with allow-list support from `_paths.py`.
- `file_write.py` registers `file_write`, supporting write and append modes and the same allow-list mechanism.
- `apply_patch.py` registers `apply_patch`, which applies a standard unified diff with context, additions, and removals.
- `shell_exec.py` registers `shell_exec`, running a shell command with a minimal environment.
- `docker_shell_exec.py` registers `docker_shell_exec`, which runs shell commands inside the task container with the `/app` working directory mounted writable.
- `code_interpreter.py` registers `code_interpreter`; its spec describes AST validation and execution in a hardened isolated subprocess with restricted imports.
- `code_interpreter_docker.py` registers `code_interpreter_docker`, with 512 MB memory, one CPU, no network, and a PID limit of 100.
- `repl.py` registers `repl`, a persistent Python session where variables, functions, and imports survive across calls.
- `git_tool.py` registers `git_status`, `git_diff`, `git_commit`, and `git_log`.
- `db_query.py` registers `db_query` for SQL against SQLite or PostgreSQL, returning a formatted table.
- `scan_chunks.py` registers `scan_chunks`, a semantic search pass that feeds stored chunks to an LM for relevance assessment.

#### Browser and media

- `browser.py` registers five tools sharing a Playwright-style browser session: `browser_navigate`, `browser_click`, `browser_type`, `browser_screenshot`, and `browser_extract`.
- `browser_axtree.py` registers `browser_axtree`, returning a structured accessibility-tree representation with roles, names, values, and states.
- `image_tool.py` registers `image_generate`, returning an image URL for a text description.
- `audio_tool.py` registers `audio_transcribe`, supporting mp3, wav, m4a, ogg, flac, and webm.
- `text_to_speech.py` registers `text_to_speech`, returning the path of generated audio.
- `pdf_tool.py` registers `pdf_extract` for extracting text from a PDF.

#### Memory, knowledge, and integrations

- `storage_tools.py` registers `memory_store`, `memory_retrieve`, `memory_search`, and `memory_index`.
- `knowledge_search.py` registers `knowledge_search`, using BM25 over ingested personal knowledge with filters for source, type, author, and date range.
- `knowledge_sql.py` registers `knowledge_sql`.
- `knowledge_tools.py` registers four graph tools: `kg_add_entity`, `kg_add_relation`, `kg_query`, and `kg_neighbors`.
- `memory_manage.py` registers `memory_manage` for persistent agent-memory entries.
- `user_profile_manage.py` registers `user_profile_manage` for user-profile entries.
- `skill_manage.py` registers `skill_manage` for creating, listing, loading, and deleting agent-authored skills.
- `channel_tools.py` registers `channel_send`, `channel_list`, and `channel_status` for messaging channels such as Telegram, Discord, and Slack.
- `apple_calendar.py` registers `calendar_upcoming` and `calendar_search`.
- `agent_tools.py` registers `agent_spawn`, `agent_send`, `agent_list`, and `agent_kill`; `agent_kill` requires confirmation.
- `proactive_tools.py` registers `check_permission`, `queue_action`, `get_pending_actions`, `record_decision`, and `execute_pending_actions`, working with the approval tiers in `approval_store.py`.

### Tool templates

`tools/templates/loader.py` constructs `ToolTemplate` instances from TOML. A template may declare a `python`, `shell`, or `transform` action. Python actions are not passed to `eval()`; the loader parses an expression and interprets an explicit AST allowlist that excludes attribute access, lambdas, comprehensions, dunder names, and calls outside a whitelist of conversion and aggregation builtins. Shell actions tokenize a fixed command with `shlex.split()`, substitute parameters into individual argv entries, and run with `shell=False`, preventing parameter text from becoming shell syntax. Transform actions support upper, lower, length, reverse, and JSON pretty-printing.

`discover_templates()` defaults to `tools/templates/builtin`. The ten bundled TOMLs are:

- `base64_encode.toml` — base64 encoding.
- `date_info.toml` — date-related information.
- `hash_compute.toml` — hash computation.
- `json_transform.toml` — JSON transformation.
- `regex_extract.toml` — regex extraction.
- `text_length.toml` — text length.
- `text_lower.toml` — lowercase conversion.
- `text_reverse.toml` — text reversal.
- `text_upper.toml` — uppercase conversion.
- `unit_convert.toml` — unit conversion.

Several of these templates declare richer descriptions while their implemented Python action is effectively an identity `str(input)` expression, so the executable behavior is narrower than the prose in those files.

### Storage backends

`tools/storage/_stubs.py` defines the `MemoryBackend` contract—`store`, `retrieve`, `delete`, and `clear`—plus `RetrievalResult`. A missing Rust memory extension raises `MemoryBackendUnavailable` with an explicit install hint. `storage/__init__.py` exposes optional backend imports through `MemoryRegistry`.

`sqlite.py` and `bm25.py` delegate to Rust implementations and publish memory events. `hybrid.py` combines results with Reciprocal Rank Fusion. `embeddings.py` defines the `Embedder` interface and `OllamaEmbedder`. `context.py` injects retrieved context with untrusted-tier filtering and a token budget. `chunking.py` and `ingest.py` prepare documents for indexing. `knowledge_graph.py` supports entity/relation storage and graph queries.

`faiss_backend.py` uses FAISS `IndexFlatIP` over normalized vectors, while `colbert_backend.py` implements token-level MaxSim scoring.

`dense.py` supplies the in-memory `DenseMemory` backend. It defaults lazily to `OllamaEmbedder` with `nomic-embed-text`, normalizes vectors at embed time, and ranks with a single `docs @ query` dot product. There is no persistence; the module notes that the corpus is rebuilt at startup by `scripts.index_docs`. `store_many()` embeds batches and concatenates matrices lazily. Deletes are soft deletes masked with `-np.inf` at query time and a compaction pass runs once tombstones exceed 25 percent. Retrieval uses `argpartition` followed by sorting of the top-k candidates. The file also contains `chunk_markdown()`, which splits on h2/h3 boundaries while ignoring headers inside fenced code blocks, prefixes chunks with header breadcrumbs, and enforces both a 500-whitespace-token and 4,000-character cap with paragraph and token/character windowing. `dedupe_chunks()` clusters near-duplicate bodies using normalized five-gram Jaccard similarity at a default 0.7 threshold, requires at least three distinct source files before dropping a cluster, keeps the most specific source path, and returns a `DedupeReport` with an audit trail.

### Sandbox subsystem

`sandbox/__init__.py` exports `AllowedRoot`, `ContainerRunner`, `MountAllowlist`, `SandboxedAgent`, `validate_mount`, and `validate_mounts`.

#### Mount security

`mount_security.py` is a port of NanoClaw's mount-security approach. `DEFAULT_BLOCKED_PATTERNS` blocks paths or components matching `.ssh`, `.gnupg`, `.env`, `credentials`, `id_rsa`, `id_ed25519`, `.aws`, `.config/gcloud`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `.git/config`, `shadow`, `passwd`, `token`, `secret`, `.docker/config.json`, `.kube/config`, `.npmrc`, and `.pypirc`.

`AllowedRoot` stores a path with a read-only flag, and `MountAllowlist` stores roots plus blocked patterns. `load_mount_allowlist()` reads JSON from disk. `validate_mount()` resolves symlinks, rejects blocked components, verifies that the path lies under an allowed root, and returns a boolean. `validate_mounts()` raises `ValueError` for any blocked or out-of-root mount. With no configured roots, all non-blocked mounts are allowed.

#### Container runner

`runner.py` defines `ContainerRunner`, defaulting to image `openjarvis-sandbox:latest`, a 300-second timeout, and the `docker` runtime, with `podman` selectable by name. `_check_runtime()` uses `shutil.which()` and raises if the binary is absent. `_build_docker_args()` creates `runtime run --rm` with a generated `oj-sandbox-*` name, the label `openjarvis-sandbox=true`, `--network none`, interactive stdin, and read-only bind mounts in the form `host:host:ro`. Environment variables are passed with `-e`.

`run()` validates mounts, sends a JSON payload over stdin, and places `secrets` under `_secrets` and the working directory under `_workspace`, rather than passing secrets as environment variables. Timeout calls `stop()` to remove the container and return a structured timeout error. Non-zero exits return stderr in the result. Successful stdout is parsed by `_parse_output()`, which looks for the markers `---OPENJARVIS_OUTPUT_START---` and `---OPENJARVIS_OUTPUT_END---`; malformed JSON falls back to plain content with `parse_error`. `cleanup_orphans()` lists containers with the sandbox label and removes them.

`SandboxedAgent` wraps any `BaseAgent` using the same wrapper pattern as `GuardrailsEngine`. It sends the prompt, wrapped agent id, and model through the runner, then converts returned `tool_results` into `ToolResult` objects and emits turn-start and turn-end events.

#### WASM runner

`wasm_runner.py` defines `WasmResult` and `WasmRunner`, which uses `wasmtime-py` for lightweight isolation and requires `uv sync --extra sandbox-wasm`. The runner configures fuel metering, sets a default one-million-fuel limit, links WASI with inherited stdout/stderr, instantiates the module, and attempts to call `_start`. It records duration and consumed fuel, and reports missing `wasmtime` with an installation hint. `validate()` checks whether bytes form a valid module. `create_sandbox_runner()` selects `WasmRunner` when config requests runtime `wasm` and the dependency is available; otherwise it falls back to `ContainerRunner`.

### Skills system

#### Data model and parsing

`skills/types.py` defines `SkillStep` with `tool_name`, `skill_name`, `arguments_template`, and `output_key`. A step may call a tool or delegate to another skill. `SkillManifest` adds `name`, `version`, `description`, `author`, steps, `required_capabilities`, Base64 `signature`, `metadata`, `tags`, `depends`, `user_invocable`, `disable_model_invocation`, and markdown body content. `manifest_bytes()` serializes the signed fields deterministically with sorted keys, excluding the signature itself.

`parser.py` implements a strict pass requiring `name` and `description`, enforcing 64-character names, 1,024-character descriptions, lowercase kebab-case naming, and a 500-character compatibility limit. Its tolerant pass maps non-spec frontmatter fields such as `version`, `author`, `tags`, `depends`, `required_capabilities`, `user_invocable`, and `disable_model_invocation` into canonical manifest fields. `platforms` and `prerequisites` go under `metadata.openjarvis`. Unknown fields are preserved under `metadata.openjarvis.original_frontmatter`. Explicit `metadata.openjarvis.*` values override top-level mappings.

#### Loading and discovery

`loader.py` loads TOML manifests with a `[skill]` table and `[[skill.steps]]` arrays, with optional signature verification through `openjarvis.security.signing` and injection scanning through `SecretScanner`. `load_skill_markdown()` parses YAML frontmatter in `SKILL.md` and uses `SkillParser`, with a legacy fallback if strict validation fails. `load_skill_directory()` supports `skill.toml`, `SKILL.md`, or both; TOML wins for structured fields while markdown supplies `markdown_content`. A `.source` sidecar contributes source provenance. `discover_skills()` handles flat `*.toml` files, direct skill directories, and `<source>/<name>` sourced layouts.

`manager.py` coordinates discovery and execution. First-seen names win, so directory order determines precedence. `validate_dependencies()` runs after discovery, and `_prune_dependency_cycles()` iteratively removes cyclic skills so one bad cycle does not discard all skills. Optimization overlays are loaded from the configured `learning.skills.overlay_dir`, defaulting to `~/.openjarvis/learning/skills`, and can replace descriptions and add few-shot examples. `get_skill_tools()` wraps each model-invocable manifest as a `SkillTool`; `disable_model_invocation` skills are hidden from tool exposure and catalog XML. `get_catalog_xml()` builds an escaped `<available_skills>` catalog, and `get_few_shot_examples()` formats overlay examples. `discover_from_traces()` mines recurring tool sequences into new kebab-case skill manifests. `find_installed_paths()` and `remove()` manage on-disk skills.

#### Execution, dependencies, and security

`executor.py` runs steps sequentially. It renders `{key}` placeholders from the context, stores each successful result under `output_key`, stops on the first failure, and publishes `SKILL_EXECUTE_START` and `SKILL_EXECUTE_END`. Sub-skill steps are delegated through a resolver that merges rendered JSON arguments into a copy of the parent context. Capability enforcement is opt-in: when `allowed_capabilities` is `None`, all skills run as before; when a set is supplied, required capabilities must be a subset or the skill is blocked before any step runs.

`dependency.py` builds a graph from both `depends` fields and `skill_name` steps, ignores references to unknown skills, uses Kahn's algorithm for topological ordering and cycle detection, and rejects chains deeper than five by default. `compute_capability_union()` walks dependencies and returns a deterministic de-duplicated capability list.

`security.py` defines dangerous capabilities `shell:execute`, `network:listen`, and `filesystem:write`, plus trust tiers `bundled`, `indexed`, `workspace`, and `unreviewed`. `classify_trust_tier()` prioritizes bundled, then workspace, then signed-and-indexed, otherwise unreviewed.

#### Importing and adapting external skills

`sources/base.py` defines `ResolvedSkill` and an abstract `SourceResolver` with git clone/fast-forward pull support, substring resolution, and category filtering. `github.py` recursively finds `SKILL.md` or `skill.md` under a generic repo. `hermes.py` reads `skills/<category>/<skill>/SKILL.md` from `NousResearch/hermes-agent`, and `openclaw.py` reads `skills/<owner>/<skill>/SKILL.md` plus optional `_meta.json` from `openclaw/skills`.

`importer.py` parses imported frontmatter, classifies trust, refuses unreviewed skills that request dangerous capabilities unless `confirm_dangerous=True`, rejects symlinks in copied directories, and copies `references`, `assets`, and `templates` always but `scripts` only with `with_scripts=True`. It writes a translated `SKILL.md` and a `.source` provenance file. `tool_translator.py` rewrites external names such as `Bash`, `Read`, `Write`, `WebFetch`, and `Task` to OpenJarvis names such as `shell_exec`, `file_read`, `file_write`, `web_search`, and `delegate_agent`, using word-boundary matching.

`index.py` reads `index.toml` catalogs with name, version, source, SHA-256, tags, and capabilities, and supports case-insensitive substring search. `overlay.py` reads and writes `optimized.toml` sidecars containing optimizer metadata, descriptions, and few-shot examples. `tool_adapter.py` exposes each skill through `SkillTool`, automatically deriving parameters from `{placeholder}` tokens minus earlier `output_key` values, or exposing a single optional `task` for instruction-only skills. Result metadata records skill name, source, kind, and step count.

#### Bundled skill TOMLs

The twenty files in `skills/data/` are all version `0.1.0`, authored by `openjarvis`, and expressed as tool pipelines:

- `backup-files.toml` — creates a timestamped tar archive with `shell_exec` and summarizes it with `think`.
- `calendar-prep.toml` — analyzes event details, searches memory for related context, and produces a briefing.
- `code-lint.toml` — reads a source file, identifies quality issues, and formats a severity-labeled lint report.
- `code-test-gen.toml` — reads code, identifies functions and edge cases, invokes `code_interpreter`, and reviews generated tests.
- `compare-docs.toml` — reads two files and produces a structured comparison with differences and a recommendation.
- `daily-digest.toml` — searches recent memory, categorizes activity, and writes a daily digest.
- `data-analyze.toml` — reads a data file, computes summary statistics, identifies patterns and outliers, and reports recommendations.
- `dependency-audit.toml` — reads `pyproject.toml`, extracts dependencies, searches advisories, and produces an audit report.
- `email-draft.toml` — analyzes context and intent, drafts a professional response, and reviews tone and completeness.
- `file-deduplicator.toml` — computes checksums with `md5sum`, groups duplicates, and reports reclaimable space.
- `file-organizer.toml` — inspects MIME types, proposes categories, creates category directories, and summarizes the plan.
- `knowledge-extract.toml` — reads a document, extracts facts and relationships, and stores them in memory.
- `meeting-notes.toml` — converts a transcript into structured attendees, decisions, action items, and next steps.
- `pdf-summarize.toml` — extracts PDF text, identifies structure, and writes an overview and key points.
- `search-and-index.toml` — finds candidate documents, filters by relevance, indexes the directory, and searches memory.
- `security-scan.toml` — reads source code, checks common vulnerability classes, and writes a severity-rated report.
- `todo-from-notes.toml` — extracts actionable items from notes and formats a prioritized checklist.
- `topic-research.toml` — checks memory, performs web search, synthesizes findings, and stores the synthesis.
- `translate-doc.toml` — reads a document, analyzes structure and terminology, calls an LM to translate it, and reviews the result.
- `web-summarize.toml` — fetches a page with `http_request`, strips navigation and ads conceptually through `think`, and produces key bullets.

---

## 5. Memory, Connectors, Sessions, Prompt, Recipes, Operators, and Workflow

### Memory

The memory subsystem is small and deliberately file-oriented. `src/openjarvis/memory/store.py` defines a `Fact` record, an abstract `FactStore`, and the concrete `LocalFactStore`. Facts carry textual content, provenance fields such as source conversation and timestamp, and trust metadata. `LocalFactStore` persists facts to a human-readable JSONL file, by default `memory_facts.jsonl` under `get_config_dir()`. It deduplicates case-insensitively, enforces a configured maximum number of facts, protects writes with both an in-process thread lock and a cross-process OS lock, and rewrites the JSONL atomically through a temporary file followed by `os.replace()`. Recall is tier-aware: empty, `auto`, and `trusted` facts are eligible for model-facing recall, while `untrusted` facts are withheld. The abstract `FactStore` interface keeps the service independent of the JSONL implementation, so alternative backends can be introduced without changing extraction or recall logic.

`src/openjarvis/memory/extractor.py` implements `FactExtractor`. It asks a model to extract durable, reusable facts and expects a JSON array in return. Parsing is defensive: malformed or unparseable model output degrades to an empty fact list rather than raising into the caller. The extractor therefore functions as a best-effort producer of candidate facts, with trust and persistence decisions made elsewhere. Its contract favors continuity of chat over strict completeness: a failed extraction should simply yield no new memories rather than interrupt a conversation.

`src/openjarvis/memory/service.py` implements `MemoryService`, which coordinates extraction, injection detection, quarantine, and recall. Extraction runs on a daemon background thread so chat responses are not blocked. The service subscribes to `CHAT_EXCHANGE_COMPLETED`, scans completed exchanges and existing facts for prompt-injection or untrusted instructions, marks flagged facts as `TRUST_UNTRUSTED`, and stores clean extracted facts as `TRUST_AUTO`. This separation means automatically learned facts remain recallable but can be quarantined if later evidence suggests they are instruction-like or unreliable. The service therefore treats memory as an untrusted-input surface: facts are useful context, but not instructions that should bypass normal prompt and tool policy.

Taken together, the three files split responsibilities cleanly: the extractor proposes facts, the store persists and filters them, and the service governs when extraction happens and which facts are safe to inject.

### Connectors

#### Shared foundation, OAuth, storage, and sync

`src/openjarvis/connectors/_stubs.py` defines the common data contracts. `Document` is the normalized ingestion unit: it carries a stable document ID, source, document type, title, author, content, participants, timestamp, thread/channel identifiers, URL, and metadata. Its v1 additions are `source_id`, `participants_raw`, and `channel`, which default to empty so legacy connectors still compile; the ingestion pipeline derives `source_id` by stripping the `{source}:` prefix from `doc_id` when it is not set explicitly. `Attachment` stores filename, MIME type, size, SHA-256, and bytes. `SyncStatus` reports `state`, `items_synced`, `items_total`, `last_sync`, `cursor`, and `error`. `BaseConnector` requires `is_connected()`, `disconnect()`, `sync()` returning an iterator of documents, and `sync_status()`; it also exposes `knowledge_sources()`, which defaults to `indexed_sources` or the connector ID. Optional hooks include `auth_url()`, `handle_callback()`, and `mcp_tools()`, whose default implementation returns an empty list.

`oauth.py` holds the OAuth provider registry, credential resolution, token loading/saving, authorization URL construction, code exchange, refresh-token handling, and Google scope definitions. Google connectors share a flow across Drive, Calendar, Contacts, Gmail, and Tasks; tokens are written to a shared `google.json` and per-product credential files under `DEFAULT_CONFIG_DIR / "connectors"`. The Google connector `handle_callback()` methods accept either a pasted `client_id:client_secret` pair or a raw token; the real browser consent and code-to-token exchange is owned by the in-process `/v1/connectors/{id}/oauth/start` → `/oauth/callback` server flow. `google_auth.py` adds `call_with_refresh()`, which reads the access token, invokes an API function, refreshes on a 401, and retries once. `spotify.py` and `strava.py` use provider entries from the same registry for their authorization URLs and token exchange, including configured callback hosts, ports, paths, scopes, and credential files.

Ingestion is layered rather than connector-specific. `store.py` defines a SQLite-backed `KnowledgeStore` with FTS5 full-text search. `pipeline.py` consumes connector documents, namespaces thread and source IDs, deduplicates by content hash, chunks content with `SemanticChunker`, optionally embeds chunks via `OllamaEmbedder`, writes attachment blobs/text through `attachment_store.py`, and stores the resulting records in the knowledge store. `embedding_store.py` persists embeddings, `embeddings.py` defines the embedder interface, and `hybrid_search.py` combines BM25-style lexical results with vector results using reciprocal rank fusion. `HybridSearch` narrows candidates with structured metadata filters such as person, time range, and source, then attaches thread context to hits so synthesis sees surrounding conversation chunks. `retriever.py` wraps retrieval for consumers.

`sync_engine.py` batches documents in groups of 100 and checkpoints progress in `sync_state.db`. It resumes from a saved cursor and `last_sync` watermark, saves progress after each batch, records errors, and supports cancellation. Importantly, progress and error checkpoints do not advance `last_sync`; only successful completion does, so a failed or cancelled sync cannot permanently skip unprocessed items. `reset_checkpoint()` is provided for reconfigured connectors that point at a different underlying source. `scheduler.py` implements `SyncScheduler`, a daemon thread that syncs connected connectors every hour by default, exposes `run_once()` for deterministic single-pass execution, and stops with a bounded join.

#### Connector files

- **`apple_calendar.py`** — `AppleCalendarConnector` reads local Calendar data, defaults to one day behind and seven days ahead, and requires Full Disk Access. It is local-only (`auth_type = "local"`).
- **`apple_contacts.py`** — `AppleContactsConnector` reads the local AddressBook SQLite database (`AddressBook-v22.abcddb`) and also requires Full Disk Access.
- **`apple_health.py`** — `AppleHealthConnector` reads HealthKit SQLite first and falls back to an exported Health export XML when the database is unreadable. Both paths are local-only and need no API key.
- **`apple_music.py`** — `AppleMusicConnector` shells out to `osascript` to query Music.app on macOS; it checks library availability and yields track documents.
- **`apple_notes.py`** — `AppleNotesConnector` reads the local Notes SQLite database and requires Full Disk Access.
- **`gcalendar.py`** — `GCalendarConnector` uses the Calendar REST v3 API with shared Google OAuth. It lists calendars/events, defaults `since` to 24 hours ago, records event metadata and URLs, can accept or decline invitations through attendee `responseStatus`, and exposes MCP tool specs.
- **`gcontacts.py`** — `GContactsConnector` paginates the People API `people/me/connections` endpoint, formats names, emails, phones, and organizations into documents, and exposes contact search/info MCP tools. `since` is reserved because the endpoint has no server-side date filter.
- **`gdrive.py`** — `GDriveConnector` lists Drive files through REST v3, exports Google Docs/Sheets/Slides as text or CSV, stores metadata-only documents for other files, and exposes search/get/list MCP tools.
- **`gmail.py`** — `GmailConnector` uses the Gmail REST API with shared Google OAuth, pagination, rate-limit handling, body/HTML decoding, participant normalization, and label/channel selection. It also exposes trash/archive actions and MCP tool specs.
- **`google_tasks.py`** — `GoogleTasksConnector` lists task lists and tasks through Tasks API v1, converts `since` to an `updatedMin` filter, and emits task documents with status, due date, list, and completion metadata.
- **`gmail_imap.py`** — `GmailIMAPConnector` is the app-password IMAP alternative. It validates credentials with LOGIN plus read-only INBOX SELECT, captures `UIDVALIDITY`, searches all UIDs and relies on pipeline deduplication, reconnects up to five times with UIDVALIDITY checks, and yields normalized Gmail documents.
- **`imap.py`** — `IMAPConnector` subclasses the Gmail IMAP connector for arbitrary providers. It validates hostnames, rejects private/local endpoints, resolves and pins globally routable addresses, supports TLS and STARTTLS, rewrites document IDs to the `imap` source, and deliberately exposes no Gmail-branded MCP tools.
- **`outlook.py`** — `OutlookConnector` is a thin IMAP subclass defaulting to `outlook.office365.com`, storing a Microsoft app password and relabeling documents with `source="outlook"`.
- **`dropbox.py`** — `DropboxConnector` uses API v2 with a locally stored Bearer token, recursively lists files with cursors, downloads text-extractable extensions, stores other files as metadata-only, and exposes three productivity MCP tools.
- **`notion.py`** — `NotionConnector` accepts a Notion internal integration token, searches pages/databases, renders child blocks to Markdown, extracts property values, queries database rows with pagination guardrails, and applies `since` filtering to pages.
- **`obsidian.py`** — `ObsidianConnector` walks a configured Markdown vault, skips hidden/junk directories, parses simple YAML frontmatter without PyYAML, filters by mtime, builds `obsidian://` URLs, and exposes a note-search MCP tool.
- **`slack_connector.py`** — `SlackConnector` requires an `xoxp-` user token because bot tokens cannot read human-to-human DMs. It validates liveness with `auth.test`, lists all conversation types, renders DM names from a user map, skips bot/system message subtypes, builds permalinks, and records workspace/channel metadata. Token errors are surfaced through `SyncStatus.error`.
- **`granola.py`** — `GranolaConnector` uses a Bearer API key, validates it with a live notes probe before persisting, paginates meeting notes, fetches transcripts, formats summary/transcript Markdown, and supports `since` as `created_after`.
- **`hackernews.py`** — `HackerNewsConnector` is unauthenticated and fetches the top five stories from the Hacker News Firebase API, including score, comment count, author, URL, and timestamp.
- **`news_rss.py`** — `NewsRSSConnector` reads configured RSS/Atom feeds. It performs strict SSRF checks, pins validated DNS answers, caps redirects and response size, parses RSS and Atom with the standard library, and emits article documents.
- **`weather.py`** — `WeatherConnector` uses OpenWeatherMap with a locally stored API key and location. It redacts `appid` from HTTPX logs, validates credentials during configuration, and emits current-conditions and short-term forecast documents.
- **`whatsapp.py`** — `WhatsAppConnector` parses exported WhatsApp chat `.txt` files, normalizes several locale timestamp formats, groups continuation lines, extracts participants, and emits one message document per chat file.
- **`imessage.py`** — `IMessageConnector` opens macOS `~/Library/Messages/chat.db` read-only, converts Apple epoch nanosecond timestamps, maps handles and chats, and emits one document per non-null text message.
- **`github_notifications.py`** — `GitHubNotificationsConnector` stores a validated GitHub PAT and syncs `/notifications` into documents containing reason, repository, type, title, URL, and update time.
- **`oura.py`** — `OuraConnector` stores a PAT and fetches sleep, daily readiness, and daily activity from Oura API v2 for a date window, emitting each item as JSON content.
- **`spotify.py`** — `SpotifyConnector` uses OAuth with the shared provider registry to sync recently played tracks, including artists, album, duration, played-at time, and Spotify URL.
- **`strava.py`** — `StravaConnector` uses OAuth with refresh-token support and syncs recent athlete activities, including distance, moving time, sport type, local start time, and JSON content.

Across these files, authentication falls into several families: Google OAuth and similar OAuth providers, locally stored API or personal access tokens, filesystem paths, macOS-local database/app access, and no authentication at all. Regardless of source, each connector's contract is the same: report connection state, yield normalized `Document` objects, report status, and optionally expose live MCP tools. Security-sensitive connectors add validation before persisting credentials: Gmail IMAP requires LOGIN plus INBOX SELECT, Slack requires an `xoxp-` token and live `auth.test`, Granola validates with a notes probe, GitHub/Oura validate tokens via the target API, and Weather/GitHub/Oura write through `secure_write_json`. Network connectors that fetch arbitrary external targets, notably generic IMAP and RSS, validate hostnames, resolve public addresses, pin connections to checked IPs, and reject local or private endpoints.

### Sessions

`src/openjarvis/sessions/session.py` defines `SessionIdentity`, `SessionMessage`, `Session`, and `SessionStore`. The store is SQLite-backed at `DEFAULT_CONFIG_DIR / "sessions.db"`. It tracks a canonical user identity plus channel-specific IDs, supports linking channels to the same session identity, expires sessions according to `max_age_hours`, and provides message append, lookup, listing, and channel linking operations. When message count exceeds `consolidation_threshold`, the store autosummarizes the oldest half of the history; decay and listing behaviors allow long-running conversations to be pruned or inspected. Canonical identity matters because the same person may arrive through multiple channels, while channel-linked IDs preserve the routing information needed to reply in the correct place.

`src/openjarvis/sessions/compression.py` defines `BaseCompressor` and four strategies registered by name: `session_consolidation` (`SessionConsolidation`), `rule_based_precompression` (`RuleBasedPrecompression`), `model_summarization` (`ModelSummarization`), and `tiered_summaries` (`TieredSummaries`). The model-summarization entry currently falls back to session consolidation. Together these strategies provide rule-based trimming, existing consolidation, and tiered summary variants for session history reduction. The registry-based naming lets configuration select a strategy without making the session store depend on a particular compressor implementation.

### Prompt

`src/openjarvis/prompt/builder.py` implements `PromptSection` and `SystemPromptBuilder`. The builder separates a cached stable `frozen_prefix` from a dynamic suffix so prompt prefixes remain consistent for caching while request-specific state changes per call. Its sections include configured prompt prefixes, the agent template, persona material (`SOUL.md`, `MEMORY.md`, `USER.md`), skill catalog or legacy skill index, skill examples/few-shot material, current time, session context, and previous state. Persona names resolve under `get_config_dir() / "personas" / <name> /`, and the literal persona `"none"` opts out of persona injection. The split is useful because persona and skill material tend to be stable across requests, whereas session context and previous state must be recomputed. Few-shot examples and skill descriptions are injected as prompt sections rather than being hard-coded into each agent template.

`src/openjarvis/prompt/time_context.py` computes the current-time section. Timezone precedence is the request header `x-openjarvis-timezone` carried through a `ContextVar`, then the `[system_prompt] timezone` configuration, then the server local zone. The generated instruction tells the model to convert timestamps into the user's zone and preserve all-day or date-only values instead of inventing times. This matters for calendar and scheduling answers, where an all-day event must remain date-only and a timestamp from another zone must be explicitly converted rather than silently reinterpreted.

### Recipes

`src/openjarvis/recipes/loader.py` defines the `Recipe` model and loader. The unified TOML recipe format uses tables such as `[recipe]`, `[intelligence]`, `[engine]`, `[agent]`, `[learning]`, `[eval]`, `[schedule]`, and `[channels]`. Discovery searches package `recipes/data`, package `recipes/data/operators`, user `~/.openjarvis/recipes`, user `~/.openjarvis/operators`, and any extra configured paths; later recipes override earlier ones by name. The loader also understands legacy `[operator]` manifests and normalizes them into the recipe representation.

Bundled top-level recipes are: `coding_assistant` (code generation/review/debugging with ReAct), `coding_benchmark` (ReAct coding agent benchmarked on TerminalBench and SWE-bench), `terminalbench-react` (terminal/shell-tuned ReAct), `swebench-openhands` (CodeAct/OpenHands-style SWE-bench agent), `research_assistant` (deep research with orchestrator and web search), `general_assistant` (balanced general-purpose orchestrator), `gaia_orchestrator` (web search and memory for GAIA), and `monitor_assistant` (evidence-driven monitoring with code execution, causality tracking, and cross-session memory).

Bundled operator-style recipes are: `sentinel` (monitors social/news/web sources and emits scored alerts), `researcher` (autonomous web research, source cross-referencing, knowledge graph, cited reports), `correspondent` (message urgency classification, response drafts, periodic digests), `inbox-triage` (Slack/Gmail importance classification and draft responses), `news-briefing` (daily topic search and morning briefing), `twitter-sentinel` (Twitter/X keyword monitoring with urgency scoring), `repo-watcher` (GitHub issues/PRs/releases with priority summaries), and `openjarvis-twitter-bot` (reactive replies and GitHub issue creation for @OpenJarvisAI mentions). Their prompt Markdown companions live beside them for sentinel, researcher, correspondent, and the Twitter bot.

`src/openjarvis/recipes/composer.py` converts recipes into other artifacts through pure functions, so the eval and operator systems do not need to understand recipes directly. `recipe_to_eval_suite()` requires a model plus benchmarks or suites; it maps the recipe model and engine into a single model entry, inherits agent type and tools, chooses the `jarvis-agent` or `jarvis-direct` backend, and applies optional sample and judge overrides. `recipe_to_operator()` requires a `[schedule]` table and maps agent, schedule, and channel-oriented fields into an `OperatorManifest`, defaulting `max_turns` to 20 and `temperature` to 0.3 when the recipe does not set them. This lets the same TOML describe an agent recipe, an evaluation suite, or a scheduled operator.

### Operators

`src/openjarvis/operators/types.py` defines `OperatorManifest`; `loader.py` discovers and parses operator TOML files; and `manager.py` implements `OperatorManager`. The manager registers manifests, discovers bundled/user TOMLs, and activates an operator by creating a deterministic scheduler task ID of the form `operator:{id}`. The scheduled tick prompt is exactly `[OPERATOR TICK] Execute your operational protocol.` It supports activation, deactivation, pause, resume, status, one-off run, and metrics, and filters operator-specific entries out of `TelemetryAggregator.summary()`.

Activation creates a scheduler task using the manifest's schedule type/value, the `operative` agent, its tool list, and metadata containing the system prompt, temperature, max turns, and declared metrics. `run_once()` invokes `system.ask()` immediately with the same tick prompt, while `status()` merges manifest fields with scheduler task state. `collect_metrics()` only returns metric names explicitly declared in the manifest, looking them up in a fixed set of telemetry summary fields such as call count, tokens, cost, latency, energy, throughput, and inter-token latency.

The bundled operator TOMLs in `operators/data` are `system_monitor.toml` (system health, alert storage, anomaly reports), `researcher.toml` (topic monitoring, information gathering, knowledge-base maintenance), `news_digest.toml` (daily digest with deduplication and summaries), and `knowledge_curator.toml` (memory review, entity/relation extraction, knowledge graph construction).

### Workflow

`src/openjarvis/workflow/types.py` defines `NodeType` (`agent`, `tool`, `condition`, `parallel`, `loop`, `transform`), `WorkflowNode`, `WorkflowEdge`, `WorkflowStepResult`, and `WorkflowResult`. `graph.py` implements `WorkflowGraph`, which validates node/edge structure, rejects illegal cycles, computes a topological order, and exposes `execution_stages()` for grouping independent work. `builder.py` provides `WorkflowBuilder` fluent methods for adding nodes, edges, and common topologies.

`engine.py` implements `WorkflowEngine`. It first validates the graph and publishes `WORKFLOW_START`/`WORKFLOW_END` events through an optional `EventBus`. It executes single-node stages sequentially and multi-node stages concurrently through a `ThreadPoolExecutor` capped by `max_parallel`, with a default node timeout of 300 seconds. Node events include `WORKFLOW_NODE_START` and `WORKFLOW_NODE_END`. Agent nodes call `system.ask()` with optional agent and tool overrides, tool nodes build a `ToolCall` for the system's tool executor, condition nodes evaluate `safe_eval_expr` against prior outputs with failures treated as `false`, transform nodes support concatenation and first-line extraction, and loop nodes re-run an agent up to `max_iterations` until a condition string appears. The final result records per-step outputs, success, final output, and total duration.

`loader.py` complements the builder by loading TOML workflow definitions with a `[workflow]` table plus `[[workflow.nodes]]` and `[[workflow.edges]]` arrays. It parses node type, agent, tools, config, condition/transform expressions, and `max_iterations`, then validates the resulting graph before returning it. Together these files provide a graph-oriented way to compose agents, tools, conditions, parallelism, loops, and transforms into repeatable workflows.

---

## 6. Learning (`src/openjarvis/learning/**`)

This section describes the learning subsystem under `src/openjarvis/learning/**`, including all subpackages. It is based only on the Python source in that tree and the accompanying OpenJarvis configuration files. Bytecode caches and compiled `.pyc` files are excluded.

The subsystem is not a single algorithm. It is a collection of coordinated mechanisms that turn recorded traces into configuration changes, prompt changes, tool changes, trained adapters, and routing policies. The main entry points are the top-level `LearningOrchestrator`, the configuration optimizer in `optimize/`, the routing modules in `routing/`, the agent/prompt optimizers in `agents/`, the model-training code in `training/` and `intelligence/`, and the teacher-guided `spec_search/` pipeline.

### 6.1 Five-primitive model, triggers, overlays, and configuration keys

#### Five-primitive overview

`optimize/search_space.py` defines `DEFAULT_SEARCH_SPACE`, whose dimensions are explicitly grouped by five primitives: `intelligence`, `engine`, `agent`, `tools`, and `learning`. `SearchDimension` records a dotted `name`, a `dim_type`, optional `values`, optional numeric `low`/`high` bounds, a human-readable `description`, and the owning `primitive`. The supported dimension types are `categorical`, `continuous`, `integer`, `subset`, and `text`. `SearchSpace` also carries `fixed` parameters that are not optimized and natural-language `constraints`; `to_prompt_description()` renders all of this as structured text for the LLM optimizer.

The default dimensions are:

| Primitive | Dimensions in `DEFAULT_SEARCH_SPACE` |
| --- | --- |
| `intelligence` | `intelligence.model` (categorical over qwen3, llama3.1, gemma2, mistral, and deepseek-r1 tags), `intelligence.temperature` (`0.0`–`1.0`), `intelligence.max_tokens` (`256`–`8192`), `intelligence.top_p` (`0.0`–`1.0`), `intelligence.system_prompt` (free text) |
| `engine` | `engine.backend` (categorical: `ollama`, `vllm`, `sglang`, `llamacpp`, `mlx`, `lmstudio`, `exo`, `nexa`, `uzu`, `apple_fm`) |
| `agent` | `agent.type` (`simple`, `orchestrator`, `native_react`, `native_openhands`), `agent.max_turns` (`1`–`30`) |
| `tools` | `tools.tool_set` (subset: `calculator`, `think`, `file_read`, `file_write`, `web_search`, `code_interpreter`, `llm`, `shell_exec`, `apply_patch`, `http_request`, `database_query`) |
| `learning` | `learning.routing_policy` (`heuristic`, `grpo`, `bandit`, `learned`) |

The default natural-language constraints are:

- `SimpleAgent (agent.type='simple') should only have max_turns = 1`
- `agent.max_turns must be >= 1`
- `intelligence.temperature and intelligence.top_p should not both be at extreme values`

`build_search_space()` builds an equivalent space from a TOML-style dict: each `[[optimize.search]]` entry contributes one dimension, the primitive is inferred from the first dotted segment, `[optimize.fixed]` becomes `fixed`, and `[optimize.constraints] rules` becomes the constraints list.

#### Triggers

There are two trigger families in this tree. `LearningOrchestrator` is a callable cycle: `run(agent_id=None)` starts when invoked, optionally preceded by skill auto-optimization when `cfg.learning.skills.auto_optimize` is true. The spec-search subsystem has explicit typed triggers in `spec_search/triggers.py`: `OnDemandTrigger`, `UserFlagTrigger(trace_id)`, `ScheduledTrigger(cron="0 3 * * *", new_trace_count=0)`, and `ClusterTrigger(cluster_description, trace_ids, failure_rate)`. `TriggerKind` in `models.py` enumerates `scheduled`, `cluster`, `user_flag`, and `on_demand`, and `AutonomyMode` enumerates `auto`, `tiered`, and `manual`.

#### Overlays and durable artifacts

Several learning outputs are sidecars rather than direct source rewrites. `SkillOptimizer` writes an overlay TOML through `SkillOverlay`/`write_overlay`; its stated default location is `~/.openjarvis/learning/skills/<skill-name>/optimized.toml`, and it can also read an `overlay_dir` from configuration. `ACEAgentOptimizer` emits a playbook sidecar under `~/.openjarvis/learning/ace/<task>`. `AgentConfigEvolver` writes versioned agent TOMLs and supports history/rollback. In spec search, `CheckpointStore` wraps git at `<openjarvis_home>/.git` and tracks `config.toml`, `agents/`, and `tools/`; it does not track `learning/`.

#### Configuration keys

The main `configs/openjarvis/config.toml` contains `[learning] enabled`, `[learning.routing] policy`, `[learning.intelligence] policy`, `[learning.agent] policy`, and `[learning.metrics]` with `accuracy_weight`, `latency_weight`, `cost_weight`, and `efficiency_weight`. The same file enables `[traces] enabled = true` with `db_path = "~/.openjarvis/traces.db"`. The example optimization config uses `[optimize]`, `max_trials`, `optimizer_model`, `output_dir`, `early_stop_patience`, `[[optimize.objectives]]`, `[[optimize.benchmarks]]`, `[optimize.fixed]`, `[[optimize.search]]`, and `[optimize.constraints] rules`. The quickstart uses `[learning.spec_search]` with `enabled`, `teacher_model`, `teacher_engine`, `autonomy_mode`, `min_traces`, `max_cost_per_session_usd`, `max_tool_calls_per_diagnosis`, `stagnation_k`, `stagnation_eps`, `max_total_cost_usd`, `max_regression`, `min_improvement`, `benchmark_subsample_size`, and `benchmark_version`, plus `[learning.spec_search.composite_reward]` weights `alpha`, `beta`, `gamma`, and `delta`. Its paper-aligned values are `max_regression = 0.01`, `stagnation_k = 5`, `stagnation_eps = 0.001`, `max_total_cost_usd = 50.0`, `min_improvement = 0.0`, `benchmark_subsample_size = 50`, `benchmark_version = "personal_v1"`, and `(alpha, beta, gamma, delta) = (0.5, 0.1, 0.1, 0.3)`.

### 6.2 File-by-file breakdown

#### Package roots and shared abstractions

- `learning/__init__.py` provides `ensure_registered()`, which imports each learning subpackage so their registry decorators execute.
- `learning/_stubs.py` defines abstract interfaces `RouterPolicy`, `QueryAnalyzer`, `RewardFunction`, and `LearningPolicy`. `IntelligenceLearningPolicy.target = "intelligence"`; `AgentLearningPolicy.target = "agent"`.
- `learning/learning_orchestrator.py` implements `LearningOrchestrator.run()`. It first attempts optional skill optimization, then mines SFT/routing/agent pairs, skips if no data exists, runs a baseline eval, updates routing recommendations, evolves agent configs, optionally trains LoRA, runs a post-learning eval, and accepts only when improvement is at least `min_improvement` (default `0.02`). Defaults include `min_sft_pairs = 10` and `min_quality = 0.7`. Skill failures are logged and return `None`; LoRA defaults to `Qwen/Qwen3-0.6B` when no model name is supplied.

#### `training/`

- `training/__init__.py` re-exports the training data miner and LoRA trainer.
- `training/data.py` contains `TrainingDataMiner`. `extract_sft_pairs()` mines high-feedback query/answer pairs; `extract_routing_pairs()` selects a best model per query class; `extract_agent_config_pairs()` selects a best agent/tool combination per class.
- `training/lora.py` contains `LoRATrainingConfig` and `LoRATrainer`. Imports of `torch`, `transformers`, and `peft` are guarded by `HAS_TORCH` and related flags. Dataset preparation formats pairs into training text; adapter checkpoints are saved under `output_dir/epoch_<n>`.

#### `routing/`

- `routing/__init__.py` exports routing helpers and registration hooks.
- `routing/_utils.py` implements `classify_query()`, returning `code`, `math`, `short`, `long`, or `general` using regex patterns and length thresholds.
- `routing/complexity.py` implements `score_complexity()` with weights length `0.20`, domain `0.25`, reasoning `0.25`, multi-part `0.15`, and creative `0.15`. Tiers are `<0.15 trivial`, `<0.30 simple`, `<0.55 moderate`, `<0.80 complex`, otherwise `very_complex`. Thinking models get a 2× token budget via `adjust_tokens_for_model()`. `ComplexityQueryAnalyzer` adapts this to `RoutingContext`.
- `routing/router.py` provides `build_routing_context()`, model-size/tag helpers, `HeuristicRouter`, and `DefaultQueryAnalyzer`. It ranks available models and applies complexity-aware selection.
- `routing/heuristic_policy.py` registers the heuristic router policy.
- `routing/learned_router.py` implements `LearnedRouterPolicy`, registered as `learned`. It learns `query_class -> model` mappings from traces, supports `observe()` and `update_from_traces()`, and `RouterStats.composite_score()` is `0.6 * success_rate + 0.4 * avg_feedback`.
- `routing/heuristic_reward.py` implements `HeuristicRewardFunction` with defaults `weight_latency = 0.4`, `weight_cost = 0.3`, `weight_efficiency = 0.3`, `max_latency = 30.0`, and `max_cost = 0.01`.

#### `optimize/`

- `optimize/__init__.py` re-exports optimization types and engine pieces.
- `optimize/types.py` defines `SearchDimension`, `SearchSpace`, `BenchmarkScore`, `SampleScore`, `TrialFeedback`, `ObjectiveSpec`, `TrialConfig`, `TrialResult`, and `OptimizationRun`. `DEFAULT_OBJECTIVES` maximize accuracy and minimize latency and cost; `ALL_OBJECTIVES` adds energy, power, throughput, MFU/MBU, IPW/IPJ, TTFT, and inter-token-latency metrics. `TrialConfig.to_recipe()` maps dotted parameter names such as `engine.backend` and `tools.tool_set` into `Recipe` fields.
- `optimize/search_space.py` contains `build_search_space()` and the five-primitive `DEFAULT_SEARCH_SPACE` described above.
- `optimize/config.py` provides `load_optimize_config()`, `load_objectives()`, and `load_benchmark_specs()`. It supports both `[[optimize.benchmarks]]` table arrays and a single `optimize.benchmark` string fallback.
- `optimize/llm_optimizer.py` implements `LLMOptimizer`. It proposes initial configs, proposes next/mutated/targeted/merged configs, and analyzes trials using textual feedback inspired by DSPy/GEPA. Fixed parameters override LLM proposals. Parse failures produce reasoning text `Failed to parse LLM response.`.
- `optimize/trial_runner.py` contains `BenchmarkSpec`, `TrialRunner`, and `MultiBenchTrialRunner`. A trial builds a temporary recipe and returns a `TrialResult` with accuracy, mean latency, total cost, energy, tokens, sample scores, errors, and failure modes. `MultiBenchTrialRunner` supports weighted multi-benchmark configurations and a native Terminal-Bench path.
- `optimize/store.py` contains `OptimizationStore`, a SQLite-backed store for runs and trials. JSON fields persist search spaces, configs, per-sample feedback, summaries, and Pareto data; migrations are additive and the connection is persistent.
- `optimize/optimizer.py` implements `compute_pareto_frontier()` and `OptimizationEngine`. `run()` generates a run ID, proposes an initial config, then loops up to `max_trials` through evaluate → analyze → record → best-trial/Pareto update → early-stop check → propose-next. Every fifth trial with at least two Pareto candidates uses `propose_merge()`; a targeted primitive mutation is used when feedback names one and `trial_num > 2`; otherwise `propose_next()` is used. `export_best_recipe()` writes a TOML recipe.

##### `optimize/feedback/`

- `feedback/__init__.py` re-exports the collector and judge.
- `feedback/collector.py` implements `FeedbackCollector`, which aggregates explicit scores, thumbs events, and LLM judge evaluations. `stats()` buckets feedback into `low < 0.4`, `medium 0.4 <= score < 0.7`, and `high >= 0.7`.
- `feedback/judge.py` implements `TraceJudge`. It asks an LLM for a `0.0`–`1.0` quality score on the first line followed by reasoning, and `batch_evaluate()` processes traces sequentially.

##### `optimize/personal/`

- `personal/__init__.py` re-exports synthesizer, dataset, and scorer.
- `personal/synthesizer.py` defines `PersonalBenchmarkSample`, `PersonalBenchmark`, and `PersonalBenchmarkSynthesizer`. It picks high-feedback traces, infers query category from agent/query, and sorts samples by feedback then `trace_id`.
- `personal/dataset.py` implements `PersonalBenchmarkDataset`, converting a `PersonalBenchmark` into `EvalRecord` objects.
- `personal/scorer.py` implements `PersonalBenchmarkScorer(LLMJudgeScorer)`. Its judge prompt asks whether the candidate is at least as good as the reference, requiring exact `YES` or `NO` on the first line.

#### `agents/`

- `agents/__init__.py` re-exports agent optimizers and registration hooks.
- `agents/dspy_optimizer.py` implements `DSPyAgentOptimizer`, registered as `dspy`. It uses `dspy.Example`, `ChainOfThought("question -> answer")`, `BootstrapFewShot`, and `BootstrapFewShotWithRandomSearch`, then writes agent config updates through `AgentConfigEvolver`.
- `agents/gepa_optimizer.py` implements `OpenJarvisGEPAAdapter` with `assess()` and `make_reflective_dataset()`, plus `GEPAAgentOptimizer`, registered as `gepa`. It evolves config candidates and writes TOML config updates.
- `agents/ace_optimizer.py` implements `ACEAgentOptimizer`, registered as `ace`. It uses Generator/Reflector/Curator-style context evolution, converts traces into task samples, splits them, and emits a playbook sidecar under `~/.openjarvis/learning/ace/<task>`.
- `agents/agent_evolver.py` implements `AgentConfigEvolver`. It scores by query class using `0.4 success + 0.4 feedback + 0.2 log-frequency`, scores agents using `0.6 success + 0.4 feedback`, writes versioned agent TOMLs, and supports `list_versions()` and `rollback()`.
- `agents/skill_discovery.py` implements `SkillDiscovery`, which mines recurring tool sequences from traces, extracts outcomes and queries, and produces `DiscoveredSkill` manifests.
- `agents/skill_optimizer.py` implements `SkillOptimizer`. It buckets traces by skill name, supports `dspy` and `gepa` optimizers, honors `min_traces_per_skill`, and writes sidecar overlay TOMLs.

#### `intelligence/`

- `intelligence/__init__.py` re-exports the intelligence trainers.
- `intelligence/sft_trainer.py` implements `SFTTrainer`. It mines pairs from a trace store, delegates to LoRA when `use_lora=True`, and otherwise returns `full fine-tuning not yet implemented; set use_lora=true`. `_SFTLearningPolicy` is registered as `sft`.
- `intelligence/grpo_trainer.py` implements `GRPOTrainer`, `DefaultRewardFn`, and `_GRPOLearningPolicy` registered as `grpo`. It samples N responses, computes group-relative advantages, and applies a clipped policy gradient with a KL penalty against a frozen reference model.
- `intelligence/orchestrator/__init__.py` re-exports orchestrator-training types and trainers.
- `intelligence/orchestrator/types.py` defines `OrchestratorAction`, `OrchestratorObservation`, `EpisodeStep`, `Episode`, `EpisodeState`, and `PolicyOutput`. Helpers include `normalize_number()`, `extract_answer()`, `grade_answer()`, and episode IPJ computation.
- `intelligence/orchestrator/environment.py` implements `OrchestratorEnvironment` using `ToolExecutor`: `reset(task)` creates an `EpisodeState`, `step()` applies actions, `is_done()` checks termination, and `get_available_tools()` lists tools.
- `intelligence/orchestrator/prompt_registry.py` builds the orchestrator policy prompt via `build_system_prompt()`.
- `intelligence/orchestrator/policy_model.py` implements `OrchestratorPolicyModel`, with `from_pretrained()`, `from_checkpoint()`, `predict_action()`, prompt construction, output parsing, generation, and save support.
- `intelligence/orchestrator/reward.py` implements `MultiObjectiveReward`, `Normalizers`, and `AdaptiveRewardWeights`, combining correctness and efficiency signals for episodes.
- `intelligence/orchestrator/sft_trainer.py` implements `OrchestratorSFTConfig`, `OrchestratorSFTDataset`, and `OrchestratorSFTTrainer`, registered through `_ensure_registered()` as `orchestrator_sft`.
- `intelligence/orchestrator/grpo_trainer.py` implements `OrchestratorGRPOConfig` and `OrchestratorGRPOTrainer`, registered as `orchestrator_grpo`, with batched generation, log-probability computation, reference-model comparison, checkpointing, and cleanup.

#### `spec_search/`

- `spec_search/__init__.py` re-exports spec-search models and orchestration entry points.
- `spec_search/models.py` defines `EditPillar`, `EditRiskTier`, `EditOp`, `TriggerKind`, `AutonomyMode`, `SessionStatus`, `Edit`, `FailureCluster`, `LearningPlan`, `BenchmarkSnapshot`, `EditOutcome`, and `LearningSession`. `EditPillar.ENGINE` is designed-for but has no v1 appliers. `LORA_FINETUNE` is a v2 placeholder whose executor refuses with `NotImplementedError`.
- `spec_search/triggers.py` defines `OnDemandTrigger`, `UserFlagTrigger`, `ScheduledTrigger`, and `ClusterTrigger`.
- `spec_search/student_runner.py` defines `StudentResult` and `VLLMStudentRunner`, which calls a vLLM/OpenAI-compatible endpoint and returns content, score, trace ID, latency, and token usage. `build_benchmark_samples_from_traces()` derives benchmark samples from traces.
- `spec_search/external_adapter.py` implements `write_external_records_as_traces()`, converting external `EvalRecord`s into synthetic `Trace`s with `feedback = 0.5`, empty steps, and `source_name` metadata.
- `spec_search/composite_reward.py` implements `RewardWeights`, `TrainingSample`, and `score_batch()`. The reward is `R(q, y) = alpha * accuracy - beta * E_hat - gamma * L_hat - delta * C_hat`; energy, latency, and cost are z-scored within the batch. Defaults are `(0.5, 0.1, 0.1, 0.3)`. It is used only for Intelligence-edit training, not for the held-out gate.
- `spec_search/orchestrator.py` implements `SpecSearchOrchestrator.from_config()` and `run()`. It enforces cold-start readiness, takes an optional baseline benchmark, runs diagnose → plan → execute, validates and applies edits, applies the benchmark gate with rollback, queues pending review edits, records the after benchmark, and saves the session and `session.json`.
- `spec_search/multi_session.py` implements `SpecSearchLoop` and `LoopResult`. It repeats single sessions until stagnation or budget exhaustion; default controls include `stagnation_k = 5`, `stagnation_eps = 0.001`, and `max_total_cost_usd = 50.0`, with stop reasons such as `stagnation` and `budget`.
- `spec_search/pending_queue.py` implements `PendingQueue`, storing edits as `<queue_dir>/<session_id>__<edit_id>.json` with `list_pending()`, `get()`, and `resolve()`. Corrupt JSON files are skipped.
- `spec_search/diagnose/types.py` defines diagnostic dataclasses including `TraceMeta`, `BenchmarkTask`, `StudentRun`, `TeacherRun`, `ComparisonResult`, `DiagnosticTool`, and `ToolCallRecord`.
- `spec_search/diagnose/tools.py` builds diagnostic tools such as listing/searching traces, fetching current config, reading agent prompts/tool descriptions, listing personal benchmark items, running student/teacher tasks, and comparing outputs.
- `spec_search/diagnose/teacher_agent.py` implements `TeacherAgent` and `TeacherAgentResult`, running the teacher with diagnostic tools available.
- `spec_search/diagnose/runner.py` implements `DiagnosisRunner`. It builds tools, runs `TeacherAgent`, parses failure clusters from teacher output, normalizes percentages/rates, persists artifacts, and has a fallback cluster extractor.
- `spec_search/plan/planner.py` implements `LearningPlanner`. It makes one structured-output teacher call with no tools and no multi-turn, emits typed edits per failure cluster, wires cluster edit IDs, writes `teacher_traces/plan.jsonl`, and validates clusters.
- `spec_search/plan/risk_tier.py` contains the deterministic `TIER_TABLE`. Intelligence operations and agent/tools parameter or tool-set operations are `auto`; prompt/class/few-shot operations are `review`; `LORA_FINETUNE` is `manual`. Teacher-supplied tiers are overwritten and logged.
- `spec_search/plan/prompt_diff.py` computes changed-line ratios and applies unified diffs. `maybe_downgrade_to_replace()` converts `PATCH_SYSTEM_PROMPT` to `REPLACE_SYSTEM_PROMPT` when a diff changes more than 50% of lines or cannot be applied, so reviewers see the full new content.
- `spec_search/execute/base.py` defines `ApplyContext`, `ValidationResult`, `ApplyResult`, abstract `EditApplier` with `validate()`/`apply()`/`rollback()`, and `EditApplierRegistry` keyed by `EditOp`.
- `spec_search/execute/loop.py` builds the default registry and implements `execute_edits()`.
- `spec_search/execute/appliers/intelligence.py` contains `SetModelForQueryClassApplier` and `SetModelParamApplier`.
- `spec_search/execute/appliers/agent.py` contains `ReplaceSystemPromptApplier`, `PatchSystemPromptApplier`, `SetAgentClassApplier`, `SetAgentParamApplier`, and `EditFewShotExemplarsApplier`.
- `spec_search/execute/appliers/tools.py` contains `AddToolToAgentApplier`, `RemoveToolFromAgentApplier`, and `EditToolDescriptionApplier`.
- `spec_search/execute/appliers/lora_stub.py` contains `LoraStubApplier`, whose validation reports `LORA_FINETUNE is deferred to v2...` and whose `apply()` raises `NotImplementedError("LORA_FINETUNE deferred to v2")`.
- `spec_search/gate/cold_start.py` implements `check_readiness()` with `min_traces = 20` and `check_benchmark_ready()` requiring high-feedback traces (`min_feedback = 0.7`, `min_samples = 10` by default).
- `spec_search/gate/regression.py` implements `regression_check()` and `RegressionResult`. Any cluster where `after - before < -max_regression` is flagged; the class default is `0.05`, while the quickstart uses `0.01`.
- `spec_search/gate/benchmark_gate.py` implements `BenchmarkGate` and `GateResult`. It re-scores with the same session seed, computes overall delta, rejects regressions, and accepts only when `delta > min_improvement`.
- `spec_search/checkpoint/store.py` implements `CheckpointStore`, `StageHandle`, and `DirtyWorkingTreeError`. It initializes a git-backed root, begins/commits/discards staged edits, and reverts sessions.
- `spec_search/storage/paths.py` implements `resolve_spec_search_root()` and `ensure_spec_search_dirs()`. It refuses artifact paths inside the OpenJarvis source tree and creates `sessions/`, `benchmarks/`, `benchmarks/reference_outputs/`, and `pending_review/` with restrictive permissions via `secure_mkdir`.
- `spec_search/storage/session_store.py` implements `SessionStore`, an independent SQLite store beside `OptimizationStore` under `~/.openjarvis/learning/`. It persists sessions and `EditOutcome` records and converts rows back into Pydantic models.

### 6.3 Optimizer comparison

| Optimizer / loop | Registry name | Input and method | Output |
| --- | --- | --- | --- |
| `DSPyAgentOptimizer` | `dspy` | Traces → `dspy.Example`, `ChainOfThought("question -> answer")`, few-shot bootstrapping with random search | Optimized demonstrations/config updates written via `AgentConfigEvolver` |
| `GEPAAgentOptimizer` | `gepa` | Traces → `OpenJarvisGEPAAdapter.assess()` / `make_reflective_dataset()`, evolutionary candidate updates | TOML config updates |
| `ACEAgentOptimizer` | `ace` | Traces → Generator/Reflector/Curator context evolution | Playbook sidecar under `~/.openjarvis/learning/ace/<task>` |
| `LLMOptimizer` + `OptimizationEngine` | not a `LearningRegistry` policy | Search space + trial feedback; propose, mutate, merge, analyze | `OptimizationRun`, Pareto frontier, best-recipe TOML |
| `SkillOptimizer` | uses `dspy` or `gepa` | Traces bucketed by discovered skill | Skill overlay TOML sidecars |

The key distinction is that DSPy/GEPA/ACE evolve agent behavior in the `agents/` layer; `LLMOptimizer` searches the five-primitive configuration space and depends on benchmark trials; `SkillOptimizer` narrows optimization to named recurring skills.

### 6.4 Routing and training summary

Routing combines deterministic scoring, heuristic selection, and trace-learned policies. `score_complexity()` produces a weighted score and a named tier; `classify_query()` supplies coarse task class; `HeuristicRouter` uses available model metadata and thinking-model handling; `LearnedRouterPolicy` stores trace-derived model choices; `HeuristicRewardFunction` scores latency, cost, and efficiency. The default config uses `policy = "heuristic"` under `[learning.routing]`, while the search space also exposes `grpo`, `bandit`, and `learned`.

Training is split between generic pair mining plus LoRA/SFT/GRPO in `training/` and `intelligence/`, and episode-level orchestrator training in `intelligence/orchestrator/`. `TrainingDataMiner` supplies SFT, routing, and agent-config pairs. `SFTTrainer` delegates to LoRA when requested and explicitly rejects full fine-tuning. `GRPOTrainer` uses group-relative advantages with clipped policy gradients and a KL term. Orchestrator training adds an `Episode`/`EpisodeState` abstraction, a `ToolExecutor`-backed environment, a prompt registry, a HuggingFace policy wrapper, multi-objective rewards, and `orchestrator_sft` / `orchestrator_grpo` registrations.

### 6.5 Feedback, personal benchmarks, storage, and trial execution

The feedback path starts with `FeedbackCollector`, which combines explicit user scores, thumbs signals, and `TraceJudge` LLM scores. `TraceJudge` expects the first response line to be a numeric score from `0.0` to `1.0`, followed by reasoning. `PersonalBenchmarkSynthesizer` turns high-feedback traces into `PersonalBenchmarkSample`s; `PersonalBenchmarkDataset` exposes them as `EvalRecord`s; `PersonalBenchmarkScorer` performs pairwise judge comparisons with strict `YES`/`NO` output. This personal benchmark is also the substrate for spec-search cold-start readiness and benchmark gates.

Persistence is separate for optimization and spec search. `OptimizationStore` records optimization runs and trials, including configs, scores, feedback, and Pareto metadata. `SessionStore` records spec-search learning sessions and edit outcomes. `PendingQueue` handles review-tier edits as JSON files. `CheckpointStore` handles git-level rollback for tracked config, agent, and tool files.

Trial execution is handled by `TrialRunner` and `MultiBenchTrialRunner`. Each trial converts dotted parameters into a `Recipe`, runs the configured evaluation, and returns a `TrialResult`. `OptimizationEngine` records those results, recomputes the Pareto frontier after every trial, tracks accuracy-based best trials with early stopping, and can export the best configuration as a TOML recipe. The spec-search gate is deliberately separate: it compares before/after `BenchmarkSnapshot`s using a fixed session seed, rejects per-cluster regressions, and requires an overall improvement greater than `min_improvement` before accepting edits.

---

## 7. Evaluation Framework (`src/openjarvis/evals/**`)

The evaluation subtree is a self-contained harness for running models and agents against benchmarks, scoring their outputs, recording traces and telemetry, and optionally publishing summaries to experiment trackers. It is organized into `core/`, `datasets/`, `scorers/`, `backends/`, `environments/`, `execution/`, `trackers/`, `comparison/`, a large `configs/` library, and a Click CLI. `__init__.py` files mark the packages, and `__main__.py` provides the module entry point for the CLI.

### 7.1 Core architecture and run flow

The central data model lives in `core/types.py`: `EvalRecord` is one task (record id, prompt/problem, reference, category, subject, metadata); `EvalResult` adds the model answer, correctness flag, scoring metadata, timing, token, telemetry, and trace fields; `RunConfig` is one concrete model–benchmark run; `RunSummary` aggregates results; and `MetricStats` plus the `MetaConfig`, `DefaultsConfig`, `JudgeConfig`, `ExecutionConfig`, `ModelConfig`, `BenchmarkConfig`, and `EvalSuiteConfig` dataclasses describe TOML suites. `core/config.py` loads TOML with `tomllib` (or `tomli` on older Python), validates that at least one model and benchmark exist, validates backend ids, and expands a suite into the cross-product of models and benchmarks. Merge precedence is benchmark > model > `[defaults]` > built-in defaults. It also accepts `[backend.external]` base URL/API key values, with `JARVIS_BACKEND_BASE_URL` and `JARVIS_BACKEND_API_KEY` taking precedence. `VALID_BACKENDS` contains `jarvis-direct`, `jarvis-agent`, `terminalbench-native`, `hermes`, and `openclaw`; `KNOWN_BENCHMARKS` is used for warnings rather than hard validation.

`core/backend.py`, `core/dataset.py`, `core/scorer.py`, `core/tracker.py`, `core/environment.py`, and `environments/base.py` define the extension interfaces. An `InferenceBackend` exposes generation; a `DatasetProvider` loads records and can override `iter_episodes()` or `create_task_env()`; a `Scorer.score()` returns `(Optional[bool], Dict[str, Any])`; a `ResultTracker` receives run/result/summary callbacks; an `EnvironmentProvider` and `TaskEnvironmentError` model external systems; and `TaskEnvironment` supplies `reset`, `step`, `evaluate`, `max_turns`, `close`, and a helper `run_agent_loop`.

`core/runner.py` implements `EvalRunner`, the main single-benchmark engine. Its `run()` method:

1. Auto-enables `episode_mode` when the dataset overrides `iter_episodes()`; detects task environments by an overridden `create_task_env()`.
2. Processes task-env benchmarks sequentially unless the environment class sets `THREAD_SAFE = True`.
3. Filters records by `record_ids`, logs the run configuration, and consumes optional warmup samples.
4. Notifies trackers of run start, then processes records through one of three paths: normal/parallel (`_process_one`), sequential episodes (`_run_episode_mode`, with optional prior-success example injection), or interactive task environments (`_process_interactive`).
5. Calls the backend for generation and the scorer for evaluation, flushes each `EvalResult` to JSONL, and invokes tracker `on_result`.
6. Computes a `RunSummary`, calls tracker `on_summary`/`on_run_end`, writes a sibling `.summary.json`, and writes per-sample traces under a `traces/<benchmark>_<model>/traces.jsonl` directory.

`core/agentic_runner.py` implements the alternative `AgenticRunner` for multi-turn agent execution. It builds `QueryTrace` and `TurnTrace` objects (defined in `core/trace.py`), correlates events and telemetry windows into per-turn and per-query energy, and distinguishes `harness_error` from `agent_error`. Harness failures are excluded from resolve-rate. `core/event_recorder.py` provides a thread-safe `EventRecorder` for `lm_inference`, `tool_call`, `prefill`, `decode`, and `submodel_call` start/end events. `core/pricing.py` wraps the engine cloud pricing table for per-turn cost. `core/export.py` aggregates trace statistics, computes efficiency metrics such as IPJ/IPW, and can trim top/bottom 5% wall-clock outliers. `core/display.py` renders Rich banners, configuration headers, accuracy panels, latency/energy tables, trace summaries, compact tables, and full results. `core/splits.py` provides deterministic seeded train/test splits. Together these files form the data, execution, presentation, and analysis layer used by the CLI and framework-comparison code.

Several support files deserve explicit mention because they are shared across every execution mode. `core/types.py` keeps configuration and result state in immutable-friendly dataclasses and computes independent metadata lists so one run cannot mutate another. `core/backend.py` declares the `generate()`/`generate_full()` contract used by every backend, which is what lets the runner treat local engines, hosted agents, and external subprocess frameworks uniformly. `core/dataset.py` provides default `iter_episodes()` and `create_task_env()` methods; the runner compares a provider's implementation against these defaults to decide whether episode or interactive handling is required. `core/trace.py` defines `QueryTrace` and `TurnTrace`, including per-turn action energy and cost fields. `core/pricing.py` delegates to the canonical engine pricing table and returns zero for unpriced local models. `core/export.py` filters harness errors before computing accuracy and efficiency, and reconstructs aggregate energy from turn data when query-level telemetry is missing. `core/display.py` is the only presentation layer: the CLI does not print raw summary objects directly, so the same rendering is reused for single runs, suites, and agentic runs. `core/splits.py` is used by dataset providers that maintain local task lists rather than relying on a HuggingFace split.

### 7.2 Backends

`backends/jarvis_direct.py` implements `JarvisDirectBackend`, engine-level inference through OpenJarvis `SystemBuilder`. It can select an engine key, honor explicit `base_url`/`api_key` endpoints, and produce `generate_full` outputs with telemetry and timing. `backends/jarvis_agent.py` implements `JarvisAgentBackend`, which builds an OpenJarvis agent (with tools, agent name, telemetry flags, max turns, and optional skills overlays) and runs agent-level queries. `backends/tb_agent.py` provides TerminalBench-specific agent construction used by the native harness path. `backends/terminalbench_native.py` drives the `terminal_bench` harness directly and maps its output into evaluation results.

`backends/external/hermes_agent.py` and `backends/external/openclaw.py` wrap foreign frameworks as one-shot subprocess backends. They require an OpenAI-compatible base URL and API key, resolve the third-party checkout and runner script, serialize a task, and parse the subprocess JSON back into the internal result shape. `backends/external/_subprocess_runner.py` provides the shared subprocess utility; `backends/external/_runners/hermes_runner.py` and `backends/external/_runners/openclaw_runner.mjs` are the in-repo runner scripts. `backends/_endpoint_util.py` normalizes endpoint URLs and handles `/v1` suffixing, and `backends/_commit_util.py` resolves commit information used for provenance. The CLI backend registry exposes `jarvis-direct`, `jarvis-agent`, `hermes`, and `openclaw`; `terminalbench-native` is valid in TOML configs and is handled by a direct CLI path.

Endpoint handling is deliberately split by backend class. In CLI single-run mode, `--base-url`/`--api-key` (or the equivalent environment variables) are forwarded to first-party backends and target that endpoint without engine discovery, failing fast if unreachable. In suite mode, `_build_backend(..., first_party_endpoint=False)` keeps `[backend.external]` values scoped to Hermes and OpenClaw; this is called out explicitly in the code as a deferred design choice. External backends always require the endpoint because they call out to a foreign framework. `JarvisAgentBackend` also accepts `skills_enabled` and `overlay_dir`, which is the seam used by the skill benchmark. The native TerminalBench path normalizes the endpoint to a single `/v1` suffix and exports the API key as `OPENAI_API_KEY` for the duration of the harness run, restoring any pre-existing value afterward.

### 7.3 Dataset catalog, grouped by source

**Multiple-choice, reasoning, and factual QA.** `datasets/supergpqa.py` (SuperGPQA, `m-a-p/SuperGPQA`), `gpqa.py` (`Idavidrein/gpqa`, default `gpqa_diamond`), `mmlu_pro.py` (`TIGER-Lab/MMLU-Pro`), and `hle.py` (`cais/hle`, with a text-only filter) render options and ask for letters or short answers. `math500.py` (`HuggingFaceH4/MATH-500`) and `natural_reasoning.py` (`facebook/natural_reasoning`) use step-by-step prompts and free-form references. `simpleqa.py` (`basicv8vc/SimpleQA`) normalizes short factual answers and preserves parsed metadata. `frames.py` (`google/frames-benchmark`) covers multi-hop factual retrieval with optional Wikipedia context. `liveresearchbench.py` loads `Salesforce/LiveResearchBench` (`question_with_checklist`) for checklist-based research comprehension. `ama_bench.py` loads `AMA-bench/AMA-bench` and packs long agent trajectories into the prompt with first/last truncation.

**Chat, local, and synthetic use-case datasets.** `wildchat.py` filters `allenai/WildChat-1M` to English single-turn conversations. `ipw_mixed.py` loads local HuggingFace Arrow or JSONL data, defaulting to `mixed_1k_seed1_base`. The remaining use-case providers are embedded task tables: `knowledge_base.py`, `research_mining.py`, `email_triage.py`, `morning_brief.py`, `coding_task.py`, `coding_assistant.py` (30 buggy projects), `security_scanner.py` (30 vulnerable projects), `daily_digest.py`, `doc_qa.py`, and `browser_assistant.py` (30 web research tasks in easy/medium/hard tiers).

**Agentic software and terminal benchmarks.** `swebench.py` uses `princeton-nlp/SWE-bench_Verified` or `MariusHobbhahn/swe-bench-verified-mini`; `swefficiency.py` uses `swefficiency/swefficiency`. `terminalbench.py` uses the HuggingFace `terminal-bench/terminal-bench` dataset, `terminalbench_native.py` loads tasks through the `terminal_bench` pip package v2 API, and `terminalbench_v2_1.py` clones `ekellbuch/terminal-bench-2` at the `terminal-bench-2.1` branch and parses `task.toml`, `instruction.md`, and tests. `gaia.py` uses `gaia-benchmark/GAIA` (`2023_all`, validation) and downloads attached files. `loghub.py` supports HDFS, BGL, and Thunderbird from `logpai/loghub` sources. `deepplanning.py` uses `Qwen/DeepPlanning` product-catalog tarballs.

**Interactive and external-service benchmarks.** `pinchbench.py` clones `pinchbench/skill` and parses task markdown. `taubench.py` wraps `sierra-research/tau2-bench` at pinned revision `fc0055dc4e0a316c3f83133267fbd6faaa770992` with airline, retail, and telecom domains. `lifelong_agent.py` reimplements `caixd-220529/LifelongAgentBench` / `csyq/LifelongAgentBench` with `db_bench`, `knowledge_graph`, and `os_interaction` subsets. `webchorearena.py` clones `WebChoreArena/WebChoreArena` and targets local Shopping, Reddit, GitLab, and related sites. `workarena.py` integrates `ServiceNow/WorkArena` tasks through BrowserGym/Playwright against a live ServiceNow instance. `toolcall15.py` embeds the 15 scenarios from `stevibe/ToolCall-15`. `liveresearch.py` clones `Ayanami0730/deep_research_bench` and parses query/criteria JSONL; despite its module name it is not the Salesforce benchmark.

**Learning corpora not used for evaluation.** `adp.py` (`neulab/agent-data-collection`), `generalthoughts.py` (`natolambert/GeneralThought-430K-filtered`), and `toolorchestra.py` (`nvidia/ToolScale`, dataset id `toolorchestra`) explicitly state that they feed the LLM-guided spec-search proposer rather than evaluation runs.

Most HuggingFace-backed providers follow the same loading convention: call `datasets.load_dataset()` with a default split, optionally shuffle with `random.Random(seed)`, then truncate to `max_samples` before converting each row into an `EvalRecord`. Providers backed by local or cloned data (GAIA, PinchBench, TauBench, LifelongAgentBench, WebChoreArena, WorkArena, LiveResearchBench, TerminalBench V2.1, LiveCodeBench, and several synthetic sets) instead use `apply_split()` or their own filtering. This distinction matters operationally: a split override such as `split="test"` means a HuggingFace split for one provider but a domain, language, subset, or local train/test slice for another. The CLI's `_build_dataset()` maps a few special cases accordingly: `deepresearch` is an alias for `liveresearch`, `taubench` splits a comma-separated domain list, `pinchbench` and `liveresearch` treat `subset` as a local path, and `lifelong-agent` defaults to the `db_bench` subset.

### 7.4 Scorer catalog

All scorers inherit `core/scorer.py::Scorer`; LLM-based ones inherit `LLMJudgeScorer`, which calls a judge backend through `_ask_judge` with temperature 0 by default. `_checklist.py` supplies shared normalization and a single-call binary checklist judge.

**Judge and normalized-exact scorers.** `supergpqa_mcq.py`, `gpqa_mcq.py`, and `mmlu_pro_mcq.py` extract answer letters and compare them to the reference. `reasoning_judge.py`, `hle_judge.py`, `simpleqa_judge.py`, `gaia_exact.py`, `knowledge_base.py`, and `loghub_scorer.py` use normalized exact matching with an LLM fallback. `frames_judge.py`, `ipw_mixed.py`, `wildchat_judge.py` (dual comparison), `research_mining.py`, `morning_brief.py`, and `terminalbench_judge.py` use semantic judging. `ama_bench_judge.py` combines judge accuracy with token-level F1. `email_triage.py`, `browser_assistant.py`, `daily_digest.py`, `doc_qa.py`, and `security_scanner.py` mix exact checks with weighted checklists. `deepplanning.py` judges constraint satisfaction; `paperarena_judge.py` uses exact MC matching plus LLM scoring for closed/open answers. `liveresearch.py` scores four rubric dimensions; `liveresearchbench.py` scores checklist coverage; `pinchbench.py` supports automated, LLM-judge, and hybrid grading and translates OpenJarvis events to PinchBench transcripts.

**Deterministic and structural scorers.** `coding_task.py` and `livecodebench.py` extract code and run sandboxed tests. `coding_assistant.py` computes fix rate and regressions. `swebench_structural.py` and `swefficiency_structural.py` perform lightweight patch-shape checks. `terminalbench_native_structural.py` reads native harness `is_resolved`/`test_results`, while `terminalbench_v2_1.py` prefers environment-populated `tbv21_reward` and has a one-shot bash fallback. `taubench.py`, `webchorearena_scorer.py`, and `workarena_scorer.py` read rewards already computed by their environments; `lifelong_agent_scorer.py` provides DB/KG/OS scoring helpers and warns that single-shot use is degraded.

**Harness-backed scoring.** `swebench_harness.py` is the authoritative SWE-bench scorer: it extracts patches, runs the official `swebench` harness with a Modal or Docker backend, applies compatibility patches, and reads the harness report JSON. TerminalBench, TauBench, WebChoreArena, WorkArena, and PinchBench similarly rely on their task environments’ native validation or simulation loops before the lightweight scorer records the result.

Several scorers publish exact weighting formulas in their module docstrings, which makes their behavior inspectable without running them. `browser_assistant.py` combines exact facts (0.35), semantic facts (0.35), a quality checklist (0.15), and source citation (0.15). `daily_digest.py` uses phrase coverage (0.5), ordering (0.3), and a checklist (0.2). `doc_qa.py` uses fact coverage (0.5), citation correctness (0.3), and grounding/accuracy (0.2). `security_scanner.py` weights vulnerability discovery (0.6), severity correctness (0.2), false-positive suppression (0.1), and checklist quality (0.1). `toolcall15.py` assigns 0, 1, or 2 per scenario via fifteen dedicated `_score_tcNN` functions and treats only a full score of 2 as correct. These are mixed into `EvalResult.metadata`, so a continuous score can coexist with the binary `is_correct` field used by headline accuracy.

### 7.5 Environments and execution

`environments/base.py` defines `TaskEnvironment`, including a generic agent loop over `reset`/`step`. `environments/lifelong_agent_env.py` implements `DBEnvironment` (MySQL with SQLite fallback), `KGEnvironment` (API/SPARQL simulation), and `OSEnvironment` (Docker), plus a `create_task_environment()` dispatcher. The `execution/` modules are per-task context managers: `pinchbench_env.py` prepares workspaces and grades via the scorer helpers; `taubench_env.py` plugs an OpenJarvis `HalfDuplexAgent` into tau2-bench’s orchestrator and sets `THREAD_SAFE = True`; `terminalbench_env.py` and `terminalbench_v2_1_env.py` manage Docker containers, mount tests, bind `docker_shell_exec`, and run verifier scripts; `webchorearena_env.py` and `workarena_env.py` drive Playwright/BrowserGym sites and run native evaluators. `trackers/wandb_tracker.py` flattens metrics into W&B, and `trackers/sheets_tracker.py` builds result rows for Google Sheets.

### 7.6 CLI usage and outputs

`cli.py` defines the `main` Click group with five commands. `run` is the primary command: with `-c/--config` it loads and expands a TOML suite and supports `--model-filter`; otherwise `-b/--benchmark` and `-m/--model` are required. Options cover backend, engine, agent, tools, samples, workers, judge model/engine, output path, seed, split, temperature, max tokens, telemetry and GPU metrics, display style (`--compact`, `--trace-detail`), W&B and Sheets settings, `--base-url`/`--api-key`, `--agentic`, `--episode-mode`, `--concurrency`, and `--query-timeout`. `--episode-mode` takes precedence over `--agentic`. `terminalbench-native` has a dedicated path in `_run_terminalbench_native`. `run-all` sweeps all registered benchmarks for a model; `summarize` re-renders a JSONL file; `reparse-judge` rescores judge metadata; and `list` prints the benchmark and backend registries. Outputs are JSONL results, a `.summary.json`, and optional trace files; `core/display.py` renders the console report.

The remaining commands are narrower but use the same persisted artifacts. `run-all` accepts a model, engine, sample cap, judge model, output directory, seed, and verbosity, then iterates the CLI registry. `summarize` takes one positional JSONL path and recomputes displayed metrics. `reparse-judge` takes `--jsonl`, optional `--out`, `--in-place` (which creates a `.bak` first), and `--summary-out`; it re-runs stored `raw_judge_output` through the current parser and recovers records whose previous score was zero or missing. `list` prints the registered benchmarks and backends. Across all commands, Rich progress bars and tables come from `core/display.py`, while `print_banner`, `print_section`, `print_completion`, and `print_run_header` frame the output.

### 7.7 Skill benchmark conditions

`skill_benchmark.py` implements a four-condition PinchBench sweep. `CONDITIONS` are `no_skills`, `skills_on`, `skills_optimized_dspy`, and `skills_optimized_gepa`. Defaults are benchmark `pinchbench`, model `qwen3.5:9b`, engine `ollama`, agent `native_react`, seeds `[42, 43, 44]`, and tools `calculator`, `think`, `shell_exec`, `web_search`, `file_read`, and `file_write`. The conditions differ only in `JarvisAgentBackend` switches: skills disabled with no overlay; skills enabled with an intentionally empty overlay directory; skills enabled with the DSPy overlay directory; or skills enabled with the GEPA overlay directory. Each seed calls `EvalRunner`, aggregates per-task pass/fail, counts skill invocations from trace metadata, and sums token and runtime totals. `run_all_conditions()` computes mean/stddev pass rate and deltas; `write_report()` writes a dated Markdown report with summary, delta, per-task, and per-skill tables.

### 7.8 Configuration families and framework comparison

The top-level `configs/` directory contains 169 TOML files. They are best understood by family rather than individually:

- **Large per-model grids:** `liveresearch-*` (25), `pinchbench-*` (19), `taubench-*` (18) plus `taubench-telecom-*` (13), `gaia-*` (14) plus `gaia-rerun-*` (8), `livecodebench-*` (12), and `toolcall15-*` (12). Within each family the filename suffix varies the model (Qwen sizes, Nemotron, Gemma, Claude, Gemini, GPT, Kimi, MiniMax, Granite, etc.); the files otherwise share the same benchmark, backend, judge, seed, and output layout. Some liveresearch variants add `-lora-*`, `-trackb`, or `-mixed` suffixes. TauBench telecom changes `split` to domain selection; GAIA reruns use different output directories and model revisions.
- **Use-case and long-horizon suites:** `use_case_*` (11) and `use_case_v2_*` (4) cross multiple models with synthetic use-case benchmarks; `long-horizon-*` (9) combines GAIA, FRAMES, DeepPlanning, and LifelongAgent subsets; `smoke_*` (3) targets hardware-specific models. `full-suite.toml`, `minimal.toml`, and `single-run.toml` are small illustrative matrices.
- **Focused experimental configs:** `liveresearchbench-*` (3), `terminalbench-*`, `terminalbench-native-*`, `deepplanning-*`, `paperarena-*`, `glm-*openhands-*`, `qwen3.5-*kg*`, `*-monitor-operative.toml`, and `qwen3.5-122b-reasoning-suite.toml` vary benchmark set, agent, tools, subset, max samples, timeouts, and telemetry/output settings.

`comparison/make_configs.py` renders `configs/framework_comparison/_template.toml` into a grid of framework/model/benchmark configs. Its catalogs define four frameworks (`openjarvis`, `openjarvis-distilled`, `hermes`, `openclaw`), three models, and eight benchmarks; `--all-tier1` materializes the full grid. `comparison/third_party.py` loads `_third_party.toml`, applies `HERMES_AGENT_PATH`/`OPENCLAW_PATH` and runtime overrides, and verifies pinned commits (with `JARVIS_ALLOW_COMMIT_DRIFT=1` as an escape hatch). `comparison/table_gen.py` reads summary JSONs with a Pydantic schema requiring `framework`, `framework_commit`, `model`, `benchmark`, `n_tasks`, and `metrics`, rejects mixed commits in a cell, and produces LaTeX tables T1–T7 for portability, efficiency, PinchBench detail, per-model accuracy, hardware, tokens, and edit-category deltas.

The TOML schema itself is intentionally small. `[meta]` carries a name and description; `[defaults]` sets temperature and max tokens; `[judge]` sets model, engine, provider, temperature, and max tokens; `[run]` holds workers, output directory, seed, telemetry/GPU flags, warmup, tracker settings, max turns, and harness timeouts. Each `[[models]]` entry requires a name and may set engine/provider, generation overrides, and hardware parameters such as `param_count_b`, `active_params_b`, `gpu_peak_tflops`, `gpu_peak_bandwidth_gb_s`, and `num_gpus`. Each `[[benchmarks]]` entry requires a name and may set backend, samples, split, subset, agent, tools, judge model, generation overrides, record ids, and timeout multipliers. Hardware parameters are copied into `RunConfig.metadata` for efficiency calculations. The optional `[backend.external]` section holds the foreign-framework endpoint, and framework-comparison meta blocks add `framework` and `framework_id` fields used by `table_gen.py`.

### 7.9 In-package tests

`tests/` contains unit tests for the core and CLI surface: `conftest.py` supplies mock backend/scorer/dataset fixtures; `test_types.py`, `test_config.py`, `test_runner.py`, and `test_display.py` cover data classes, config expansion, runner behavior, and rendering; `test_backends.py`, `test_cli_endpoint.py`, and `test_cli_flags.py` cover backend construction and endpoint/flag forwarding; and `test_gaia.py`, `test_frames.py`, `test_supergpqa.py`, and `test_wildchat.py` cover representative scorer logic.

---

## 8. Server, Channels, Daemon, Interoperability, Observability, and Security

This section describes the server-facing and perimeter subsystems in the tree: the FastAPI server and its HTTP/WebSocket surface, the channel framework and its many adapters, the gateway daemon, Agent-to-Agent (A2A), Model Context Protocol (MCP), analytics, speech, tracing, and the full security package. The descriptions below are drawn from the implementation files themselves.

### 8.1 HTTP server and runtime bridges

#### Application assembly and middleware

`src/openjarvis/server/app.py` builds the FastAPI application in `create_app()`. It includes the main `router`, `dashboard_router`, `comparison_router`, connector routes, digest routes, upload routes, research routes, and analytics routes, and then calls `include_all_routes(app)` from `api_routes.py`. The extended registration function adds agents, memory, traces, telemetry, skills, sessions, budget, metrics, WebSocket, learning, speech, feedback, and optimize routers. The application also has startup and shutdown hooks and an SPA catch-all route so built dashboard assets can be served by the same process.

Middleware order is deliberate. Security headers are followed by `TimezoneMiddleware`, then optional `AuthMiddleware`, then `CORSMiddleware` last, making CORS the outermost layer. Literal `"*"` origins are removed from the configured CORS origin list. The security-header layer sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`, and a content security policy of `default-src 'self' 'unsafe-inline' 'unsafe-eval'; media-src 'self' blob:`. `OPTIONS` requests pass through without those headers.

`TimezoneMiddleware` reads the `X-OpenJarvis-Timezone` header from the ASGI scope, calls `set_request_timezone()` with the supplied value, ignores unknown zone names, and always resets the request context in a `finally` block. This gives request-scoped tools and formatting code a user timezone without leaving state behind between requests.

#### Authentication and protected surfaces

`AuthMiddleware` protects `/v1/`, `/api/`, `/metrics`, `/openapi.json`, `/docs`, and `/redoc`. It leaves `/health`, webhook paths, and the UI open. A true CORS preflight—identified by both an `Origin` header and an `Access-Control-Request-Method` header—is exempt from API-key checks. `generate_api_key()` returns `oj_sk_` followed by `secrets.token_urlsafe(32)`. `check_bind_safety()` exits when the server is bound to a non-loopback address without an API key, preventing an accidentally exposed unauthenticated server.

WebSocket authentication is stricter and explicit. It accepts `Authorization: Bearer <key>` or an `openjarvis.auth.v1` subprotocol combined with `openjarvis.key.b64url.<unpadded base64url key>`. Comparisons use `secrets.compare_digest`. Credentials in URL query strings are deliberately rejected, because they leak through logs and browser history.

#### Route inventory

A decorator inventory of the server modules found 44 routes. The main route module includes `/v1/chat/completions`, `/v1/models`, `/v1/savings`, `/v1/channels`, `/v1/channels/send`, `/v1/channels/status`, `/v1/security/scan`, `/health`, `/research`, and `/dashboard`, plus approval routes under `/v1/approvals/*`, connector routes, and digest routes. Extended routers add the agent, memory, trace, telemetry, skill, session, budget, metrics, WebSocket, learning, speech, feedback, and optimization surfaces. The feedback router’s `post("")` route at `/v1/feedback` uses `DEFAULT_CONFIG_DIR / "traces.db"` and `TraceStore.update_feedback()`.

A few routes are especially important to the runtime perimeter. `/v1/security/scan` exposes the security scanning machinery through HTTP. Channel routes expose status, listing, and outbound sending. Approval routes implement the pending-action workflow used by connectors and other tools that require human confirmation. The WebSocket router uses `app.state.bus` when present and otherwise calls `get_event_bus()`.

#### Cost, savings, and savings presentation

`cost_calculator.py` defines `CLOUD_PRICING`, `SCENARIOS`, `CostEstimate`, and `Scenario`, with helpers `estimate_monthly_cost()`, `estimate_scenario()`, and `estimate_all_scenarios()`. It turns token counts and model price assumptions into monthly and per-scenario estimates.

`savings.py` compares local inference against three named cloud references: `gpt-5.6-sol`, `claude-fable-5`, and `gemini-3.1-pro`. Its header notes that FLOPs and energy estimates assume no KV cache and use `P * N * (N+1)`. `SavingsSummary` includes a monthly projection, average cost per query, session timing, and `cloud_agent_equivalent` values of `15`, `60`, `100`, and `400`. These numbers feed the savings route and dashboard-facing presentation rather than the chat completion path itself.

#### Bridges and stores

`channel_bridge.py` is the unified orchestration layer for inbound and outbound channel traffic. It handles commands such as `/help`, `/more`, `/notify`, `/sessions`, `/agents`, and `/agent <id> status|pause|resume|<message>`. It truncates replies to 4000 characters and to 1600 for SMS-like channels. Notification events are rate-limited to one per event type per five minutes. This module is the main consumer of the channel registry and the place where channel traffic is translated into agent work.

`session_store.py` is a SQLite-backed store with a `channel_sessions` table and a thread lock. It persists JSON history, caps history at `_MAX_HISTORY_TURNS = 20`, records notification preferences, tracks pending long-running task metadata, remembers the last active channel, and stores notification targets. That last-active-channel state is what lets background completion messages return to the right destination.

`stream_bridge.py` adapts synchronous `agent.run()` execution plus EventBus events into Server-Sent Events through `AgentStreamBridge` and `create_agent_stream()`. `ws_bridge.py` forwards EventBus agent, inference, and tool events to connected WebSocket clients. Together they give the same underlying execution two different transport shapes: HTTP streaming and push over WebSocket.

### 8.2 Channel framework

#### Base contract and registry

`channels/_stubs.py` defines the channel contract and `ChannelMessage`. A channel implements `connect()`, `disconnect()`, `send()`, `status()`, `list_channels()`, and `on_message()`. `ChannelMessage` carries `channel`, `sender`, `content`, `message_id`, `conversation_id`, `session_id`, and `metadata`. A subtle but important rule is encoded in `BaseChannel.send(channel, content, conversation_id=...)`: `channel` is the destination or native channel identifier, while `conversation_id` is the inbound message, reply, or thread reference; it is never the channel id.

`core/registry.py` provides `@ChannelRegistry.register()` and lookup/listing helpers. `channels/__init__.py` imports 30 channel modules so their decorators run; a grep of the tree found 32 registrations. Import errors are swallowed so one optional dependency does not prevent the rest of the channel modules from loading.

#### File-by-file channel adapters

Most adapters are send-oriented REST, webhook, or SDK wrappers. They commonly set `CONNECTED`/`DISCONNECTED` in `connect()`/`disconnect()`, keep local handler lists, and emit `CHANNEL_MESSAGE_SENT` events. The following file-by-file notes call out the distinguishing behavior of each.

- `bluebubbles.py` talks to a BlueBubbles server using a URL and password and sends through its REST API.
- `email_channel.py` uses standard-library SMTP and IMAP, polling IMAP every 30 seconds and sending through SMTP.
- `discord_channel.py` uses an async runtime and thread handling around Discord REST operations and inbound handling.
- `gmail.py` uses OAuth2/token paths and the Gmail API for polling and sending, and marks processed messages as read.
- `google_chat.py` uses a Google Chat incoming webhook URL for outbound messages.
- `feishu.py` authenticates with an app id and app secret.
- `line_channel.py` uses a LINE access token and secret.
- `matrix_channel.py` uses a Matrix homeserver and access token.
- `mattermost.py` uses a Mattermost URL and token.
- `messenger_channel.py` uses a Facebook Messenger page token.
- `reddit_channel.py` uses `praw` for Reddit messaging.
- `signal_channel.py` uses the Signal REST API with an API URL and phone number.
- `teams.py` integrates with Microsoft Teams through the Bot Framework and app credentials.
- `viber_channel.py` uses a Viber token, bot name, and avatar configuration.
- `webhook.py` posts JSON to a configured webhook and checks `X-Webhook-Secret`.
- `webchat.py` is an in-memory channel with `get_messages()` and `clear_messages()`, useful for local UI tests and interactive sessions.
- `mastodon_channel.py` uses `Mastodon.py` for status/message operations.
- `rocketchat_channel.py` uses the `rocketchat_API` package.
- `xmpp_channel.py` uses `slixmpp`.
- `telegram.py` uses the Telegram Bot API, supports `allowed_chat_ids`, and performs staged asynchronous shutdown.
- `slack.py` uses the Slack Web API plus a Socket Mode thread for inbound events.
- `whatsapp.py` uses the WhatsApp Cloud API with an access token and phone number id.
- `whatsapp_baileys.py` spawns and supervises the Node/Baileys bridge described below and parses JSON-line events from it.
- `irc_channel.py` uses standard-library socket and SSL support for IRC.
- `twilio_sms.py` sends through Twilio and receives messages through the `/webhooks/twilio` server route.
- `sendblue.py` wraps the SendBlue API and exposes API key, API secret, and webhook secret properties.
- `zulip_channel.py` uses the Zulip API.
- `twitch_channel.py` uses `twitchio`.
- `twitter_channel.py` implements OAuth 1.0a signing with the standard library and polls mentions.
- `nostr_channel.py` uses `pynostr`.

Two standalone daemons supplement the in-process adapters. `imessage_daemon.py` polls `~/Library/Messages/chat.db` every five seconds, responds through AppleScript, writes a PID file, and requires macOS Full Disk Access and Accessibility permissions. `slack_daemon.py` uses slack-bolt Socket Mode, formats Markdown into Slack markup, and also uses a PID file.

#### WhatsApp Baileys TypeScript bridge

`channels/whatsapp_baileys_bridge/src/bridge.ts` is a Node-side bridge around `@whiskeysockets/baileys` version `^7.0.0-rc.9` and `qrcode-terminal` version `^0.12`. It uses `useMultiFileAuthState` and `makeWASocket`, handles QR authentication, forwards incoming messages to the Python process, and accepts JSON-line commands on stdin. The Python side sends `{"type":"send","jid":"...","text":"..."}` and `{"type":"disconnect"}`. The bridge emits `message`, `status`, `qr`, and `error` events as JSON lines on stdout. This design keeps the WhatsApp Web protocol implementation in TypeScript while `whatsapp_baileys.py` presents it as a normal OpenJarvis channel.

### 8.3 Daemon and gateway

`daemon/__init__.py` defines the package surface. `daemon/gateway.py` provides the gateway daemon used by service managers. Its `session_key(platform, chat_type, chat_id, thread_id)` returns a stable key of the form `agent:main:{platform}:{chat_type}:{chat_id}:{thread_id}`. `start()` and `stop()` toggle the daemon’s `_running` flag; the actual long-running work is driven by the configured channel/gateway integration.

`daemon/service.py` contains service templates for running `python -m openjarvis.daemon.gateway`. The systemd template uses `Restart=on-failure` and `RestartSec=5`; the launchd template uses `RunAtLoad` and `KeepAlive`. `daemon/session_expiry.py` implements `SessionExpiryHook`, which flushes a session only when `len(messages) >= 6`. The flush runs a simple ephemeral agent equipped with `memory_manage` and `skill_manage`, allowing long conversations to persist useful state without flushing every short exchange.

### 8.4 Agent-to-Agent protocol

`a2a/protocol.py` defines JSON-RPC 2.0 types for A2A. `TaskState` values are `submitted`, `working`, `input-required`, `completed`, `canceled`, and `failed`. An `AgentCard` is served at `/.well-known/agent.json`. Task methods are `tasks/send`, `tasks/get`, and `tasks/cancel`, posted to `/a2a/tasks`.

`a2a/server.py` implements the receiving side. When an `auth_token` is configured, it performs a constant-time bearer-token check and advertises `{"schemes":["bearer"]}`. With no token set, the server is unauthenticated and suitable only for a trusted network.

`a2a/client.py` implements discovery and task calls. `discover()` fetches `/.well-known/agent.json`; `send_task()`, `get_task()`, and `cancel_task()` post JSON-RPC requests to `/a2a/tasks`. `a2a/tool.py` adapts a remote A2A agent into an OpenJarvis tool. It requires the `network:fetch` capability and treats remote task states `completed` or `working` as successful outcomes. `a2a/__init__.py` exports the package surface.

### 8.5 Model Context Protocol

`mcp/protocol.py` defines MCP JSON-RPC messages and standard error codes: `PARSE_ERROR=-32700`, `INVALID_REQUEST=-32600`, `METHOD_NOT_FOUND=-32601`, `INVALID_PARAMS=-32602`, and `INTERNAL_ERROR=-32603`. An `MCPRequest` with `id=None` is treated as a JSON-RPC notification.

`mcp/transport.py` provides three transports. `InProcessTransport` connects a client and server directly in Python. `StdioTransport` launches a subprocess and exchanges line-delimited JSON. `StreamableHTTPTransport` tracks sessions and extracts SSE responses; `SSETransport` is an alias for it.

`mcp/client.py` performs a handshake using protocol version `2025-03-26`. Discovered tools default to `timeout_seconds=600.0`. Its close path uses locks and events so closing the transport can unblock a stuck request rather than leaving callers waiting indefinitely.

`mcp/server.py` exposes OpenJarvis tools over MCP with `MCPServer.PROTOCOL_VERSION = "2025-11-25"`. Incoming tool calls are converted to `ToolCall`, executed locally, and returned as text `content` plus an `isError` flag. Tool annotations include hints such as `readOnlyHint` and `destructiveHint`.

`mcp/loader.py` provides `load_mcp_tools_from_config()`, which returns `(tools, clients)`. Callers must retain the `clients` objects to keep transports alive. The loader applies `include_tools`, `exclude_tools`, and `allowed_names` filters and isolates failures per configured server so one bad MCP endpoint does not prevent other servers from loading.

### 8.6 Analytics

The analytics package is PostHog-based and deliberately fail-closed. Unknown event names and unknown property names are dropped rather than guessed. The redaction module drops strings longer than 200 characters, values matching PII patterns, and composite values that could accidentally carry private content. Identity is generated as a UUID v4, avoiding stable user identifiers. A bridge connects EventBus activity to analytics emission, while `SessionAggregator` emits one `chat_session_ended` event per session using a 300-second idle timeout and a 30-second tick. Analytics therefore reports coarse usage shape rather than conversation payloads.

### 8.7 Speech

The speech package uses discovery lists rather than hard-wiring one backend. STT is discovered in the order `faster-whisper`, `openai`, `deepgram`. TTS is discovered in the order `kokoro`, `openai_tts`, `cartesia`, `elevenlabs`. This lets a local engine win when installed while still allowing cloud fallbacks. The server registers speech routes through the extended router assembly, and speech backends also appear as tool surfaces in data-boundary diagnostics.

### 8.8 Traces

The traces package stores structured execution history in SQLite. `traces` and `trace_steps` hold run-level and step-level records; `traces_fts` provides full-text search through FTS5. WAL mode, delete/update FTS triggers, and a threaded lock keep writes and search consistent. `TraceCollector` subscribes to inference, tool, and memory events. `record_response_trace()` covers streamed and WebSocket response paths that do not pass through the normal non-streaming return. `TraceAnalyzer` provides summaries, route statistics, tool statistics, and export helpers. Feedback written through `/v1/feedback` updates the corresponding trace in `traces.db`.

### 8.9 Security package, file by file

`security/__init__.py` defines `SecurityContext` and `setup_security()`. When `config.security.enabled` is false it returns an unwrapped engine. Otherwise it adds configured `SecretScanner` and `PIIScanner` scanners through `GuardrailsEngine`, creates a `CapabilityPolicy` when capabilities are enabled, creates a `RateLimiter` when rate limiting is enabled, and creates an `AuditLogger`. Scanner and rate-limiter initialization failures raise in `shared` and `server` profiles but only warn in other profiles; capability failures raise in every profile because explicitly enabled enforcement must never degrade into an unrestricted executor. A conservative `_default` grant of `file:read`, `network:fetch`, `memory:read`, and `memory:write` is applied only for default-deny configurations with no policy file. The module also exports many names lazily through `__getattr__()` and `_LAZY_EXPORTS`.

`security/_stubs.py` defines the `BaseScanner` abstract base class with `scanner_id`, abstract `scan(text) -> ScanResult`, and abstract `redact(text) -> str`.

`security/types.py` defines `ThreatLevel` (`low`, `medium`, `high`, `critical`), `RedactionMode` (`warn`, `redact`, `block`), `SecurityEventType`, `ScanFinding`, `ScanResult`, and `SecurityEvent`. `ScanResult.clean` and `ScanResult.highest_threat` summarize scanner output.

`security/taint.py` implements information-flow labels `PII`, `SECRET`, `USER_PRIVATE`, and `EXTERNAL` in an immutable `TaintSet`. `SINK_POLICY` forbids PII/secrets for `web_search` and `http_request`, secrets for `channel_send`, `channel_tools`, `code_interpreter`, and `file_write`. `check_taint()`, `auto_detect_taint()`, `propagate_taint()`, and `declassify()` provide checking, regex detection, propagation, and explicit label removal.

`security/subprocess_sandbox.py` builds a sanitized environment from a small `_SAFE_ENV_VARS` set plus explicit passthrough/extra values. `run_sandboxed()` intentionally uses `shell=True` for caller-provided commands, starts the child in a new process group with `os.setsid`, enforces a timeout, truncates stdout/stderr to `max_output_bytes`, and kills the process tree on timeout through `kill_process_tree()`.

`security/ssrf.py` blocks private and reserved IPv4/IPv6 ranges, loopback, link-local, CGNAT, multicast, and cloud metadata hosts such as `169.254.169.254`, `metadata.google.internal`, and Alibaba’s `100.100.100.200`. `check_ssrf()` prefers the Rust backend and falls back to `_check_ssrf_python()`. The fallback normalizes IPv4-mapped, compatible, NAT64, and 6to4 addresses, detects disguised IPv4 forms through `inet_aton`, resolves hostnames, and fails closed on DNS errors unless `OPENJARVIS_SSRF_FAIL_OPEN` is truthy.

`security/signing.py` provides Ed25519 supply-chain signing for manifests. `generate_keypair()`, `sign()`, `verify()`, `sign_b64()`, `verify_b64()`, `load_public_key()`, and `save_keypair()` require the optional `cryptography` package and raise an installation hint when it is missing.

`security/severity_policy.py` maps threat levels to actions. Defaults are critical → `block`, high → `warn`, medium → `sanitize`, and low → `log`; `SeverityPolicy` accepts overrides and falls back to `log`.

`security/scanner.py` defines `_RegexScanner`, `SecretScanner`, and `PIIScanner`. Scanners prefer equivalent Rust implementations but fall back to Python regexes when the extension is unavailable or fails. Secret patterns cover OpenAI, Anthropic, AWS, GitHub, Slack, Stripe, database URLs, private keys, password assignments, and generic API keys. PII patterns cover email addresses, US SSNs, Visa/Mastercard/Amex cards, US phone numbers, and IPv4 addresses, with extra validation on IPv4 octets and a Python-specific prefix that linearizes long non-email input.

`security/runtime.py` wires security into agent execution. `agent_security_kwargs()` passes only kwargs the agent constructor actually accepts. `wire_agent_security()` attaches the bus, capability policy, rate limiter, and agent id to agents and their executors, including cached runtime attributes used by lazily constructed executors. `execute_secured_tool()` and `authorize_secured_operation()` route direct operations through a canonical `ToolExecutor` so they cannot bypass standard gates.

`security/rate_limiter.py` implements a token bucket with `RateLimitConfig`, `TokenBucket`, and `RateLimiter`. It is thread-safe in Python, keyed by strings such as `agent_id:tool_name`, and uses the native backend when available. `check()` returns whether a request is allowed and the wait time; `reset()` clears one or all buckets.

`security/injection_scanner.py` detects prompt injection using patterns for system-prompt override, identity override, shell/code injection, exfiltration, jailbreaks, and delimiter injection. `InjectionScanner` prefers Rust but has a pure-Python fallback with the same pattern set, the same 100-character match cap, and `ThreatLevel.LOW` for clean results.

`security/guardrails.py` defines `GuardrailsEngine`, an `InferenceEngine` wrapper that scans input messages and generated output. In `warn` mode it publishes `SECURITY_ALERT`; in `redact` mode it replaces matched content; in `block` mode it publishes `SECURITY_BLOCK` and raises `SecurityBlockError`. Streaming scans input before generation but scans accumulated output post-hoc for logging only, since tokens have already been yielded.

`security/file_utils.py` provides `secure_mkdir()`, `secure_create()`, `secure_write_text()`, and `secure_write_json()`. Directories default to `0o700`, files to `0o600`, and text writes use a same-directory temporary file plus `os.replace()` for atomic, restrictive persistence.

`security/file_policy.py` defines `DEFAULT_SENSITIVE_PATTERNS` for `.env` files, keys, certificates, SSH identities, password files, and credential stores. `is_sensitive_file()` checks the original path, symlink chain, and resolved path; `filter_sensitive_paths()` removes sensitive entries. The Python fallback matches case-insensitively and strips Win32-style streams and trailing dots/spaces so credential filenames cannot be hidden by aliases.

`security/data_boundary_audit.py` builds a side-effect-free `DataBoundaryReport` with `DataBoundaryFinding` entries. It intentionally uses only configuration values, environment-key presence, and file existence; it never reads private contents from credential files, memory, traces, logs, or other stores. It classifies cloud providers and engines, local engines, API-key environment variables, channel secrets and reference fields, local stores, digest sources, web/browser/network/weather/market/channel/media tools, MCP servers, server exposure, analytics, telemetry, memory, deep research, traces, learning, and speech. Notable fail findings include local memory injected into cloud-bound prompts, spec search using a cloud teacher, and local knowledge chunks routed to cloud inference when `knowledge.db` exists. Paths are redacted by default and only exposed with `show_paths=True`.

`security/credential_stripper.py` defines `CredentialStripper`, which replaces OpenAI, AWS, GitHub, Slack, and bearer-token patterns with redaction markers. `wrap_tool_output()` wraps redacted content in a `<tool_result>` envelope with name and success/error status.

`security/capabilities.py` defines the RBAC capability model. `Capability` values include file, network, code, memory, channel, tool-invoke, schedule, and system-admin labels. `CapabilityPolicy` supports grants, explicit denials, JSON policy loading with strict validation, `_default` fallback grants, and case-sensitive `*` wildcards. `DEFAULT_TOOL_CAPABILITIES` is a non-bypassable floor for in-tree tools. MCP adapter tools require `tool:invoke`; unlisted built-ins fail closed as `system:admin`; third-party tools retain privileged floors when they collide with built-in names.

`security/boundary.py` defines `BoundaryGuard`, which scans content at device exit points before it reaches cloud engines or external tools. Its modes are `redact`, `warn`, and `block`; `scan_outbound()` handles text and `check_outbound()` handles `ToolCall.arguments`. Findings emit `SECURITY_ALERT` events with a content preview and destination.

`security/audit.py` defines `AuditLogger`, which creates `security_events` in SQLite using `secure_create()` and a thread lock. It subscribes to security scan/alert/block events and to tool execution, capability-denied, and rate-limited events. Each row stores SHA-256 `row_hash` and `prev_hash` values forming a Merkle-style chain; `verify_chain()` returns the first broken row id or `(True, None)`. Writes use `BEGIN IMMEDIATE` so concurrent writers cannot read the same chain tail.

---

## 9. Rust, Frontend, and Desktop

This section describes the native Rust workspace under `rust/`, the PyO3 bindings that expose Rust functionality to Python, the browser-based frontend under `frontend/`, and the Tauri v2 desktop application together with the `desktop/` support directory. The description is limited to source and configuration files; generated artifacts such as `target/`, `node_modules/`, built static bundles, lockfiles, tsbuildinfo files, binaries, and icons are not covered except where a source file explicitly configures or verifies them.

### 9.1 The Rust workspace

#### 9.1.1 Workspace layout and toolchain

- `rust/Cargo.toml` defines a Cargo workspace using `resolver = "2"` and declares `rust-version = "1.89"`.
- The workspace has 17 members, all under `rust/crates/`:
  - `openjarvis-core`
  - `openjarvis-engine`
  - `openjarvis-agents`
  - `openjarvis-tools`
  - `openjarvis-learning`
  - `openjarvis-telemetry`
  - `openjarvis-traces`
  - `openjarvis-security`
  - `openjarvis-mcp`
  - `openjarvis-python`
  - `openjarvis-sessions`
  - `openjarvis-workflow`
  - `openjarvis-skills`
  - `openjarvis-recipes`
  - `openjarvis-templates`
  - `openjarvis-a2a`
  - `openjarvis-scheduler`
- `rust/rust-toolchain.toml` pins the toolchain channel to `1.89` and lists `rustfmt` and `clippy` as components, so formatting and linting are tied to the same compiler version the workspace declares.
- The workspace dependencies section centralizes the common crate versions used by the members. It includes `serde` and `serde_json` for data models, `toml` for configuration files, `thiserror` for error types, `tracing` for instrumentation, `tokio` with streaming support (`tokio-stream`, `futures`) for async execution, `reqwest` for HTTP, `rusqlite` for embedded SQLite storage, `regex`, `once_cell`, `sha2`, `uuid`, `rand`, `parking_lot`, `async-trait`, `pyo3` version `0.29`, `meval`, `time`, `ed25519-dalek`, `fnmatch-regex`, `url`, `rig-core` version `0.31`, and `schemars`.
- Each member crate has its own `Cargo.toml` that selects from these shared dependencies, plus its own `src/lib.rs` (or `src/main.rs` where applicable). The crates are largely domain-oriented: core types and registries, model engines, agents, tools and memory, learning, telemetry, traces, sessions, scheduler, security, skills, MCP, A2A, recipes, templates, workflow, and the Python binding crate.

#### 9.1.2 Core types, registries, and configuration (`openjarvis-core`)

- `openjarvis-core` is the foundation crate. Its library root re-exports the modules for configuration, errors, events, hardware detection, model catalog data, registries, and shared types.
- Configuration is represented by serializable/deserializable structs that can be read from TOML, using the workspace `serde`/`toml` dependencies. Error types are built with `thiserror`, giving the other crates a common error vocabulary.
- Event types model the streamed output of model and agent execution, and are consumed by both the engine layer and the bindings.
- Hardware detection exposes information about the machine (for example memory and available accelerators) that the desktop app and engine discovery use when choosing a model or backend.
- The model catalog contains built-in model metadata and is used by `register_builtin_models`, one of the functions exposed through the Python bindings.
- The registry layer provides `TypedRegistry<T>`, a generic registry backed by a `parking_lot::RwLock` for concurrent access. Global registries are built on this type, giving the rest of the workspace a single place to register and look up named implementations such as models and tools.

#### 9.1.3 Model engines (`openjarvis-engine`)

- `openjarvis-engine` defines an `Engine` enum that provides static dispatch over the supported inference backends. The variants cover Ollama, an OpenAI-compatible HTTP endpoint, and the local/self-hosted options vLLM, SGLang, and llama.cpp.
- The Ollama implementation talks to a local Ollama server; the OpenAI-compatible implementation targets any endpoint speaking that protocol. The remaining variants correspond to the alternative serving paths listed in the enum.
- A discovery module probes which backends are reachable or available, so callers can select an engine without hard-coding an endpoint.
- A `rig` adapter integrates `rig-core` version `0.31`, allowing engine functionality to be used through that library's abstractions.
- The crate uses `async-trait` for async trait methods, `reqwest` for HTTP calls, and `tokio-stream`/`futures` for streaming responses back to callers and, ultimately, to the frontend.

#### 9.1.4 Agents (`openjarvis-agents`)

- `openjarvis-agents` exports the agent implementations and their shared helpers:
  - `OjAgent` — the core agent abstraction used by the rest of the system.
  - `SimpleAgent` — a straightforward single-loop agent.
  - `OrchestratorAgent` — an agent that coordinates other agents or sub-tasks.
  - `NativeReActAgent` — a native Rust implementation of the ReAct loop (reason and act).
  - `NativeOpenHandsAgent` — a native Rust implementation of the OpenHands-style agent.
  - `MonitorOperativeAgent` — an agent that monitors an operative or delegated run.
  - `LoopGuard` — a guard that detects and interrupts repetitive or looping behavior during agent execution.
  - `AgentHelpers` — shared utility functions used by the agent implementations.
- The presence of both simple and orchestrating agents, plus dedicated ReAct and OpenHands loops, shows that the Rust side mirrors the multiple agent styles available in the broader project.

#### 9.1.5 Tools and memory (`openjarvis-tools`)

- `openjarvis-tools` provides `ToolExecutor`, which runs tool calls requested by a model or agent, together with the set of built-in tools.
- The crate contains several memory backends, each exporting a distinct type:
  - `SQLiteMemory` — memory persisted in a SQLite database via `rusqlite`.
  - `BM25Memory` — retrieval based on the BM25 ranking function.
  - `FAISSMemory` — integration with FAISS-style vector search.
  - `ColBERTMemory` — a ColBERT-style late-interaction memory.
  - `HybridMemory` — combines multiple retrieval strategies.
  - `KnowledgeGraphMemory` — stores and queries knowledge-graph structured memory.
- The memory backends are also surfaced through the Python bindings, so Python callers can choose among the same implementations available in Rust.

#### 9.1.6 Learning and telemetry (`openjarvis-learning`, `openjarvis-telemetry`)

- `openjarvis-learning` contains policy and optimization modules. It supports learning-based decisions and an `optimize` path that is exposed to Python through conversion helpers in the bridge (for optimization results).
- `openjarvis-telemetry` records runtime metrics. Its modules cover sessions, inter-token latency (ITL), FLOPs estimation, and execution phases. These measurements feed the telemetry endpoints that the frontend displays and that are also available through the Tauri commands.

#### 9.1.7 Traces, sessions, and scheduling (`openjarvis-traces`, `openjarvis-sessions`, `openjarvis-scheduler`)

- `openjarvis-traces` implements trace collection and analysis. Trace data can be queried from the frontend through the API/Tauri command surface.
- `openjarvis-sessions` provides a session store backed by SQLite, using `rusqlite`. Sessions are the persistent record of chat or agent interactions.
- `openjarvis-scheduler` handles scheduled execution. A corresponding binding function, `parse_cron_next`, computes the next occurrence of a cron expression, indicating that cron-style schedules are part of this crate's responsibility.

#### 9.1.8 Security (`openjarvis-security`)

- `openjarvis-security` groups the project's safety and policy logic. Its modules include scanners, capability definitions, audit functionality, and taint tracking.
- Two of its checks are exported directly to Python: `check_ssrf`, which validates URLs against server-side request forgery rules, and `is_sensitive_file`, which classifies file paths as sensitive. These are used when tools or agents propose network or filesystem operations.
- The crate uses `url` for URL parsing, `fnmatch-regex` for pattern matching, and `sha2`/`ed25519-dalek` for hashing and signing-related checks.

#### 9.1.9 Skills, MCP, and A2A (`openjarvis-skills`, `openjarvis-mcp`, `openjarvis-a2a`)

- `openjarvis-skills` loads skill definitions from disk. The binding function `load_skill` exposes this to Python.
- `openjarvis-mcp` implements the Model Context Protocol integration, allowing external tool and context providers to be connected.
- `openjarvis-a2a` handles Agent-to-Agent request parsing; `parse_a2a_request` is the corresponding binding function.

#### 9.1.10 Recipes, templates, and workflow (`openjarvis-recipes`, `openjarvis-templates`, `openjarvis-workflow`)

- `openjarvis-recipes` loads recipe definitions and exports `load_recipe` to Python. `classify_query` is also exposed and selects or classifies a recipe/template based on a query.
- `openjarvis-templates` loads templates and exports `load_template`.
- `openjarvis-workflow` ports the Python workflow logic to Rust. Its library root defines node types and a fluent builder for constructing workflows. Validation uses a depth-first search to check the directed acyclic graph (DAG), and execution planning uses Kahn's algorithm for topological sorting so that independent nodes can be grouped into parallel execution stages. The crate includes unit tests covering DAG validation and topological behavior.

### 9.2 PyO3 bindings and the Python bridge

#### 9.2.1 Binding crate configuration

- The PyO3 layer is the `openjarvis-python` crate. Its `Cargo.toml` declares the library name `openjarvis_rust` and sets `crate-type = ["cdylib"]`, which is the shared-library form Python can import as a native extension module.
- `pyproject.toml` configures `maturin` as the build backend and declares Python `>= 3.10` as the supported runtime. This lets the Rust workspace be built and installed as a wheel with `maturin develop` or `maturin build`.
- `rust/crates/openjarvis-python/src/lib.rs` is the module root. It registers the exported classes and functions with PyO3 and organizes the binding modules by domain, corresponding to the Rust crates described above (configuration, hardware, engines, agents, tools, memory, learning, telemetry, traces, scheduler, security, skills, recipes, templates, workflow, and A2A).
- The exported surface is roughly fifty `#[pyclass]` types, with methods exposed via `#[pymethods]`. These give Python access to the underlying Rust implementations rather than reimplementing them in Python.

#### 9.2.2 Module-level functions

The binding module root exposes the following module-level functions directly:

- `load_config` — load a configuration from disk into a binding config object.
- `detect_hardware` — run hardware detection and return the detected information.
- `check_ssrf` — validate a URL against SSRF rules.
- `is_sensitive_file` — classify a path as sensitive or not.
- `register_builtin_models` — populate the registry with the built-in model catalog entries.
- `classify_query` — classify a query for recipe/template selection.
- `load_skill` — load a skill definition.
- `load_recipe` — load a recipe definition.
- `load_template` — load a template definition.
- `parse_a2a_request` — parse an Agent-to-Agent request.
- `parse_cron_next` — compute the next time a cron expression fires.

#### 9.2.3 The Python-side bridge

- `src/openjarvis/_rust_bridge.py` is the single point of contact between the Python package and the native module. It attempts to import `openjarvis_rust` and records availability in a `RUST_AVAILABLE` flag.
- `get_rust_module()` returns the imported module when the extension is present, giving callers a single accessor instead of scattering imports throughout the package.
- The bridge includes JSON conversion helpers used at the boundary: functions that turn Rust results into Python dictionaries/lists and back for scan results, retrieval results, optimization results, and generation results. This keeps the PyO3 surface working with simple data structures rather than exposing internal Rust types.
- When the extension is not installed, `RUST_AVAILABLE` is false and the Python side can fall back to its own implementations. This makes the Rust module an acceleration/native path rather than a hard requirement for importing the package.

### 9.3 The frontend application (`frontend/`)

#### 9.3.1 Package and tooling

- `frontend/package.json` identifies the app as `openjarvis-chat` version `1.0.1`. Scripts include `dev`, `build`, `build:tauri`, `preview`, `tauri`, and `test`.
- Runtime and build dependencies include React 19, Vite 8, TypeScript 7, Tailwind CSS 4, Zustand for state, React Router for routing, Base UI for primitives, Recharts for charts, PostHog for analytics, and the Tauri v2 JavaScript APIs and plugins.
- `frontend/index.html` is the HTML entry point that mounts the React app.
- `frontend/vite.config.ts` configures the Vite build. The PWA plugin uses `registerType: 'autoUpdate'`. The default build output directory is `../src/openjarvis/server/static`, so the built frontend is served by the Python server in a standard (non-desktop) deployment. The dev server proxy target is chosen from `OPENJARVIS_VITE_PROXY_TARGET`, then `VITE_API_URL`, then `http://localhost:8000`; the `/v1` proxy is configured with `ws: true` so WebSocket traffic reaches the backend during development.
- `frontend/tsconfig.json` enables strict TypeScript checking and excludes `src/components/Desktop` from the main TypeScript project, reflecting that those desktop-specific panels are compiled in the Tauri context.

#### 9.3.2 Application shell and routing

- `frontend/src/App.tsx` is the root component. It defines the application routes:
  - `/` — the chat interface.
  - `/dashboard` — the dashboard.
  - `/settings` — settings.
  - `/get-started` — first-run setup.
  - `/data-sources` — data source management.
  - `/agents` — agent management.
  - `/logs` — logs.
- On startup, `App.tsx` performs fetches for models, server information, and savings/telemetry data. It gates the UI on a desktop setup check when running inside Tauri (`isTauri()`): if setup is not complete, the app routes to the setup experience.
- When running under Tauri, the app imports overlay conversations on a five-second interval, keeping the main UI in sync with the native overlay panel.
- App-level keyboard shortcuts include Cmd/Ctrl+K for a command palette and Cmd/Ctrl+I for a system panel.
- Analytics initialization in the app is opt-in and uses the identity returned from `/v1/analytics/identity`.

#### 9.3.3 Data layer: API, state, and streaming

- `frontend/src/lib/api.ts` centralizes all backend communication. It defines the API base URL, attaches an API key as a Bearer token when configured, and provides `apiFetch` as the common fetch wrapper. It also contains helpers that call Tauri `invoke` for native operations when running in the desktop app.
- The API module covers setup and backend control, models and health checks, telemetry and traces, speech and text-to-speech, managed agents, messages and channels, tools, learning, memory, approvals, and inference-source configuration. This is the frontend's single gateway to both the Python server (in web mode) and the Tauri commands (in desktop mode).
- `frontend/src/lib/store.ts` defines Zustand stores that hold client state such as conversations, UI flags, and settings, with localStorage persistence for selected values.
- `frontend/src/lib/sse.ts` implements streaming over Server-Sent Events. It streams chat completions from `/v1/chat/completions` and research output from `/api/research`, assembling the incremental tokens into the displayed response.
- `frontend/src/components/.../useAgentEvents.ts` opens a WebSocket to `/v1/agents/events` to receive agent lifecycle events. It implements reconnection with backoff and authenticates the WebSocket using a subprotocol that carries the API key.

#### 9.3.4 Pages, components, and desktop panels

- The page components corresponding to the routes above (chat, dashboard, settings, get-started, data sources, agents, logs) consume the API/state modules to render and manage their data. The dashboard uses Recharts for its telemetry visualizations; the settings and get-started pages configure inference source, models, and API access.
- Shared layout components (including `Layout` and `ErrorBoundary`) provide the application frame, navigation, and error handling.
- `frontend/src/components/Desktop/` contains panels specific to the desktop build. These panels call the Tauri-side APIs/invokes directly for operations such as backend control, inference-source configuration, and native overlay interaction, and are excluded from the plain web TypeScript configuration as noted above.
- Speech and text-to-speech hooks in the frontend wrap the corresponding browser/Tauri capabilities, allowing spoken input and output to be enabled from the UI.

#### 9.3.5 Analytics, Supabase, and deep links

- The analytics module wraps PostHog. It derives identity from `/v1/analytics/identity`, disables automatic capture, automatic pageviews, and session recording, and restricts events to an explicit `KNOWN_EVENTS` list. The platform string sent with events is one of `tauri-macos`, `tauri-windows`, `tauri-linux`, or `web`.
- Supabase integration is optional: a leaderboard module reads `VITE_SUPABASE_ANON_KEY`, and the `LEADERBOARD_ENABLED` flag depends on that key being present. When absent, the leaderboard UI is disabled.
- A deep-link parser handles `openjarvis://` URLs, matching the scheme registered in the Tauri configuration, so the app can respond to external links that carry commands or navigation targets.

### 9.4 The Tauri v2 desktop app and `desktop/`

#### 9.4.1 Tauri crate and configuration

- `frontend/src-tauri/Cargo.toml` defines the desktop application binary `openjarvis-desktop` version `1.0.1`. It depends on Tauri v2 and a set of official plugins: notification, shell, global shortcut, autostart, updater, single-instance, process, and dialog. The `keyring` dependency selects per-platform native credential stores so API keys and secrets are stored in the OS keychain.
- `frontend/src-tauri/build.rs` is the standard Tauri build script that generates the compile-time context from the configuration file.
- `frontend/src-tauri/tauri.conf.json` configures:
  - The frontend distribution directory `../dist` and dev URL `http://localhost:5173` (the Vite dev server).
  - A main window of 1280x800.
  - A Content Security Policy restricting what the webview may load and execute.
  - The updater endpoint `https://github.com/open-jarvis/OpenJarvis/releases/download/desktop-latest/latest.json`.
  - The `openjarvis` deep-link scheme.
  - Bundle settings for the desktop installers.
- Capability files grant the webview the permissions it needs: core, notification, updater, process, and dialog defaults; global shortcut register/unregister; autostart enable/disable/is-enabled; shell spawn, execute, kill, open, and stdin; dialog open; and permission to execute the sidecar binary `binaries/ollama`. macOS and other platform plist files accompany the configuration for bundle metadata such as the deep-link registration.

#### 9.4.2 Native Rust backend

- `frontend/src-tauri/src/main.rs` is the binary entry point; it calls into the library crate that contains the application setup.
- `frontend/src-tauri/src/lib.rs` builds the Tauri builder with the plugins, registers the tray icon and menu, installs the global shortcut, initializes the native overlay, and registers the command handlers.
- The backend constants include `OLLAMA_PORT = 11434`, `JARVIS_PORT = 8000`, a preferred startup model `qwen3.5:4b`, and a fallback model `qwen3:0.6b`. The boot plan chooses among Qwen3.5 models based on available RAM, starts (or reuses) Ollama on its port, and launches the Python backend with `uv run jarvis serve` on port 8000.
- The commands exposed to the frontend include:
  - Setup and lifecycle: `get_setup_status`, `get_api_base`, `start_backend`, `stop_backend`, `reset_inference_source`, `check_health`.
  - Data fetching: telemetry, traces, learning, memory, agents, models, and savings figures.
  - Control: `run_jarvis_command`, speech/TTS operations, model pull and delete, cloud API key management, and inference-source configuration.
  - Overlay commands that control the native panel and its conversation state.
- These commands are the native counterparts of the REST endpoints in `api.ts`; the frontend picks between them depending on whether `isTauri()` is true.

#### 9.4.3 Native macOS overlay

- On macOS the app includes a native overlay implemented with `NSPanel` and `WKWebView`. The panel is always on top and non-activating, with a transparent appearance, so it can float above other applications without taking focus.
- The webview loads the bundled `frontend/src-tauri/src/overlay.html`, a small standalone page that renders the overlay conversation.
- Conversation state is read from and written to `~/.openjarvis/overlay-conversation.json`, which is how the main app and the overlay exchange messages.
- A global shortcut, Cmd+Shift+Space, toggles the overlay. The shortcut is registered through the Tauri global-shortcut plugin and handled in the Rust backend.

#### 9.4.4 Ollama sidecar, verification, and audit scripts

- An Ollama download script fetches the platform-specific Ollama binary used as the Tauri sidecar at `binaries/ollama`, matching the capability that allows the webview to spawn that sidecar.
- A dedicated ARM64 PE verifier checks the downloaded Windows ARM64 binary's PE headers, guarding against a wrong-architecture or invalid sidecar being bundled.
- Frontend audit scripts run `npm audit` with a narrow exception: only the known development-build advisory chain `GHSA-gcqx-w48m-w2h4` is allowed, and only until the expiry `2026-11-27T00:00:00Z`. Unknown advisories, advisories affecting runtime dependencies, and advisories after the expiry cause the audit to fail.

#### 9.4.5 The `desktop/` directory

- Outside `frontend/src-tauri`, the `desktop/` directory contains only two non-ignored files:
  - `desktop/src-tauri/binaries/ollama-aarch64-apple-darwin` — the macOS ARM64 Ollama sidecar binary referenced by the Tauri configuration and capabilities.
  - `desktop/src-tauri/src/overlay.html` — the overlay HTML page, which duplicates `frontend/src-tauri/src/overlay.html`.
- Apart from these two files, the remainder of `desktop/` consists of ignored build outputs and binaries, so the authoritative desktop source is `frontend/src-tauri/` with the frontend desktop panels in `frontend/src/components/Desktop/`.

### 9.5 Summary of relationships

- The Rust workspace provides the reusable domain logic: core types and registries, engines, agents, tools and memory, learning, telemetry, traces, sessions, scheduler, security, skills, MCP, A2A, recipes, templates, and workflow.
- `openjarvis-python` wraps that logic in a PyO3 `cdylib` named `openjarvis_rust`, and `_rust_bridge.py` is the single Python import point with a fallback when the extension is unavailable.
- The frontend is a Vite/React/TypeScript app that talks to a Python server over REST/SSE/WebSocket in web mode, and to the Tauri commands over `invoke` in desktop mode; its build is copied into the Python server's static directory for non-desktop deployments.
- The Tauri v2 app packages that frontend, boots the local Ollama and Python backend processes, manages settings and credentials natively, and adds OS-specific features such as the macOS always-on-top overlay and global shortcut.

---

## 10. Documentation, Deployment, Tests, and Infrastructure

### Documentation site and navigation

- `mkdocs.yml` defines the site as **OpenJarvis** (`https://open-jarvis.github.io/OpenJarvis/`), a Material-theme site with `docs/overrides`, Georgia/JetBrains Mono fonts, sticky tabs, section navigation, back-to-top, footer, search suggestions/highlighting, code copy/annotations, linked tabs, and a followable table of contents.
- The theme has light and dark custom palettes with blue accents and a GitHub icon; extra CSS is `docs/stylesheets/extra.css`, and JavaScript adds leaderboard support, DocSearch, and leaderboard initialization.
- Plugins are `search` (custom separator), `gen-files`, `literate-nav` (`SUMMARY.md`), and `mkdocstrings` with the Python handler over `src`; generated API pages expose source, root headings, category/symbol headings, source-order members, NumPy docstrings, signature annotations/crossrefs, and filter out private names except `__init__`/`__all__`.
- Markdown extensions include abbreviations, admonitions, attributes, definition lists, footnotes, raw HTML, tables, permalinked TOCs to depth 3, better emphasis/caret/strikethrough/mark/keys/smart symbols, Pygments highlighting, Mermaid fences via `pymdownx.superfences`, alternate-style tabs, and custom task lists.
- `docs/gen_ref_pages.py` walks `src/**/*.py`, skips private modules, writes `api-reference/**` pages containing `::: module`, and emits `api-reference/SUMMARY.md`; `docs/gen_install_script.py` publishes `scripts/install/install.sh` and `deploy/windows/install.ps1` verbatim at `/install.sh` and `/install.ps1` so the canonical HTTPS install URLs cannot drift.
- The explicit `nav` contains Home, Getting Started, Showcase, Tutorials, Architecture, API Reference, User Guide, Leaderboard, Roadmap, and a short Development section; several checked-in pages (installer internals, WSL/native Windows, deployment, design specs, channels/skills architecture, ACE, QA runbook, and some tutorials) exist outside that explicit nav.
- `docs/includes/abbreviations.md` is auto-appended as a shared abbreviation dictionary; `docs/assets/showcase/README.md` documents the one-screenshot-per-showcase-slug convention.

#### Core architectural narrative

- `docs/index.md` frames OpenJarvis as local-first personal AI research infrastructure: shared on-device primitives, evaluations where energy/FLOPs/latency/cost are first-class, and a learning loop over local traces; it lists five primitives — Intelligence, Engine, Agents, Tools & Memory, and Learning — plus quick-start tabs for browser app, desktop app, Python SDK, and CLI.
- `docs/architecture/design-principles.md` describes pluggable ABCs, typed decorator registries with duplicate detection/introspection/runtime creation, offline-first operation, hardware detection and engine recommendation, telemetry-native inference measurement, Python-first SDK design, and related conventions.
- `docs/architecture/query-flow.md` traces CLI/SDK config loading, engine discovery, model discovery and routing, optional memory context injection, direct versus agent mode, instrumented generation, telemetry persistence, trace collection, and response delivery.
- `docs/architecture/agents.md` defines `BaseAgent.run(input, context, **kwargs)`, `AgentContext`/`AgentResult`, the `accepts_tools` flag, helper methods, `ToolUsingAgent`, and implementations including `simple`, `orchestrator`, `native_react`, `native_openhands`, `rlm`, `openhands`, `claude_code`, and `sandboxed`.
- `docs/architecture/security.md` explains composable `BaseScanner` pipelines, `GuardrailsEngine` wrapping any `InferenceEngine`, `WARN`/`REDACT`/`BLOCK` modes, post-hoc streaming scan behavior, `SECURITY_ALERT`/`SECURITY_BLOCK`/`SECURITY_SCAN` events, SQLite audit logging, and independent file-policy checks for `FileReadTool` and memory ingest.
- `docs/user-guide/telemetry.md` distinguishes local telemetry (per-inference metrics) from full interaction traces; `docs/telemetry.md` documents optional external analytics, consent, event allowlists, redaction, PostHog destination, and separation from the Savings Leaderboard.

### Documentation pages by section

#### Top-level and showcase

- `docs/index.md` — project overview, five primitives, and entry points for browser, desktop, SDK, and CLI.
- `docs/downloads.md` — desktop installers for macOS, Windows x64/ARM64, DEB/RPM/AppImage, plus Gatekeeper remediation.
- `docs/leaderboard.md` — community savings table for dollars, energy, FLOPs, requests, and tokens.
- `docs/telemetry.md` — opt-in external usage analytics policy, collected events, safeguards, and retention.
- `docs/desktop-auto-update.md` — Tauri updater flow, `desktop-latest`/`desktop-v*`/`desktop-edge` channels, signing, and key rotation.
- `docs/showcase/index.md` — outcome-first gallery overview.
- `docs/showcase/morning-brief.md` — overnight Slack/email/news briefing scenario.
- `docs/showcase/persistent-memory.md` — long-lived memory that survives sessions.
- `docs/showcase/cost-savings.md` — local-versus-cloud savings tracking scenario.
- `docs/showcase/discord-companion.md` — personal assistant living in Discord.
- `docs/showcase/coding-assistant.md` — offline code-review scenario.
- `docs/showcase/CONTRIBUTING.md` — instructions for adding showcase entries and screenshots.

#### Getting started

- `docs/getting-started/installation.md` — browser one-command quickstart, manual setup, desktop downloads, CLI/SDK install, and verification.
- `docs/getting-started/install.md` — canonical bash/PowerShell one-liners and detailed bash installer phases, flags, overrides, update, uninstall, and troubleshooting.
- `docs/getting-started/macos.md` — macOS install path using the bash installer.
- `docs/getting-started/linux.md` — Linux install path using the bash installer.
- `docs/getting-started/wsl2.md` — recommended Windows path through WSL2, including Ollama startup differences.
- `docs/getting-started/windows-native.md` — advanced native Windows/PowerShell path and Phase-1 scope.
- `docs/getting-started/quickstart.md` — copy-paste workflows for chat, tools, memory, SDK, server, digest, research, and scheduling.
- `docs/getting-started/configuration.md` — configuration reference for `~/.openjarvis/config.toml`.
- `docs/getting-started/snippets.md` — reusable code snippets for common setups.

#### Tutorials

- `docs/tutorials/index.md` — tutorial landing page.
- `docs/tutorials/deep-research.md` — build a multi-source research assistant.
- `docs/tutorials/scheduled-ops.md` — scheduled personal operations with persistent agents.
- `docs/tutorials/messaging-hub.md` — smart inbox and messaging workflow.
- `docs/tutorials/code-companion.md` — local code-assistant workflow.
- `docs/tutorials/skills-workflow.md` — tutorial for skill-driven workflows.

#### Architecture

- `docs/architecture/overview.md` — high-level map of primitives and supporting systems.
- `docs/architecture/intelligence.md` — model identity, catalog metadata, quantization, and fallback chains.
- `docs/architecture/engine.md` — uniform inference backends and local/cloud swapping.
- `docs/architecture/agents.md` — `BaseAgent`, tool-using agents, built-in agent types, and sandboxing.
- `docs/architecture/memory.md` — searchable storage, ingestion, chunking, retrieval, and context injection.
- `docs/architecture/learning.md` — trace-driven router policies, rewards, training, and LLM-guided spec search.
- `docs/architecture/query-flow.md` — end-to-end query sequence from CLI/SDK to telemetry and traces.
- `docs/architecture/security.md` — scanner pipeline, guardrails wrapper, events, audit log, and file policy.
- `docs/architecture/design-principles.md` — pluggability, registries, offline-first, hardware awareness, telemetry, and Python-first design.
- `docs/architecture/channels.md` — `BaseChannel` registry and external messaging transports.
- `docs/architecture/skills.md` — skill architecture, trust, discovery, and optimization.

#### User guide

- `docs/user-guide/cli.md` — reference for `init`, `ask`, `model`, `pearl`, `memory`, `telemetry`, `bench`, `channel`, and `serve`.
- `docs/user-guide/cli-interactive-picker.md` — optional TTY model/runtime picker for `chat` and bare `jarvis`.
- `docs/user-guide/pearl.md` — thin `jarvis pearl` wrapper around native Pearl commands.
- `docs/user-guide/mining.md` — Pearl PoUW mining quickstart, commands, model support, v1 scope, and troubleshooting.
- `docs/user-guide/mining-apple-silicon.md` — Pearl mining on Apple Silicon and other CPU hosts.
- `docs/user-guide/python-sdk.md` — `Jarvis` SDK usage.
- `docs/user-guide/morning-digest.md` — spoken daily briefing from connected services.
- `docs/user-guide/deep-research.md` — multi-hop research with local-document citations.
- `docs/user-guide/code-assistant.md` — orchestrator with code execution, file I/O, and shell access.
- `docs/user-guide/scheduled-monitor.md` — persistent scheduled operative agent.
- `docs/user-guide/chat-simple.md` — no-tools, no-agent chat configuration.
- `docs/user-guide/agents.md` — agent selection and registry behavior.
- `docs/user-guide/channels.md` — platform channel implementations and messaging behavior.
- `docs/user-guide/channels-and-connectors.md` — distinction between messaging channels and data connectors.
- `docs/user-guide/tools.md` — tool specs, dispatch, and OpenAI function-calling format.
- `docs/user-guide/memory.md` — retrieval backends, chunking, ingestion, and RAG context injection.
- `docs/user-guide/mcp-external-servers.md` — connect external MCP tool servers.
- `docs/user-guide/scheduler.md` — persisted one-shot, interval, and cron tasks.
- `docs/user-guide/telemetry.md` — local telemetry, traces, and learning integration.
- `docs/user-guide/evaluations.md` — dataset-driven evaluation framework.
- `docs/user-guide/benchmarks.md` — latency/throughput benchmarking and custom benchmarks.
- `docs/user-guide/system-access.md` — granting agent access to the local machine.
- `docs/user-guide/security.md` — prompt/output scanning, redaction, and guardrails.
- `docs/user-guide/data-boundary-scan.md` — `jarvis scan --data-boundaries` reporting.
- `docs/user-guide/llm-guided-spec-search.md` — frontier-model-driven config improvement over local traces.
- `docs/user-guide/skills.md` — skill formats, sources, invocation, discovery, optimization, security, and CLI.

#### Deployment documentation

- `docs/deployment/index.md` — deployment guide landing page.
- `docs/deployment/docker.md` — CPU/GPU images, Compose stack, API key requirement, and health checks.
- `docs/deployment/api-server.md` — OpenAI-compatible FastAPI/uvicorn endpoints.
- `docs/deployment/systemd.md` — Linux service unit installation and operation.
- `docs/deployment/launchd.md` — macOS launchd service and log capture.
- `docs/deployment/render.md` — one-click Render Blueprint caveats, especially ephemeral state.

#### Development, design, learning, and QA

- `docs/development/contributing.md` — dev setup, testing, linting, docs build, and registry pattern.
- `docs/development/mining.md` — add a mining provider using the registry pattern.
- `docs/development/pearl-model-enablement.md` — checklist/model work for making a Hugging Face model mineable.
- `docs/development/mining-nvidia-validation.md` — v1 `vllm-pearl` release-gate runbook.
- `docs/development/roadmap.md` — five workstreams with maturity tags.
- `docs/development/release-checklist.md` — manual platform smoke tests, failure checks, and CI gates.
- `docs/learning/ace.md` — ACE optimizer setup, configuration, and playbook-oriented learning.
- `docs/testing/agent-qa-runbook.md` — manual scenarios for persistent agents in CLI and desktop.
- `docs/design/2026-05-05-vllm-pearl-mining-integration-design.md` — vLLM-Pearl Spec A for solo H100/H200 mining with v2 seams.
- `docs/design/2026-05-05-vllm-pearl-mining-integration-plan.md` — task-by-task implementation plan for Spec A.
- `docs/design/2026-05-05-apple-silicon-pearl-mining-design.md` — Apple Silicon Pearl Spec B, with v1 reference-miner scope.
- `docs/design/2026-05-05-apple-silicon-pearl-mining-plan-v1.md` — implementation plan for Spec B v1.
- `docs/design/2026-05-05-pearl-coordination-discussion-draft.md` — draft upstream discussion for Pearl coordination.

#### Notable user-facing workflows

- **CLI:** `jarvis init` writes hardware-aware config/presets; `jarvis ask` supports direct and agent modes, tools, images, screen capture, and JSON output; `jarvis model` lists/inspects/pulls models; `jarvis memory` indexes/searches/reports; `jarvis telemetry` stats/export/clear; `jarvis bench run`; `jarvis channel` list/send/status; and `jarvis serve` exposes OpenAI-compatible endpoints.
- **Skills:** `skill.toml` defines structured pipelines, `SKILL.md` holds instructional content, and skills can come from Hermes Agent, OpenClaw, GitHub repos, or config-driven sources. Skills are catalogued in system prompts, governed by trust tiers/capabilities and script policies, discoverable from traces, optimizable with DSPy/GEPA/ACE, and benchmarkable.
- **Mining:** Pearl mining supports provider IDs such as `vllm-pearl`, `cpu-pearl`, and `apple-mps-pearl`; commands cover `jarvis mine init/start/stop/status/doctor/logs/validate-model`; the v1 docs and validation runbook restrict production readiness to the documented H100/H200 vLLM path while leaving engine-neutral seams for other hardware.
- **Telemetry:** local SQLite records capture timing, tokens, energy/power, cost, engine, and agent data, and traces capture full interactions; optional PostHog analytics uses explicit consent, a structural event allowlist, value-level redaction, no chat content, and 365-day documented retention, separate from leaderboard submission.

#### Roadmap and release checklist

- The roadmap centers on post-training data from traces, multi-model orchestration, energy-aware routing, plugin packaging, federated memory, and LLM-guided spec search; its five workstreams cover continuous operators, mobile/messaging clients, secure cloud collaboration with Minions/TEE ideas, tutorials/docs, and hardware breadth, with Ready/Design Needed/Research-Stage maturity tags.
- The release checklist requires fresh-account smoke tests on macOS Intel/ARM, Ubuntu 22.04, Fedora 40, and WSL2; checks install time, first chat, background notifications, `jarvis doctor`, idempotent reinstall, and clean uninstall; verifies the cloud quick path; rotates failure-mode spot checks; and cites pytest, Bats, and installer-integration CI gates.

### Deployment assets

#### Dockerfiles and Compose

- `deploy/docker/Dockerfile` — three-stage CPU image: digest-pinned Node builder for the frontend, Python 3.12 builder using frozen `uv.lock` export and Maturin for the Rust extension, and an unprivileged `openjarvis` runtime with `jarvis serve --host 0.0.0.0 --port 8000`.
- `deploy/docker/Dockerfile.gpu` — same structure on digest-pinned `nvidia/cuda:12.4.0-runtime-ubuntu22.04`, with Python 3.12 installed via uv into `/opt/openjarvis/venv`, NVIDIA device access without root, and port 8000.
- `deploy/docker/Dockerfile.gpu.rocm` — digest-pinned ROCm 7.2 Ubuntu 22.04 variant; the runtime user is added to `video` and `render` groups for `/dev/kfd` and `/dev/dri`.
- `deploy/docker/Dockerfile.sandbox` — isolated execution image that transplants a digest-pinned Node runtime into a Python slim runtime, labels itself `openjarvis-sandbox=true`, and starts `python -m openjarvis.sandbox.entrypoint`.
- `deploy/docker/docker-compose.yml` — runs `jarvis` on port 8000 and digest-pinned Ollama on 11434 with a healthcheck, named `ollama-models` volume, `depends_on` health condition, restart policy, default Ollama engine, and a required `OPENJARVIS_API_KEY` that fails fast if unset.
- `deploy/docker/docker-compose.gpu.nvidia.yml` — override switching to `Dockerfile.gpu`, mounting `/proc` and `/sys` read-only, setting NVIDIA visibility/capability variables, and reserving all GPUs for both services.
- `deploy/docker/docker-compose.gpu.rocm.yml` — override switching to `Dockerfile.gpu.rocm` and exposing `/dev/kfd`/`/dev/dri` with `video`/`render` groups.
- `deploy/docker/.env.example` — instructs copying to `.env`, generating a key with `openssl rand -hex 32`, and sending `Authorization: Bearer <key>` because the container binds `0.0.0.0`.

#### Host services and platform prep

- `deploy/systemd/openjarvis.service` — runs `/opt/openjarvis/.venv/bin/jarvis serve` as `openjarvis`, requires `EnvironmentFile=/etc/openjarvis/env` with an API key, restarts on failure after 5 seconds, and applies hardening such as `NoNewPrivileges`, `ProtectSystem=strict`, `ReadWritePaths=/opt/openjarvis`, private temp, and kernel/control-group protections.
- `deploy/launchd/com.openjarvis.plist` — runs `/usr/local/bin/jarvis serve --host 127.0.0.1 --port 8000`, loads at login, keeps alive, logs to `/tmp`, and documents how to switch to `0.0.0.0` only with an API key.
- `deploy/windows/install.ps1` and `deploy/windows/jarvis-service.ps1` — PowerShell installer and scheduled-task manager; the installer checks Windows/Python prerequisites, installs uv, clones to `%LOCALAPPDATA%\OpenJarvis`, syncs desktop extras, and can register logon auto-start.
- `deploy/windows/README.md` — documents the `irm ... install.ps1 | iex` one-liner, `-Service`/`-SkipService`/`-Force` flags and environment equivalents, scheduled-task install/status/uninstall, loopback versus LAN binding, parity with systemd/launchd, update, and uninstall behavior.
- `deploy/posthog/posthog-hetzner-prep.sh` — idempotent root-only Ubuntu/Hetzner preparation for self-hosted PostHog: packages, UFW rules, 4 GB swap, Docker, and PostHog Hobby deploy; it prints post-install steps for project creation, API key config, 365-day retention, Session Replay off, and release.
- `render.yaml` — free Docker web service using `deploy/docker/Dockerfile`, Oregon region, `/health`, auto-deploy, command `serve --host 0.0.0.0 --port 10000 --engine cloud --model gpt-4o-mini`, generated `OPENJARVIS_API_KEY`, operator-supplied `OPENAI_API_KEY`, and `OPENJARVIS_HOME` with an explicit ephemeral-filesystem warning.

### Scripts

- `scripts/quickstart.sh` — checks Python/Node prerequisites, installs Ollama and a starter model, syncs Python/frontend dependencies, starts backend and frontend, and opens the browser UI.
- `scripts/index_docs.py` — indexes `README.md` plus `docs/**/*.md` into a DenseMemory backend for documentation search.
- `scripts/oauth_all.py` — runs OAuth flows for Google, Strava, and Spotify sequentially.
- `scripts/launch-claude.sh` — launches Claude through the cloud engine.
- `scripts/setup-energy-monitor.sh` — installs the platform-appropriate energy extra (`energy-apple`, `gpu-metrics`, or `energy-amd`) or notes sysfs RAPL availability.
- `scripts/smoke_framework_comparison.sh` — verifies commit pins and runs one-task-per-cell smoke checks across Hermes, OpenClaw, and OpenJarvis on ToolCall-15, PinchBench, and GAIA.
- `scripts/bump-desktop-version.sh` — validates semver and updates `frontend/package.json`, `tauri.conf.json`, and `src-tauri/Cargo.toml`.
- `scripts/install/install.sh` — curl-pipe-bash installer with foreground setup, detached background orchestration, analytics consent, state file, idempotent reruns, cloud detection, and flags including `--minimal`, `--force`, `--no-bg-orchestrator`, `--analytics`, and `--no-analytics`.
- `scripts/install/bg-orchestrator.sh` — detached parent for installer background work.
- `scripts/install/build-extension.sh` — builds the Maturin Rust extension into the installer venv.
- `scripts/install/install-rust.sh` — installs the Rust toolchain via rustup when cargo is absent.
- `scripts/install/pull-model.sh` — pulls an Ollama model with state-file lifecycle tracking.
- `scripts/install/jarvis-wrapper.sh` — symlinked wrapper used as `~/.local/bin/jarvis`.
- `scripts/install/jarvis-uninstall.sh` — removes OpenJarvis state, symlinks, and scripts while leaving shared tools installed.
- `scripts/security/audit_dependencies.py` — audits locked Python dependencies via OSV and renders a strict cargo-deny policy with reviewed advisory exceptions.
- `scripts/pearl/model_converter.py` — creates experimental Pearl-compatible compressed-tensors checkpoints from raw Hugging Face safetensors.
- `scripts/mining/pearl_model_converter.py` — compatibility wrapper for Pearl model conversion tooling.
- `scripts/pearl/README.md` — explains that Pearl conversion tools are manual developer utilities, not runtime commands.

### Examples

- `examples/browser_assistant/` — web-browsing agent using browser, `web_search`, and `think` tools; contains `browser_assistant.py` and README.
- `examples/code_companion/` — developer scripts `reviewer.py`, `debugger.py`, and `test_gen.py` for review, debugging, and test generation.
- `examples/cross_device_travel/` — standalone Rust handoff template with laptop/phone travel planning, protocol, runtime, demo traces, and integration tests (`Cargo.toml`, `src/`, `tests/`, `traces/happy.json`).
- `examples/daily_digest/` — `daily_digest.py` operator producing a structured news briefing.
- `examples/deep_research/` — `research.py` plus `research.toml` for multi-source, tool-using research.
- `examples/doc_qa/` — `doc_qa.py` indexes documents into memory and answers with retrieval and citations.
- `examples/messaging_hub/` — `smart_inbox.py` plus `messaging.toml` for inbox triage, priority classification, draft replies, and summaries.
- `examples/multi_model_router/` — `multi_model_router.py` routes simple versus complex queries to cheaper or larger models via learning/routing.
- `examples/openjarvis/` — `spec_search_quickstart.py` demonstrates the full LLM-guided spec search loop with local fakes and config hooks.
- `examples/scheduled_ops/` — `schedules.toml` and `code_review.py`, `daily_digest.py`, `gym_scheduler.py` demonstrate autonomous scheduled agents.
- `examples/security_scanner/` — `security_scanner.py` uses a ReAct agent to scan a project for secrets, vulnerability patterns, and dependency issues.
- `examples/twitter_bot/` — `twitter_bot.py` handles mentions in demo/live modes, `slack_preview.py` generates proactive posts into one Slack thread, and two test scripts cover grounding and real-world behavior.

### Tests

#### Structure and coverage

- `pyproject.toml` sets `testpaths = ["tests"]`; developer docs describe approximately 1,000+ pytest tests organized by module, and the test tree contains roughly fifty subsystem directories plus nested suites.
- Major areas include `a2a`, `agents`, `analytics`, `bench`, `channels`, `cli`, `connectors`, `core`, `daemon`, `deploy`, `deployment`, `engine`, `evals` (with `comparison`, `core`, `datasets`, `scorers`), `hardware`, `install` (including `bash`), `integration`, `intelligence`, `learning` (including `agents`, `intelligence`, `routing`, `spec_search`, `training`), `mcp`, `memory`, `mining`, `operators`, `pearl`, `prompt`, `recipes`, `sandbox`, `scheduler`, `sdk`, `security`, `server`, `sessions`, `skills`, `speech`, `telemetry`, `templates`, `test_orchestrator_learning`, `tools`, `traces`, and `workflow`.
- Representative suites cover orchestrator end-to-end behavior, agent lifecycle scenarios, channel contracts and platform integrations, CLI command behavior, engine/model matrices, memory backends and retrieval quality, MCP protocol/transport, miner providers and sidecars, security policy/audit/guardrails, server routes/auth/daemon behavior, skill parsing/loading/security, telemetry energy monitors, tool dispatch/sandboxing, and deployment artifacts such as Docker, Render, desktop release, and Windows ARM64 checks.
- CI runs `pytest tests/ -n auto -q --tb=short -m "not live and not cloud and not hub"` on Python 3.11 and 3.12 with `--cov=openjarvis`, terminal-missing and XML reports, and a 60% coverage floor; CPython 3.12 uses `COVERAGE_CORE=sysmon` and 3.11 uses `ctrace`.
- Local commands documented in `docs/development/contributing.md` include `uv run pytest tests/ -v`, individual file/node selection, per-directory runs, and `uv run pytest tests/ --cov=openjarvis --cov-report=html`.

#### Fixtures and isolation

- Root `tests/conftest.py` sets an isolated `OPENJARVIS_HOME` before importing config, removes `OPENJARVIS_CONFIG`, clears `load_config()` cache, disables update checks, clears all registries and resets the event bus before each test, and restores import-time environment state at session teardown/unconfigure.
- It also provides hardware profiles (NVIDIA A100/4090/multi-H100, AMD MI300X, Apple M4 Max, CPU-only), engine availability probes for Ollama/vLLM/llama.cpp, cloud API-key probes, a mock-engine factory, a history-recording `EventBus`, and shared Pearl mining sidecar payload/path fixtures.
- Subdirectory fixtures add agent lifecycle scenario harnesses with fake engines/systems, channel credential environment helpers, engine cloud-key isolation, mining H100/4090/Apple hardware and mocked Docker clients, installer temporary homes/model markers, and server trace/connector database isolation with sync-worker draining.
- Shared helper modules include `tests/agents/fake_engine.py`, `tests/agents/scenario_harness.py`, `tests/channels/channel_test_helpers.py`, `tests/telemetry/energy_test_helpers.py`, `tests/mining/fixtures/`, and `tests/fixtures/docs/`.

#### Markers and Bats tests

- Registered pytest markers are `amd`, `apple`, `cloud`, `docker`, `live`, `macos15`, `live_channel`, `nvidia`, `slow`, `hub`, `live_external`, and `modal`; representative uses include live engine and channel tests, cloud connector tests, Apple FM/macOS 15 tests, slow mining/eval cases, and Apple energy tests.
- CI excludes `live`, `cloud`, and `hub` from the default lane; the docs show `-m live`, `-m "not slow"`, and `-m "not cloud"` selections.
- `tests/install/bash/` contains Bats files `test_install.bats`, `test_bg_orchestrator.bats`, `test_build_extension.bats`, `test_install_rust.bats`, and `test_pull_model.bats`, plus `run_installer_pty.py` and eight command stubs (`cargo`, `curl`, `git`, `ollama`, `ollama-mock`, `rustup`, `uv`, `uvx`).
- `test_install.bats` uses a fake HOME, stub-first PATH, wrapped uv/python binaries, log files, and `tomlkit` assertions to verify analytics consent behavior in unattended, explicit-opt-in, and related installer paths without touching the host environment.
- `.github/workflows/bash-tests.yml` installs `bats` and `python3-tomlkit`, sets `OPENJARVIS_TEST_PYTHON`, and runs `bats tests/install/bash/` on installer-related PRs/pushes to `main`.

### CI/CD and repository infrastructure

#### GitHub Actions workflows

- `.github/workflows/ci.yml` — on pushes/PRs to `main`, calls `security-sast.yml`, requires its success before lint, runs Ruff check/format on Python 3.12 with dev/framework-comparison/server extras, tests Python 3.11/3.12 with the Rust extension and coverage gate, runs a Windows matrix (3.12/3.13) for RAM detection, CLI/daemon, GUI lifecycle, PyO3 import, file/SSRF/capability policy, time zones, and audio, and runs Rust clippy/tests plus the cross-device travel example checks.
- `.github/workflows/security-sast.yml` — reusable/manual security gate with Bandit high-severity/high-confidence rejection, Python `uv.lock` advisory audit across locked extras/platforms via `scripts/security/audit_dependencies.py`, cargo-deny for backend and desktop lockfiles with exact expiring exceptions, and pinned Semgrep baseline scanning of `src/openjarvis` and `scripts/security`; reports upload on failure.
- `.github/workflows/bash-tests.yml` — path-filtered Bats tests described above.
- `.github/workflows/docker-validation.yml` — builds the CPU image from `git archive HEAD`, smoke-checks unprivileged runtime/UI/presets/native extension without network, and on manual dispatch builds NVIDIA and ROCm images without GPU hardware while verifying Python/runtime constraints.
- `.github/workflows/docs.yml` — builds MkDocs on docs/mkdocs/source changes, injects the Supabase anon key from a secret into generated leaderboard config, builds with `uv sync --extra docs`, and deploys `site/` to GitHub Pages from `main`.
- `.github/workflows/frontend.yml` — Node 22/npm 11.19.0, `npm ci`, audit-policy node tests, `npm audit` with a checked policy, `npm test`, TypeScript no-emit, and Vite build with optional leaderboard key on frontend changes.
- `.github/workflows/installer-integration.yml` — on installer/CLI test changes or daily schedule, installs the real installer as a non-root user in Ubuntu 22.04/24.04 and Fedora 40 containers and macOS 15 Intel/ARM runners using an Ollama mock, then checks install state, `jarvis --version`, `jarvis doctor`, and clean uninstall.
- `.github/workflows/desktop.yml` — builds a PR-only unsigned Windows ARM64 test installer, validates TypeScript/Tauri tests, cleans `desktop-edge` assets, builds signed Linux/macOS universal/Windows x64/Windows ARM64 releases via `tauri-action`, verifies updater manifests/signatures and native ARM64 executables, publishes stable `desktop-v*` releases with download aliases, and mirrors stable `latest.json` into `desktop-latest`.
- `.github/workflows/autotag.yml` — on `main` push, derives `X.Y.Z.devN` from the latest plain `vX.Y.Z` tag, creates/pushes a tag, and dispatches `pypi-publish.yml` and `desktop.yml` because default-token tag pushes do not trigger workflows.
- `.github/workflows/pypi-publish.yml` — on release/tag/dispatch, builds the frontend into the Python static directory, pins the hatch-vcs version from the tag, validates wheel/sdist size and `twine check --strict`, publishes prereleases/dry runs to TestPyPI and final releases to PyPI via OIDC.
- `.github/workflows/claude-issues.yml` — write-scoped Claude issue fixer gated to maintainers for public issue/comment triggers; diagnoses, comments a plan, branches, runs Ruff/pytest, and opens a linked PR.
- `.github/workflows/claude-review.yml` — maintainer-gated `@claude` PR review via `REVIEW.md` and Claude Code Action with read contents/write comments permissions.
- `.github/workflows/take-assign.yml` — assigns a commenter who writes `take`/`Take`/`TAKE` on an issue.
- `.github/workflows/track-clones.yml` — daily clone-traffic fetch merges counts by date into `.github/clone-stats/clone-data.json`, refreshes the shields.io `badge.json`, and commits changes with `[skip ci]`.

#### Templates, security policy, and governance files

- `.github/CODEOWNERS` — `* @jonsaadfalcon @ANarayan @robbym-dev` for the branch ruleset’s Code Owner review requirement; later, more-specific rules would override it.
- `.github/dependabot.yml` — weekly grouped minor/patch updates with a two-PR limit for frontend npm, Tauri Cargo, Rust Cargo (ignoring `rig-core` major updates), root uv, and GitHub Actions.
- `.github/pull_request_template.md` — asks what the PR does, how it was tested, and checklist items for pytest, Ruff check/format, docstrings, registry pattern, and docs.
- `.github/ISSUE_TEMPLATE/bug_report.yml` — required description, reproduction, expected/actual behavior, OS, Python version, hardware, optional engine, and logs.
- `.github/ISSUE_TEMPLATE/feature_request.yml` — problem, proposal, primitive area, and alternatives, with a note to discuss non-trivial changes first.
- `.github/ISSUE_TEMPLATE/new_eval.yml` — dataset name/reference, capability checkboxes, size, proposed scorer, and context.
- `.github/ISSUE_TEMPLATE/pearl_model_validation.yml` — raw/Pearl model IDs, provider, quantization recipe, validation hardware, ten required acceptance checks, and artifacts.
- `.github/ISSUE_TEMPLATE/config.yml` — disables blank issues and directs questions to Discussions.
- `.github/security/README.md` — explains why lint fails unless the security audit succeeds, OSV/cargo-deny/Semgrep behavior, exception-review policy, and the owner step needed to activate the prepared merge rule.
- `.github/security/required-checks.json` — active `main` ruleset requiring the `lint` status check and up-to-date branches with no bypass actors.
- `.github/security/advisory-exceptions.json` — schema 1 exceptions with exact lockfile/package/version/advisories, upstream links, reasons, and 2026-12-16 expiry for GTK GLib, DiskCache via DSPy, Setuptools, and several maintenance-only Rust notices.
- `.github/clone-stats/` — accumulated clone data and generated badge JSON maintained by `track-clones.yml`.
- `.pre-commit-config.yaml` — `ruff-pre-commit` v0.9.0 with `ruff --fix` and `ruff-format`.
- `CONTRIBUTING.md` — contributor incentives, contribution sizing, Python 3.10+/uv/Node 22 prerequisites, pre-commit setup, issue claiming via “take,” conventional commits, focused/tested/documented PR expectations, and contribution-area table.
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1 with positive/unacceptable behavior standards, enforcement scope, reporting, and the four-step correction/warning/temporary-ban/permanent-ban ladder.
- `LICENSE` — Apache License 2.0, Copyright 2025 The OpenJarvis Authors, with standard terms and disclaimer.
- `CHANGELOG.md` — Keep a Changelog format with `[Unreleased]` and releases `1.0.2` (2026-05-24), `1.0.1` (2026-05-17), and `1.0.0` (2026-05-15); Unreleased notes include Apple Foundation Models, per-rail eval energy results, ANE/whole-SoC energy, and `jarvis ask` vision input with a non-local-engine privacy warning.

