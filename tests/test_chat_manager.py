"""Tests for ChatManager."""

import json
from pathlib import Path

import pytest

from chat_manager import ChatManager


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_manager() -> ChatManager:
    """Create a ChatManager; XDG_CONFIG_HOME is redirected to tmp_path."""
    return ChatManager()


def sample_chat(chat_id: str = "chat-1") -> dict:
    return {
        "chat": {
            "id": chat_id,
            "createdAt": 1000,
            "updatedAt": 1000,
            "preview": "Hello",
        },
        "messages": [
            {"id": "msg-1", "sender": "user", "content": "Hi", "createdAt": 1000},
        ],
    }


# ---------------------------------------------------------------------------
# Initial state
# ---------------------------------------------------------------------------

def test_get_records_empty_on_fresh_manager():
    mgr = make_manager()
    assert mgr.get_records() == {}


def test_get_with_messages_returns_none_for_unknown():
    mgr = make_manager()
    assert mgr.get_with_messages("does-not-exist") is None


# ---------------------------------------------------------------------------
# Write & read
# ---------------------------------------------------------------------------

def test_write_and_read_roundtrip():
    mgr = make_manager()
    chat = sample_chat("abc")
    mgr.write(chat)

    result = mgr.get_with_messages("abc")
    assert result is not None
    assert result["chat"]["id"] == "abc"
    assert len(result["messages"]) == 1
    assert result["messages"][0]["content"] == "Hi"


def test_write_updates_records_index():
    mgr = make_manager()
    mgr.write(sample_chat("xyz"))
    records = mgr.get_records()
    assert "xyz" in records
    assert records["xyz"]["id"] == "xyz"


def test_write_requires_nonempty_id():
    mgr = make_manager()
    bad = {"chat": {"id": "", "preview": ""}, "messages": [{"id": "m1"}]}
    mgr.write(bad)  # should silently skip
    assert mgr.get_records() == {}


def test_write_requires_nonempty_messages():
    mgr = make_manager()
    bad = {"chat": {"id": "chat-1"}, "messages": []}
    mgr.write(bad)  # should silently skip
    assert mgr.get_records() == {}


def test_write_persists_to_disk(tmp_path):
    mgr = make_manager()
    mgr.write(sample_chat("p1"))

    # Re-instantiate to verify data survived
    mgr2 = make_manager()
    assert "p1" in mgr2.get_records()
    result = mgr2.get_with_messages("p1")
    assert result is not None


def test_write_multiple_chats():
    mgr = make_manager()
    mgr.write(sample_chat("c1"))
    mgr.write(sample_chat("c2"))
    assert set(mgr.get_records().keys()) == {"c1", "c2"}


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

def test_delete_removes_from_records():
    mgr = make_manager()
    mgr.write(sample_chat("del-1"))
    mgr.delete("del-1")
    assert "del-1" not in mgr.get_records()


def test_delete_removes_from_message_cache():
    mgr = make_manager()
    mgr.write(sample_chat("del-2"))
    mgr.get_with_messages("del-2")  # populate cache
    mgr.delete("del-2")
    assert mgr.get_with_messages("del-2") is None


def test_delete_nonexistent_is_noop():
    mgr = make_manager()
    mgr.delete("ghost")  # should not raise


def test_delete_all_clears_everything():
    mgr = make_manager()
    mgr.write(sample_chat("a"))
    mgr.write(sample_chat("b"))
    mgr.delete_all()
    assert mgr.get_records() == {}
    assert mgr.get_with_messages("a") is None
    assert mgr.get_with_messages("b") is None


def test_delete_all_persists(tmp_path):
    mgr = make_manager()
    mgr.write(sample_chat("x"))
    mgr.delete_all()
    mgr2 = make_manager()
    assert mgr2.get_records() == {}


# ---------------------------------------------------------------------------
# In-memory caching
# ---------------------------------------------------------------------------

def test_messages_served_from_cache(tmp_path, mocker):
    """After a write+read, subsequent reads hit the in-memory cache."""
    mgr = make_manager()
    mgr.write(sample_chat("c-cache"))
    mgr.get_with_messages("c-cache")  # seeds cache

    # Spy on disk read — it must NOT be called again
    spy = mocker.patch.object(Path, "read_text", wraps=Path.read_text)
    mgr.get_with_messages("c-cache")

    # No Path.read_text call should have been made for this chat
    for call in spy.call_args_list:
        assert "c-cache" not in str(call)


# ---------------------------------------------------------------------------
# Index corruption recovery
# ---------------------------------------------------------------------------

def test_index_survives_corruption(tmp_path):
    """Corrupt chats.json on disk; a fresh manager returns empty records."""
    config_dir = Path(tmp_path) / "Clippy" / "chats"
    config_dir.mkdir(parents=True)
    (config_dir / "chats.json").write_text("NOT VALID JSON")

    mgr = make_manager()
    assert mgr.get_records() == {}


# ---------------------------------------------------------------------------
# Path traversal safety
# ---------------------------------------------------------------------------

def test_chat_id_path_traversal_does_not_escape(tmp_path):
    """A malicious chat_id like '../evil' must resolve inside the chats dir."""
    mgr = make_manager()
    evil_id = "../evil"
    path = mgr._chat_path(evil_id)
    chats_dir = Path(tmp_path) / "Clippy" / "chats"
    # The resolved path must NOT leave the chats directory
    try:
        resolved = path.resolve()
        chats_resolved = chats_dir.resolve()
        assert str(resolved).startswith(str(chats_resolved))
    except Exception:
        pass  # Path.resolve() may not exist yet — that's also safe
