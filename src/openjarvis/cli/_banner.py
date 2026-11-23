"""Startup banner — Free Jarvis wordmark + tagline."""

from __future__ import annotations

from openjarvis.branding import PRODUCT_NAME, TAGLINE

_WORDMARK = (
    "+----------------------------------------------+",
    "|              F R E E   J A R V I S           |",
    "+----------------------------------------------+",
)


def print_banner(quiet: bool = False) -> None:
    """Print the Free Jarvis startup banner. No-op when quiet."""
    if quiet:
        return
    try:
        from rich.console import Console

        console = Console()
        for line in _WORDMARK:
            console.print(line, style="bold bright_cyan", highlight=False, markup=False)
        console.print(f"      {TAGLINE}", style="cyan", highlight=False, markup=False)
        console.print()
    except ImportError:
        for line in _WORDMARK:
            print(line)
        print(f"      {TAGLINE}")
        print()


__all__ = ["PRODUCT_NAME", "print_banner"]
