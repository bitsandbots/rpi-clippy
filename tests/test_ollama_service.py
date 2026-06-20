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
    svc.create_session(
        {
            "ollamaTag": "tinyllama",
            "initialPrompts": [
                {"role": "user", "content": "Hi"},
                {"role": "assistant", "content": "Hello"},
            ],
        }
    )
    assert len(svc._history) == 2
    assert svc._history[0] == {"role": "user", "content": "Hi"}


def test_create_session_skips_empty_prompts():
    svc = make_service()
    svc.create_session(
        {
            "ollamaTag": "tinyllama",
            "initialPrompts": [{"role": "user", "content": ""}],
        }
    )
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
    catalog = state["catalog"]
    assert len(catalog) == len(BUILT_IN_MODELS)
    for name, model in catalog.items():
        assert "downloaded" in model
        assert isinstance(model["downloaded"], bool)
        assert "actualTag" in model


def test_model_state_all_downloaded_false_when_available_empty():
    svc = make_service()
    svc._available = set()
    state = svc.get_model_state()
    catalog = state["catalog"]
    assert all(not m["downloaded"] for m in catalog.values())


def test_get_model_state_returns_hybrid_format():
    svc = make_service()
    svc._available = set()
    state = svc.get_model_state()
    assert "catalog" in state
    assert "orphans" in state
    assert isinstance(state["catalog"], dict)
    assert isinstance(state["orphans"], list)


def test_get_model_state_catalog_entries_have_actual_tag():
    svc = make_service()
    svc._available = {"gemma3:1b"}
    state = svc.get_model_state()
    gemma = state["catalog"].get("Gemma 3 (1B)")
    assert gemma is not None
    assert gemma["actualTag"] == "gemma3:1b"
    assert gemma["downloaded"] is True


def test_get_model_state_actual_tag_fallback_when_not_installed():
    svc = make_service()
    svc._available = set()
    state = svc.get_model_state()
    gemma = state["catalog"]["Gemma 3 (1B)"]
    assert gemma["actualTag"] == gemma["ollamaTag"]
    assert gemma["downloaded"] is False


def test_get_model_state_orphans_from_ollama_tags():
    svc = make_service()
    svc._available = {"nomic-embed-text", "gemma3:1b"}
    state = svc.get_model_state()
    orphan_tags = [m["name"] for m in state["orphans"]]
    assert "nomic-embed-text" in orphan_tags
    # gemma3:1b is consumed by catalog match — not in orphans
    assert "gemma3:1b" not in orphan_tags


def test_get_model_state_no_orphan_duplicates():
    """Tags matching a catalog prefix are excluded from orphans."""
    svc = make_service()
    svc._available = {"qwen3:4b-Q4_K_M", "qwen3:4b-Q4_K_M-40k", "gemma3:1b"}
    state = svc.get_model_state()
    orphan_names = [m["name"] for m in state["orphans"]]
    assert "qwen3:4b-Q4_K_M" not in orphan_names
    assert "qwen3:4b-Q4_K_M-40k" not in orphan_names
    assert "gemma3:1b" not in orphan_names


def test_resolve_tag_respects_size_boundary():
    """gemma3:1b must not satisfy the 4B/12B catalog entries (size boundary)."""
    svc = make_service()
    assert svc._tag_matches("gemma3:1b", "gemma3:1b") is True
    assert svc._tag_matches("gemma3:12b", "gemma3:1b") is False
    assert svc._tag_matches("gemma3:4b-Q4_K_M", "gemma3:1b") is False
    # Variant suffix and implicit :latest still match.
    assert svc._tag_matches("llama3.2:3b", "llama3.2:3b-instruct-q4_K_M") is True
    assert svc._tag_matches("phi4-mini", "phi4-mini:latest") is True


def test_model_state_other_sizes_not_downloaded_with_only_1b():
    """Only gemma3:1b installed: the 4B/12B entries are NOT marked downloaded
    and keep their own tag (regression for the base-name collision bug)."""
    svc = make_service()
    svc._available = {"gemma3:1b"}
    catalog = svc.get_model_state()["catalog"]

    assert catalog["Gemma 3 (1B)"]["downloaded"] is True
    assert catalog["Gemma 3 (1B)"]["actualTag"] == "gemma3:1b"

    for name in ("Gemma 3 (4B)", "Gemma 3 (12B)"):
        entry = catalog[name]
        assert entry["downloaded"] is False, f"{name} falsely downloaded"
        assert entry["actualTag"] == entry["ollamaTag"], f"{name} resolved to a sibling"


def test_model_state_variant_satisfies_catalog_entry():
    """An installed quant/instruct variant satisfies the base catalog entry."""
    svc = make_service()
    svc._available = {"llama3.2:3b-instruct-q4_K_M", "phi4-mini:latest"}
    catalog = svc.get_model_state()["catalog"]

    llama = catalog["Llama 3.2 (3B Instruct)"]
    assert llama["downloaded"] is True
    assert llama["actualTag"] == "llama3.2:3b-instruct-q4_K_M"

    phi = catalog["Phi-4 Mini (3.8B)"]
    assert phi["downloaded"] is True
    assert phi["actualTag"] == "phi4-mini:latest"


