"""
Chat manager — reads/writes chat JSON files under ~/.config/Clippy/chats/.
File format is identical to the Electron version for full compatibility.
"""

import json
import os
import threading
from pathlib import Path


def _chats_dir() -> Path:
    config = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "Clippy"
    return config / "chats"


class ChatManager:
    """Manages conversation JSON files on disk."""

    def __init__(self):
        self._dir = _chats_dir()
        self._index_path = self._dir / "chats.json"
        self._records: dict = self._load_index()
        self._messages: dict = {}

    def _load_index(self) -> dict:
        if not self._index_path.exists():
            return {}
        try:
            return json.loads(self._index_path.read_text())
        except Exception:
            return {}

    def _save_index(self) -> None:
        self._dir.mkdir(parents=True, exist_ok=True)
        self._index_path.write_text(json.dumps(self._records, indent=2))

    def _chat_path(self, chat_id: str) -> Path:
        return self._dir / f"{chat_id}.json"

    def get_records(self) -> dict:
        """Return the chat index (id → ChatRecord)."""
        return dict(self._records)

    def get_with_messages(self, chat_id: str) -> dict | None:
        """Return ChatWithMessages for chat_id, or None if not found."""
        # Check in-memory cache first
        if chat_id in self._messages and chat_id in self._records:
            return {"chat": self._records[chat_id], "messages": self._messages[chat_id]}

        path = self._chat_path(chat_id)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text())
            self._messages[chat_id] = data.get("messages", [])
            return data
        except Exception:
            return None

    def write(self, chat_with_messages: dict) -> None:
        """Persist a ChatWithMessages to disk and update the index."""
        chat = chat_with_messages.get("chat", {})
        chat_id = chat.get("id")
        messages = chat_with_messages.get("messages", [])

        if not chat_id or not messages:
            return

        self._records[chat_id] = chat
        self._messages[chat_id] = messages

        self._dir.mkdir(parents=True, exist_ok=True)
        self._chat_path(chat_id).write_text(json.dumps(chat_with_messages, indent=2))
        self._save_index()

    def delete(self, chat_id: str) -> None:
        """Delete a single chat from disk and index."""
        self._records.pop(chat_id, None)
        self._messages.pop(chat_id, None)
        path = self._chat_path(chat_id)
        if path.exists():
            path.unlink()
        self._save_index()

    def delete_all(self) -> None:
        """Delete all chats from disk and reset the index."""
        self._records = {}
        self._messages = {}
        if self._dir.exists():
            for f in self._dir.glob("*.json"):
                f.unlink(missing_ok=True)
        self._save_index()


_chat_manager: ChatManager | None = None
_chat_manager_lock = threading.Lock()


def get_chat_manager() -> ChatManager:
    """Return the global ChatManager singleton."""
    global _chat_manager
    if _chat_manager is None:
        with _chat_manager_lock:
            if _chat_manager is None:
                _chat_manager = ChatManager()
    return _chat_manager
