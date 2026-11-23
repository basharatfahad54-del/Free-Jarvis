---
title: Identity & What Changed
description: What Free Jarvis is, its tagline, CLI names, and its relationship to upstream OpenJarvis
---

# Identity & What Changed

## Product identity

| Field | Value |
|-------|-------|
| Product name | **Free Jarvis** |
| Repository name | `free-jarvis` |
| Tagline | **Your Personal AI. Your Device. Your Rules.** |
| Short description | Local-first personal AI assistant |
| Default persona | `JARVIS` |
| Python package | `openjarvis` (unchanged) |
| CLI commands | `free-jarvis` and `jarvis` (same entry point) |
| Default data directory | `~/.openjarvis` (unchanged) |

Free Jarvis is a downstream, local-first distribution of the upstream
OpenJarvis research framework. It keeps the architecture and the research
heritage intact while changing the *default experience*: Ollama is the first
runtime you meet, the `jarvis setup` wizard is resumable and never asks for
cloud credentials, and the product speaks in its own voice.

## What changed for users

- **Ollama-first setup.** `jarvis setup` detects your hardware, recommends a
  free local Qwen 3.5 model, and pulls it from Ollama. No signup, no API key.
- **Resumable wizard.** Progress is saved in `setup-state.json` in your data
  home. Interrupt it and run `jarvis setup` again to continue.
- **Product-named CLI alias.** `free-jarvis` invokes the same CLI as `jarvis`.
  Existing scripts keep working.
- **New preferred environment names.** `FREE_JARVIS_HOME` and
  `FREE_JARVIS_CONFIG` are preferred; `OPENJARVIS_HOME` and
  `OPENJARVIS_CONFIG` remain supported.
- **Local-only defaults.** API and UI bind to `127.0.0.1`. Remote access
  requires an API key and HTTPS.
- **Hardware-aware recommendations.** CPU-only, 8/16/32/64 GB RAM, NVIDIA,
  AMD, and Apple Silicon get concrete model suggestions. See
  [Local Models](local-models.md).
- **Backups and migration guidance.** One data directory to back up; config
  files are copied to `config.toml.before-free-jarvis-<timestamp>` before a
  setup rewrite. See [Backup, Restore & Updates](backup-restore.md) and
  [Migrating from OpenJarvis](migration.md).

## What deliberately did not change

Internal identifiers are retained so existing installs, plugins, and scripts
keep working:

- the `openjarvis` Python package and all import paths;
- the `jarvis` CLI command (now joined by `free-jarvis`);
- the `.openjarvis` default data directory and database filenames;
- `OPENJARVIS_*` legacy environment variables, API-key name, and DB/store keys;
- WebSocket authentication subprotocol strings (`openjarvis.auth.v1` and
  `openjarvis.key.b64url.*`);
- the five-primitive architecture and registry pattern.

See [Migrating from OpenJarvis](migration.md) for the complete compatibility
list and a safe upgrade path.

## Quick links

- [Setup wizard](setup-wizard.md) — all 12 stages and every flag
- [Local models](local-models.md) — exact recommendation table
- [Backup, restore & updates](backup-restore.md) — protect your data
- [Installation](../getting-started/installation.md) — get running locally
- [Security](../user-guide/security.md) — localhost, approvals, and audit logs

---

## Upstream attribution

Free Jarvis is based on OpenJarvis, an Apache-2.0 licensed research framework.
Copyright 2025 The OpenJarvis Authors. Free Jarvis adds local-first defaults,
product branding, setup tooling, and interface changes; it does not claim
authorship of the upstream implementation.

The upstream research was developed at Hazy Research and the Scaling
Intelligence Lab at Stanford SAIL. The homepage documentation preserves the
original citation, sponsors, and research links under
[Upstream research and attribution](../index.md#upstream-research-and-attribution).
The full license text is in the repository `LICENSE` file.
