"""Tests for the Free Jarvis local-first identity, config aliases and setup policy."""

from __future__ import annotations

from pathlib import Path

import pytest

from openjarvis import branding
from openjarvis.core.config import GpuInfo, HardwareInfo, load_config
from openjarvis.core.paths import get_config_dir
from openjarvis.local_setup import (
    MODEL_RECOMMENDATIONS,
    available_memory_gb,
    ollama_host,
    ollama_install_hint,
    recommend_local_model,
    recommended_local_engine,
    setup_plan,
)


class TestBranding:
    def test_display_identity(self) -> None:
        assert branding.PRODUCT_NAME == "Free Jarvis"
        assert branding.REPOSITORY_NAME == "free-jarvis"
        assert branding.TAGLINE == "Your Personal AI. Your Device. Your Rules."
        assert branding.DEFAULT_PERSONA_NAME == "JARVIS"

    def test_upstream_attribution_preserved(self) -> None:
        assert "OpenJarvis" in branding.UPSTREAM_NOTICE
        assert "Apache-2.0" in branding.UPSTREAM_NOTICE

    def test_default_persona_identity(self) -> None:
        prompt = load_config().agent.default_system_prompt
        assert "JARVIS" in prompt
        assert "Free Jarvis" in prompt
        assert "not Claude" in prompt


class TestConfigAliases:
    def test_free_jarvis_home_takes_precedence(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        free_home = tmp_path / "free-home"
        legacy_home = tmp_path / "legacy-home"
        monkeypatch.setenv("FREE_JARVIS_HOME", str(free_home))
        monkeypatch.setenv("OPENJARVIS_HOME", str(legacy_home))
        monkeypatch.delenv("XDG_DATA_HOME", raising=False)
        assert get_config_dir() == free_home

    def test_legacy_home_still_honored(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        legacy_home = tmp_path / "legacy-home"
        monkeypatch.delenv("FREE_JARVIS_HOME", raising=False)
        monkeypatch.setenv("OPENJARVIS_HOME", str(legacy_home))
        monkeypatch.delenv("XDG_DATA_HOME", raising=False)
        assert get_config_dir() == legacy_home

    def test_free_jarvis_config_takes_precedence(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        preferred = tmp_path / "preferred.toml"
        legacy = tmp_path / "legacy.toml"
        monkeypatch.setenv("FREE_JARVIS_CONFIG", str(preferred))
        monkeypatch.setenv("OPENJARVIS_CONFIG", str(legacy))
        assert load_config()._config_path == preferred
        assert load_config(path=preferred)._config_path == preferred

    def test_legacy_config_still_honored(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        legacy = tmp_path / "legacy.toml"
        monkeypatch.delenv("FREE_JARVIS_CONFIG", raising=False)
        monkeypatch.setenv("OPENJARVIS_CONFIG", str(legacy))
        assert load_config()._config_path == legacy


class TestLocalSetupPolicy:
    @pytest.mark.parametrize(
        ("ram", "expected"),
        [
            (8.0, "qwen3.5:2b"),
            (16.0, "qwen3.5:4b"),
            (32.0, "qwen3.5:9b"),
            (64.0, "qwen3.5:27b"),
        ],
    )
    def test_ram_tiers(self, ram: float, expected: str) -> None:
        hw = HardwareInfo(platform="linux", ram_gb=ram, gpu=None)
        assert recommend_local_model(hw).model == expected

    def test_gpu_vendor_tiers(self) -> None:
        for vendor in ("nvidia", "amd", "apple"):
            hw = HardwareInfo(
                platform="linux",
                ram_gb=32.0,
                gpu=GpuInfo(vendor=vendor, name=f"{vendor} gpu", vram_gb=16.0, count=1),
            )
            assert recommend_local_model(hw).tier == {
                "nvidia": "nvidia_gpu",
                "amd": "amd_gpu",
                "apple": "apple_silicon",
            }[vendor]

    def test_ollama_always_recommended(self) -> None:
        hw = HardwareInfo(platform="linux", ram_gb=8.0, gpu=None)
        assert recommended_local_engine(hw) == "ollama"

    def test_memory_estimate_prefers_vram(self) -> None:
        cpu_only = HardwareInfo(platform="linux", ram_gb=16.0, gpu=None)
        with_gpu = HardwareInfo(
            platform="linux",
            ram_gb=16.0,
            gpu=GpuInfo(vendor="nvidia", name="RTX", vram_gb=8.0, count=1),
        )
        # Dedicated VRAM is the hard constraint for GPU inference; RAM is used
        # only when no GPU is present.
        assert available_memory_gb(with_gpu) == 7.2
        assert available_memory_gb(cpu_only) == 9.6

    def test_install_hints_are_platform_specific(self) -> None:
        assert "ollama.com/download" in ollama_install_hint(
            HardwareInfo(platform="windows", ram_gb=16.0, gpu=None)
        )
        assert "brew" in ollama_install_hint(
            HardwareInfo(platform="darwin", ram_gb=16.0, gpu=None)
        )
        assert "install.sh" in ollama_install_hint(
            HardwareInfo(platform="linux", ram_gb=16.0, gpu=None)
        )

    def test_setup_plan_has_no_cloud_requirement(self) -> None:
        hw = HardwareInfo(platform="linux", ram_gb=16.0, gpu=None)
        plan = setup_plan(hw)
        assert plan["product"] == "Free Jarvis"
        assert plan["recommended_engine"] == "ollama"
        assert plan["recommended_model"] == "qwen3.5:4b"
        assert plan["cloud_keys_required"] is False
        assert "ollama_install_hint" in plan

    def test_ollama_host_default_and_override(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("OLLAMA_HOST", raising=False)
        assert ollama_host() == "http://localhost:11434"
        monkeypatch.setenv("OLLAMA_HOST", "http://127.0.0.1:12345")
        assert ollama_host() == "http://127.0.0.1:12345"

    def test_hardware_tier_table_is_documented(self) -> None:
        for key in (
            "cpu_only",
            "ram_8gb",
            "ram_16gb",
            "ram_32gb",
            "ram_64gb_plus",
            "nvidia_gpu",
            "amd_gpu",
            "apple_silicon",
        ):
            assert key in MODEL_RECOMMENDATIONS
