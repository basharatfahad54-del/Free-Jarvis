---
title: Free Jarvis
description: Your Personal AI. Your Device. Your Rules.
search:
  boost: 2
hide:
  - navigation
---

# Free Jarvis

<p class="hero-tagline">
Your Personal AI. Your Device. Your Rules. Free Jarvis is a local-first
personal AI assistant: it runs on your hardware, keeps your data in one folder
you control, and needs no cloud account or API key.
</p>

Free Jarvis is a downstream, local-first distribution of the upstream
OpenJarvis research framework. Ollama is the recommended runtime, the
`jarvis setup` wizard gets you running in a few guided steps, and every core
feature works offline. Cloud providers are optional add-ons, never a
requirement. See [Identity & What Changed](free-jarvis/identity.md) for the
full product story.

<div class="grid cards" markdown>

-   :material-rocket-launch:{ .lg .middle } **Set up once, pick up where you left off**

    ---

    `jarvis setup` detects your hardware, recommends a local model that fits,
    and saves progress in your data directory. Interrupt it and re-run the
    command to resume.

    [:octicons-arrow-right-24: Setup wizard](free-jarvis/setup-wizard.md)

-   :material-cpu:{ .lg .middle } **Models chosen for your machine**

    ---

    Ollama-first recommendations for CPU-only systems, 8–64 GB RAM, NVIDIA,
    AMD, and Apple Silicon using the Qwen 3.5 family. Swap models at runtime.

    [:octicons-arrow-right-24: Local models](free-jarvis/local-models.md)

-   :material-shield-check:{ .lg .middle } **Private by default**

    ---

    Services bind to `127.0.0.1`, your data stays under `~/.openjarvis`, and
    remote access requires an API key and HTTPS. Capability policies,
    approvals, and audit logs keep tool use accountable.

    [:octicons-arrow-right-24: Security](user-guide/security.md)

</div>

---

## The 18-area command center

Free Jarvis brings the pieces of a personal AI together in one local command
center. Everything below runs from your own device; optional integrations are
explicit and opt-in.

| # | Area | What it gives you |
|---|------|-------------------|
| 1 | Chat & conversations | Streaming chat in the browser, desktop app, terminal, or Python SDK |
| 2 | Local models | Ollama-first model discovery, pulls, and hot-swapping |
| 3 | Engines | Ollama by default; llama.cpp, MLX, vLLM, SGLang, and others available |
| 4 | Agents | Simple, orchestrator, ReAct, CodeAct, operative, and monitor agents |
| 5 | Tools | Calculator, web search, file access, code interpreter, retrieval, MCP |
| 6 | Memory & knowledge | Local SQLite/FTS5 memory, document indexing, persistent recall |
| 7 | Skills | Reusable tool-and-prompt compositions discovered from your data directory |
| 8 | Persona | Your own `SOUL.md`, `MEMORY.md`, and `USER.md` shape the JARVIS persona |
| 9 | Channels & connectors | Optional Telegram, Discord, Slack, webhook, and other bridges |
| 10 | Scheduler | Cron-driven monitors, digests, and recurring personal ops |
| 11 | Voice & speech | Browser Web Speech by default; server STT/TTS is opt-in |
| 12 | Workflows & recipes | Packaged presets and composable system configurations |
| 13 | Telemetry & energy | Local-only timing, token, and power statistics |
| 14 | Traces & learning | Interaction traces that can improve routing and prompts over time |
| 15 | Security & approvals | Guardrails, capability policy, confirmations, and prompt-injection defenses |
| 16 | Vault & credentials | Local credential storage; secrets never belong in `config.toml` |
| 17 | Backup, restore & updates | Copy one data directory, update in place, uninstall without data loss |
| 18 | Diagnostics & settings | `jarvis doctor`, `jarvis config path`, and an env-aware TOML config |

Start with the [quick start](getting-started/quickstart.md), then explore the
[user guide](user-guide/cli.md) area by area.

---

## Get Started

