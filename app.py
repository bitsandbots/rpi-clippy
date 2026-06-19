#!/usr/bin/env python3
"""
Sprout Flask server — replaces the Electron main process.
Serves the React SPA and exposes a REST/SSE API for the frontend.

Usage:
  python3 app.py

Opens on http://localhost:5080 (also accessible from LAN via http://<pi-ip>:5080).
"""

import importlib
import json
import os
import re
import sys
import threading
import time
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory

# Allow importing from src/python/
sys.path.insert(0, str(Path(__file__).parent / "src" / "python"))

from chat_manager import get_chat_manager
from ollama_service import get_ollama_service, set_ollama_base
from settings_manager import get_debug_settings, get_settings
from tts_manager import get_tts_manager
from stt_manager import get_stt_manager
from garden_service import get_garden_service

PORT = 5080
DIST_DIR = Path(__file__).parent / "dist"
VERSION = "0.5.0"

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024  # reject bodies >20 MB before route handlers run

_CHAT_ID_RE = re.compile(r"^[A-Za-z0-9_\-]+$")
_MAX_MESSAGES_PER_CHAT = 1000
_MAX_PAYLOAD_SIZE = 10_000_000  # 10MB limit for chat write


def _valid_chat_id(chat_id: str) -> bool:
    """Reject chat IDs that could escape the chats directory."""
    return bool(_CHAT_ID_RE.match(chat_id))


def _validate_chat_payload(body: dict) -> tuple[bool, str]:
    """Validate chat payload size and message count.
    Returns (is_valid, error_message).
    """
    try:
        # Check total payload size
        payload_size = len(json.dumps(body))
        if payload_size > _MAX_PAYLOAD_SIZE:
            return (
                False,
                f"payload too large ({payload_size} > {_MAX_PAYLOAD_SIZE} bytes)",
            )

        # Check message count
        messages = body.get("messages", [])
        if len(messages) > _MAX_MESSAGES_PER_CHAT:
            return (
                False,
                f"too many messages ({len(messages)} > {_MAX_MESSAGES_PER_CHAT})",
            )

        return True, ""
    except Exception:
        return False, "payload validation error"


# ---------------------------------------------------------------------------
# SPA serving
# ---------------------------------------------------------------------------


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_spa(path):
    """Serve the React build. Static assets are in dist/assets/."""
    # Don't intercept API calls
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404

    assets = DIST_DIR / "assets"
    if path and path.startswith("assets/") and (DIST_DIR / path).exists():
        return send_from_directory(str(DIST_DIR), path)

    index = DIST_DIR / "index.html"
    if index.exists():
        return index.read_text(), 200, {
            "Content-Type": "text/html",
            "Cache-Control": "no-cache, no-store, must-revalidate",
        }

    return (
        "<h1>Sprout</h1><p>Run <code>npm run build</code> first, then restart.</p>",
        200,
        {"Content-Type": "text/html"},
    )


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------


@app.route("/api/state", methods=["GET"])
def get_state():
    """Return full SharedState (models + settings)."""
    svc = get_ollama_service()
    settings = get_settings()
    return jsonify(
        {
            "models": svc.get_model_state(),
            "settings": settings.get_all(),
        }
    )


@app.route("/api/state", methods=["POST"])
def set_state():
    """Set a single settings key. Body: {key, value}."""
    body = request.get_json(force=True) or {}
    key = body.get("key", "")
    value = body.get("value")
    if not key:
        return jsonify({"error": "key required"}), 400
    get_settings().set(key, value)
    return jsonify({"status": "ok"})


@app.route("/api/debug-state", methods=["GET"])
def get_debug_state():
    return jsonify(get_debug_settings().get_all())


@app.route("/api/debug-state", methods=["POST"])
def set_debug_state():
    body = request.get_json(force=True) or {}
    key = body.get("key", "")
    value = body.get("value")
    if not key:
        return jsonify({"error": "key required"}), 400
    get_debug_settings().set(key, value)
    return jsonify({"status": "ok"})


# ---------------------------------------------------------------------------
# Chats
# ---------------------------------------------------------------------------


@app.route("/api/chats", methods=["GET"])
def get_chats():
    return jsonify(get_chat_manager().get_records())


