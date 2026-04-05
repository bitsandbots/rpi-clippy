"""Tests for OllamaService."""

import json
import queue
import threading

import pytest
import ollama_service as _om

from ollama_service import OllamaService, BUILT_IN_MODELS

# Saved before any fixtures run — lets specific tests restore the real method.
_original_refresh_bg = OllamaService._refresh_available_bg


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_service() -> OllamaService:
    """Return a fresh OllamaService (background refresh already patched to no-op)."""
    return OllamaService()


def _streaming_response(lines: list[dict]):
    """Build a mock requests.Response whose iter_lines yields encoded JSON."""
    from unittest.mock import MagicMock
    resp = MagicMock()
    resp.iter_lines.return_value = [json.dumps(line).encode() for line in lines]
    return resp


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

def test_create_session_stores_options():
    svc = make_service()
    opts = {"ollamaTag": "tinyllama", "temperature": 0.5}
    svc.create_session(opts)
    assert svc._session == opts


def test_destroy_session_clears_state():
    svc = make_service()
    svc.create_session({"ollamaTag": "tinyllama"})
    svc.destroy_session()
    assert svc._session is None
    assert svc._history == []


def test_create_session_seeds_history():
    svc = make_service()
    svc.create_session({
        "ollamaTag": "tinyllama",
        "initialPrompts": [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello"},
        ],
    })
    assert len(svc._history) == 2
    assert svc._history[0] == {"role": "user", "content": "Hi"}


def test_create_session_skips_empty_prompts():
    svc = make_service()
    svc.create_session({
        "ollamaTag": "tinyllama",
        "initialPrompts": [{"role": "user", "content": ""}],
    })
    assert svc._history == []


def test_destroy_clears_history():
    svc = make_service()
    svc.create_session({"initialPrompts": [{"role": "user", "content": "x"}]})
    svc.destroy_session()
    assert svc._history == []


# ---------------------------------------------------------------------------
# Model state
# ---------------------------------------------------------------------------

def test_get_model_state_returns_all_builtin_models():
    svc = make_service()
    state = svc.get_model_state()
    assert len(state) == len(BUILT_IN_MODELS)
    for name, model in state.items():
        assert "downloaded" in model
        assert isinstance(model["downloaded"], bool)
        assert "ollamaTag" in model


def test_model_state_all_downloaded_false_when_available_empty():
    svc = make_service()
    svc._available = set()
    state = svc.get_model_state()
    assert all(not m["downloaded"] for m in state.values())


def test_is_available_exact_match():
    svc = make_service()
    svc._available = {"tinyllama:latest"}
    assert svc._is_available("tinyllama:latest") is True


def test_is_available_prefix_match():
    svc = make_service()
    svc._available = {"llama3.2:3b"}
    # The built-in tag is "llama3.2:1b" — different tag, but same base prefix "llama3.2"
    assert svc._is_available("llama3.2:1b") is True


def test_is_available_no_match():
    svc = make_service()
    svc._available = {"gemma3:1b"}
    assert svc._is_available("tinyllama") is False


def test_refresh_available_populates_set(mocker):
    mock_resp = mocker.MagicMock()
    mock_resp.json.return_value = {
        "models": [
            {"name": "tinyllama:latest"},
            {"name": "llama3.2:3b"},
        ]
    }
    mocker.patch("requests.get", return_value=mock_resp)
    # Restore real implementation — the autouse fixture patches it to a no-op.
    mocker.patch.object(OllamaService, "_refresh_available_bg", _original_refresh_bg)

    svc = make_service()
    svc._available = set()
    svc.refresh_available()

    assert "tinyllama:latest" in svc._available
    assert "llama3.2:3b" in svc._available


def test_refresh_available_silent_on_connection_error(mocker):
    mocker.patch("requests.get", side_effect=ConnectionError("refused"))
    svc = make_service()
    svc._available = set()
    svc.refresh_available()  # must not raise
    assert svc._available == set()


# ---------------------------------------------------------------------------
# Streaming inference
# ---------------------------------------------------------------------------

def test_prompt_streaming_yields_chunks(mocker):
    mock_resp = _streaming_response([
        {"done": False, "message": {"role": "assistant", "content": "Hello"}},
        {"done": False, "message": {"role": "assistant", "content": " world"}},
        {"done": True},
    ])
    mocker.patch("requests.post", return_value=mock_resp)

    svc = make_service()
    svc.create_session({"ollamaTag": "tinyllama"})

    events = list(svc.prompt_streaming("hi", "uuid-1"))

    chunks = [e for e in events if e["type"] == "chunk"]
    done = [e for e in events if e["type"] == "done"]

    assert len(chunks) == 2
    assert chunks[0]["text"] == "Hello"
    assert chunks[1]["text"] == " world"
    assert len(done) == 1
    assert done[0]["uuid"] == "uuid-1"