=== "Guided setup (recommended)"

    Install Ollama, then let the resumable wizard do the rest:

    ```bash
    # Install Ollama from https://ollama.com, then:
    ollama serve
    jarvis setup
    ```

    No API key is required. If you stop halfway, run `jarvis setup` again to
    continue. See the [setup wizard](free-jarvis/setup-wizard.md) and
    [installation](getting-started/installation.md) guides.

=== "Browser App"

    Run the full chat UI locally with one script:

    ```bash
    git clone https://github.com/<your-github-username>/free-jarvis.git
    cd free-jarvis
    ./scripts/quickstart.sh
    ```

    This installs dependencies, starts Ollama plus a local model, launches the
    backend and frontend, and opens `http://localhost:5173` in your browser.

=== "Desktop App"

    The desktop app is a native window for the Free Jarvis UI. The backend
    (Ollama + inference) runs on your machine — start it first, then open the app.

    **Step 1.** Start the backend:

    ```bash
    git clone https://github.com/<your-github-username>/free-jarvis.git
    cd free-jarvis
    ./scripts/quickstart.sh
    ```

    **Step 2.** Build the app from source in `desktop/`, or download an
    installer from the Releases page of your own repository
    (`https://github.com/<your-github-username>/free-jarvis/releases`).
    Replace `<your-github-username>` with your account before publishing docs.

    The app connects to `http://localhost:8000` automatically.

=== "Python SDK"

    ```python
    from openjarvis import Jarvis

    j = Jarvis()                              # auto-detect engine
    response = j.ask("Explain quicksort.")
    print(response)
    ```

    The Python package remains `openjarvis` for backwards compatibility; see
    [migration](free-jarvis/migration.md).

=== "CLI"

    Both `free-jarvis` and `jarvis` invoke the same command:

    ```bash
    jarvis setup
    jarvis ask "What is the capital of France?"

    free-jarvis ask --agent orchestrator --tools calculator "What is 137 * 42?"

    jarvis serve --port 8000

    jarvis memory index ./docs/
    jarvis memory search "configuration options"
    ```

---

## Five primitives for personal AI

The architecture is unchanged from upstream and built around five composable
layers. Each has a clean interface and can be swapped independently.

