"""Tests for TTSManager and VoiceInfo."""

import io
import json
import sys
import wave
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from tts_manager import TTSManager, VoiceInfo

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_manager(voices_dir: Path) -> TTSManager:
    return TTSManager(voices_dir=voices_dir)


def create_voice_files(
    voices_dir: Path, voice_id: str, with_meta: bool = False
) -> Path:
    """Create a stub .onnx file (and optionally .meta.json) in voices_dir."""
    voices_dir.mkdir(parents=True, exist_ok=True)
    onnx = voices_dir / f"{voice_id}.onnx"
    onnx.write_bytes(
        b"\x00" * 2048
    )  # dummy content (minimum valid size for _scan validation)
    config = voices_dir / f"{voice_id}.onnx.json"
    config.write_text('{"key": "value"}')
    if with_meta:
        meta = voices_dir / f"{voice_id}.meta.json"
        meta.write_text(
            json.dumps(
                {
                    "name": "Test Voice",
                    "language": "fr",
                    "gender": "female",
                    "style": "happy",
                    "description": "A test voice",
                }
            )
        )
    return onnx


def make_piper_mock() -> MagicMock:
    """Return a (mock_piper, mock_config, mock_voice) triple for patching sys.modules."""
    mock_piper = MagicMock()
    mock_voice = MagicMock()
    mock_piper.PiperVoice.load.return_value = mock_voice
    mock_config = MagicMock()
    mock_config.SynthesisConfig = MagicMock(return_value=MagicMock())
    return mock_piper, mock_config, mock_voice


# ---------------------------------------------------------------------------
# VoiceInfo
# ---------------------------------------------------------------------------


def test_voice_info_to_dict(tmp_path):
    onnx = tmp_path / "test.onnx"
    onnx.write_bytes(b"\x00")
    info = VoiceInfo(
        "test-voice",
        onnx,
        None,
        {
            "name": "My Voice",
            "language": "en",
            "gender": "male",
            "style": "neutral",
            "description": "desc",
        },
    )
    d = info.to_dict()
    assert d["id"] == "test-voice"
    assert d["name"] == "My Voice"
    assert d["language"] == "en"
    assert d["gender"] == "male"
    assert d["style"] == "neutral"
    assert d["description"] == "desc"


def test_voice_info_defaults_from_id(tmp_path):
    onnx = tmp_path / "my-voice.onnx"
    onnx.write_bytes(b"\x00")
    info = VoiceInfo("my-voice", onnx, None, {})
    assert info.name == "My Voice"  # title-cased, hyphen removed
    assert info.language == "en"
    assert info.gender == "unknown"
    assert info.style == "neutral"


# ---------------------------------------------------------------------------
# Initial state
# ---------------------------------------------------------------------------


def test_get_state_initial_no_voices(tmp_path):
    mgr = make_manager(tmp_path / "voices")
    state = mgr.get_state()
    assert state["enabled"] is False
    assert state["currentVoice"] is None
    assert state["voices"] == {}


def test_scan_empty_directory_gives_empty_registry(tmp_path):
    voices = tmp_path / "voices"
    voices.mkdir()
    mgr = make_manager(voices)
    assert mgr.registry == {}


def test_scan_nonexistent_directory_gives_empty_registry(tmp_path):
    mgr = make_manager(tmp_path / "does_not_exist")
    assert mgr.registry == {}


# ---------------------------------------------------------------------------
# Voice discovery (_scan)
# ---------------------------------------------------------------------------


def test_scan_discovers_onnx_files(tmp_path):
    voices = tmp_path / "voices"
    create_voice_files(voices, "en-us-amy")
    mgr = make_manager(voices)
    assert "en-us-amy" in mgr.registry


def test_scan_ignores_onnx_json_files(tmp_path):
    voices = tmp_path / "voices"
    voices.mkdir()
    (voices / "config.onnx.json").write_text("{}")
    mgr = make_manager(voices)
    assert "config" not in mgr.registry  # .onnx.json files must be skipped


def test_scan_reads_meta_json(tmp_path):
    voices = tmp_path / "voices"
    create_voice_files(voices, "fr-voice", with_meta=True)
    mgr = make_manager(voices)
    info = mgr.registry["fr-voice"]
    assert info.name == "Test Voice"
    assert info.language == "fr"
    assert info.gender == "female"