@app.route("/api/chats", methods=["DELETE"])
def delete_all_chats():
    get_chat_manager().delete_all()
    return jsonify({"status": "ok"})


@app.route("/api/chats/<chat_id>", methods=["GET"])
def get_chat(chat_id):
    if not _valid_chat_id(chat_id):
        return jsonify({"error": "invalid chat_id"}), 400
    data = get_chat_manager().get_with_messages(chat_id)
    if data is None:
        return jsonify({"error": "Not found"}), 404
    return jsonify(data)


@app.route("/api/chats/<chat_id>", methods=["POST"])
def write_chat(chat_id):
    if not _valid_chat_id(chat_id):
        return jsonify({"error": "invalid chat_id"}), 400
    body = request.get_json(force=True) or {}
    chat = body.get("chat") or {}
    if not chat.get("id"):
        chat["id"] = chat_id
        body["chat"] = chat

    # Validate payload
    is_valid, error_msg = _validate_chat_payload(body)
    if not is_valid:
        return jsonify({"error": error_msg}), 413

    get_chat_manager().write(body)
    return jsonify({"status": "ok"})


@app.route("/api/chats/<chat_id>", methods=["DELETE"])
def delete_chat(chat_id):
    if not _valid_chat_id(chat_id):
        return jsonify({"error": "invalid chat_id"}), 400
    get_chat_manager().delete(chat_id)
    return jsonify({"status": "ok"})


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


@app.route("/api/models", methods=["GET"])
def get_models():
    return jsonify(get_ollama_service().get_model_state())


@app.route("/api/models/refresh", methods=["POST"])
def refresh_models():
    svc = get_ollama_service()
    svc.refresh_available()
    return jsonify(svc.get_model_state())


@app.route("/api/models/download", methods=["POST"])
def download_model():
    body = request.get_json(force=True) or {}
    tag = body.get("tag", "")
    name = body.get("name", "")
    if not tag and not name:
        return jsonify({"error": "tag or name required"}), 400
    svc = get_ollama_service()
    if name:
        threading.Thread(target=svc.pull_model_by_name, args=(name,), daemon=True).start()
    else:
        threading.Thread(target=svc.pull_model_by_tag, args=(tag,), daemon=True).start()
    return jsonify({"status": "ok"})


@app.route("/api/models/delete", methods=["POST"])
def delete_model():
    body = request.get_json(force=True) or {}
    name = body.get("name", "")
    if not name:
        return jsonify({"error": "name required"}), 400
    try:
        get_ollama_service().delete_model_by_name(name)
        return jsonify({"status": "ok"})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/models/remove", methods=["POST"])
def remove_model():
    body = request.get_json(force=True) or {}
    name = body.get("name", "")
    if not name:
        return jsonify({"error": "name required"}), 400
    get_ollama_service().remove_model_by_name(name)
    return jsonify({"status": "ok"})


@app.route("/api/models/delete-all", methods=["POST"])
def delete_all_models():
    try:
        get_ollama_service().delete_all_models()
        return jsonify({"status": "ok"})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/models/pull-progress")
def pull_progress_sse():
    """SSE stream — broadcasts pull progress events to all connected subscribers."""
    svc = get_ollama_service()
    q = svc.subscribe_pull_events()

    def generate():
        try:
            while True:
                try:
                    event = q.get(timeout=30)
                    yield f"data: {json.dumps(event)}\n\n"
                except Exception:
                    # Send a keepalive comment so the browser doesn't disconnect
                    yield ": keepalive\n\n"
        finally:
            svc.unsubscribe_pull_events(q)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Ollama connectivity
# ---------------------------------------------------------------------------


@app.route("/api/ollama/status")
def ollama_status():
    """Return Ollama URL, connection status, and running model tag."""
    import ollama_service as _osvc
    import requests as _req

    url = get_settings().get("ollamaUrl") or _osvc.OLLAMA_BASE
    connected = False
    active_model = None
    try:
        resp = _req.get(f"{url}/api/ps", timeout=3)
        if resp.ok:
            connected = True
            models = resp.json().get("models", [])
            if models:
                active_model = models[0].get("name")
    except Exception:
        pass
    return jsonify({"url": url, "connected": connected, "activeModel": active_model})


