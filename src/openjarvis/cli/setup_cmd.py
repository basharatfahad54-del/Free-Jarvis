"""Resumable first-run setup wizard for Free Jarvis.

The wizard deliberately never asks for cloud credentials. It detects local
hardware, recommends an Ollama model that fits, records progress in the Free
Jarvis data directory, and can be re-run safely to finish skipped steps.
"""

from __future__ import annotations

import json
import platform
import secrets
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import click

from openjarvis import branding
from openjarvis.cli._banner import print_banner
from openjarvis.core.paths import (
    get_cache_dir,
    get_config_dir,
    get_config_file_path,
)

_STEPS = (
    "welcome",
    "hardware",
    "dependencies",
    "ollama",
    "model",
    "download",
    "engine",
    "storage",
    "voice",
    "integrations",
    "security",
    "finish",
)


def _state_path() -> Path:
    return get_config_dir() / "setup-state.json"


def _load_state() -> dict[str, Any]:
    path = _state_path()
    if not path.exists():
        return {"version": 1, "completed": [], "choices": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"version": 1, "completed": [], "choices": {}}
    if not isinstance(data, dict):
        return {"version": 1, "completed": [], "choices": {}}
    data.setdefault("version", 1)
    data.setdefault("completed", [])
    data.setdefault("choices", {})
    return data


def _save_state(state: dict[str, Any]) -> None:
    path = _state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(state, indent=2, sort_keys=True) + "\n"
    path.write_text(payload, encoding="utf-8")


def _heading(text: str) -> None:
    click.echo()
    click.echo(click.style(text, fg="cyan", bold=True))
    click.echo("-" * len(text))


def _step(name: str, state: dict[str, Any], non_interactive: bool) -> bool:
    """Return True when the step should run, False when already complete."""
    if name in state["completed"]:
        click.echo(f"  [done] {name}")
        return False
    if non_interactive:
        click.echo(f"  [auto] {name}")
    return True


def _complete(name: str, state: dict[str, Any]) -> None:
    if name not in state["completed"]:
        state["completed"].append(name)
    _save_state(state)


def _backup_config(path: Path) -> Path | None:
    """Back up an existing config before any setup write."""
    if not path.exists():
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = path.with_name(f"config.toml.before-free-jarvis-{stamp}")
    shutil.copy2(path, backup)
    return backup