1. **Intelligence** — Pick a model, or let Free Jarvis pick one for your hardware. Manages the catalog of local models across providers.
2. **Engine** — The inference runtime: [Ollama](https://ollama.com) first, plus [vLLM](https://github.com/vllm-project/vllm), [SGLang](https://github.com/sgl-project/sglang), [llama.cpp](https://github.com/ggerganov/llama.cpp), cloud APIs, and more.
3. **Agents** — Multi-step reasoning with tool use, from simple chat to orchestrated workflows.
4. **Tools & Memory** — Web search, calculator, file I/O, code interpreter, retrieval, persistent local state, and any external MCP server.
5. **Learning** — Local traces can drive improvements to routing, prompts, and agent behavior.

---

## Key features

<div class="grid cards" markdown>

-   **Ollama-first setup**

    ---

    `jarvis setup` detects your machine, recommends a Qwen 3.5 model that fits,
    pulls it locally, and writes a local-only config. No cloud keys, no signup.

-   **Local-first by default**

    ---

    Core functionality works without a network connection. Cloud APIs are
    clearly marked, optional extras.

-   **10+ Engine Backends**

    ---

    [Ollama](https://ollama.com), [vLLM](https://github.com/vllm-project/vllm), [SGLang](https://github.com/sgl-project/sglang), [llama.cpp](https://github.com/ggerganov/llama.cpp), [MLX](https://github.com/ml-explore/mlx), [Exo](https://github.com/exo-explore/exo), [LiteLLM](https://github.com/BerriAI/litellm), cloud (OpenAI/Anthropic/Google), and more. Same `InferenceEngine` interface, swap freely.

-   **Automated workflows**

    ---

    Cron-based agents that monitor, summarize, and act — running on your hardware.

-   **Hardware-aware**

    ---

    Detects your CPU, RAM, and GPU and recommends a local engine and model size.

-   **OpenAI-compatible API**

    ---

    `jarvis serve` starts a FastAPI server with SSE streaming, bound to
    `127.0.0.1` unless you explicitly opt into remote access.

-   **Energy & cost tracking**

    ---

    Local telemetry for GPU power draw, token counts, and latency.

</div>

---

## Documentation

<div class="grid cards" markdown>

-   **[Getting Started](getting-started/installation.md)**

    ---

    Install Free Jarvis, set up Ollama, and run your first query.

-   **[Free Jarvis specifics](free-jarvis/identity.md)**

    ---

    Product identity, the setup wizard, local model recommendations, backup and
    restore, and migration from upstream OpenJarvis.

-   **[User Guide](user-guide/cli.md)**

    ---

    CLI, Python SDK, and guides for [Morning Digest](user-guide/morning-digest.md), [Deep Research](user-guide/deep-research.md), [Code Assistant](user-guide/code-assistant.md), [Scheduled Monitor](user-guide/scheduled-monitor.md), [Simple Chat](user-guide/chat-simple.md), [Evaluations](user-guide/evaluations.md), agents, memory, tools, and telemetry.

-   **[Architecture](architecture/overview.md)**

    ---

    Five-primitive design, registry pattern, query flow, and cross-cutting learning.

-   **[API Reference](api-reference/openjarvis/index.md)**

    ---

    Auto-generated reference for every module in the `openjarvis` package.

-   **[Deployment](deployment/index.md)**

    ---

    Docker, systemd, launchd, GPU-accelerated images, and local API server setup.

-   **[Development](development/contributing.md)**

    ---

    Contributing guide, extension patterns, roadmap, and changelog.

</div>

## Upstream research and attribution

The research framework behind Free Jarvis was developed by the upstream
OpenJarvis authors. We preserve their attribution and research links here.

OpenJarvis is part of [Intelligence Per Watt](https://www.intelligence-per-watt.ai/), a research initiative studying the efficiency of on-device AI systems. Developed at [Hazy Research](https://hazyresearch.stanford.edu/) and the [Scaling Intelligence Lab](https://scalingintelligence.stanford.edu/) at [Stanford SAIL](https://ai.stanford.edu/).

Read the [blog post](https://openjarvis.stanford.edu/) for the full research motivation, architecture details, and experimental results.

## Citation (upstream)

```bibtex
@misc{saadfalcon2026openjarvispersonalaipersonal,
      title={OpenJarvis: Personal AI, On Personal Devices}, 
      author={Jon Saad-Falcon and Avanika Narayan and Robby Manihani and Tanvir Bhathal and Herumb Shandilya and Hakki Orhun Akengin and Gabriel Bo and Andrew Park and Matthew Hart and Caia Costello and Chuan Li and Christopher Ré and Azalia Mirhoseini},
      year={2026},
      eprint={2605.17172},
      archivePrefix={arXiv},
      primaryClass={cs.LG},
      url={https://arxiv.org/abs/2605.17172}, 
}
```

## Sponsors (upstream)

<p>
  <a href="https://www.laude.org/">Laude Institute</a> &bull;
  <a href="https://datascience.stanford.edu/marlowe">Stanford Marlowe</a> &bull;
  <a href="https://cloud.google.com/">Google Cloud Platform</a> &bull;
  <a href="https://lambda.ai/">Lambda Labs</a> &bull;
  <a href="https://ollama.com/">Ollama</a> &bull;
  <a href="https://research.ibm.com/">IBM Research</a> &bull;
  <a href="https://hai.stanford.edu/">Stanford HAI</a>
</p>

Follow [@OpenJarvisAI](https://x.com/OpenJarvisAI) on X for upstream updates.

!!! note "Apache-2.0 attribution"
    Free Jarvis is based on OpenJarvis, an Apache-2.0 licensed research
    framework. Copyright 2025 The OpenJarvis Authors. Free Jarvis adds
    local-first defaults, product branding, setup tooling, and interface
    changes; it does not claim authorship of the upstream implementation.
