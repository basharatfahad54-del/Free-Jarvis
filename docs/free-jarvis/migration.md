# Migrating from OpenJarvis to Free Jarvis

Free Jarvis is a local-first distribution of the same underlying project. The
upgrade path is deliberately conservative: **existing installs keep working,
nothing is moved or overwritten automatically, and all internal identifiers
are retained.** This page explains what stays the same, what is new, and how to
verify a safe migration.

## Compatibility promise

Upstream OpenJarvis installations continue to work with Free Jarvis. The
following are intentionally unchanged:

| Area | Retained identifier / behaviour |
|------|---------------------------------|
| Python package | `openjarvis` — all import paths such as `from openjarvis import Jarvis` remain valid |
| CLI | `jarvis` (the original command) |
| Default data directory | `~/.openjarvis` |
| Environment variables | `OPENJARVIS_*` names, including `OPENJARVIS_HOME`, `OPENJARVIS_CONFIG`, and `OPENJARVIS_API_KEY` |
| Databases and store keys | Existing DB filenames and store/key names are preserved; memory and traces remain readable |
| WebSocket subprotocols | `openjarvis.auth.v1` and `openjarvis.key.b64url.*` strings are unchanged |

Because of this, there is no forced migration step: update in place and your
existing data, scripts, and clients keep functioning.

## New aliases

Free Jarvis adds convenience names without removing the originals:

| New name | Role | Legacy equivalent |
|----------|------|-------------------|
| `FREE_JARVIS_HOME` | Preferred resolved data home | `OPENJARVIS_HOME` |
| `FREE_JARVIS_CONFIG` | Preferred explicit config file path | `OPENJARVIS_CONFIG` |
| `free-jarvis` | Product-named console script — the same CLI as `jarvis` | `jarvis` |

The new variables take precedence when both are set. If only `OPENJARVIS_*`
is set, it is still honoured, so upstream shell profiles need no edits. The
data-home resolution order is:

1. `FREE_JARVIS_HOME`
2. `OPENJARVIS_HOME`
3. `XDG_DATA_HOME/openjarvis`
4. `~/.openjarvis`

Config path precedence is `FREE_JARVIS_CONFIG` then `OPENJARVIS_CONFIG` then
`<data home>/config.toml`.

!!! note "No automatic moves"
    Free Jarvis **never** copies, moves, rewrites, or deletes your data simply
    because a new variable or alias exists. Setting `FREE_JARVIS_HOME` to a new
    path makes the app look there; it does not transfer anything from
    `~/.openjarvis`. Relocate data yourself if that is what you want, following
    [Backup, Restore & Updates](backup-restore.md).

## Config backup behaviour

If you run the Ollama-first wizard (`jarvis setup` or `free-jarvis setup`) on an
install that already has a `config.toml`, the wizard first copies it to:

```
<data home>/config.toml.before-free-jarvis-<UTC timestamp>
```

For example: `config.toml.before-free-jarvis-20261123T101530Z`. The original
content is preserved so you can roll back or compare settings. This is the only
automatic file-copy step in the migration path; it applies to the config file
and does not touch databases, credentials, skills, or Ollama model weights.
`jarvis init --force` still overwrites a config without this backup, so prefer
`jarvis setup` for an existing installation. See
[Backup, Restore & Updates](backup-restore.md) for full backup instructions.

## Safe upgrade steps

1. **Back up first.** Find the resolved home with `jarvis config path`, then
   copy the whole directory as described in
   [Backup, Restore & Updates](backup-restore.md). Ollama weights live in a
   separate store (usually `~/.ollama`) and do not need copying unless you are
   moving machines.
2. **Update in place.**
   ```bash
   jarvis self-update --check   # preview
   jarvis self-update           # apply
   ```
   Previously installed extras are preserved. Resolve any Git divergence
   before retrying; self-update does not reset local changes.
3. **Verify.** Run the checks below before relying on the new version.
4. **Optional: adopt the new names.** You can leave `OPENJARVIS_*` in place
   forever. To use the preferred aliases, set `FREE_JARVIS_HOME` /
   `FREE_JARVIS_CONFIG` to the *same paths* you already use, and try
   `free-jarvis --version`. Nothing is moved when you adopt an alias.
5. **Run the wizard when ready.** `jarvis setup` adds Ollama-first defaults,
   hardware-aware model recommendations, and resumable progress in
   `setup-state.json`. It backs up `config.toml` as described above and never
   asks for cloud keys. See [Setup Wizard](setup-wizard.md).

## Verify the migration

```bash
# Confirm the resolved data home and config file
jarvis config path

# Confirm the CLI alias is the same program
jarvis --version
free-jarvis --version

# Check local runtime, engine, and dependencies
jarvis doctor

# Confirm existing models and a small local query
jarvis model list
jarvis ask "Hello"
```

`jarvis config path` should point at the same directory you used before the
upgrade (by default `~/.openjarvis`). `jarvis doctor` reports dependency and
engine health. If either command surprises you, stop and inspect your
`FREE_JARVIS_HOME` / `OPENJARVIS_HOME` / `XDG_DATA_HOME` settings before making
changes — do not delete or move data to "fix" a path mismatch. If memory or
traces look missing, restore from the backup rather than reinitialising.

## Optional cloud integrations

Cloud provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`,
and others) remain supported for backwards compatibility. They are optional,
non-free, third-party integrations and are never required by the Free Jarvis
local experience or requested by `jarvis setup`. Keep them in your environment
or local vault, never in `config.toml` or version control.

## Upstream attribution

Free Jarvis is based on OpenJarvis, an Apache-2.0 licensed research framework.
Copyright 2025 The OpenJarvis Authors. Free Jarvis adds local-first defaults,
product branding, setup tooling, and interface changes; it does not claim
authorship of the upstream implementation. The upstream research, citation,
and sponsors are preserved on the [homepage](../index.md#upstream-research-and-attribution),
and the full license text is in the repository `LICENSE` file.
