# Docker deployment

Free Jarvis provides Docker images for CPU-only and GPU-accelerated deployments,
plus a Docker Compose configuration that bundles the API server with an Ollama
inference backend. Container images use the `free-jarvis` name; the `jarvis`
CLI and the `openjarvis` Python package inside them are unchanged.

## Localhost by default

Docker containers must listen on `0.0.0.0` *inside* the container so Docker can
route to them, but you should **publish ports only on the host loopback
interface**. Every `-p` / `ports:` entry below uses `127.0.0.1`, so neither the
API nor Ollama is reachable from your LAN.

Because the server binds a non-loopback address internally, an **API key is
required**. Keep it in `.env`, never in source control.

```bash
cd deploy/docker
cp .env.example .env
export OPENJARVIS_API_KEY="$(openssl rand -hex 32)"
```

`docker compose` reads `OPENJARVIS_API_KEY` from `.env` (or your shell
environment) and fails fast if it is unset. Clients must then send
`Authorization: Bearer <key>` on `/v1/*` and `/api/*` requests. Keep this key
available in your shell, or save its value in `.env` for later Compose
invocations. The example uses OpenSSL to generate a random key.

Then start both the API server and an Ollama backend with Docker Compose:

```bash
docker compose up -d
```

This brings up two services:

| Service  | Host port | Description                  |
|----------|-----------|------------------------------|
| `jarvis` | 8000      | Free Jarvis API server       |
| `ollama` | 11434     | Ollama inference engine      |

Verify the server with its health check:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status": "ok"}
```

!!! warning "Remote access"
    Publishing to `0.0.0.0` on the host exposes your assistant. If you must do
    it, require the API key on every request and put a TLS-terminating reverse
    proxy in front. Never send the key over plain HTTP. See
    [API server](api-server.md#running-behind-a-reverse-proxy) and
    [Security](../user-guide/security.md).

## Docker images

### CPU-only image (`Dockerfile`)

The default `Dockerfile` uses a multi-stage build based on `python:3.12-slim` to produce a minimal image.

**Build stages:**

1. **Builder stage** -- installs `uv` and the `openjarvis[server]` package (which includes FastAPI, uvicorn, and all server dependencies) from the project source.
2. **Runtime stage** -- copies only the installed Python packages and application code from the builder, keeping the final image small.

```dockerfile
FROM python:3.12-slim AS builder

WORKDIR /app
COPY pyproject.toml README.md ./
COPY src/ src/

RUN pip install --no-cache-dir uv && \
    uv pip install --system ".[server]"

FROM python:3.12-slim

COPY --from=builder /usr/local /usr/local
COPY --from=builder /app /app
WORKDIR /app

EXPOSE 8000

ENTRYPOINT ["jarvis"]
CMD ["serve", "--host", "0.0.0.0", "--port", "8000"]
```

Build it manually from the repository root:

```bash
docker build -f deploy/docker/Dockerfile -t free-jarvis:latest .
```

Run it standalone, publishing only to loopback, with a persistent data volume
and an API key:

```bash
export OPENJARVIS_API_KEY="$(openssl rand -hex 32)"
docker run -d --name free-jarvis \
  -e OPENJARVIS_API_KEY \
  -v free-jarvis-data:/root/.openjarvis \
  -p 127.0.0.1:8000:8000 \
  free-jarvis:latest
```

### Running the built image with a host Ollama server

Use the `free-jarvis:latest` image built above. Ollama must already be running
on the host with a model installed and listening on an address reachable from
containers. On Linux, its default loopback-only binding is not reachable via
the Docker host gateway; configure its binding using the
[Ollama server instructions](https://docs.ollama.com/faq#how-do-i-configure-ollama-server)
and restrict access to trusted container traffic.

Set an API key, persist data, and map each container to a different loopback host port:

```bash
export OPENJARVIS_API_KEY="$(openssl rand -hex 32)"

docker run -d --name free-jarvis-8001 \
  -e OPENJARVIS_API_KEY \
  -e OLLAMA_HOST=http://host.docker.internal:11434 \
  -v free-jarvis-data-8001:/root/.openjarvis \
  -p 127.0.0.1:8001:8000 \
  --add-host host.docker.internal:host-gateway \
  free-jarvis:latest serve --engine ollama --host 0.0.0.0 --port 8000

docker run -d --name free-jarvis-8003 \
  -e OPENJARVIS_API_KEY \
  -e OLLAMA_HOST=http://host.docker.internal:11434 \
  -v free-jarvis-data-8003:/root/.openjarvis \
  -p 127.0.0.1:8003:8000 \
  --add-host host.docker.internal:host-gateway \
  free-jarvis:latest serve --engine ollama --host 0.0.0.0 --port 8000
```

The APIs are available at `http://localhost:8001` and
`http://localhost:8003`. Keep the API key out of source control; the commands
read it from the shell environment.