def test_get_model_state_orphans_have_minimal_fields():
    svc = make_service()
    svc._available = {"nomic-embed-text"}
    state = svc.get_model_state()
    orphan = state["orphans"][0]
    assert orphan["name"] == "nomic-embed-text"
    assert orphan["path"] == "nomic-embed-text"
    assert orphan["downloaded"] is True
    assert orphan.get("actualTag") == "nomic-embed-text"


def test_get_model_state_empty_ollama():
    """Empty available set produces no orphans, all catalog downloaded=false."""
    svc = make_service()
    svc._available = set()
    state = svc.get_model_state()
    assert state["orphans"] == []
    assert all(not m["downloaded"] for m in state["catalog"].values())


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
    # Ollama /api/generate uses "response" field instead of "message.content"
    mock_resp = _streaming_response(
        [
            {"done": False, "response": "Hello"},
            {"done": False, "response": " world"},
            {"done": True},
        ]
    )
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
    # Ollama /api/generate uses "response" field
    mock_resp = _streaming_response(
        [
            {"done": False, "response": "Hi"},
            {"done": True},
        ]
    )
    mocker.patch("requests.post", return_value=mock_resp)

    svc = make_service()
    svc.create_session({"ollamaTag": "tinyllama"})
    list(svc.prompt_streaming("hello", "uuid-2"))

    assert len(svc._history) == 2
    assert svc._history[0] == {"role": "user", "content": "hello"}
    assert svc._history[1] == {"role": "assistant", "content": "Hi"}


def test_prompt_streaming_abort_skips_history(mocker):
    """Aborting mid-stream means history is NOT appended."""
    # Ollama /api/generate uses "response" field
    lines = [
        {"done": False, "response": "A"},
        {"done": False, "response": "B"},
        {"done": True},
    ]
    mock_resp = _streaming_response(lines)
    mocker.patch("requests.post", return_value=mock_resp)

    svc = make_service()
    svc.create_session({"ollamaTag": "tinyllama"})

    gen = svc.prompt_streaming("test", "abort-uuid")
    next(gen)  # consume first chunk
    svc.abort("abort-uuid")  # set abort event
    list(gen)  # exhaust generator

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
    """System prompt should be included in the prompt string."""
    mock_resp = _streaming_response([{"done": True}])
    mock_post = mocker.patch("requests.post", return_value=mock_resp)

    svc = make_service()
    svc.create_session({"ollamaTag": "tinyllama", "systemPrompt": "Be concise."})
    list(svc.prompt_streaming("hi", "uuid-sys"))

    call_body = mock_post.call_args[1]["json"]
    # Ollama /api/generate uses "prompt" with formatted conversation
    assert "System: Be concise." in call_body["prompt"]


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


def test_pull_model_by_tag_starts_pull(mocker):
    """pull_model_by_tag accepts an arbitrary tag string."""
    mock_resp = mocker.MagicMock()
    mock_resp.iter_lines.return_value = [
        b'{"status":"pulling"}',
        b'{"status":"success"}',
    ]
    mock_post = mocker.patch("requests.post", return_value=mock_resp)

    svc = make_service()
    svc.pull_model_by_tag("llama3.2:1b")

    mock_post.assert_called_once()
    call_body = mock_post.call_args[1]["json"]
    assert call_body["name"] == "llama3.2:1b"


def test_pull_model_by_tag_arbitrary_tag(mocker):
    """Can pull tags not in BUILT_IN_MODELS."""
    mock_resp = mocker.MagicMock()
    mock_resp.iter_lines.return_value = [b'{"status":"success"}']
    mock_post = mocker.patch("requests.post", return_value=mock_resp)

    svc = make_service()
    svc.pull_model_by_tag("nomic-embed-text")

    call_body = mock_post.call_args[1]["json"]
    assert call_body["name"] == "nomic-embed-text"


def test_pull_model_by_tag_adds_to_available_on_success(mocker):
    mock_resp = mocker.MagicMock()
    mock_resp.iter_lines.return_value = [b'{"status":"success"}']
    mocker.patch("requests.post", return_value=mock_resp)

    svc = make_service()
    svc._available = set()
    svc.pull_model_by_tag("new-model:latest")

    assert "new-model:latest" in svc._available


def test_pull_model_by_tag_broadcasts_error_on_failure(mocker):
    mocker.patch("requests.post", side_effect=ConnectionError("refused"))
    svc = make_service()
    q = svc.subscribe_pull_events()
    svc.pull_model_by_tag("bad-tag")
    event = q.get_nowait()
    assert event["type"] == "pull_error"
    assert event["tag"] == "bad-tag"


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