@app.route("/api/ollama/url", methods=["POST"])
def set_ollama_url():
    """Persist a new Ollama base URL and apply it immediately."""
    from urllib.parse import urlparse

    body = request.get_json(force=True) or {}
    url = (body.get("url") or "").strip().rstrip("/")
    if not url:
        return jsonify({"error": "url required"}), 400
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return jsonify({"error": "url must use http or https scheme"}), 400
    get_settings().set("ollamaUrl", url)
    set_ollama_base(url)
    # Refresh model cache for new server and return updated state
    svc = get_ollama_service()
    svc.refresh_available()
    return jsonify({"status": "ok", "url": url, "models": svc.get_model_state()})


@app.route("/api/ollama/discover")
def ollama_discover():
    """Scan the local subnet for Ollama instances (port 11434)."""
    import concurrent.futures
    import ipaddress
    import socket
    import requests as _req

    def _get_local_subnet():
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            net = ipaddress.IPv4Network(f"{local_ip}/24", strict=False)
            return [str(h) for h in net.hosts()]
        except Exception:
            return []

    def _probe(ip):
        try:
            url = f"http://{ip}:11434"
            resp = _req.get(f"{url}/api/tags", timeout=1)
            if resp.ok:
                return {"url": url, "ip": ip}
        except Exception:
            pass
        return None

    hosts = _get_local_subnet()
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=32)
    try:
        futures = [executor.submit(_probe, h) for h in hosts]
        done, _ = concurrent.futures.wait(futures, timeout=2)
        results = [r for f in done if (r := f.result()) is not None]
    finally:
        executor.shutdown(wait=False, cancel_futures=True)
    return jsonify({"instances": results})


# ---------------------------------------------------------------------------
# LLM
# ---------------------------------------------------------------------------


@app.route("/api/llm/create", methods=["POST"])
def llm_create():
    body = request.get_json(force=True) or {}
    get_ollama_service().create_session(body)
    return jsonify({"status": "ok"})


@app.route("/api/llm/destroy", methods=["POST"])
def llm_destroy():
    get_ollama_service().destroy_session()
    return jsonify({"status": "ok"})


@app.route("/api/llm/abort", methods=["POST"])
def llm_abort():
    body = request.get_json(force=True) or {}
    uuid = body.get("uuid", "")
    get_ollama_service().abort(uuid)
    return jsonify({"status": "ok"})


@app.route("/api/llm/stream")
def llm_stream():
    """SSE stream for inference chunks. Query params: uuid, message."""
    uuid = request.args.get("uuid", "")
    message = request.args.get("message", "")
    if not uuid or not message:
        return jsonify({"error": "uuid and message required"}), 400
    if len(message) > 32_000:
        return jsonify({"error": "message too long (max 32 000 chars)"}), 413

    svc = get_ollama_service()

    def generate():
        try:
            for event in svc.prompt_streaming(message, uuid):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'uuid': uuid, 'error': str(exc)})}\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Voice — TTS (Piper) + STT (Faster-Whisper)
# ---------------------------------------------------------------------------


@app.route("/api/voice/state")
def voice_state():
    """Return combined TTS + STT state."""
    return jsonify(
        {
            "tts": get_tts_manager().get_state(),
            "stt": get_stt_manager().get_state(),
        }
    )


@app.route("/api/voice/tts-toggle", methods=["POST"])
def tts_toggle():
    tts = get_tts_manager()
    body = request.get_json(force=True) or {}
    if "enabled" in body:
        tts.enabled = bool(body["enabled"])
    else:
        tts.enabled = not tts.enabled
    get_settings().set("ttsEnabled", tts.enabled)
    return jsonify({"enabled": tts.enabled})


@app.route("/api/voice/stt-toggle", methods=["POST"])
def stt_toggle():
    stt = get_stt_manager()
    body = request.get_json(force=True) or {}
    if "enabled" in body:
        stt.enabled = bool(body["enabled"])
    else:
        stt.enabled = not stt.enabled
    get_settings().set("sttEnabled", stt.enabled)
    return jsonify({"enabled": stt.enabled})


