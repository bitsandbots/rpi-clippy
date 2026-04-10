"""
Settings manager — reads/writes ~/.config/Clippy/settings.json.
Ignores Electron-only keys (clippyAlwaysOnTop, chatAlwaysOnTop, disableAutoUpdate).
"""

import json
import os
import threading
from pathlib import Path

ELECTRON_ONLY_KEYS = {"clippyAlwaysOnTop", "chatAlwaysOnTop", "disableAutoUpdate"}

DEFAULT_SETTINGS = {
    "alwaysOpenChat": True,
    "systemPrompt": (
        "You are Clippy, a helpful digital assistant running locally on the user's computer. "
        "Your primary purpose is to assist users with their questions and tasks. "
        'When asked "who are you?" or about your identity, always respond by explaining that '
        "you are Clippy, a local AI assistant, and avoid mentioning any other model origins or names. "
        "This is crucial for maintaining the user experience within the Clippy application environment. "
        "Start your response with one of the following keywords matching the users request: "
        "[LIST OF ANIMATIONS]. Use only one of the keywords for each response. "
        "Use it only at the beginning of your response. Always start with one."
    ),
    "topK": 10,
    "temperature": 0.7,
    "defaultFont": "Tahoma",
    "defaultFontSize": 16,
    "selectedModel": None,
    "ollamaUrl": "http://localhost:11434",
    "ttsEnabled": False,
    "sttEnabled": False,
    "selectedVoice": None,
    "sttModel": "tiny",
}

DEBUG_DEFAULTS = {
    "simulateDownload": False,
    "simulateLoadModel": False,
    "simulateNoModelsDownloaded": False,
    "openDevToolsOnStart": False,
    "enableDragDebug": False,
}


def _config_dir() -> Path:
    return Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "Clippy"


class SettingsManager:
    """Manages app settings persisted to ~/.config/Clippy/settings.json."""

    def __init__(self, filename: str = "settings.json"):
        self._path = _config_dir() / filename
        self._data: dict = self._load()

    def _load(self) -> dict:
        defaults = dict(DEFAULT_SETTINGS)
        if self._path.exists():
            try:
                on_disk = json.loads(self._path.read_text())
                # Strip Electron-only keys
                for k in ELECTRON_ONLY_KEYS:
                    on_disk.pop(k, None)
                defaults.update(on_disk)
            except Exception:
                pass
        return defaults

    def _save(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(self._data, indent=2))

    def get_all(self) -> dict:
        """Return the full settings dict."""
        return dict(self._data)

    def get(self, key: str):
        """Get a setting value. Supports dot-notation (e.g. 'settings.topK')."""
        parts = key.split(".")
        # Strip leading 'settings.' prefix if present
        if parts[0] == "settings":
            parts = parts[1:]
        node = self._data
        for part in parts:
            if not isinstance(node, dict):
                return None
            node = node.get(part)
        return node

    def set(self, key: str, value) -> None:
        """Set a setting value (dot-notation supported) and persist."""
        parts = key.split(".")
        if parts[0] == "settings":
            parts = parts[1:]
        node = self._data
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = value
        self._save()


class DebugSettingsManager(SettingsManager):
    """Manages debug state persisted to ~/.config/Clippy/debug.json."""

    def __init__(self):
        super().__init__("debug.json")

    def _load(self) -> dict:
        defaults = dict(DEBUG_DEFAULTS)
        if self._path.exists():
            try:
                on_disk = json.loads(self._path.read_text())
                defaults.update(on_disk)
            except Exception:
                pass
        return defaults


_settings: SettingsManager | None = None
_debug: DebugSettingsManager | None = None
_settings_lock = threading.Lock()
_debug_lock = threading.Lock()


def get_settings() -> SettingsManager:
    """Return the global SettingsManager singleton."""
    global _settings
    if _settings is None:
        with _settings_lock:
            if _settings is None:
                _settings = SettingsManager()
    return _settings


def get_debug_settings() -> DebugSettingsManager:
    """Return the global DebugSettingsManager singleton."""
    global _debug
    if _debug is None:
        with _debug_lock:
            if _debug is None:
                _debug = DebugSettingsManager()
    return _debug