### GPU image (`Dockerfile.gpu`)

The GPU image is built on `nvidia/cuda:12.4.0-runtime-ubuntu22.04` and includes the CUDA 12.4 runtime libraries, enabling GPU-accelerated inference when paired with a GPU-capable engine like vLLM or SGLang.

```dockerfile
FROM nvidia/cuda:12.4.0-runtime-ubuntu22.04 AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml README.md ./
COPY src/ src/

RUN pip install --no-cache-dir uv && \
    uv pip install --system ".[server]"

FROM nvidia/cuda:12.4.0-runtime-ubuntu22.04

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local /usr/local
COPY --from=builder /app /app
WORKDIR /app

EXPOSE 8000

ENTRYPOINT ["jarvis"]
CMD ["serve", "--host", "0.0.0.0", "--port", "8000"]
```

Build the GPU image:

```bash
docker build -f Dockerfile.gpu -t free-jarvis:gpu .
```

Run with GPU access (requires the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)),
still publishing to loopback only and persisting data:

```bash
export OPENJARVIS_API_KEY="$(openssl rand -hex 32)"
docker run -d --gpus all --name free-jarvis-gpu \
  -e OPENJARVIS_API_KEY \
  -v free-jarvis-data:/root/.openjarvis \
  -p 127.0.0.1:8000:8000 \
  free-jarvis:gpu
```

!!! note "NVIDIA Container Toolkit required"
    The host machine must have the NVIDIA Container Toolkit installed for `--gpus` to work. See the [NVIDIA installation guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) for setup instructions.

## Docker Compose configuration

The `docker-compose.yml` defines a complete deployment with the Free Jarvis API
server and an Ollama backend. Ports are published on loopback, the data
directory is a named volume, and a health check guards the API service:

```yaml
version: "3.9"

services:
  jarvis:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "127.0.0.1:8000:8000"
    environment:
      - OPENJARVIS_API_KEY=${OPENJARVIS_API_KEY:?set a key in .env}
      - OPENJARVIS_ENGINE_DEFAULT=ollama
      - OPENJARVIS_OLLAMA_HOST=http://ollama:11434
    volumes:
      - free-jarvis-data:/root/.openjarvis
    depends_on:
      - ollama
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    restart: unless-stopped

  ollama:
    image: ollama/ollama
    ports:
      - "127.0.0.1:11434:11434"
    volumes:
      - ollama-models:/root/.ollama
    restart: unless-stopped

volumes:
  ollama-models:
  free-jarvis-data:
```

### Environment variables

The `jarvis` service is configured through environment variables:

| Variable                      | Description                                             | Default                    |
|-------------------------------|---------------------------------------------------------|----------------------------|
| `OPENJARVIS_API_KEY`          | Required for the internal non-loopback bind; legacy name remains supported | — |
| `FREE_JARVIS_HOME`            | Preferred root inside the container                     | `/root/.openjarvis`        |
| `OPENJARVIS_HOME`             | Legacy alias for the root                               | —                          |
| `OPENJARVIS_ENGINE_DEFAULT`   | Inference engine backend to use (legacy name)           | `ollama`                   |
| `OPENJARVIS_OLLAMA_HOST`      | URL of the Ollama server (uses Docker service name)     | `http://ollama:11434`      |
| `OLLAMA_HOST`                 | Standard Ollama host override                           | `http://localhost:11434`   |

The `OPENJARVIS_*` names are preserved for backwards compatibility. Prefer
`FREE_JARVIS_HOME` for new deployments.

### Volumes and persistence

- `ollama-models` persists downloaded models across container restarts.
- `free-jarvis-data` persists the whole resolved data home: `config.toml`,
  `memory.db`, `telemetry.db`, `traces.db`, skills, and credentials.

Never run the API container without a data volume unless you are deliberately
testing with throwaway data. `docker compose down` without `-v` keeps named
volumes; `docker compose down -v` deletes them.

### Service dependencies

The `jarvis` service declares `depends_on: ollama`, ensuring the Ollama container starts before the API server. Both services use `restart: unless-stopped` to automatically recover from crashes.

## Custom configuration

### Mounting a configuration file

To use a custom `config.toml`, mount it into the container at the expected path
(`<data home>/config.toml`, which is `/root/.openjarvis/config.toml` in the container):

```yaml
services:
  jarvis:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "127.0.0.1:8000:8000"
    volumes:
      - ./my-config.toml:/root/.openjarvis/config.toml:ro
      - free-jarvis-data:/root/.openjarvis
    environment:
      - OPENJARVIS_API_KEY=${OPENJARVIS_API_KEY:?set a key in .env}
      - OPENJARVIS_ENGINE_DEFAULT=ollama
      - OPENJARVIS_OLLAMA_HOST=http://ollama:11434
    depends_on:
      - ollama
    restart: unless-stopped
```