@app.route("/api/voice/set-voice", methods=["POST"])
def set_voice():
    body = request.get_json(force=True) or {}
    voice_id = body.get("voiceId", "")
    if not voice_id:
        return jsonify({"error": "voiceId required"}), 400
    result = get_tts_manager().load_voice(voice_id)
    if "error" in result:
        return jsonify(result), 422
    get_settings().set("selectedVoice", voice_id)
    return jsonify(result)


@app.route("/api/voice/rescan", methods=["POST"])
def rescan_voices():
    """Re-scan the voices directory (call after downloading new voices)."""
    get_tts_manager().rescan()
    return jsonify(get_tts_manager().get_state())


@app.route("/api/voice/speak", methods=["POST"])
def speak():
    """Synthesize text to WAV. Returns audio/wav bytes."""
    body = request.get_json(force=True) or {}
    text = body.get("text", "").strip()
    try:
        length_scale = float(body.get("lengthScale", 1.0))
    except (TypeError, ValueError):
        return jsonify({"error": "lengthScale must be a number"}), 400
    if not text:
        return jsonify({"error": "text required"}), 400

    wav_bytes = get_tts_manager().synthesize(text, length_scale=length_scale)
    if wav_bytes is None:
        return jsonify({"error": "TTS not available — no voice loaded"}), 503

    return Response(
        wav_bytes,
        mimetype="audio/wav",
        headers={"Content-Length": len(wav_bytes)},
    )


@app.route("/api/voice/transcribe", methods=["POST"])
def transcribe():
    """Transcribe base64-encoded audio (WebM from browser) to text."""
    body = request.get_json(force=True) or {}
    audio_b64 = body.get("audio", "")
    language = body.get("language") or None
    if not audio_b64:
        return jsonify({"error": "audio (base64) required"}), 400
    if len(audio_b64) > 10_000_000:
        return jsonify({"error": "audio payload too large (max ~7 MB)"}), 413

    result = get_stt_manager().transcribe_base64(audio_b64, language=language)
    return jsonify(result)


@app.route("/api/voice/stt-model", methods=["POST"])
def set_stt_model():
    body = request.get_json(force=True) or {}
    model = body.get("model", "")
    if not model:
        return jsonify({"error": "model required"}), 400
    result = get_stt_manager().load_model(model)
    if "error" not in result:
        get_settings().set("sttModel", model)
    return jsonify(result)


# ---------------------------------------------------------------------------
# Garden telemetry (hydroMazing HTTP API adapter)
# ---------------------------------------------------------------------------


@app.route("/api/garden/state")
def garden_state():
    """Return the latest normalized GardenState snapshot (poll fallback)."""
    state = get_garden_service().get_state()
    if state is None:
        return jsonify({"error": "garden telemetry unavailable"}), 503
    return jsonify(state)


@app.route("/api/garden/refresh", methods=["POST"])
def garden_refresh():
    """Force an immediate hydroMazing poll and return the result."""
    state = get_garden_service().force_refresh()
    if state is None:
        return jsonify({"error": "garden telemetry unavailable"}), 503
    return jsonify(state)


@app.route("/api/garden/stream")
def garden_stream():
    """SSE stream — pushes GARDEN_STATE_UPDATE events to connected clients."""
    svc = get_garden_service()
    q = svc.subscribe_events()

    def generate():
        try:
            while True:
                try:
                    event = q.get(timeout=30)
                    yield f"data: {json.dumps(event)}\n\n"
                except Exception:
                    yield ": keepalive\n\n"
        finally:
            svc.unsubscribe_events(q)

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ---------------------------------------------------------------------------
# Versions
# ---------------------------------------------------------------------------


@app.route("/api/versions")
def versions():
    import importlib.metadata
    import platform

    try:
        flask_version = importlib.metadata.version("flask")
    except Exception:
        flask_version = "unknown"
    return jsonify(
        {
            "sprout": VERSION,
            "python": platform.python_version(),
            "flask": flask_version,
        }
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Apply saved Ollama URL before accepting requests
    saved_url = get_settings().get("ollamaUrl")
    if saved_url:
        set_ollama_base(saved_url)
    print(f"Sprout running at http://localhost:{PORT}")
    print(f"LAN access: http://0.0.0.0:{PORT}")
    app.run(host="0.0.0.0", port=PORT, threaded=True, debug=False)