def test_scan_handles_missing_meta(tmp_path):
    voices = tmp_path / "voices"
    create_voice_files(voices, "no-meta")
    mgr = make_manager(voices)
    info = mgr.registry["no-meta"]
    assert info.language == "en"  # default


def test_scan_handles_corrupt_meta(tmp_path):
    voices = tmp_path / "voices"
    create_voice_files(voices, "bad-meta")
    (voices / "bad-meta.meta.json").write_text("NOT JSON")
    mgr = make_manager(voices)
    assert "bad-meta" in mgr.registry  # still discovered, just uses defaults


def test_scan_skips_onnx_file_below_1kb(tmp_path):
    """Files under 1 KB must be excluded from registry (likely corrupted)."""
    voices = tmp_path / "voices"
    voices.mkdir()
    (voices / "tiny-voice.onnx").write_bytes(b"\x00" * 1023)
    (voices / "tiny-voice.onnx.json").write_text("{}")
    mgr = make_manager(voices)
    assert "tiny-voice" not in mgr.registry


def test_scan_includes_onnx_file_at_exact_1kb(tmp_path):
    """A file at exactly 1024 bytes must be included (boundary condition)."""
    voices = tmp_path / "voices"
    voices.mkdir()
    (voices / "edge-voice.onnx").write_bytes(b"\x00" * 1024)
    (voices / "edge-voice.onnx.json").write_text("{}")
    mgr = make_manager(voices)
    assert "edge-voice" in mgr.registry


