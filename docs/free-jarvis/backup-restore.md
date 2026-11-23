# Backup, Restore & Updates

Your data is the most valuable part of Free Jarvis. The application is
replaceable; conversations, memory, traces, skills, credentials, and your
persona are not. This page describes the safe way to protect them.

!!! warning "Never delete user data"
    Uninstalling, updating, or "fixing" a startup problem must never begin by
    deleting your data directory. Back it up first, and keep the backup until
    the new install has been verified. Any removal of user data requires an
    explicit, separate confirmation.

## Find your data home

All state lives under a single resolved data home. With no overrides that is
`~/.openjarvis`, but `FREE_JARVIS_HOME` (legacy: `OPENJARVIS_HOME` or
`XDG_DATA_HOME/openjarvis`) can change it.

```bash
jarvis config path       # shows the data home and config file
jarvis config home       # resolved data home
```

Use that exact path in every command below. The examples use `~/.openjarvis`
as the default.

## What is inside

| Path | Contents |
|------|----------|
| `config.toml` | Engine, model, security, and feature settings |
| `config.toml.before-free-jarvis-*` | Automatic backup copies made by the setup wizard |
| `setup-state.json` | Saved progress for the resumable `jarvis setup` wizard |
| `memory.db`, `telemetry.db`, `traces.db` | Local SQLite databases |
| `vault/` | Stored credentials (treat as secret) |
| `skills/`, `personas/` | Your skills and persona files |
| `SOUL.md`, `MEMORY.md`, `USER.md` | Editable JARVIS persona files |
| `logs/` | Local logs |
| `src/`, `.venv/` | Source checkout and Python environment created by the installer |

Ollama stores downloaded model weights separately, by default under
`~/.ollama`. It is not part of the Free Jarvis data home. If you want a fully
portable copy, back up that directory too, or simply re-pull models with
`ollama pull <tag>` on the new machine.

## Back up

Stop the server and any running CLI processes so SQLite writes are flushed,
then copy the whole data home. A plain recursive copy is sufficient for normal
backups:

```bash
# Resolve the path first
jarvis config path

# Stop background services (if running)
# pkill -f "jarvis serve"

# Copy the directory, preserving metadata
cp -a ~/.openjarvis ~/.openjarvis.backup-$(date +%Y%m%dT%H%M%S)
```

For containers, back up the named volume instead of a host folder:

```bash
docker run --rm -v free-jarvis-data:/data -v "$PWD:/backup" alpine \
  tar czf /backup/free-jarvis-data.tgz -C /data .
```

Store the archive somewhere outside the install tree. Do not put backups inside
`<data home>/src/` — the resolved data home is rejected if it points inside a
source checkout.

## Config backup behaviour

`jarvis setup` never silently overwrites a hand-edited configuration. Before it
writes a new `config.toml`, it copies the existing file to:

```
<data home>/config.toml.before-free-jarvis-<UTC timestamp>
```

For example: `config.toml.before-free-jarvis-20261123T101530Z`. The original
file is left in place until the write succeeds. These timestamped copies are
included in a data-home backup. You can also make one manually before any risky
change:

```bash
cp ~/.openjarvis/config.toml \
   ~/.openjarvis/config.toml.before-free-jarvis-manual-$(date +%Y%m%dT%H%M%SZ)
```

To roll back just the config:

```bash
cp ~/.openjarvis/config.toml.before-free-jarvis-<timestamp> \
   ~/.openjarvis/config.toml
```

## Restore

Restore into a fresh install of the same Free Jarvis version where possible.

```bash
# 1. Stop the app
# pkill -f "jarvis serve"

# 2. Move any partial new data aside rather than deleting it
mv ~/.openjarvis ~/.openjarvis.partial-$(date +%Y%m%dT%H%M%S)

# 3. Restore your backup
cp -a ~/.openjarvis.backup-<timestamp> ~/.openjarvis

# 4. Verify
jarvis config path
jarvis doctor
jarvis model list
```

Restore a container volume with:

```bash
docker run --rm -v free-jarvis-data:/data -v "$PWD:/backup" alpine \
  tar xzf /backup/free-jarvis-data.tgz -C /data
```

If you restored a backup taken from a different `FREE_JARVIS_HOME`, set the
environment variable to the restored location before running any `jarvis`
command. Nothing is moved automatically; see
[Migrating from OpenJarvis](migration.md).

## Updates

Update in place. The updater preserves installed extras and existing data.

```bash
jarvis self-update --check   # preview the plan
jarvis self-update           # perform the update
```

Take a data backup first. If Git reports a conflict or a diverged branch,
resolve it before retrying; `jarvis self-update` does not reset local changes.
For container deployments, rebuild and recreate the container while keeping
the named data volume:

```bash
docker compose up -d --build
```

After any update, confirm with `jarvis doctor` and a small query such as
`jarvis ask "Hello"`. If something looks wrong, restore the config from its
`config.toml.before-free-jarvis-*` copy and re-check `jarvis config path`.

## Uninstall safely

The uninstaller removes the installed program, CLI links, and installation
artifacts. It does **not** delete your data home, Ollama, uv, or the Rust
toolchain, because other tools may use them. Keep your backup even after a
successful uninstall.

```bash
jarvis-uninstall
```

Only if you have a verified backup and deliberately want to erase your data
should you remove the data home in a separate, explicit step:

```bash
# DESTRUCTIVE — only after verifying the backup
# rm -rf ~/.openjarvis
```

For containers, `docker compose down` keeps named volumes;
`docker compose down -v` deletes them and must never be used without a
verified backup. See [Docker deployment](../deployment/docker.md).

## Checklist

- [ ] `jarvis config path` recorded
- [ ] Server stopped before copying SQLite databases
- [ ] Full data home copied to an external location
- [ ] Ollama models backed up or re-pullable
- [ ] Credentials/vault included and the backup stored securely
- [ ] Update or uninstall completed
- [ ] `jarvis doctor` and a test query passed after the change

---

Free Jarvis is based on OpenJarvis, an Apache-2.0 licensed research framework.
Copyright 2025 The OpenJarvis Authors. Free Jarvis adds local-first defaults,
product branding, setup tooling, and interface changes; it does not claim
authorship of the upstream implementation. See [Identity](identity.md) for the
full attribution notice.
