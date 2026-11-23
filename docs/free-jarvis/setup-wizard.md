# The `jarvis setup` wizard

`jarvis setup` is the Free Jarvis first-run wizard. It is local by design: it
detects your hardware, recommends an Ollama model that fits, writes a local-only
config, and never asks for a cloud API key. `free-jarvis setup` is the same
command under the product-named alias.

```bash
jarvis setup
```

## Resumability

The wizard records completed steps in **`<data home>/setup-state.json`**, where
`<data home>` is the resolved data directory (`~/.openjarvis` by default, or
`FREE_JARVIS_HOME` / legacy `OPENJARVIS_HOME`). Re-run `jarvis setup` at any
time: finished steps print `[done]` and are skipped, so an interrupted model
download or a closed terminal does not force you to start over.

!!! note "No automatic data moves"
    The wizard writes state under the resolved data home and never relocates or
    deletes existing user data. If it needs to replace an existing
    `config.toml`, it first copies it to
    `config.toml.before-free-jarvis-<UTC-timestamp>`. See
    [Backup, Restore & Updates](backup-restore.md).

## The 12 stages

Internally the wizard tracks twelve named stages. The terminal prints a banner
for `welcome` and numbered headings for the remaining stages (1–11).

| # | Stage | What happens |
|---|-------|--------------|
| 0 | `welcome` | Prints the product name, tagline, and the "everything is local" promise |
| 1 | `hardware` | Reports OS, CPU, core count, RAM, GPU, and estimated usable inference memory |
| 2 | `dependencies` | Checks Python, Node.js (for `jarvis gui`), and whether Ollama is on `PATH` |
| 3 | `ollama` | Probes `OLLAMA_HOST` (default `http://localhost:11434`) and shows a free install hint if it is not running |
| 4 | `model` | Presents the recommended local engine and model with a reason; accepts an override |
| 5 | `download` | Runs `ollama pull <model>` when Ollama is available; failures are retryable by re-running setup |
| 6 | `engine` | Writes the local-first config, backing up an existing `config.toml` first |
| 7 | `storage` | Creates the data and cache directories under the resolved home |
| 8 | `voice` | Explains that browser speech uses the Web Speech API and server STT/TTS is opt-in |
| 9 | `integrations` | Lists available connectors; configure later with `jarvis connect <name>` |
| 10 | `security` | Confirms the localhost bind; optionally generates a local API key for remote access |
| 11 | `finish` | Prints next commands (`jarvis`, `jarvis gui`, `jarvis doctor`, `jarvis setup`) |

The downloaded model, engine choice, and other choices are persisted in
`setup-state.json` alongside the completed-step list.

## Options

| Flag | Effect |
|------|--------|
| `--non-interactive` | Accept all local-first defaults and skip confirmation prompts. |
| `--skip-download` | Choose the model without pulling weights now; useful on slow links. |
| `--engine <name>` | Override the recommended local engine (Ollama is the default). |
| `--model <tag>` | Override the recommended local model, e.g. `qwen3.5:4b`. |
| `--reset` | Forget stored progress and start the wizard over. It does **not** delete your data or config. |
| `--open` | Launch the browser UI at `http://127.0.0.1:8000/` when setup finishes. |

```bash
# Accept all defaults, no model download
jarvis setup --non-interactive --skip-download

# Pin a model explicitly
jarvis setup --engine ollama --model qwen3.5:9b

# Start over without touching user data
jarvis setup --reset
```

## After setup

```bash
jarvis doctor            # verify local runtime and engine
jarvis model list        # confirm the pulled model is visible
jarvis ask "Hello!"      # first local query
jarvis setup --open      # optional: open the browser UI
```

Cloud keys are never required. Optional, non-free provider integrations are
documented in [Configuration](../getting-started/configuration.md#environment-variables)
and are always opt-in.

---

Free Jarvis is based on OpenJarvis, an Apache-2.0 licensed research framework.
Copyright 2025 The OpenJarvis Authors. See [Identity](identity.md) for the full
attribution notice.
