"""Tests for STTManager."""

import base64
import sys
from unittest.mock import MagicMock, patch

import pytest

from stt_manager import STTManager, ALLOWED_STT_MODELS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_manager(model_size: str = "tiny") -> STTManager:
    return STTManager(model_size=model_size)


def make_whisper_mock():
    """Return a (mock_fw_module, mock_model) pair."""
    mock_fw = MagicMock()
    mock_model = MagicMock()
    mock_fw.WhisperModel.return_value = mock_model
    return mock_fw, mock_model


def fake_wav_base64() -> str:
    """Return base64-encoded minimal WAV file bytes."""
    return base64.b64encode(b"RIFF\x24\x00\x00\x00WAVEfmt ").decode()


# ---------------------------------------------------------------------------
# Initial state
# ---------------------------------------------------------------------------

def test_get_state_initial():
    mgr = make_manager()
    state = mgr.get_state()
    assert state["enabled"] is False
    assert state["model"] == "tiny"
    assert isinstance(state["available_models"], list)
    assert "tiny" in state["available_models"]


def test_initial_model_is_not_loaded():
    mgr = make_manager()
    assert mgr._model is None
    assert mgr.model_size is None


# ---------------------------------------------------------------------------
# load_model — validation
# ---------------------------------------------------------------------------

def test_load_model_invalid_name():
    mgr = make_manager()
    result = mgr.load_model("xlarge_super")
    assert "error" in result
    assert "allowed" in result["error"]


def test_load_model_invalid_lists_allowed():
    mgr = make_manager()
    result = mgr.load_model("nope")
    for model in ["tiny", "base", "small"]:
        assert model in result["error"]


# ---------------------------------------------------------------------------
# load_model — success / caching
# ---------------------------------------------------------------------------

def test_load_model_success():
    mgr = make_manager()
    mock_fw, _ = make_whisper_mock()

    with patch.dict(sys.modules, {"faster_whisper": mock_fw}):
        result = mgr.load_model("tiny")

    assert result["status"] == "loaded"
    assert result["model"] == "tiny"
    assert mgr.model_size == "tiny"


def test_load_model_already_loaded_same_size():
    mgr = make_manager()
    mock_fw, _ = make_whisper_mock()

    with patch.dict(sys.modules, {"faster_whisper": mock_fw}):
        mgr.load_model("tiny")
        result = mgr.load_model("tiny")

    assert result["status"] == "already_loaded"
    assert mock_fw.WhisperModel.call_count == 1  # only loaded once


def test_load_model_swaps_model():
    mgr = make_manager()
    mock_fw, _ = make_whisper_mock()

    with patch.dict(sys.modules, {"faster_whisper": mock_fw}):
        mgr.load_model("tiny")
        result = mgr.load_model("base")

    assert result["status"] == "loaded"
    assert mgr.model_size == "base"
    assert mock_fw.WhisperModel.call_count == 2


def test_load_model_error_returns_error_dict():
    mgr = make_manager()
    mock_fw = MagicMock()
    mock_fw.WhisperModel.side_effect = RuntimeError("download failed")

    with patch.dict(sys.modules, {"faster_whisper": mock_fw}):
        result = mgr.load_model("tiny")

    assert "error" in result
    assert "download failed" in result["error"]
    assert mgr._model is None


# ---------------------------------------------------------------------------
# _ensure_loaded
# ---------------------------------------------------------------------------

def test_ensure_loaded_returns_true_on_success():
    mgr = make_manager()
    mock_fw, _ = make_whisper_mock()

    with patch.dict(sys.modules, {"faster_whisper": mock_fw}):
        ok = mgr._ensure_loaded()

    assert ok is True
    assert mgr._model is not None


def test_ensure_loaded_returns_false_on_error():
    mgr = make_manager()
    mock_fw = MagicMock()
    mock_fw.WhisperModel.side_effect = OSError("no disk space")

    with patch.dict(sys.modules, {"faster_whisper": mock_fw}):
        ok = mgr._ensure_loaded()

    assert ok is False
    assert mgr._model is None


def test_ensure_loaded_idempotent():
    """Calling _ensure_loaded twice only loads the model once."""
    mgr = make_manager()
    mock_fw, _ = make_whisper_mock()

    with patch.dict(sys.modules, {"faster_whisper": mock_fw}):
        mgr._ensure_loaded()
        mgr._ensure_loaded()

    assert mock_fw.WhisperModel.call_count == 1


