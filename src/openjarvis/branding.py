"""Product identity for Free Jarvis.

This module is the single source of truth for user-visible product strings.
Internal identifiers (the ``openjarvis`` Python package, the ``jarvis`` CLI
command, ``OPENJARVIS_*`` environment variables, database filenames and import
paths) are deliberately left unchanged for backwards compatibility — see
``docs/free-jarvis/migration.md``.

Free Jarvis is a downstream, local-first distribution of the upstream
OpenJarvis research framework. The upstream Apache-2.0 copyright and research
attribution are preserved in ``LICENSE`` and the documentation.
"""

from __future__ import annotations

PRODUCT_NAME = "Free Jarvis"
REPOSITORY_NAME = "free-jarvis"
DOCS_TITLE = "Free Jarvis Documentation"
TAGLINE = "Your Personal AI. Your Device. Your Rules."
SHORT_DESCRIPTION = "Local-first personal AI assistant"
LEGACY_PRODUCT_NAME = "OpenJarvis"
DEFAULT_PERSONA_NAME = "JARVIS"

# Environment variables. The FREE_JARVIS_* names are preferred; the
# OPENJARVIS_* names remain supported for existing installations.
HOME_ENV = "FREE_JARVIS_HOME"
LEGACY_HOME_ENV = "OPENJARVIS_HOME"
CONFIG_ENV = "FREE_JARVIS_CONFIG"
LEGACY_CONFIG_ENV = "OPENJARVIS_CONFIG"

UPSTREAM_NOTICE = (
    "Free Jarvis is based on OpenJarvis, an Apache-2.0 licensed research "
    "framework. Copyright 2025 The OpenJarvis Authors. Free Jarvis adds "
    "local-first defaults, product branding, setup tooling, and interface "
    "changes; it does not claim authorship of the upstream implementation."
)


def product_label(*, include_legacy: bool = False) -> str:
    """Return the display name, optionally with the upstream name in brackets."""
    if include_legacy:
        return f"{PRODUCT_NAME} (based on {LEGACY_PRODUCT_NAME})"
    return PRODUCT_NAME
