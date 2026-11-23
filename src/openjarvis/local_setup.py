"""Local-first setup recommendations for Free Jarvis.

The upstream ``recommend_engine``/``recommend_model`` helpers in
``openjarvis.core.config`` remain available because existing tests, CLIs and
deployments depend on their exact behaviour. This module adds the Free Jarvis
policy on top of them: Ollama is the recommended default runtime, Qwen models
are selected from the memory actually available on the machine, and no cloud
credentials are required.

Nothing in this module downloads software or contacts a paid service; it only
inspects local hardware and probes the local Ollama HTTP endpoint.
"""

from __future__ import annotations

import os
import platform
import socket
from dataclasses import dataclass
from urllib.parse import urlparse

from openjarvis.branding import PRODUCT_NAME
from openjarvis.core.config import HardwareInfo, detect_hardware

OLLAMA_DEFAULT_HOST = "http://localhost:11434"


@dataclass(frozen=True)
class LocalModelRecommendation:
    """A model suggestion with the reasoning shown to the user."""

    model: str
    tier: str
    reason: str


# Ordered smallest to largest. Model tags mirror the ones the installer and
# the upstream model tiers already use, so no new dependency is introduced.
MODEL_TIERS: tuple[tuple[int, str, str], ...] = (
    (8, "qwen3.5:2b", "CPU-only and 8 GB systems"),
    (16, "qwen3.5:4b", "16 GB systems or 4-6 GB GPUs"),
    (32, "qwen3.5:9b", "32 GB systems or 8-12 GB GPUs"),
    (64, "qwen3.5:27b", "64 GB+ systems or 16 GB+ GPUs"),
)

MODEL_RECOMMENDATIONS: dict[str, str] = {
    "cpu_only": "qwen3.5:2b",
    "ram_8gb": "qwen3.5:2b",
    "ram_16gb": "qwen3.5:4b",
    "ram_32gb": "qwen3.5:9b",
    "ram_64gb_plus": "qwen3.5:27b",
    "nvidia_gpu": "qwen3.5:9b (scale to 27b with 16 GB+ VRAM)",
    "amd_gpu": "qwen3.5:9b (scale to 27b with 16 GB+ VRAM)",
    "apple_silicon": "qwen3.5:9b (16 GB unified memory), 27b on 64 GB+",
}


def recommended_local_engine(hardware: HardwareInfo) -> str:
    """Return the Free Jarvis default engine.

    Ollama is always recommended first: it has the simplest local install on
    macOS, Linux, WSL2 and Windows, supports model hot-swapping, and needs no
    API key. Hardware-specific engines remain available as explicit options.
    """
    del hardware  # intentionally uniform; kept in signature for callers/tests
    return "ollama"


def available_memory_gb(hardware: HardwareInfo) -> float:
    """Estimate memory usable for a local model, preferring dedicated VRAM."""
    gpu = hardware.gpu
    if gpu is not None and gpu.vram_gb > 0:
        # Apple reports unified memory; leave headroom for the OS and UI.
        factor = 0.70 if gpu.vendor == "apple" else 0.90
        return round(gpu.vram_gb * max(gpu.count, 1) * factor, 1)
    if hardware.ram_gb > 0:
        return round(max(hardware.ram_gb - 4, 0) * 0.80, 1)
    return 0.0


def hardware_tier(hardware: HardwareInfo) -> str:
    """Human-readable hardware class used in setup and docs."""
    gpu = hardware.gpu
    if gpu is None:
        return "cpu_only"
    if gpu.vendor == "nvidia":
        return "nvidia_gpu"
    if gpu.vendor == "amd":
        return "amd_gpu"
    if gpu.vendor == "apple":
        return "apple_silicon"
    return "cpu_only"


def recommend_local_model(hardware: HardwareInfo) -> LocalModelRecommendation:
    """Pick a Qwen model that should fit in detected memory."""
    memory = available_memory_gb(hardware)
    tier = hardware_tier(hardware)
    if memory <= 0:
        return LocalModelRecommendation(
            model="",
            tier=tier,
            reason="Could not determine available memory; choose a model manually.",
        )
    for threshold, model, label in MODEL_TIERS:
        if memory < threshold:
            return LocalModelRecommendation(
                model=model,
                tier=tier,
                reason=(
                    f"About {memory:g} GB usable memory detected "
                    f"({label}); {model} is the safest local fit."
                ),
            )
    model = MODEL_TIERS[-1][1]
    return LocalModelRecommendation(
        model=model,
        tier=tier,
        reason=f"About {memory:g} GB usable memory detected; {model} should fit.",
    )


def ollama_host() -> str:
    """Resolve the Ollama host the same way the engine does."""
    configured = os.environ.get("OLLAMA_HOST", "").strip()
    return configured or OLLAMA_DEFAULT_HOST


def ollama_is_running(host: str | None = None) -> bool:
    """Probe the local Ollama endpoint without importing the engine stack."""
    target = (host or ollama_host()).rstrip("/")
    parsed = urlparse(target)
    hostname = parsed.hostname or "localhost"
    port = parsed.port or (443 if parsed.scheme == "https" else 11434)
    try:
        with socket.create_connection((hostname, port), timeout=1.0):
            return True
    except OSError:
        return False


def ollama_install_hint(hardware: HardwareInfo | None = None) -> str:
    """Platform-specific, free installation instructions."""
    system = (hardware.platform if hardware else platform.system()).lower()
    if system == "darwin":
        return (
            "Install Ollama: download the macOS app from https://ollama.com/download "
            "or run `brew install ollama`, then start it and leave it running."
        )
    if system == "windows":
        return (
            "Install Ollama from https://ollama.com/download, then run "
            "`ollama serve` (or let the desktop app start automatically). "
            "WSL2 users can use the Linux command below inside WSL."
        )
    return (
        "Install Ollama: `curl -fsSL https://ollama.com/install.sh | sh`, "
        "then start it with `ollama serve` (or enable its systemd service)."
    )


def setup_plan(hardware: HardwareInfo | None = None) -> dict[str, object]:
    """Build the payload consumed by the setup wizard and the HTTP endpoint."""
    hw = hardware or detect_hardware()
    model = recommend_local_model(hw)
    return {
        "product": PRODUCT_NAME,
        "platform": hw.platform,
        "cpu": hw.cpu_brand,
        "cpu_count": hw.cpu_count,
        "ram_gb": hw.ram_gb,
        "gpu": (
            {
                "vendor": hw.gpu.vendor,
                "name": hw.gpu.name,
                "vram_gb": hw.gpu.vram_gb,
                "count": hw.gpu.count,
            }
            if hw.gpu is not None
            else None
        ),
        "hardware_tier": model.tier,
        "usable_memory_gb": available_memory_gb(hw),
        "recommended_engine": recommended_local_engine(hw),
        "recommended_model": model.model,
        "recommendation_reason": model.reason,
        "ollama_host": ollama_host(),
        "ollama_running": ollama_is_running(),
        "ollama_install_hint": ollama_install_hint(hw),
        "cloud_keys_required": False,
    }