def test_prompt_streaming_appends_history(mocker):
    mock_resp = _streaming_response([
        {"done": False, "message": {"role": "assistant", "content": "Hi"}},
        {"done": True},
    ])
    mocker.patch("requests.post", return_value=mock_resp)

    svc = make_service()
    svc.create_session({"ollamaTag": "tinyllama"})
    list(svc.prompt_streaming("hello", "uuid-2"))

    assert len(svc._history) == 2
    assert svc._history[0] == {"role": "user", "content": "hello"}
    assert svc._history[1] == {"role": "assistant", "content": "Hi"}


def test_prompt_streaming_abort_skips_history(mocker):
    """Aborting mid-stream means history is NOT appended."""
    lines = [
        {"done": False, "message": {"role": "assistant", "content": "A"}},
        {"done": False, "message": {"role": "assistant", "content": "B"}},
        {"done": True},
    ]
    mock_resp = _streaming_response(lines)
    mocker.patch("requests.post", return_value=mock_resp)

    svc = make_service()
    svc.create_session({"ollamaTag": "tinyllama"})

    gen = svc.prompt_streaming("test", "abort-uuid")
    next(gen)           # consume first chunk
    svc.abort("abort-uuid")   # set abort event
    list(gen)           # exhaust generator

    assert svc._history == []


def test_prompt_streaming_error_yields_error_event(mocker):
    mocker.patch("requests.post", side_effect=ConnectionError("refused"))

    svc = make_service()
    svc.create_session({"ollamaTag": "tinyllama"})

    events = list(svc.prompt_streaming("hello", "uuid-err"))
    assert events[-1]["type"] == "error"
    assert "uuid-err" == events[-1]["uuid"]
    assert "refused" in events[-1]["error"]


def test_prompt_streaming_uses_system_prompt(mocker):
    """System prompt should be prepended as the first message."""
    mock_resp = _streaming_response([{"done": True}])
    mock_post = mocker.patch("requests.post", return_value=mock_resp)

    svc = make_service()
    svc.create_session({"ollamaTag": "tinyllama", "systemPrompt": "Be concise."})
    list(svc.prompt_streaming("hi", "uuid-sys"))

    call_body = mock_post.call_args[1]["json"]
    assert call_body["messages"][0] == {"role": "system", "content": "Be concise."}


# ---------------------------------------------------------------------------
# Abort
# ---------------------------------------------------------------------------

def test_abort_unknown_uuid_is_noop():
    svc = make_service()
    svc.abort("does-not-exist")  # must not raise


# ---------------------------------------------------------------------------
# Pull SSE fan-out
# ---------------------------------------------------------------------------

def test_subscribe_returns_queue():
    svc = make_service()
    q = svc.subscribe_pull_events()
    assert isinstance(q, queue.Queue)


def test_broadcast_reaches_subscriber():
    svc = make_service()
    q = svc.subscribe_pull_events()
    svc._broadcast_pull({"type": "pull_progress", "tag": "test"})
    event = q.get_nowait()
    assert event["type"] == "pull_progress"


def test_broadcast_reaches_multiple_subscribers():
    svc = make_service()
    q1 = svc.subscribe_pull_events()
    q2 = svc.subscribe_pull_events()
    svc._broadcast_pull({"type": "ping"})
    assert q1.get_nowait()["type"] == "ping"
    assert q2.get_nowait()["type"] == "ping"


def test_unsubscribe_stops_receiving():
    svc = make_service()
    q = svc.subscribe_pull_events()
    svc.unsubscribe_pull_events(q)
    svc._broadcast_pull({"type": "test"})
    assert q.empty()


def test_unsubscribe_nonexistent_is_noop():
    svc = make_service()
    q = queue.Queue()
    svc.unsubscribe_pull_events(q)  # not subscribed — must not raise


def test_pull_model_unknown_name_broadcasts_error():
    svc = make_service()
    q = svc.subscribe_pull_events()
    svc.pull_model_by_name("NonExistentModel XYZ")
    event = q.get_nowait()
    assert event["type"] == "pull_error"


# ---------------------------------------------------------------------------
# Model deletion
# ---------------------------------------------------------------------------

def test_delete_model_removes_from_available(mocker):
    mock_resp = mocker.MagicMock()
    mock_resp.raise_for_status = mocker.MagicMock()
    mocker.patch("requests.delete", return_value=mock_resp)

    svc = make_service()
    svc._available = {"tinyllama"}
    svc.delete_model_by_name("TinyLlama (1.1B)")

    assert "tinyllama" not in svc._available


def test_remove_model_updates_cache_only(mocker):
    """remove_model_by_name doesn't call HTTP — only updates _available."""
    mock_delete = mocker.patch("requests.delete")
    svc = make_service()
    svc._available = {"tinyllama"}
    svc.remove_model_by_name("TinyLlama (1.1B)")
    mock_delete.assert_not_called()
    assert "tinyllama" not in svc._available
