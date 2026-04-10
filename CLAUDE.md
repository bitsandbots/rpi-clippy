# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Clippy** is a Flask web app that revives the 90s Microsoft Office Clippy as a local LLM chat interface. It runs on a Raspberry Pi 5 and is accessible from any device on the LAN. All inference runs through locally running Ollama — no cloud dependencies.

The app was converted from Electron to a Flask+React SPA to eliminate the display-server requirement and reduce dependencies (~100 MB Electron removed).

## Commands

```bash
# Run Python test suite
pytest -q                           # all tests, quiet
pytest tests/test_routes.py -q      # specific module

# Run frontend tests (Vitest)
npm run test                        # one-shot
npm run test:watch                  # watch mode

# Install Python dev dependencies
pip install -r requirements-dev.txt

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

# Documentation
open docs/README.md     # Start here
open docs/overview.md   # Project overview
open docs/architecture.md  # Technical architecture
open docs/api-reference.md # API reference
```

## Documentation

Comprehensive documentation is available in the `docs/` folder:

| Document                                              | Description                     |
| ----------------------------------------------------- | ------------------------------- |
| [README.md](docs/README.md)                           | Quick start guide               |
| [overview.md](docs/overview.md)                       | Project purpose and goals       |
| [architecture.md](docs/architecture.md)               | High-level design and data flow |
| [tech-stack.md](docs/tech-stack.md)                   | Technologies and versions       |
| [installation.md](docs/installation.md)               | Setup and running instructions  |
| [api-reference.md](docs/api-reference.md)             | Backend API documentation       |
| [frontend-components.md](docs/frontend-components.md) | React component docs            |
| [voice-features.md](docs/voice-features.md)           | TTS and STT setup guide         |

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
  ├─ /api/state         → SharedState JSON (GET/POST)
  ├─ /api/debug-state   → debug flag (GET/POST)
  ├─ /api/chats/*       → conversation CRUD
  ├─ /api/models/*      → Ollama model management
  ├─ /api/ollama/*      → Ollama connection status, URL config, discovery
  ├─ /api/llm/*         → LLM session + SSE streaming
  ├─ /api/voice/*       → Piper TTS + Faster-Whisper STT
  └─ /api/versions      → version info

src/python/
  ├─ ollama_service.py  — OllamaService: Ollama REST API, model pull fan-out
  ├─ chat_manager.py    — ChatManager: JSON files at ~/.config/Clippy/chats/
  ├─ settings_manager.py — SettingsManager: ~/.config/Clippy/settings.json
  │                     └ DebugSettingsManager (same file): debug flag (5s polling)
  ├─ tts_manager.py     — TTSManager: Piper TTS, lazy-loaded .onnx voices
  └─ stt_manager.py     — STTManager: Faster-Whisper, lazy-loaded Whisper model
```

### Streaming

SSE (Server-Sent Events) for LLM inference and model pull progress:

- `GET /api/llm/stream?uuid=&message=` — inference chunks
- `GET /api/models/pull-progress` — pull events (fan-out queue per subscriber)

TTS audio: `POST /api/voice/speak` returns `audio/wav` bytes (not SSE).

`POST /api/llm/abort` sets a `threading.Event` the SSE generator checks per chunk.

### Frontend

State is managed via React Context — no Redux or Zustand:

- `ChatContext.tsx` — active messages, model loading, chat CRUD
- `SharedStateContext.tsx` — models list, global settings (2s polling + SSE pull events)
- `BubbleViewContext.tsx` — bubble/settings tab switching
- `VoiceContext.tsx` — TTS/STT state, audio playback, mic recording
- `DebugContext.tsx` — debug flag (5s polling)
- `WindowContext.tsx` — window/panel resize and layout state

UI entry: `renderer.tsx` → `App.tsx` → CSS-positioned `BubbleWindow.tsx` / `Clippy.tsx`

`src/renderer/clippy-animation-helpers.tsx` — sprite frame and timing logic for Clippy animations.
`src/renderer/clippy-animations.tsx` — animation definitions (idle, wave, think, etc.).
`src/renderer/logging.tsx` — client-side debug logging utility.

IPC is gone. `clippyApi.tsx` is a shim re-exporting from `api.ts` — no call sites needed updating.

### Utilities

`src/renderer/helpers/` — shared frontend utilities:

- `convert-download-speed.ts` — formats Ollama pull byte/s to human-readable rate
- `uuid.ts` — UUID generation for chat and session IDs

### Voice

- **TTS**: Piper `.onnx` voice models in `~/.config/Clippy/voices/`, lazy-loaded via `TTSManager`. Download with `scripts/setup_voices.sh`.
- **STT**: Faster-Whisper `tiny`/`base`/`small` model, lazy-loaded via `STTManager`. Browser records WebM via `MediaRecorder`, sends base64 to `/api/voice/transcribe`.

### Storage

All app data under `~/.config/Clippy/`: chats (`chats/`), settings (`settings.json`), voices (`voices/`). Models managed by Ollama in `~/.ollama/models/`.

### Styling

Uses **98.css** for the Windows 95/98 aesthetic. Custom styles in `src/renderer/components/css/`.

### Code Style

- Python: type hints on all signatures, docstrings on public functions, black formatting
- TypeScript: Prettier formatting (`npm run lint`), semicolons used
- All Python singletons use double-checked locking for thread safety (Flask `threaded=True`)
- New API routes must use `_validate_chat_payload()` for writes

### Build System

- **Vite** unified browser build (`vite.config.ts`) — `npm run build` → `dist/`
- Dev proxy: Vite `:5173` → Flask `:5080` for `/api/*`
- No Electron Forge, no native modules

### Dev Dependencies

| Package             | Purpose                                            |
| ------------------- | -------------------------------------------------- |
| `pytest>=8.0`       | Backend test runner (151 tests in `tests/`)        |
| `pytest-mock>=3.12` | Mock fixtures for unit tests                       |
| `pytest-flask>=1.3` | Flask test client fixtures                         |
| `vitest>=2.0`       | Frontend test runner (77 tests in `src/renderer/`) |

## Gotchas

- **Animation key fallback**: Chat.tsx handles `Key: text` colon format when the LLM omits bracket syntax. If you modify message rendering, preserve this fallback or animated responses will break.
- **Payload limits**: `app.py` enforces a 10MB body cap and 1000-message limit on chat writes (HTTP 413 on violation). Don't bypass `_validate_chat_payload()`.
- **SSE abort**: `POST /api/llm/abort` sets a `threading.Event` checked per chunk — not a socket close. If adding new SSE endpoints, use the same pattern.
- **clippyApi.tsx shim**: This file re-exports from `api.ts` for backward compat. New code should import from `api.ts` directly.

## Key Dependencies

| Package           | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `98.css`          | Windows 95/98 UI styling                      |
| `react-markdown`  | Markdown rendering in chat messages           |
| `flask`           | HTTP server, SSE streaming                    |
| `requests`        | Ollama REST API calls                         |
| `piper-tts`       | Local TTS synthesis from .onnx voice models   |
| `faster-whisper`  | Local STT transcription (CTranslate2 backend) |
| `ffmpeg` (system) | Audio format conversion for STT input         |
