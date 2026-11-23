# Local models (Ollama-first)

Free Jarvis recommends [Ollama](https://ollama.com) on every hardware class.
It is free, installs on macOS, Linux, WSL2, and Windows, serves models over a
local HTTP endpoint, and supports hot-swapping models. **No API key, account,
or paid subscription is needed.**

```bash
# Install: https://ollama.com  (macOS: brew install ollama)
ollama serve
jarvis setup                 # detects hardware and pulls the recommended model
```

The setup wizard probes `OLLAMA_HOST` (default `http://localhost:11434`) and
shows a platform-specific install hint if Ollama is not reachable. You can
point it at a different local endpoint with:

```bash
export OLLAMA_HOST=http://localhost:11434
export JARVIS_NUM_CTX=16384   # context window in tokens for vision/long inputs
```

## Exact recommendation table

These are the Free Jarvis recommendations. The four Qwen 3.5 tags are
`qwen3.5:2b`, `qwen3.5:4b`, `qwen3.5:9b`, and `qwen3.5:27b`.

| Hardware / memory | Recommended model |
|-------------------|-------------------|
| CPU-only | `qwen3.5:2b` |
| 8 GB RAM | `qwen3.5:2b` |
| 16 GB RAM | `qwen3.5:4b` |
| 32 GB RAM | `qwen3.5:9b` |
| 64 GB+ RAM | `qwen3.5:27b` |
| NVIDIA GPU | `qwen3.5:9b` (scale to 27b with 16 GB+ VRAM) |
| AMD GPU | `qwen3.5:9b` (scale to 27b with 16 GB+ VRAM) |
| Apple Silicon | `qwen3.5:9b` (16 GB unified memory), 27b on 64 GB+ |

The memory-tier labels attached to these recommendations are:

| Usable local memory | Model | Intended for |
|---------------------|-------|--------------|
| Under 8 GB | `qwen3.5:2b` | CPU-only and 8 GB systems |
| Under 16 GB | `qwen3.5:4b` | 16 GB systems or 4–6 GB GPUs |
| Under 32 GB | `qwen3.5:9b` | 32 GB systems or 8–12 GB GPUs |
| 32 GB or more | `qwen3.5:27b` | 64 GB+ systems or 16 GB+ GPUs |

### How "usable memory" is estimated

| Detected hardware | Estimate |
|---|---|
| GPU reporting VRAM (non-Apple) | `VRAM × max(GPU count, 1) × 0.90` |
| Apple Silicon (unified memory reported as VRAM) | `VRAM × max(GPU count, 1) × 0.70` |
| No GPU / VRAM unavailable | `(total RAM − 4 GB) × 0.80`, floored at 0 |

If memory cannot be determined, the wizard leaves the model blank and asks you
to choose one with `--model`. Recommendations are guidance, not a guarantee
that a model will fit or run at a given speed on every device in a band.

## Other local engines

Ollama is the default, but the underlying framework still supports explicit
alternatives through `jarvis setup --engine` or `jarvis init`:

- `llamacpp` — CPU and GGUF inference (auto-selected upstream when no GPU is found)
- `mlx` — Apple Silicon
- `vllm` / `sglang` — datacenter NVIDIA/AMD GPUs
- `lemonade` — AMD GPUs and Ryzen AI NPUs

Those paths keep upstream hardware-detection rules; the table above describes
the free Ollama-first policy. See
[Configuration](../getting-started/configuration.md#hardware-aware-local-model-recommendations).

## Changing models

At runtime, override the model for a single command:

```bash
jarvis ask -m qwen3.5:9b "Summarize this paragraph"
jarvis ask --engine ollama --model qwen3.5:4b "Hello"
```

In interactive chat, the model picker lets you switch without restarting
(`jarvis chat`; set `JARVIS_SKIP_MODEL_PICK=1` to skip it). List and pull models
locally:

```bash
jarvis model list
jarvis model info qwen3.5:9b
jarvis model pull qwen3.5:9b        # or: ollama pull qwen3.5:9b
```

To change the default persistently, edit `<data home>/config.toml`:

```toml
[intelligence]
default_model = "qwen3.5:9b"
fallback_model = "qwen3.5:4b"
```

or use the CLI:

```bash
jarvis config set intelligence.default_model qwen3.5:9b
```

Check where that file lives with `jarvis config path`. Ollama keeps model
weights in its own store (by default `~/.ollama`), outside the Free Jarvis
data home; back up both if you want a complete portable copy. See
[Backup, Restore & Updates](backup-restore.md).

## No API keys

Local model use requires no credentials. Optional, non-free cloud integrations
are documented in [Configuration](../getting-started/configuration.md#environment-variables)
and are never requested by `jarvis setup`. If you see a prompt for a cloud key
during a plain local install, stop and check that you are running the Free
Jarvis wizard.

---

Free Jarvis is based on OpenJarvis, an Apache-2.0 licensed research framework.
Copyright 2025 The OpenJarvis Authors. See [Identity](identity.md) for the full
attribution notice.
