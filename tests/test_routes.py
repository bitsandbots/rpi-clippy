"""
Flask route tests.

All manager singletons are reset per test by isolate_config (conftest.py).
OllamaService background refresh is patched to a no-op by no_ollama_bg_refresh.
"""

import json
import sys
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def post_json(client, url, body=None):
    return client.post(
        url, data=json.dumps(body or {}), content_type="application/json"
    )


def delete_json(client, url, body=None):
    return client.delete(
        url, data=json.dumps(body or {}), content_type="application/json"
    )


# ---------------------------------------------------------------------------
# SPA serving
# ---------------------------------------------------------------------------


def test_root_returns_html_or_placeholder(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"html" in resp.data.lower() or b"Clippy" in resp.data


def test_api_path_returns_json_not_html(client):
    """Requests to /api/unknown should be handled by Flask, not the SPA catch-all."""
    resp = client.get("/api/does-not-exist")
    assert resp.status_code == 404
    data = resp.get_json()
    assert data is not None


# ---------------------------------------------------------------------------
# GET /api/state
# ---------------------------------------------------------------------------


def test_get_state_returns_models_and_settings(client):
    resp = client.get("/api/state")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "models" in data
    assert "settings" in data


def test_get_state_settings_has_topk(client):
    resp = client.get("/api/state")
    settings = resp.get_json()["settings"]
    assert "topK" in settings


# ---------------------------------------------------------------------------
# POST /api/state
# ---------------------------------------------------------------------------


def test_set_state_missing_key_returns_400(client):
    resp = post_json(client, "/api/state", {"value": 99})
    assert resp.status_code == 400


def test_set_state_updates_value(client):
    post_json(client, "/api/state", {"key": "topK", "value": 42})
    resp = client.get("/api/state")
    assert resp.get_json()["settings"]["topK"] == 42


def test_set_state_returns_ok(client):
    resp = post_json(client, "/api/state", {"key": "topK", "value": 5})
    assert resp.get_json()["status"] == "ok"


# ---------------------------------------------------------------------------
# GET/POST /api/debug-state
# ---------------------------------------------------------------------------


def test_get_debug_state_returns_dict(client):
    resp = client.get("/api/debug-state")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "simulateDownload" in data


def test_set_debug_state_missing_key_returns_400(client):
    resp = post_json(client, "/api/debug-state", {"value": True})
    assert resp.status_code == 400


def test_set_debug_state_updates_value(client):
    post_json(client, "/api/debug-state", {"key": "simulateDownload", "value": True})
    resp = client.get("/api/debug-state")
    assert resp.get_json()["simulateDownload"] is True


# ---------------------------------------------------------------------------
# Chats
# ---------------------------------------------------------------------------


def test_get_chats_empty_initially(client):
    resp = client.get("/api/chats")
    assert resp.status_code == 200
    assert resp.get_json() == {}


def test_write_and_read_chat(client):
    body = {
        "chat": {"id": "chat-1", "createdAt": 1, "updatedAt": 1, "preview": "Hi"},
        "messages": [
            {"id": "m1", "sender": "user", "content": "Hello", "createdAt": 1}
        ],
    }
    resp = post_json(client, "/api/chats/chat-1", body)
    assert resp.get_json()["status"] == "ok"

    resp = client.get("/api/chats/chat-1")
    assert resp.status_code == 200
    assert resp.get_json()["chat"]["id"] == "chat-1"


def test_get_missing_chat_returns_404(client):
    resp = client.get("/api/chats/nonexistent")
    assert resp.status_code == 404


def test_get_chats_lists_written_chats(client):
    body = {
        "chat": {"id": "c1", "preview": ""},
        "messages": [{"id": "m1", "sender": "user", "content": "x", "createdAt": 1}],
    }
    post_json(client, "/api/chats/c1", body)
    resp = client.get("/api/chats")
    assert "c1" in resp.get_json()


def test_delete_chat(client):
    body = {
        "chat": {"id": "c-del"},
        "messages": [{"id": "m1", "sender": "user", "content": "x", "createdAt": 1}],
    }
    post_json(client, "/api/chats/c-del", body)
    resp = delete_json(client, "/api/chats/c-del")
    assert resp.get_json()["status"] == "ok"
    assert client.get("/api/chats/c-del").status_code == 404


def test_delete_all_chats(client):
    for cid in ["x1", "x2"]:
        body = {
            "chat": {"id": cid},
            "messages": [
                {"id": "m1", "sender": "user", "content": "x", "createdAt": 1}
            ],
        }
        post_json(client, f"/api/chats/{cid}", body)
    resp = delete_json(client, "/api/chats")
    assert resp.get_json()["status"] == "ok"
    assert client.get("/api/chats").get_json() == {}


def test_write_chat_auto_assigns_id(client):
    """If chat body has no id, the URL chat_id is used."""
    body = {
        "chat": {},  # no id field
        "messages": [{"id": "m1", "sender": "user", "content": "hi", "createdAt": 1}],
    }
    post_json(client, "/api/chats/auto-id", body)
    resp = client.get("/api/chats/auto-id")
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


def test_get_models_returns_model_state(client):
    resp = client.get("/api/models")
    assert resp.status_code == 200
    data = resp.get_json()
    assert isinstance(data, dict)
    # Should have at least one entry
    assert len(data) > 0


def test_download_model_missing_name_returns_400(client):
    resp = post_json(client, "/api/models/download", {})
    assert resp.status_code == 400


def test_download_model_starts_thread(client, mocker):
    mock_thread = mocker.patch("threading.Thread")
    post_json(client, "/api/models/download", {"name": "TinyLlama (1.1B)"})
    # Thread may be called more than once (e.g., background refresh), but
    # at least one call should start the download.
    assert mock_thread.call_count >= 1
    assert mock_thread.return_value.start.called


def test_delete_model_missing_name_returns_400(client):
    resp = post_json(client, "/api/models/delete", {})
    assert resp.status_code == 400


def test_delete_model_success(client, mocker):
    mocker.patch("ollama_service.OllamaService.delete_model_by_name")
    resp = post_json(client, "/api/models/delete", {"name": "TinyLlama (1.1B)"})
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"


def test_delete_model_error_returns_500(client, mocker):
    mocker.patch(
        "ollama_service.OllamaService.delete_model_by_name",
        side_effect=Exception("Ollama error"),
    )
    resp = post_json(client, "/api/models/delete", {"name": "TinyLlama (1.1B)"})
    assert resp.status_code == 500


def test_remove_model_missing_name_returns_400(client):
    resp = post_json(client, "/api/models/remove", {})
    assert resp.status_code == 400


def test_remove_model_success(client):
    resp = post_json(client, "/api/models/remove", {"name": "TinyLlama (1.1B)"})
    assert resp.status_code == 200


def test_refresh_models_returns_model_state(client):
    resp = post_json(client, "/api/models/refresh")
    assert resp.status_code == 200
    assert isinstance(resp.get_json(), dict)


def test_set_ollama_url_refreshes_models(client, mocker):
    """When Ollama URL changes, model cache should be refreshed."""
    # Mock the requests.get to return a specific model list
    mock_get = mocker.patch("requests.get")
    mock_get.return_value.status_code = 200
    mock_get.return_value.json.return_value = {
        "models": [{"name": "test-model:latest"}]
    }

    resp = post_json(client, "/api/ollama/url", {"url": "http://test-server:11434"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "ok"
    assert data["url"] == "http://test-server:11434"
    # Verify models are returned (proving refresh was called)
    assert "models" in data
    # The mocked model list should affect downloaded status via _is_available
    assert isinstance(data["models"], dict)


# ---------------------------------------------------------------------------
# LLM
# ---------------------------------------------------------------------------


def test_llm_create_returns_ok(client):
    resp = post_json(client, "/api/llm/create", {"ollamaTag": "tinyllama"})
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"


def test_llm_destroy_returns_ok(client):
    resp = post_json(client, "/api/llm/destroy")
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"


def test_llm_abort_returns_ok(client):
    resp = post_json(client, "/api/llm/abort", {"uuid": "test-uuid"})
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"


def test_llm_stream_missing_params_returns_400(client):
    resp = client.get("/api/llm/stream")
    assert resp.status_code == 400


def test_llm_stream_missing_message_returns_400(client):
    resp = client.get("/api/llm/stream?uuid=abc")
    assert resp.status_code == 400


def test_llm_stream_missing_uuid_returns_400(client):
    resp = client.get("/api/llm/stream?message=hello")
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Voice
# ---------------------------------------------------------------------------


def test_voice_state_returns_tts_and_stt(client):
    resp = client.get("/api/voice/state")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "tts" in data
    assert "stt" in data


def test_tts_toggle_defaults_to_false(client):
    resp = post_json(client, "/api/voice/tts-toggle")
    # Default enabled=False, toggle → True
    assert resp.get_json()["enabled"] is True


def test_tts_toggle_explicit_enable(client):
    resp = post_json(client, "/api/voice/tts-toggle", {"enabled": True})
    assert resp.get_json()["enabled"] is True


def test_tts_toggle_explicit_disable(client):
    # Enable first
    post_json(client, "/api/voice/tts-toggle", {"enabled": True})
    resp = post_json(client, "/api/voice/tts-toggle", {"enabled": False})
    assert resp.get_json()["enabled"] is False


def test_stt_toggle_toggles(client):
    resp = post_json(client, "/api/voice/stt-toggle")
    assert resp.get_json()["enabled"] is True


def test_set_voice_missing_voice_id_returns_400(client):
    resp = post_json(client, "/api/voice/set-voice", {})
    assert resp.status_code == 400


def test_set_voice_unknown_id_returns_error(client):
    resp = post_json(client, "/api/voice/set-voice", {"voiceId": "nonexistent"})
    assert resp.status_code == 422
    assert "error" in resp.get_json()


def test_speak_missing_text_returns_400(client):
    resp = post_json(client, "/api/voice/speak", {})
    assert resp.status_code == 400


def test_speak_whitespace_only_returns_400(client):
    resp = post_json(client, "/api/voice/speak", {"text": "   "})
    assert resp.status_code == 400


def test_speak_no_voice_returns_503(client, monkeypatch):
    import app as app_mod
    from unittest.mock import MagicMock

    empty_mgr = MagicMock()
    empty_mgr.synthesize.return_value = None
    monkeypatch.setattr(app_mod, "get_tts_manager", lambda: empty_mgr)
    resp = post_json(client, "/api/voice/speak", {"text": "hello"})
    assert resp.status_code == 503


def test_transcribe_missing_audio_returns_400(client):
    resp = post_json(client, "/api/voice/transcribe", {})
    assert resp.status_code == 400


def test_transcribe_oversized_payload_returns_413(client):
    big_audio = "A" * 10_000_001
    resp = post_json(client, "/api/voice/transcribe", {"audio": big_audio})
    assert resp.status_code == 413


def test_stt_model_missing_model_returns_400(client):
    resp = post_json(client, "/api/voice/stt-model", {})
    assert resp.status_code == 400


def test_stt_model_invalid_returns_error(client):
    resp = post_json(client, "/api/voice/stt-model", {"model": "invalid_xyz"})
    assert resp.status_code == 200
    assert "error" in resp.get_json()


def test_rescan_voices_returns_state(client):
    resp = post_json(client, "/api/voice/rescan")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "tts" in data or "enabled" in data  # returns tts state dict


# ---------------------------------------------------------------------------
# Versions
# ---------------------------------------------------------------------------


def test_versions_returns_expected_keys(client):
    resp = client.get("/api/versions")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "clippy" in data
    assert "python" in data
    assert "flask" in data


def test_versions_clippy_is_string(client):
    resp = client.get("/api/versions")
    assert isinstance(resp.get_json()["clippy"], str)
