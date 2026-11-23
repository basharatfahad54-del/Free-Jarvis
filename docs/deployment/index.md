---
title: Deployment
description: Deploy Free Jarvis locally, on your LAN, or as a managed service
---

# Deployment

Free Jarvis is designed to run on **your** device. The default bind address is
`127.0.0.1` (localhost), so the API and UI are not reachable from other machines
until you explicitly change that. Choose the deployment strategy that fits your
environment.

## Before you expose anything

- **Localhost by default.** Leave the server on `127.0.0.1` for single-user use.
- **API key for non-loopback.** Setting an API key (`OPENJARVIS_API_KEY`) is
  required before the server will bind to a non-loopback address.
- **HTTPS for remote access.** Terminate TLS in a reverse proxy and keep the
  app bound to localhost behind it. Do not pass API keys over plain HTTP.
- **Persistent data volume.** Config, memory, traces, telemetry, and skills live
  under the resolved data home (`~/.openjarvis` by default). Mount or relocate
  that directory so container updates never lose it.
- **Health checks.** Use `GET /health` for liveness/readiness probes.
- **Backups first.** Copy the data home before updates, reinstalls, or
  uninstalls. See [Backup, Restore & Updates](../free-jarvis/backup-restore.md).

## Local process

Run the API server directly on your machine for the simplest setup:

```bash
jarvis serve --host 127.0.0.1 --port 8000
curl http://localhost:8000/health
```

[:octicons-arrow-right-24: API server guide](api-server.md)

## Docker

The recommended container setup bundles the API server with an Ollama backend.
CPU and GPU (NVIDIA CUDA, AMD ROCm) variants are available. Map ports to
`127.0.0.1` and mount the data directory as a named volume.

[:octicons-arrow-right-24: Docker deployment](docker.md)

## systemd (Linux)

Run Free Jarvis as a managed system service on a Linux server.

[:octicons-arrow-right-24: systemd setup](systemd.md)

## launchd (macOS)

Register Free Jarvis as a launch agent on macOS.

[:octicons-arrow-right-24: launchd setup](launchd.md)

## Backup, restore, update, uninstall

Never delete your data directory as part of routine maintenance. Back up the
resolved data home, update in place with `jarvis self-update`, and use the
uninstaller only after you have a verified backup.

[:octicons-arrow-right-24: Backup, restore & updates](../free-jarvis/backup-restore.md)

---

Free Jarvis is based on OpenJarvis, an Apache-2.0 licensed research framework.
Copyright 2025 The OpenJarvis Authors. See
[Identity](../free-jarvis/identity.md) for the full attribution notice.