### Persisting data

To persist telemetry data, memory databases, and trace records across container restarts, mount the entire Free Jarvis data directory (as in the Compose example above):

```yaml
services:
  jarvis:
    # ... other config ...
    volumes:
      - free-jarvis-data:/root/.openjarvis

volumes:
  ollama-models:
  free-jarvis-data:
```

This preserves:

- `telemetry.db` -- inference call telemetry records
- `memory.db` -- the default SQLite memory backend
- `traces.db` -- interaction trace records
- `config.toml` -- user configuration
- skills, recipes, credentials, and setup progress (`setup-state.json`)

### Using the GPU image with Compose

To use the GPU Dockerfile in your Compose setup, change the `dockerfile` field and add GPU resource reservations:

```yaml
services:
  jarvis:
    build:
      context: .
      dockerfile: Dockerfile.gpu
    ports:
      - "127.0.0.1:8000:8000"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    environment:
      - OPENJARVIS_API_KEY=${OPENJARVIS_API_KEY:?set a key in .env}
      - OPENJARVIS_ENGINE_DEFAULT=ollama
      - OPENJARVIS_OLLAMA_HOST=http://ollama:11434
    volumes:
      - free-jarvis-data:/root/.openjarvis
    depends_on:
      - ollama
    restart: unless-stopped
```

## Health checks

The API server exposes a `GET /health` endpoint that checks whether the underlying inference engine is responsive:

```bash
curl http://localhost:8000/health
```

A healthy response returns HTTP 200:

```json
{"status": "ok"}
```

An unhealthy engine returns HTTP 503:

```json
{"detail": "Engine unhealthy"}
```

Wire this into Compose (already present in the example above):

```yaml
services:
  jarvis:
    # ... other config ...
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
```

## Backup, restore, update, and uninstall

Back up the named data volume before rebuilding or replacing containers. The
volume is your data; the image is disposable.

```bash
# Backup: copy the data home out of the container
docker run --rm -v free-jarvis-data:/data -v "$PWD:/backup" alpine \
  tar czf /backup/free-jarvis-data.tgz -C /data .

# Restore into a fresh volume
docker run --rm -v free-jarvis-data:/data -v "$PWD:/backup" alpine \
  tar xzf /backup/free-jarvis-data.tgz -C /data
```

To update, rebuild the image and recreate the container while keeping the
volume (`docker compose up -d --build`). Inside a non-container install,
`jarvis self-update` updates in place. To uninstall, stop and remove the
containers and images only after you have a verified backup:

```bash
docker compose down           # keep named volumes
docker compose down -v        # DELETES named volumes — only with a backup
```

Never delete the data volume to "fix" a startup problem; restore from backup
instead. See [Backup, Restore & Updates](../free-jarvis/backup-restore.md).

## Building custom images

### Adding extra dependencies

To include additional engine backends (such as vLLM or ColBERT memory), modify the install command in the Dockerfile:

```dockerfile
RUN pip install --no-cache-dir uv && \
    uv pip install --system ".[server,inference-vllm,memory-colbert]"
```

### Overriding the default command

The entrypoint is `jarvis` and the default command is `serve --host 0.0.0.0 --port 8000`. Override the command to change options while still publishing only to loopback on the host:

```bash
docker run -d -p 127.0.0.1:9000:9000 -e OPENJARVIS_API_KEY \
  -v free-jarvis-data:/root/.openjarvis \
  free-jarvis:latest \
  serve --host 0.0.0.0 --port 9000 --engine ollama --model qwen3.5:9b
```

Or in Docker Compose:

```yaml
services:
  jarvis:
    build: .
    command: ["serve", "--host", "0.0.0.0", "--port", "9000", "--model", "qwen3.5:9b"]
    ports:
      - "127.0.0.1:9000:9000"
```

### Available CLI options for `jarvis serve`

| Option               | Description                                         |
|----------------------|-----------------------------------------------------|
| `--host`             | Container bind address; keep host port mapping on `127.0.0.1` |
| `--port`             | Port number (default: 8000)                         |
| `-e` / `--engine`    | Engine backend (`ollama`, `vllm`, `llamacpp`, `sglang`)  |
| `-m` / `--model`     | Default model name                                   |
| `-a` / `--agent`     | Agent for non-streaming requests (`simple`, `orchestrator`, `react`, `openhands`) |

## Pulling models

After starting the Ollama container, you need to pull at least one model before the API server can serve requests:

```bash
docker compose exec ollama ollama pull qwen3.5:2b
```

Verify models are available through the API:

```bash
curl http://localhost:8000/v1/models
```

---

Free Jarvis is based on OpenJarvis, an Apache-2.0 licensed research framework.
Copyright 2025 The OpenJarvis Authors. See
[Identity](../free-jarvis/identity.md) for the full attribution notice.
