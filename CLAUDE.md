# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Clippy** is a Flask web app that revives the 90s Microsoft Office Clippy as a local LLM chat interface. It runs on a Raspberry Pi 5 and is accessible from any device on the LAN. All inference runs through locally running Ollama — no cloud dependencies.

The app was converted from Electron to a Flask+React SPA to eliminate the display-server requirement and reduce dependencies (~100 MB Electron removed).

## Commands

```bash
# Start Flask server (production)
python3 app.py

# Dev mode: Flask backend + Vite hot-reload frontend
python3 app.py &          # :5080
npm run dev               # :5173, proxies /api → :5080

# Build React frontend
npm run build

# Format TypeScript/TSX with Prettier
npm run lint

# Install as systemd service (auto-start on boot)
bash install.sh

# Download Piper TTS voices
bash scripts/setup_voices.sh            # default voices
bash scripts/setup_voices.sh all        # all available voices
bash scripts/setup_voices.sh <voice_id> # one specific voice
```

No test suite exists — linting is the only automated check.

```bash
# Smoke-test the Flask API (requires Ollama running)
curl http://localhost:5080/api/state
curl http://localhost:5080/api/versions
```

## Architecture

```
Browser (localhost:5080)
  └─ React SPA (98.css UI)
       └─ src/renderer/api.ts  (fetch + EventSource)

Flask app.py (port 5080, 0.0.0.0 for LAN access)
  ├─ GET /              → serves dist/index.html (React build)
  ├─ GET /assets/*      → Vite static assets
  ├─ /api/state         → SharedState JSON
  ├─ /api/chats/*       → conversation CRUD
  ├─ /api/models/*      → Ollama model management
  ├─ /api/llm/*         → LLM session + SSE streaming
  ├─ /api/voice/*       → Piper TTS + Faster-Whisper STT
  └─ /api/versions      → version info

src/python/
  ├─ ollama_service.py  — OllamaService: Ollama REST API, model pull fan-out
  ├─ chat_manager.py    — ChatManager: JSON files at ~/.config/Clippy/chats/
  ├─ settings_manager.py — SettingsManager: ~/.config/Clippy/settings.json
  ├─ tts_manager.py     — TTSManager: Piper TTS, lazy-loaded .onnx voices
  └─ stt_manager.py     — STTManager: Faster-Whisper, lazy-loaded Whisper model
```

### Streaming

SSE (Server-Sent Events) for both LLM inference and model pull progress:
- `GET /api/llm/stream?uuid=&message=` — inference chunks
- `GET /api/models/pull-progress` — pull events (fan-out queue per subscriber)

`POST /api/llm/abort` sets a `threading.Event` the SSE generator checks per chunk.

### Frontend

State is managed via React Context — no Redux or Zustand:
- `ChatContext.tsx` — active messages, model loading, chat CRUD
- `SharedStateContext.tsx` — models list, global settings (2s polling + SSE pull events)
- `BubbleViewContext.tsx` — bubble/settings tab switching
- `VoiceContext.tsx` — TTS/STT state, audio playback, mic recording
- `DebugContext.tsx` — debug flag (5s polling)

UI entry: `renderer.tsx` → `App.tsx` → CSS-positioned `BubbleWindow.tsx` / `Clippy.tsx`

IPC is gone. `clippyApi.tsx` is a shim re-exporting from `api.ts` — no call sites needed updating.

### Voice

- **TTS**: Piper `.onnx` voice models in `~/.config/Clippy/voices/`, lazy-loaded via `TTSManager`. Download with `scripts/setup_voices.sh`.
- **STT**: Faster-Whisper `tiny`/`base`/`small` model, lazy-loaded via `STTManager`. Browser records WebM via `MediaRecorder`, sends base64 to `/api/voice/transcribe`.

### Storage

- Chats: `~/.config/Clippy/chats/{id}.json` + `chats.json` index
- Settings: `~/.config/Clippy/settings.json`
- Voices: `~/.config/Clippy/voices/*.onnx` + `*.onnx.json`
- Models: managed by Ollama (`~/.ollama/models/`)

### Styling

Uses **98.css** for the Windows 95/98 aesthetic. Custom styles live in `src/renderer/` alongside components.

### Build System

- **Vite** unified browser build (`vite.config.ts`) — `npm run build` → `dist/`
- Dev proxy: Vite `:5173` → Flask `:5080` for `/api/*`
- No Electron Forge, no native modules

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `98.css` | Windows 95/98 UI styling |
| `react-markdown` | Markdown rendering in chat messages |
| `flask` | HTTP server, SSE streaming |
| `requests` | Ollama REST API calls |
| `piper-tts` | Local TTS synthesis from .onnx voice models |
| `faster-whisper` | Local STT transcription (CTranslate2 backend) |
| `ffmpeg` (system) | Audio format conversion for STT input |
