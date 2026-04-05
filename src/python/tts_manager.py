"""
Piper TTS manager — scans ~/.config/Clippy/voices/ for .onnx voice models,
loads them lazily, and synthesizes text to WAV bytes.

Voices must be downloaded separately (see scripts/setup_voices.sh).
Each voice is an .onnx file + a .onnx.json config file in the same directory.
An optional .meta.json file alongside provides display metadata.
"""

import io
import json
import logging
import threading
import wave
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

VOICES_DIR = Path.home() / ".config" / "Clippy" / "voices"


class VoiceInfo:
    """Lightweight metadata for a discovered voice — no model loaded yet."""

    def __init__(self, voice_id: str, model_path: Path,
                 config_path: Optional[Path], meta: dict):
        self.id = voice_id
        self.model_path = model_path
        self.config_path = config_path
        self.name = meta.get("name", voice_id.replace("-", " ").title())
        self.description = meta.get("description", "")
        self.language = meta.get("language", "en")
        self.gender = meta.get("gender", "unknown")
        self.style = meta.get("style", "neutral")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "language": self.language,
            "gender": self.gender,
            "style": self.style,
        }


class TTSManager:
    """
    Manages Piper TTS voices. Models are lazy-loaded on first use.
    Thread safety: synthesize() is called from Flask request threads;
    load_voice() acquires no lock but is idempotent for the same voice_id.
    """

    def __init__(self, voices_dir: Path = VOICES_DIR):
        self.voices_dir = voices_dir
        self.registry: dict[str, VoiceInfo] = {}
        self._loaded_voice = None          # PiperVoice instance
        self.current_voice_id: Optional[str] = None
        self.enabled: bool = False         # Off by default until user enables
        self._lock = threading.Lock()      # Guards _loaded_voice across Flask threads
        self._scan()

    def _scan(self) -> None:
        """Discover .onnx voice models in voices_dir."""
        if not self.voices_dir.exists():
            return
        try:
            entries = list(self.voices_dir.iterdir())
        except PermissionError as exc:
            log.error("Cannot read voices directory %s: %s", self.voices_dir, exc)
            return
        for f in entries:
            if f.suffix != ".onnx" or f.name.endswith(".onnx.json"):
                continue
            voice_id = f.stem
            config = f.parent / f"{f.name}.json"
            meta_path = f.parent / f"{voice_id}.meta.json"
            meta: dict = {}
            if meta_path.exists():
                try:
                    meta = json.loads(meta_path.read_text())
                except Exception:
                    pass
            self.registry[voice_id] = VoiceInfo(
                voice_id, f,
                config if config.exists() else None,
                meta,
            )

    def rescan(self) -> None:
        """Re-scan voices dir (called after setup_voices.sh)."""
        self.registry.clear()
        self._scan()

    def load_voice(self, voice_id: str) -> dict:
        """Load (or hot-swap) a Piper voice model. Returns status dict."""
        with self._lock:
            if voice_id == self.current_voice_id and self._loaded_voice is not None:
                return {"status": "already_loaded", "voice": voice_id}
            if voice_id not in self.registry:
                return {
                    "error": f"unknown_voice: {voice_id}",
                    "available": list(self.registry.keys()),
                }
            info = self.registry[voice_id]
            try:
                from piper import PiperVoice  # lazy import — only load piper if TTS used
                self._loaded_voice = PiperVoice.load(
                    str(info.model_path),
                    config_path=str(info.config_path) if info.config_path else None,
                )
                self.current_voice_id = voice_id
                return {"status": "loaded", "voice": voice_id}
            except Exception as exc:
                log.error("Failed to load voice %r: %s", voice_id, exc)
                return {"error": str(exc)}

    def synthesize(self, text: str, length_scale: float = 1.0) -> Optional[bytes]:
        """
        Synthesize text to WAV bytes. Returns None if no voice is loaded.
        length_scale > 1.0 = slower speech, < 1.0 = faster.
        """
        if self._loaded_voice is None:
            # Auto-load the first available voice if none is set
            if self.registry:
                result = self.load_voice(next(iter(self.registry)))
                if "error" in result:
                    return None
            else:
                return None

        buf = io.BytesIO()
        wav_writer = wave.open(buf, "wb")
        try:
            self._loaded_voice.synthesize(
                text,
                wav_writer,
                length_scale=length_scale,
                sentence_silence=0.2,
            )
        except Exception as exc:
            log.error("TTS synthesis failed: %s", exc)
            return None
        finally:
            wav_writer.close()  # Don't use context manager — would close buf too
        return buf.getvalue()

    def list_voices(self) -> dict:
        """Return voice registry as a serialisable dict."""
        return {vid: v.to_dict() for vid, v in self.registry.items()}

    def get_state(self) -> dict:
        return {
            "enabled": self.enabled,
            "currentVoice": self.current_voice_id,
            "voices": self.list_voices(),
        }


_tts: Optional[TTSManager] = None


def get_tts_manager() -> TTSManager:
    """Return the global TTSManager singleton."""
    global _tts
    if _tts is None:
        _tts = TTSManager()
    return _tts
