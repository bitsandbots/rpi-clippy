"""
Piper TTS manager — scans ~/.config/Sprout/voices/ for .onnx voice models,
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

VOICES_DIR = Path.home() / ".config" / "Sprout" / "voices"


class VoiceInfo:
    """Lightweight metadata for a discovered voice — no model loaded yet."""

    def __init__(
        self, voice_id: str, model_path: Path, config_path: Optional[Path], meta: dict
    ):
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
        self._dir_mtime: Optional[float] = None  # voices_dir mtime at last scan
        self._loaded_voice = None  # PiperVoice instance
        self.current_voice_id: Optional[str] = None
        self.enabled: bool = False  # Off by default until user enables
        self._lock = threading.Lock()  # Guards _loaded_voice across Flask threads
        self._scan()

    def _current_dir_mtime(self) -> Optional[float]:
        """Modification time of voices_dir, or None if it does not exist."""
        try:
            return self.voices_dir.stat().st_mtime
        except OSError:
            return None

    def _build_registry(self) -> dict[str, VoiceInfo]:
        """Discover .onnx voice models in voices_dir. Returns a fresh registry."""
        registry: dict[str, VoiceInfo] = {}
        if not self.voices_dir.exists():
            return registry
        try:
            entries = list(self.voices_dir.iterdir())
        except PermissionError as exc:
            log.error("Cannot read voices directory %s: %s", self.voices_dir, exc)
            return registry
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
            # Check if file is valid by checking its size (corrupted files are often 0 or very small)
            file_size = f.stat().st_size
            if file_size < 1024:  # Less than 1KB is likely corrupted
                log.warning(
                    "Skipping voice %s: file too small (%d bytes)", voice_id, file_size
                )
                continue
            registry[voice_id] = VoiceInfo(
                voice_id,
                f,
                config if config.exists() else None,
                meta,
            )
        return registry

    def _scan(self) -> None:
        """(Re)build the voice registry and remember voices_dir's mtime.

        The new registry is built into a local dict and swapped in with a single
        atomic assignment, so concurrent readers never observe a half-populated
        registry (the old clear()-then-populate had an empty window).
        """
        self.registry = self._build_registry()
        self._dir_mtime = self._current_dir_mtime()
        # Drop the selected voice if it was removed from disk.
        if self.current_voice_id and self.current_voice_id not in self.registry:
            self.current_voice_id = None

    def _maybe_rescan(self) -> None:
        """Re-scan only if voices_dir changed since the last scan.

        TTSManager is a process-lifetime singleton, so voices added or removed
        after startup (e.g. by setup_voices.sh) would otherwise stay invisible
        until a manual rescan or server restart. Adding/removing a file bumps
        the directory's mtime, which lets us catch the change cheaply (one stat)
        on the next state poll — no manual "Rescan Voices" click required.
        """
        if self._current_dir_mtime() != self._dir_mtime:
            self._scan()

    def rescan(self) -> None:
        """Force a re-scan of voices_dir (called after setup_voices.sh)."""
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
                from piper import (
                    PiperVoice,
                )  # lazy import — only load piper if TTS used

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
        with self._lock:
            if self._loaded_voice is None:
                # Auto-load the first available voice if none is set
                if not self.registry:
                    return None
                voice_id = next(iter(self.registry))
                info = self.registry[voice_id]
                try:
                    from piper import PiperVoice

                    self._loaded_voice = PiperVoice.load(
                        str(info.model_path),
                        config_path=str(info.config_path) if info.config_path else None,
                    )
                    self.current_voice_id = voice_id
                except Exception as exc:
                    log.error("Auto-load of voice %r failed: %s", voice_id, exc)
                    return None
            voice = self._loaded_voice  # capture reference while holding lock

        buf = io.BytesIO()
        wav_writer = wave.open(buf, "wb")
        try:
            from piper.config import SynthesisConfig

            syn_config = SynthesisConfig(length_scale=length_scale)
            voice.synthesize_wav(text, wav_writer, syn_config=syn_config)
        except Exception as exc:
            log.error("TTS synthesis failed: %s", exc)
            try:
                wav_writer.close()
            except Exception:
                pass
            return None
        wav_writer.close()  # Don't use context manager — would close buf too
        return buf.getvalue()

    def list_voices(self) -> dict:
        """Return voice registry as a serialisable dict."""
        return {vid: v.to_dict() for vid, v in self.registry.items()}

    def get_state(self) -> dict:
        self._maybe_rescan()  # pick up voices added/removed since startup
        return {
            "enabled": self.enabled,
            "currentVoice": self.current_voice_id,
            "voices": self.list_voices(),
        }


_tts: Optional[TTSManager] = None
_tts_lock = threading.Lock()


def get_tts_manager() -> TTSManager:
    """Return the global TTSManager singleton."""
    global _tts
    if _tts is None:
        with _tts_lock:
            if _tts is None:
                tts = TTSManager()
                # Restore persisted voice preferences
                from settings_manager import get_settings

                settings = get_settings()
                tts.enabled = bool(settings.get("ttsEnabled"))
                voice_id = settings.get("selectedVoice")
                if voice_id and voice_id in tts.registry:
                    tts.current_voice_id = voice_id
                    # Auto-load the persisted voice on startup
                    tts.load_voice(voice_id)
                _tts = tts
    return _tts
