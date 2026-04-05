"""Tests for SettingsManager and DebugSettingsManager."""

import json
from pathlib import Path

import pytest

from settings_manager import (
    DEFAULT_SETTINGS,
    DEBUG_DEFAULTS,
    ELECTRON_ONLY_KEYS,
    SettingsManager,
    DebugSettingsManager,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_manager(tmp_path, filename="settings.json") -> SettingsManager:
    """Create a SettingsManager whose config dir is inside tmp_path."""
    # XDG_CONFIG_HOME is already set to tmp_path by isolate_config fixture
    return SettingsManager(filename=filename)


def make_debug_manager() -> DebugSettingsManager:
    return DebugSettingsManager()


# ---------------------------------------------------------------------------
# SettingsManager — defaults
# ---------------------------------------------------------------------------

def test_defaults_loaded(tmp_path):
    mgr = make_manager(tmp_path)
    data = mgr.get_all()
    for key in DEFAULT_SETTINGS:
        if key not in ELECTRON_ONLY_KEYS:
            assert key in data


def test_default_topk_value(tmp_path):
    mgr = make_manager(tmp_path)
    assert mgr.get("topK") == 10


def test_default_temperature_value(tmp_path):
    mgr = make_manager(tmp_path)
    assert mgr.get("temperature") == 0.7


def test_default_selected_model_is_none(tmp_path):
    mgr = make_manager(tmp_path)
    assert mgr.get("selectedModel") is None


# ---------------------------------------------------------------------------
# SettingsManager — get()
# ---------------------------------------------------------------------------

def test_get_simple_key(tmp_path):
    mgr = make_manager(tmp_path)
    assert mgr.get("topK") == 10


def test_get_dot_notation_strips_settings_prefix(tmp_path):
    mgr = make_manager(tmp_path)
    assert mgr.get("settings.topK") == 10


def test_get_missing_key_returns_none(tmp_path):
    mgr = make_manager(tmp_path)
    assert mgr.get("nonExistentKey") is None


def test_get_deep_missing_returns_none(tmp_path):
    mgr = make_manager(tmp_path)
    assert mgr.get("a.b.c.d") is None


# ---------------------------------------------------------------------------
# SettingsManager — set()
# ---------------------------------------------------------------------------

def test_set_simple_key(tmp_path):
    mgr = make_manager(tmp_path)
    mgr.set("topK", 20)
    assert mgr.get("topK") == 20


def test_set_dot_notation(tmp_path):
    mgr = make_manager(tmp_path)
    mgr.set("settings.topK", 30)
    assert mgr.get("topK") == 30


def test_set_persists_to_disk(tmp_path):
    mgr = make_manager(tmp_path)
    mgr.set("topK", 99)
    # Re-load from disk by creating a new instance
    mgr2 = make_manager(tmp_path)
    assert mgr2.get("topK") == 99


def test_set_creates_nested_keys(tmp_path):
    mgr = make_manager(tmp_path)
    mgr.set("nested.deep.key", "value")
    data = mgr.get_all()
    assert data["nested"]["deep"]["key"] == "value"


def test_set_string_value(tmp_path):
    mgr = make_manager(tmp_path)
    mgr.set("selectedModel", "TinyLlama (1.1B)")
    assert mgr.get("selectedModel") == "TinyLlama (1.1B)"


# ---------------------------------------------------------------------------
# SettingsManager — electron key filtering
# ---------------------------------------------------------------------------

def test_electron_keys_not_in_defaults(tmp_path):
    mgr = make_manager(tmp_path)
    data = mgr.get_all()
    for key in ELECTRON_ONLY_KEYS:
        assert key not in data


def test_electron_keys_stripped_on_load(tmp_path):
    """If a disk file contains Electron-only keys they should be stripped."""
    config_dir = Path(tmp_path) / "Clippy"
    config_dir.mkdir(parents=True)
    settings_path = config_dir / "settings.json"
    dirty = {"topK": 5, "clippyAlwaysOnTop": True, "chatAlwaysOnTop": False}
    settings_path.write_text(json.dumps(dirty))

    mgr = make_manager(tmp_path)
    data = mgr.get_all()
    assert data["topK"] == 5
    assert "clippyAlwaysOnTop" not in data
    assert "chatAlwaysOnTop" not in data


# ---------------------------------------------------------------------------
# SettingsManager — JSON corruption
# ---------------------------------------------------------------------------

def test_corrupted_json_returns_defaults(tmp_path):
    config_dir = Path(tmp_path) / "Clippy"
    config_dir.mkdir(parents=True)
    (config_dir / "settings.json").write_text("this is not json {{{{")

    mgr = make_manager(tmp_path)
    # Should fall back to defaults
    assert mgr.get("topK") == DEFAULT_SETTINGS["topK"]


def test_partial_json_merges_with_defaults(tmp_path):
    config_dir = Path(tmp_path) / "Clippy"
    config_dir.mkdir(parents=True)
    (config_dir / "settings.json").write_text(json.dumps({"topK": 42}))

    mgr = make_manager(tmp_path)
    assert mgr.get("topK") == 42
    # Defaults for other keys should still be present
    assert mgr.get("temperature") == DEFAULT_SETTINGS["temperature"]


# ---------------------------------------------------------------------------
# DebugSettingsManager
# ---------------------------------------------------------------------------

def test_debug_defaults_loaded():
    mgr = make_debug_manager()
    data = mgr.get_all()
    for key in DEBUG_DEFAULTS:
        assert key in data
        assert data[key] == DEBUG_DEFAULTS[key]


def test_debug_uses_separate_file(tmp_path):
    settings = make_manager(tmp_path)
    debug = make_debug_manager()

    settings.set("topK", 99)
    debug.set("simulateDownload", True)

    # Verify they don't bleed into each other
    assert settings.get("simulateDownload") is None
    assert debug.get("topK") is None


def test_debug_set_and_get(tmp_path):
    mgr = make_debug_manager()
    mgr.set("simulateDownload", True)
    assert mgr.get("simulateDownload") is True


def test_debug_persists(tmp_path):
    mgr1 = make_debug_manager()
    mgr1.set("enableDragDebug", True)

    mgr2 = make_debug_manager()
    assert mgr2.get("enableDragDebug") is True