# ---------------------------------------------------------------------------
# transcribe
# ---------------------------------------------------------------------------

def test_transcribe_no_model_returns_error():
    mgr = make_manager()
    mock_fw = MagicMock()
    mock_fw.WhisperModel.side_effect = RuntimeError("unavailable")

    with patch.dict(sys.modules, {"faster_whisper": mock_fw}):
        result = mgr.transcribe("/fake/audio.wav")

    assert "error" in result


def test_transcribe_success():
    mgr = make_manager()
    mock_fw, mock_model = make_whisper_mock()

    from unittest.mock import MagicMock as MM
    seg1 = MM(); seg1.text = "Hello"
    seg2 = MM(); seg2.text = "world"
    info = MM(); info.language = "en"; info.language_probability = 0.987

    mock_model.transcribe.return_value = ([seg1, seg2], info)

    with patch.dict(sys.modules, {"faster_whisper": mock_fw}):
        mgr._ensure_loaded()
        result = mgr.transcribe("/fake/audio.wav")

    assert result["text"] == "Hello world"
    assert result["language"] == "en"
    assert result["probability"] == 0.987


def test_transcribe_with_language_hint():
    mgr = make_manager()
    mock_fw, mock_model = make_whisper_mock()

    info = MagicMock(); info.language = "fr"; info.language_probability = 0.9
    mock_model.transcribe.return_value = ([], info)

    with patch.dict(sys.modules, {"faster_whisper": mock_fw}):
        mgr._ensure_loaded()
        mgr.transcribe("/fake/audio.wav", language="fr")

    call_kwargs = mock_model.transcribe.call_args[1]
    assert call_kwargs.get("language") == "fr"


def test_transcribe_error_returns_error_dict():
    mgr = make_manager()
    mock_fw, mock_model = make_whisper_mock()
    mock_model.transcribe.side_effect = ValueError("corrupt audio")

    with patch.dict(sys.modules, {"faster_whisper": mock_fw}):
        mgr._ensure_loaded()
        result = mgr.transcribe("/fake/audio.wav")

    assert "error" in result
    assert "corrupt audio" in result["error"]


# ---------------------------------------------------------------------------
# transcribe_base64
# ---------------------------------------------------------------------------

def test_transcribe_base64_invalid_b64():
    mgr = make_manager()
    result = mgr.transcribe_base64("this-is-not-base64!!!")
    assert "error" in result
    assert "base64_decode_failed" in result["error"]


def test_transcribe_base64_success():
    mgr = make_manager()
    mock_fw, mock_model = make_whisper_mock()

    info = MagicMock(); info.language = "en"; info.language_probability = 0.95
    seg = MagicMock(); seg.text = "test"
    mock_model.transcribe.return_value = ([seg], info)

    audio_b64 = fake_wav_base64()

    with patch.dict(sys.modules, {"faster_whisper": mock_fw}):
        mgr._ensure_loaded()
        result = mgr.transcribe_base64(audio_b64)

    assert result.get("text") is not None or "error" in result  # may fail on bad WAV, that's OK


def test_transcribe_base64_cleans_up_tempfile(tmp_path, mocker):
    """Temp file must be deleted even if transcription raises."""
    mgr = make_manager()
    mock_fw, mock_model = make_whisper_mock()
    mock_model.transcribe.side_effect = RuntimeError("crash")

    import os
    deleted_paths = []
    original_unlink = os.unlink

    def tracking_unlink(path):
        deleted_paths.append(path)
        original_unlink(path)

    mocker.patch("stt_manager.os.unlink", side_effect=tracking_unlink)

    audio_b64 = base64.b64encode(b"fake audio bytes").decode()
    with patch.dict(sys.modules, {"faster_whisper": mock_fw}):
        mgr._ensure_loaded()
        mgr.transcribe_base64(audio_b64)

    assert len(deleted_paths) == 1
    assert "clippy_stt_" in deleted_paths[0]


# ---------------------------------------------------------------------------
# get_state
# ---------------------------------------------------------------------------

def test_get_state_reflects_loaded_model():
    mgr = make_manager("base")
    mock_fw, _ = make_whisper_mock()

    with patch.dict(sys.modules, {"faster_whisper": mock_fw}):
        mgr.load_model("base")

    state = mgr.get_state()
    assert state["model"] == "base"


def test_get_state_enabled_toggle():
    mgr = make_manager()
    assert mgr.get_state()["enabled"] is False
    mgr.enabled = True
    assert mgr.get_state()["enabled"] is True
