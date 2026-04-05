"""
Faster-Whisper STT manager — transcribes audio to text using CTranslate2.

The Whisper model is lazy-loaded on first transcribe() call to avoid
consuming RAM during app startup. Supports model hot-swapping.

Requires ffmpeg in PATH for non-WAV audio (e.g. WebM from browser MediaRecorder).
Install: sudo apt install -y ffmpeg
"""

import base64
import logging
import os
import tempfile
import threading
from typing import Optional

log = logging.getLogger(__name__)

ALLOWED_STT_MODELS = {"tiny", "base", "small", "medium", "large"}


class STTManager:
    """Manages a Faster-Whisper transcription model."""

    def __init__(self, model_size: str = "tiny", threads: int = 3):
        self._model = None
        self.model_size: Optional[str] = None
        self.threads = threads
        self.enabled: bool = False           # Off by default until user enables
        self._target_model_size = model_size  # Load this on first use

    def _ensure_loaded(self) -> bool:
        """Load the model if not already loaded. Returns True on success."""
        if self._model is not None:
            return True
        try:
            from faster_whisper import WhisperModel  # lazy import
            self._model = WhisperModel(
                self._target_model_size,
                device="cpu",
                compute_type="int8",
                cpu_threads=self.threads,
            )
            self.model_size = self._target_model_size
            return True
        except Exception as exc:
            log.error("Failed to load Whisper model %r: %s", self._target_model_size, exc)
            return False

    def load_model(self, model_size: str) -> dict:
        """Explicitly load or swap the transcription model."""
        if model_size not in ALLOWED_STT_MODELS:
            return {"error": f"invalid model {model_size!r}; allowed: {sorted(ALLOWED_STT_MODELS)}"}
        if model_size == self.model_size and self._model is not None:
            return {"status": "already_loaded", "model": model_size}
        try:
            from faster_whisper import WhisperModel
            self._model = WhisperModel(
                model_size,
                device="cpu",
                compute_type="int8",
                cpu_threads=self.threads,
            )
            self._target_model_size = model_size
            self.model_size = model_size
            return {"status": "loaded", "model": model_size}
        except Exception as exc:
            return {"error": str(exc)}

    def transcribe(self, audio_path: str, language: Optional[str] = None) -> dict:
        """
        Transcribe an audio file to text.
        Supports WAV, MP3, WebM, OGG (anything ffmpeg can read).
        Returns {"text": str, "language": str, "probability": float}.
        """
        if not self._ensure_loaded():
            return {"error": "model_not_available — install faster-whisper"}

        opts: dict = {"beam_size": 1, "best_of": 1}
        if language:
            opts["language"] = language

        try:
            segments, info = self._model.transcribe(audio_path, **opts)
            text = " ".join(s.text for s in segments).strip()
            return {
                "text": text,
                "language": info.language,
                "probability": round(info.language_probability, 3),
            }
        except Exception as exc:
            return {"error": str(exc)}

    def transcribe_base64(self, audio_b64: str,
                          language: Optional[str] = None) -> dict:
        """
        Decode a base64-encoded audio blob (e.g. WebM from browser MediaRecorder),
        write to a temp file, transcribe, then clean up.
        """
        try:
            audio_bytes = base64.b64decode(audio_b64)
        except Exception as exc:
            return {"error": f"base64_decode_failed: {exc}"}

        suffix = ".webm"
        fd, tmp_path = tempfile.mkstemp(suffix=suffix, prefix="clippy_stt_")
        try:
            os.write(fd, audio_bytes)
            os.close(fd)
            return self.transcribe(tmp_path, language=language)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    def get_state(self) -> dict:
        return {
            "enabled": self.enabled,
            "model": self.model_size or self._target_model_size,
            "available_models": sorted(ALLOWED_STT_MODELS),
        }


_stt: Optional[STTManager] = None
_stt_lock = threading.Lock()


def get_stt_manager() -> STTManager:
    """Return the global STTManager singleton."""
    global _stt
    if _stt is None:
        with _stt_lock:
            if _stt is None:
                _stt = STTManager()
    return _stt