def test_scan_warns_on_small_file_and_keeps_valid_sibling(tmp_path, caplog):
    """Small file emits a warning; only it is skipped — valid sibling is kept."""
    import logging

    voices = tmp_path / "voices"
    voices.mkdir()
    (voices / "bad-voice.onnx").write_bytes(b"\x00" * 500)
    (voices / "bad-voice.onnx.json").write_text("{}")
    create_voice_files(voices, "good-voice")

    with caplog.at_level(logging.WARNING, logger="tts_manager"):
        mgr = make_manager(voices)

    assert "bad-voice" not in mgr.registry
    assert "good-voice" in mgr.registry
    assert any("bad-voice" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# Voice loading
# ---------------------------------------------------------------------------


def test_load_voice_not_in_registry(tmp_path):
    mgr = make_manager(tmp_path / "voices")
    result = mgr.load_voice("nonexistent")
    assert "error" in result
    assert "available" in result


def test_load_voice_success(tmp_path):
    voices = tmp_path / "voices"
    create_voice_files(voices, "en-test")
    mock_piper, mock_config, _ = make_piper_mock()

    with patch.dict(sys.modules, {"piper": mock_piper, "piper.config": mock_config}):
        mgr = make_manager(voices)
        result = mgr.load_voice("en-test")

    assert result["status"] == "loaded"
    assert result["voice"] == "en-test"


def test_load_voice_already_loaded(tmp_path):
    voices = tmp_path / "voices"
    create_voice_files(voices, "en-test2")
    mock_piper, mock_config, _ = make_piper_mock()

    with patch.dict(sys.modules, {"piper": mock_piper, "piper.config": mock_config}):
        mgr = make_manager(voices)
        mgr.load_voice("en-test2")
        result = mgr.load_voice("en-test2")  # second call

    assert result["status"] == "already_loaded"
    assert result["voice"] == "en-test2"


def test_load_voice_error(tmp_path):
    voices = tmp_path / "voices"
    create_voice_files(voices, "bad-voice")
    mock_piper = MagicMock()
    mock_piper.PiperVoice.load.side_effect = RuntimeError("model corrupt")

    with patch.dict(sys.modules, {"piper": mock_piper}):
        mgr = make_manager(voices)
        result = mgr.load_voice("bad-voice")

    assert "error" in result
    assert "model corrupt" in result["error"]
    assert mgr.current_voice_id is None


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------


def test_synthesize_returns_none_with_no_registry(tmp_path):
    mgr = make_manager(tmp_path / "voices")
    result = mgr.synthesize("hello")
    assert result is None


def test_synthesize_returns_wav_bytes(tmp_path):
    voices = tmp_path / "voices"
    create_voice_files(voices, "synth-voice")
    mock_piper, mock_config, mock_voice = make_piper_mock()

    # Make synthesize_wav() write a minimal WAV header to the wav_writer
    def fake_synthesize_wav(text, wav_writer, **kwargs):
        wav_writer.setnchannels(1)
        wav_writer.setsampwidth(2)
        wav_writer.setframerate(22050)
        wav_writer.writeframes(b"\x00" * 100)

    mock_voice.synthesize_wav.side_effect = fake_synthesize_wav

    with patch.dict(sys.modules, {"piper": mock_piper, "piper.config": mock_config}):
        mgr = make_manager(voices)
        mgr.load_voice("synth-voice")
        result = mgr.synthesize("Hello world")

    assert result is not None
    assert isinstance(result, bytes)
    assert len(result) > 0


def test_synthesize_error_returns_none(tmp_path):
    voices = tmp_path / "voices"
    create_voice_files(voices, "err-voice")
    mock_piper, mock_config, mock_voice = make_piper_mock()

    def _raise(text, wav_writer, **kwargs):
        raise RuntimeError("synthesis failed")

    mock_voice.synthesize_wav.side_effect = _raise

    with patch.dict(sys.modules, {"piper": mock_piper, "piper.config": mock_config}):
        mgr = make_manager(voices)
        mgr.load_voice("err-voice")
        result = mgr.synthesize("text")

    assert result is None


# ---------------------------------------------------------------------------
# Rescan
# ---------------------------------------------------------------------------


def test_rescan_discovers_new_voices(tmp_path):
    voices = tmp_path / "voices"
    voices.mkdir()
    mgr = make_manager(voices)
    assert mgr.registry == {}

    create_voice_files(voices, "new-voice")
    mgr.rescan()
    assert "new-voice" in mgr.registry


def test_get_state_auto_discovers_voices_added_after_startup(tmp_path):
    """get_state() must pick up voices dropped in after the manager was built.

    Reproduces the field bug: the long-running server scanned an empty dir at
    startup, then setup_voices.sh populated it hours later and the UI showed no
    voices until a manual rescan/restart.
    """
    voices = tmp_path / "voices"
    voices.mkdir()
    mgr = make_manager(voices)
    assert mgr.get_state()["voices"] == {}  # empty at startup

    create_voice_files(voices, "late-voice")
    state = mgr.get_state()  # no manual rescan
    assert "late-voice" in state["voices"]


def test_get_state_auto_drops_removed_voice(tmp_path):
    """A voice deleted from disk disappears from state on the next poll."""
    voices = tmp_path / "voices"
    create_voice_files(voices, "doomed-voice")
    mgr = make_manager(voices)
    assert "doomed-voice" in mgr.get_state()["voices"]

    (voices / "doomed-voice.onnx").unlink()
    assert "doomed-voice" not in mgr.get_state()["voices"]


def test_maybe_rescan_skips_when_dir_unchanged(tmp_path):
    """Unchanged dir mtime must not trigger a rebuild (cheap polling)."""
    voices = tmp_path / "voices"
    create_voice_files(voices, "stable-voice")
    mgr = make_manager(voices)

    with patch.object(mgr, "_build_registry") as build:
        mgr.get_state()  # mtime unchanged since construction
        build.assert_not_called()


def test_scan_clears_selected_voice_when_removed_from_disk(tmp_path):
    """A rescan that loses the current voice must clear current_voice_id."""
    voices = tmp_path / "voices"
    create_voice_files(voices, "selected-voice")
    mgr = make_manager(voices)
    mgr.current_voice_id = "selected-voice"

    (voices / "selected-voice.onnx").unlink()
    mgr.rescan()
    assert mgr.current_voice_id is None


def test_list_voices_returns_serializable(tmp_path):
    voices = tmp_path / "voices"
    create_voice_files(voices, "list-voice", with_meta=True)
    mgr = make_manager(voices)
    listing = mgr.list_voices()
    assert "list-voice" in listing
    assert "name" in listing["list-voice"]
