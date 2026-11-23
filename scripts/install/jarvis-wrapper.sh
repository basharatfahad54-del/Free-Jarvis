#!/usr/bin/env bash
# jarvis-wrapper.sh — symlinked to ~/.local/bin/jarvis.
# Activates the managed venv and execs the real jarvis CLI.

# FREE_JARVIS_HOME is preferred; OPENJARVIS_HOME remains the legacy alias.
FREE_JARVIS_HOME="${FREE_JARVIS_HOME:-${OPENJARVIS_HOME:-$HOME/.openjarvis}}"
OPENJARVIS_HOME="$FREE_JARVIS_HOME"
VENV="$OPENJARVIS_HOME/.venv"

if [[ ! -d "$VENV" ]]; then
    echo "jarvis: venv not found at $VENV" >&2
    echo "Re-run the Free Jarvis installer: curl -fsSL https://raw.githubusercontent.com/<your-github-username>/free-jarvis/main/scripts/install/install.sh | bash" >&2
    exit 1
fi

exec "$VENV/bin/jarvis" "$@"
