# Installer reference

The Free Jarvis installer sets up a **local** install: it installs uv, a Python
environment, Ollama, and a small free starter model, then writes a local-only
config and links the CLI. No cloud account, payment, or API key is required.
After installing, run `jarvis setup` to complete the resumable first-run wizard.

## Platform-specific guides

| Platform | One-liner | Detailed guide |
|---|---|---|
| **macOS** | `curl -fsSL https://<your-github-username>.github.io/free-jarvis/install.sh \| bash` | [macOS install](macos.md) |
| **Linux** | `curl -fsSL https://<your-github-username>.github.io/free-jarvis/install.sh \| bash` | [Linux install](linux.md) |
| **WSL2 on Windows** | `curl -fsSL https://<your-github-username>.github.io/free-jarvis/install.sh \| bash` (run inside Ubuntu) | [WSL2 install](wsl2.md) |
| **Native Windows** | `irm https://<your-github-username>.github.io/free-jarvis/install.ps1 \| iex` | [Native Windows install](windows-native.md) |
| **Desktop GUI** | Build from `desktop/`, or use your repository's Releases page | — |

Replace `<your-github-username>` with your account before publishing these
docs. The bash and PowerShell installers do the same thing on their respective
hosts. The rest of this page documents the bash installer in detail; the
[native Windows guide](windows-native.md) is the equivalent reference for
PowerShell.

## Bash installer

```bash
curl -fsSL https://<your-github-username>.github.io/free-jarvis/install.sh | bash
```

