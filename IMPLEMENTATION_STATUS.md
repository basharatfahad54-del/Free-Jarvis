# Free Jarvis — Implementation Status

**Status: transformation implemented; verification completed with documented environment caveats.**

This file records the checks that were actually run and their exact outcomes. It is the
companion to [`PROJECT_TRANSFORMATION.md`](PROJECT_TRANSFORMATION.md), which records what
was changed and why. No check is reported as passing unless it was executed locally.

Recorded: 2026-11-23 (Windows 11, Python 3.13, Node/Vite 5.1, Rust/Cargo, Docker Client 29.9.3)

---

## 1. Verification summary

| Area | Command | Result |
|---|---|---|
| Python — full suite | `.venv\Scripts\python.exe -m pytest -q --disable-warnings` | **149 failed, 9675 passed, 322 skipped** in 1821.55 s (30:21). See §2 for the failure breakdown. |
| Python — targeted after final edits | `pytest tests/cli/test_self_update.py … tests/deployment/test_desktop_release_publish.py -q` | **213 passed, 2 failed** in 40.66 s. Both failures are environmental (§2). |
| Python — new Free Jarvis tests | `pytest tests/core/test_free_jarvis.py tests/server/test_setup_hardware_route.py -q` | **19 passed** (6 warnings). |
| Python — config subset | `pytest tests/core/test_free_jarvis.py tests/server/test_setup_hardware_route.py tests/core/test_config.py::TestAgentConfigNew -q` | **22 passed, 1 skipped**. |
| Python — server routes | `pytest tests/server/test_setup_hardware_route.py tests/server/test_routes.py -q` | **80 passed**. |
| Lint | `.venv\Scripts\ruff.exe check --output-format concise src/openjarvis tests` | **All checks passed.** |
| Frontend — types | `cd frontend && npx tsc -b --pretty false` | **Passed** (exit 0). |
| Frontend — tests | `cd frontend && npm test -- --run` | **25 files / 126 tests passed** in 8.02 s. |
| Frontend — server assets | `cd frontend && npm run build` | **Passed**; regenerated `src/openjarvis/server/static` (PWA service worker included). |
| Frontend — desktop assets | `cd frontend && npm run build:tauri` | **Passed**; regenerated `frontend/dist`. |
| Rust / Tauri | `cd frontend/src-tauri && cargo check --locked` | **Passed** in 53.18 s (`openjarvis-desktop v1.0.1`). First attempt failed only because `frontend/dist` had not been built yet. |
| Docker Compose | `cd deploy/docker && docker compose -f docker-compose.yml config --quiet` | **Passed** (exit 0) with `OPENJARVIS_API_KEY` set to a validation placeholder. Without the required key, config validation correctly fails. |
| Package metadata | `importlib.metadata.distribution('free-jarvis')` | `Name=free-jarvis`, `Version=0.0.0+unknown`, `License=Apache-2.0`, console scripts `free-jarvis`, `jarvis`, `openjarvis-eval` → `openjarvis.cli:main`. |
| CLI smoke | `python -m openjarvis.cli --help`, `self-update --help` | Shows `Free Jarvis — your personal AI, on your device` and the correct upgrade help. |
| Setup wizard smoke | `FREE_JARVIS_HOME=… FREE_JARVIS_CONFIG=… python -m openjarvis.cli setup --non-interactive --skip-download` | Completed all 12 steps; wrote the custom config path and seeded local storage directories. |
| Docs nav | `mkdocs.yml` explicit `.md` nav targets | All targets exist (checked separately). `mkdocs build` was **not run** — mkdocs is not installed in this venv. |

---

## 2. Full-suite failure breakdown

The 149 failures in the full run were classified. **None were traced to the Free Jarvis
changes** except one test expectation, which was found and fixed afterwards (see §3).

| Category | Approx. count | Root cause | New? |
|---|---:|---|---|
| `openjarvis_rust` native extension missing | 91 | `ModuleNotFoundError` / `MemoryBackendUnavailable`; the extension is not built into this venv. Upstream requires `maturin develop -m rust/crates/openjarvis-python/Cargo.toml`. | No — environment |
| Windows-only POSIX APIs | ~30 | `os.setsid` missing; daemon identity tests expect `/proc`-style `start_ticks`/`boot_id`; subprocess sandbox and `chmod 700/600` tests assume POSIX. | No — platform |
| Live/external service tests | ~20 | Connectors (Oura, Strava, Spotify, Google Tasks, Obsidian), gemma.cpp weights, live smoke tests need credentials/models not present. | No — environment |
| Windows path/encoding in test harness | ~6 | `cp1252` decoding of a UTF-8 shell script; Rich wrapping of Windows short paths in `test_preset_lookup`; Windows bash environment variables in deployment script tests. | No — platform |
| Optional torch installed | 1 | `tools.storage.__init__` → `colbert_backend` → `torch` → `numpy`, so `test_importing_cli_does_not_import_numpy` fails. Traced with an import hook; chain is pre-existing and does not involve the new `setup` command. | No — environment |
| Deployment tests needing macOS/bash tooling | ~5 | Notarization preflight, Windows ARM staging, sdist rebuild. | No — platform |

The full run predates the §3 fix; the post-fix targeted run confirms the touched areas.

---

## 3. Regression found and fixed

`tests/deployment/test_desktop_release_publish.py::test_download_aliases_copy_the_verified_versioned_files`
asserted the old `OpenJarvis_*` stable-download aliases. The rebranded
`.github/workflows/desktop.yml` now emits `Free_Jarvis_*` names to match the Tauri
`productName`. The test expectation was updated to `Free_Jarvis_*` and the workflow YAML
was inspected directly to confirm it is well-formed. The test still fails on this Windows
machine at an earlier `mkdir` step because the harness passes a Windows-style path through
`bash -c` (`$RUNNER_TEMP` expands empty); that part is environmental, not a branding issue.

---

## 4. Checks deliberately not claimed

- `mkdocs build`, full `npm run tauri build` packaging, installer execution, live Ollama
  inference, live connector syncs and remote-access deployment were **not run**.
- Docker daemon was not running (`docker version` could not connect to the Linux engine);
  only Compose **config validation** was performed, which does not require the daemon.
- `uv sync --extra dev` could not complete earlier because a project `jarvis.exe` daemon
  held a file lock; that process was stopped and `uv pip install -e . --no-deps` restored
  correct `free-jarvis` metadata. Test dependencies were then reinstalled manually.
- No GitHub release, badge, screenshot or deployment URL was invented. Repository links use
  `https://github.com/<your-github-username>/free-jarvis` placeholders throughout.

---

## 5. Known limitations (carried forward)

1. Skills install/remove is an upstream file-based placeholder; the UI labels it honestly.
2. `FREE_JARVIS_WEB_HOST` is documented but not consumed by application code; services bind
   to `127.0.0.1` by default.
3. Hardware/model recommendations are best-effort and manually overridable.
4. `openjarvis.__version__` / installed distribution version is `0.0.0+unknown` because this
   checkout has no Git tags; a tagged release will produce a real version.
5. Some docs and design records intentionally retain upstream OpenJarvis URLs and
   Apache-2.0 copyright/attribution text.