@click.command("setup")
@click.option(
    "--non-interactive", is_flag=True, help="Accept all local-first defaults."
)
@click.option("--skip-download", is_flag=True, help="Do not download a model now.")
@click.option("--engine", default=None, help="Override the recommended local engine.")
@click.option("--model", default=None, help="Override the recommended local model.")
@click.option(
    "--reset", is_flag=True, help="Forget stored wizard progress and start over."
)
@click.option(
    "--open", "open_dashboard", is_flag=True, help="Launch the browser UI at the end."
)
def setup_cmd(
    non_interactive: bool,
    skip_download: bool,
    engine: str | None,
    model: str | None,
    reset: bool,
    open_dashboard: bool,
) -> None:
    """Run the Free Jarvis first-run setup wizard.

    Progress is stored in the local data directory. Re-run ``jarvis setup`` to
    resume; cloud API keys are never required.
    """
    from openjarvis.local_setup import setup_plan

    print_banner()
    click.echo(f"Welcome to {branding.PRODUCT_NAME} — {branding.TAGLINE}")
    click.echo("Everything below is local by default. No paid account is needed.")

    state = _load_state()
    if reset:
        state = {"version": 1, "completed": [], "choices": {}}
        _save_state(state)
        click.echo("Stored setup progress cleared.")

    plan = setup_plan()
    choices = state["choices"]

    if _step("hardware", state, non_interactive):
        _heading("1. Hardware detection")
        click.echo(f"  OS:        {platform.platform()}")
        click.echo(f"  CPU:       {plan['cpu']} ({plan['cpu_count']} cores)")
        click.echo(f"  RAM:       {plan['ram_gb']} GB")
        click.echo(f"  GPU:       {plan.get('gpu') or 'none detected'}")
        click.echo(f"  Usable:    ~{plan['usable_memory_gb']} GB for local inference")
        _complete("hardware", state)

    if _step("dependencies", state, non_interactive):
        _heading("2. Dependency check")
        click.echo(f"  Python:    {sys.version.split()[0]} (3.11-3.13 supported)")
        node = shutil.which("node") or "not found (needed for jarvis gui)"
        click.echo(f"  Node.js:   {node}")
        click.echo(f"  Ollama:    {shutil.which('ollama') or 'not found on PATH'}")
        _complete("dependencies", state)

    if _step("ollama", state, non_interactive):
        _heading("3. Local model runtime")
        if plan["ollama_running"]:
            click.echo(f"  Ollama is reachable at {plan['ollama_host']}")
        else:
            click.echo(f"  Ollama is not running at {plan['ollama_host']}")
            click.echo(f"  {plan['ollama_install_hint']}")
            if not non_interactive and not click.confirm(
                "Continue anyway?", default=True
            ):
                raise SystemExit(0)
        _complete("ollama", state)

    selected_engine = engine or choices.get("engine") or str(plan["recommended_engine"])
    selected_model = model or choices.get("model") or str(plan["recommended_model"])

    if _step("model", state, non_interactive):
        _heading("4. Model recommendation")
        click.echo(f"  Engine:    {selected_engine}")
        click.echo(f"  Model:     {selected_model or '(none)'}")
        click.echo(f"  Why:       {plan['recommendation_reason']}")
        if not non_interactive and not model:
            answer = click.prompt(
                "  Model to use", default=selected_model or "qwen3.5:2b"
            )
            selected_model = answer.strip() or selected_model
        if not selected_model:
            click.echo("  No model could be recommended; select one with --model.")
            raise SystemExit(1)
        choices["engine"] = selected_engine
        choices["model"] = selected_model
        _complete("model", state)

    if _step("download", state, non_interactive) and not skip_download:
        _heading("5. Model download (local, free)")
        if not plan["ollama_running"] or shutil.which("ollama") is None:
            click.echo("  Skipped: Ollama is not available yet.")
        else:
            click.echo(f"  Running: ollama pull {selected_model}")
            result = subprocess.run(["ollama", "pull", selected_model], check=False)
            if result.returncode != 0:
                click.echo("  Download failed. Re-run `jarvis setup` to retry.")
                _save_state(state)
                raise SystemExit(result.returncode)
            click.echo("  Model ready.")
        _complete("download", state)

    if _step("engine", state, non_interactive):
        _heading("6. Engine configuration")
        from openjarvis.core.config import detect_hardware

        config_path = get_config_file_path()
        if config_path.exists():
            backup = _backup_config(config_path)
            click.echo(f"  Existing config backed up to {backup}")
            confirm = not non_interactive and not click.confirm(
                "Replace it with local-first defaults?", default=False
            )
            if confirm:
                click.echo("  Kept existing config.")
                _complete("engine", state)
            else:
                _write_local_config(
                    config_path, detect_hardware(), selected_engine, selected_model
                )
                _complete("engine", state)
        else:
            _write_local_config(
                config_path, detect_hardware(), selected_engine, selected_model
            )
            _complete("engine", state)

    if _step("storage", state, non_interactive):
        _heading("7. Local memory and storage")
        home = get_config_dir()
        home.mkdir(parents=True, exist_ok=True)
        cache = get_cache_dir()
        cache.mkdir(parents=True, exist_ok=True)
        click.echo(f"  Data:  {home} (persistent, outside the source tree)")
        click.echo(f"  Cache: {cache}")
        click.echo("  Conversation and memory databases are created on first use.")
        _complete("storage", state)

    if _step("voice", state, non_interactive):
        _heading("8. Voice (optional)")
        click.echo("  Browser speech uses Web Speech API; no cloud key required.")
        click.echo("  Server STT/TTS providers are opt-in under [speech].")
        _complete("voice", state)

    if _step("integrations", state, non_interactive):
        _heading("9. Integrations (optional)")
        try:
            from openjarvis.core.registry import ConnectorRegistry

            connectors = sorted(ConnectorRegistry.keys())
        except Exception:
            connectors = []
        names = ", ".join(connectors) or "none registered"
        click.echo(f"  Available connectors: {names}")
        click.echo("  Configure later with `jarvis connect <name>`. Skipping is safe.")
        _complete("integrations", state)

    if _step("security", state, non_interactive):
        _heading("10. Security and permissions")
        click.echo("  Server binds to 127.0.0.1 by default; remote access stays off.")
        if non_interactive:
            click.echo("  No API key generated. Remote access requires one.")
        elif click.confirm(
            "Generate a local API key for optional remote access?", default=False
        ):
            key = secrets.token_hex(32)
            key_file = get_config_dir() / "api-key.txt"
            key_file.write_text(key + "\n", encoding="utf-8")
            try:
                key_file.chmod(0o600)
            except OSError:
                click.echo("  Warning: could not restrict file permissions.")
            click.echo(f"  Key saved to {key_file} (never commit it).")
            click.echo("  Export it with:")
            click.echo(f"    export OPENJARVIS_API_KEY=$(cat '{key_file}')")
        else:
            click.echo("  Kept local-only defaults.")
        _complete("security", state)

    _finish_if_requested(state, open_dashboard)


def _write_local_config(config_path, hardware, engine, model) -> None:
    """Write local-first defaults using the upstream config writer."""
    from openjarvis.cli._bootstrap import write_initial_config

    write_initial_config(
        hardware=hardware, engine=engine, model=model, path=config_path
    )
    click.echo(f"  Wrote {config_path}")


def _finish_if_requested(state: dict[str, Any], open_dashboard: bool) -> None:
    if "finish" in state["completed"] and not open_dashboard:
        return
    _heading("11. Ready")
    click.echo(f"  {branding.PRODUCT_NAME} is configured for local use.")
    click.echo("  Start chatting:     jarvis")
    click.echo("  Open browser UI:    jarvis gui")
    click.echo("  Verify install:     jarvis doctor")
    click.echo("  Resume setup:       jarvis setup")
    if open_dashboard:
        click.launch("http://127.0.0.1:8000/")
    _complete("finish", state)


__all__ = ["setup_cmd"]
