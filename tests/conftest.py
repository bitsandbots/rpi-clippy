"""
Shared pytest fixtures for rpi-clippy tests.

Isolation strategy:
  - XDG_CONFIG_HOME is redirected to a per-test tmp_path so all managers
    write to a throwaway directory instead of ~/.config/Clippy.
  - All module-level singletons are reset to None before each test via
    monkeypatch, so get_*() factories produce fresh instances.
  - OllamaService's background refresh thread is patched to a no-op to
    prevent real network calls to localhost:11434.
"""

import sys
from pathlib import Path

import pytest

# Allow tests to import from both the project root and src/python/
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "src" / "python"))

# Save real _refresh_available_bg before any fixture patches it.
import ollama_service as _osvc  # noqa: E402

_real_refresh_available_bg = _osvc.OllamaService._refresh_available_bg


# ---------------------------------------------------------------------------
# Config & singleton isolation (autouse — applies to every test)
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def isolate_config(tmp_path, monkeypatch):
    """Redirect config storage to tmp_path and reset all module singletons."""
    monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))

    import settings_manager
    import chat_manager
    import tts_manager
    import stt_manager
    import ollama_service

    monkeypatch.setattr(settings_manager, "_settings", None)
    monkeypatch.setattr(settings_manager, "_debug", None)
    monkeypatch.setattr(chat_manager, "_chat_manager", None)
    monkeypatch.setattr(tts_manager, "_tts", None)
    monkeypatch.setattr(stt_manager, "_stt", None)
    monkeypatch.setattr(ollama_service, "_service", None)

    yield


@pytest.fixture(autouse=True)
def no_ollama_bg_refresh(monkeypatch):
    """Prevent OllamaService.__init__ background thread from hitting network."""
    import ollama_service

    monkeypatch.setattr(
        ollama_service.OllamaService,
        "_refresh_available_bg",
        lambda self, clear_on_failure=False: None,
    )


@pytest.fixture
def real_ollama_refresh(monkeypatch):
    """Restore the real _refresh_available_bg for tests that need network-failure behaviour."""
    import ollama_service

    monkeypatch.setattr(
        ollama_service.OllamaService,
        "_refresh_available_bg",
        _real_refresh_available_bg,
    )


# ---------------------------------------------------------------------------
# Flask test fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def flask_app(monkeypatch):
    """Return the Flask app configured for testing."""
    import app as flask_module

    flask_module.app.config["TESTING"] = True
    return flask_module.app


@pytest.fixture
def client(flask_app):
    """Return a Flask test client."""
    return flask_app.test_client()
