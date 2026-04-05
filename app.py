#!/usr/bin/env python3
"""
Clippy Flask server — replaces the Electron main process.
Serves the React SPA and exposes a REST/SSE API for the frontend.

Usage:
  python3 app.py

Opens on http://localhost:5080 (also accessible from LAN via http://<pi-ip>:5080).
"""

import importlib
import json
import os
import sys
import threading
import time
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory

# Allow importing from src/python/
sys.path.insert(0, str(Path(__file__).parent / "src" / "python"))

from chat_manager import get_chat_manager
from ollama_service import get_ollama_service
from settings_manager import get_debug_settings, get_settings
from tts_manager import get_tts_manager
from stt_manager import get_stt_manager

PORT = 5080
DIST_DIR = Path(__file__).parent / "dist"
VERSION = "0.4.3"

app = Flask(__name__, static_folder=None)


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
        return index.read_text(), 200, {"Content-Type": "text/html"}

    return (
        "<h1>Clippy</h1><p>Run <code>npm run build</code> first, then restart.</p>",
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
    return jsonify({
        "models": svc.get_model_state(),
        "settings": settings.get_all(),
    })


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
    data = get_chat_manager().get_with_messages(chat_id)
    if data is None:
        return jsonify({"error": "Not found"}), 404
    return jsonify(data)


@app.route("/api/chats/<chat_id>", methods=["POST"])
def write_chat(chat_id):
    body = request.get_json(force=True) or {}
    chat = body.get("chat") or {}
    if not chat.get("id"):
        chat["id"] = chat_id
        body["chat"] = chat
    get_chat_manager().write(body)
    return jsonify({"status": "ok"})


@app.route("/api/chats/<chat_id>", methods=["DELETE"])
def delete_chat(chat_id):
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
    name = body.get("name", "")
    if not name:
        return jsonify({"error": "name required"}), 400
    svc = get_ollama_service()
    threading.Thread(target=svc.pull_model_by_name, args=(name,), daemon=True).start()
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

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


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

    svc = get_ollama_service()

    def generate():
        for event in svc.prompt_streaming(message, uuid):
            yield f"data: {json.dumps(event)}\n\n"

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------------------------------------------------------------------------
# Voice — TTS (Piper) + STT (Faster-Whisper)
# ---------------------------------------------------------------------------

@app.route("/api/voice/state")
def voice_state():
    """Return combined TTS + STT state."""
    return jsonify({
        "tts": get_tts_manager().get_state(),
        "stt": get_stt_manager().get_state(),
    })


@app.route("/api/voice/tts-toggle", methods=["POST"])
def tts_toggle():
    tts = get_tts_manager()
    body = request.get_json(force=True) or {}
    if "enabled" in body:
        tts.enabled = bool(body["enabled"])
    else:
        tts.enabled = not tts.enabled
    return jsonify({"enabled": tts.enabled})


@app.route("/api/voice/stt-toggle", methods=["POST"])
def stt_toggle():
    stt = get_stt_manager()
    body = request.get_json(force=True) or {}
    if "enabled" in body:
        stt.enabled = bool(body["enabled"])
    else:
        stt.enabled = not stt.enabled
    return jsonify({"enabled": stt.enabled})


@app.route("/api/voice/set-voice", methods=["POST"])
def set_voice():
    body = request.get_json(force=True) or {}
    voice_id = body.get("voiceId", "")
    if not voice_id:
        return jsonify({"error": "voiceId required"}), 400
    result = get_tts_manager().load_voice(voice_id)
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
    length_scale = float(body.get("lengthScale", 1.0))
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
    return jsonify(result)


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
    return jsonify({
        "clippy": VERSION,
        "python": platform.python_version(),
        "flask": flask_version,
    })


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print(f"Clippy running at http://localhost:{PORT}")
    print(f"LAN access: http://0.0.0.0:{PORT}")
    app.run(host="0.0.0.0", port=PORT, threaded=True, debug=False)