The installer downloads everything for you — including [uv](https://docs.astral.sh/uv/)
(the Python package manager), the Python venv, Ollama, and a small starter
model. **You don't need to install uv or any other prerequisite first.**

!!! info "Install URL"
    Upstream OpenJarvis docs reference `https://open-jarvis.github.io/OpenJarvis/install.sh`
    and an older community domain with intermittent TLS issues. For Free Jarvis,
    use the placeholder URL above and replace `<your-github-username>` with your
    own GitHub account when publishing.

About 3 minutes on a typical broadband connection. Type `jarvis` (or the
product-named alias `free-jarvis`) to start chatting.

Before sending any installation analytics, the Bash installer displays a
dedicated optional-sharing prompt: **Press Enter or Y to consent, or N to
decline**. The choice also controls runtime analytics. No terminal, EOF, or
cancelled input leaves sharing off. See [Telemetry](../telemetry.md) for details.

## What the installer does

| Phase | Step | Where |
|---|---|---|
| Foreground | Install `uv` (Python package manager) | `~/.cargo/bin/` or `~/.local/bin/` |
| Foreground | Clone Free Jarvis repo | `<data home>/src/` (default `~/.openjarvis/src/`) |
| Foreground | Create Python 3.11 venv | `<data home>/.venv/` |
| Foreground | `uv pip install -e .` (editable install) | venv |
| Foreground | Install Ollama | system default |
| Foreground | Start `ollama serve` | systemd-user / launchd / nohup |
| Foreground | Pull `qwen3.5:2b` (free local model) | Ollama's model store |
| Foreground | Write `config.toml` (auto-detected hardware + Ollama + model) | `<data home>/config.toml` |
| Foreground | Symlink `jarvis` (and `free-jarvis` where provided) | `~/.local/bin/` |
| Foreground | Add `~/.local/bin` to PATH if missing (with on-screen notice) | `~/.bashrc` or `~/.zshrc` |
| Background | Install Rust toolchain via rustup | `~/.cargo/` |
| Background | Build the maturin extension (memory + security features) | venv |
| Background | Pull hardware-tier and tier+1 models | Ollama's model store |

`<data home>` is the resolved Free Jarvis data directory — by default
`~/.openjarvis`, or the value of `FREE_JARVIS_HOME` (legacy: `OPENJARVIS_HOME`).
Check it with `jarvis config path`.

## What the installer does NOT touch

- Your existing Python installations
- Your `~/.bashrc` / `~/.zshrc` other than appending one PATH line (with on-screen notice)
- Your existing Ollama models
- Any other tool or dotfile
- Cloud credentials — nothing is requested and nothing is written

## Complete setup with the wizard

The installer prepares the machine; `jarvis setup` completes the first-run
experience. The wizard is resumable and always local-first:

```bash
jarvis setup                    # 12 guided stages; safe to re-run
jarvis setup --non-interactive  # accept all local-first defaults
jarvis setup --skip-download    # choose a model without pulling weights yet
jarvis setup --engine ollama --model qwen3.5:4b
jarvis setup --reset            # forget saved progress and start over
jarvis setup --open             # launch the browser UI when finished
```

Progress is stored in `<data home>/setup-state.json`. If you close the terminal
or a model download fails, run `jarvis setup` again to continue. See the
[setup wizard guide](../free-jarvis/setup-wizard.md) for every stage.

## Idempotent re-runs

Re-running the curl line is safe. The installer reads
`<data home>/.state/install-state.json` and skips completed steps. If your venv
is removed, re-running heals it.

## Cloud quick-path (optional, non-free)

Free Jarvis does **not** need any of these. If any of the following variables
are set when you install or run `jarvis init`, the upstream-compatible init
command proposes cloud as the default and writes the matching provider into
`config.toml`:

- `OPENROUTER_API_KEY`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY` (or `GEMINI_API_KEY`)

Local-first remains the default when no key is in env. Precedence is
OpenRouter > Anthropic > OpenAI > Google. These are third-party paid services:
using them may cost money and sends prompts off your device. The `jarvis setup`
wizard never asks for them.

## Flags

| Flag | Effect |
|---|---|
| `--minimal` | Skip the foreground model pull. First chat will need to wait for the bg pull to finish. |
| `--no-bg-orchestrator` | Don't detach the background work pipeline. (Mostly for testing.) |
| `--force` | Re-run all steps even if `install-state.json` says they're done. |
| `--analytics` | Consent to installation and runtime usage analytics without prompting. |
| `--no-analytics` | Decline analytics without prompting. |

## Environment overrides

| Variable | Default | Purpose |
|---|---|---|
| `FREE_JARVIS_HOME` | `$HOME/.openjarvis` | Preferred root for config, databases, caches, logs, skills, and credentials. |
| `OPENJARVIS_HOME` | — | Legacy alias; honored when `FREE_JARVIS_HOME` is unset. |
| `FREE_JARVIS_CONFIG` | `<data home>/config.toml` | Explicit config file path. |
| `OPENJARVIS_CONFIG` | — | Legacy alias for the explicit config file path. |
| `OLLAMA_HOST` | `http://localhost:11434` | Local Ollama endpoint; no key needed. |
| `JARVIS_NUM_CTX` | `16384` | Ollama context window in tokens. |
| `OPENJARVIS_REPO_URL` | `https://github.com/<your-github-username>/free-jarvis.git` | Legacy override for the clone step. |

## Uninstall, backup, and updates

Back up your data before uninstalling or updating. The data root contains your
config, memory, traces, credentials, and skills — never delete it blindly.
See [Backup, Restore & Updates](../free-jarvis/backup-restore.md).

```bash
jarvis-uninstall
```

The uninstaller removes the installed program, CLI links, and associated
install artifacts. Keep your `<data home>` backup; any removal of user data
requires an explicit, separate confirmation. Ollama, uv, and the Rust toolchain
are left in place because other tools may use them; the script prints removal
hints.

To update in place:

```bash
jarvis self-update
```

Fetches release-tag history from your configured repository, pulls the latest
source with a fast-forward-only update, and rebuilds Free Jarvis in the Python
environment that launched it. Previously installed extras are preserved. Use
`jarvis self-update --check` to preview the plan, or `--yes` to skip the
confirmation prompt. If Git reports a conflict or diverged branch, resolve it
before retrying; self-update does not reset local changes.

## Troubleshooting

### "command not found: jarvis"

`~/.local/bin` isn't on your PATH. Run `source ~/.bashrc` (or `~/.zshrc`) or open a new terminal.

### "memory features unavailable"

Rust extension hasn't finished building yet (or failed). Check status:

```bash
jarvis doctor
```

Manually retry:

```bash
~/.openjarvis/.scripts/install-rust.sh && ~/.openjarvis/.scripts/build-extension.sh
```

### A bigger model failed to download

Check status and retry, or re-run the resumable wizard:

```bash
jarvis doctor
~/.openjarvis/.scripts/pull-model.sh qwen3.5:9b
jarvis setup
```

### Behind a corporate proxy

Set `HTTPS_PROXY` and `CURL_CA_BUNDLE` in your environment before running the installer.

---

Free Jarvis is based on OpenJarvis, an Apache-2.0 licensed research framework.
Copyright 2025 The OpenJarvis Authors. See [Identity](../free-jarvis/identity.md)
for the full attribution notice.
