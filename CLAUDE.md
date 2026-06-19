# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Sprout** is a Flask web app that revives the 90s Microsoft Office Sprout as a local LLM chat interface. It runs on a Raspberry Pi 5 and is accessible from any device on the LAN. All inference runs through locally running Ollama — no cloud dependencies.

The app was converted from Electron to a Flask+React SPA to eliminate the display-server requirement and reduce dependencies (~100 MB Electron removed).

## Commands

```bash
# Install Python dev dependencies (required before running pytest)
pip install -r requirements-dev.txt

# Run Python test suite
python3 -m pytest -q                                                  # all tests, quiet
python3 -m pytest tests/test_routes.py -q                            # specific module
python3 -m pytest tests/test_routes.py::test_get_state -v            # single test

# Run frontend tests (Vitest)
npm run test                        # one-shot
npm run test:watch                  # watch mode

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
  └─ React SPA (Sprout dark theme)
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
  ├─ /api/garden/*      → hydroMazing telemetry: state (GET), refresh (POST), stream (SSE)
  └─ /api/versions      → version info

src/python/
  ├─ ollama_service.py  — OllamaService: Ollama REST API, model pull fan-out
  ├─ chat_manager.py    — ChatManager: JSON files at ~/.config/Sprout/chats/
  ├─ settings_manager.py — SettingsManager: ~/.config/Sprout/settings.json
  │                     └ DebugSettingsManager (same file): debug flag (5s polling)
  ├─ tts_manager.py     — TTSManager: Piper TTS, lazy-loaded .onnx voices
  ├─ stt_manager.py     — STTManager: Faster-Whisper, lazy-loaded Whisper model
  └─ garden_service.py  — GardenService: polls hydroMazing HTTP API, fans out to SSE subscribers
```

### Streaming

SSE (Server-Sent Events) for LLM inference and model pull progress:

- `GET /api/llm/stream?uuid=&message=` — inference chunks
- `GET /api/models/pull-progress` — pull events (fan-out queue per subscriber)

TTS audio: `POST /api/voice/speak` returns `audio/wav` bytes (not SSE).

`POST /api/llm/abort` sets a `threading.Event` the SSE generator checks per chunk.

### Frontend

State is managed via React Context — no Redux or Zustand. Context files live in `src/renderer/contexts/`:

- `ChatContext.tsx` — active messages, model loading, chat CRUD
- `SharedStateContext.tsx` — models list, global settings (2s polling + SSE pull events)
- `BubbleViewContext.tsx` — bubble/settings tab switching
- `VoiceContext.tsx` — TTS/STT state, audio playback, mic recording
- `DebugContext.tsx` — debug flag (5s polling)
- `WindowContext.tsx` — window/panel resize and layout state
- `GardenContext.tsx` — hydroMazing telemetry SSE subscriber; emits garden signals + aria-live alerts

UI entry: `renderer.tsx` → `App.tsx` → CSS-positioned `BubbleWindow.tsx` / `Sprout.tsx`

`src/renderer/animation-keys.ts` — animation-token vocabulary (`ANIMATION_KEYS` / `ANIMATION_KEYS_BRACKETS`) shared by the chat layer and the reactive rig; sourced from `sprout/config/reactions.ts::BRACKET_TOKEN_REACTIONS`.
`src/renderer/logging.tsx` — client-side debug logging utility.

**Reactive character engine** (`src/renderer/sprout/`):

- `engine/signals.ts` — `SignalBus` singleton + `SproutSignal` union type
- `engine/stateMachine.ts` — `StateMachine`: BFS path-finding between 8 states
- `engine/blendSpace.ts` — `BlendSpace2D`: IDW blend of 6 mood points → `ExpressionParams`
- `engine/oneShot.ts` — `OneShotLayer`: fire-and-forget reaction overlays with track filters
- `engine/tween.ts` — `Tween`: single-value interpolation with easing functions
- `engine/loop.ts` — `AnimationLoop`: rAF driver, 30 fps cap, visibility + reduced-motion guards
- `engine/brain.ts` — `SproutBrain`: singleton orchestrating all engine modules; writes SVG refs
- `rig/SproutRig.tsx` — SVG plant figure; exposes `RigRefs` (13 named parts + root)
- `rig/parts.ts` — anchor table (center, rotationOrigin, writableAttrs per part)
- `config/expressions.ts` — 6 named `ExpressionParams` presets
- `config/moods.ts` — 6 `MoodPoint` definitions on Vitality × Energy axes
- `config/reactions.ts` — 11 `OneShotDef` reactions + `BRACKET_TOKEN_REACTIONS` map
- `config/gardenMapping.ts` — sensor → mood/reaction thresholds; `mapGardenState()`

IPC is gone. `sproutApi.tsx` is a shim re-exporting from `api.ts` — no call sites needed updating.

### Utilities

`src/renderer/helpers/` — shared frontend utilities:

- `convert-download-speed.ts` — formats Ollama pull byte/s to human-readable rate
- `uuid.ts` — UUID generation for chat and session IDs

### Voice

- **TTS**: Piper `.onnx` voice models in `~/.config/Sprout/voices/`, lazy-loaded via `TTSManager`. Download with `scripts/setup_voices.sh`.
- **STT**: Faster-Whisper `tiny`/`base`/`small` model, lazy-loaded via `STTManager`. Browser records WebM via `MediaRecorder`, sends base64 to `/api/voice/transcribe`.

### Storage

All app data under `~/.config/Sprout/`: chats (`chats/`), settings (`settings.json`), voices (`voices/`). Models managed by Ollama in `~/.ollama/models/`.

### Styling

Custom dark theme in `src/renderer/components/css/SproutTheme.css`. Colors: navy `#0d1926`, blue `#2b7de9`, green `#3dbb68`, orange `#e07018`. System fonts only (offline-safe).

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

| Package             | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `pytest>=8.0`       | Backend test runner (196 tests in `tests/`)         |
| `pytest-mock>=3.12` | Mock fixtures for unit tests                        |
| `pytest-flask>=1.3` | Flask test client fixtures                          |
| `vitest>=2.0`       | Frontend test runner (166 tests in `src/renderer/`) |

### Test Isolation

`tests/conftest.py` has an `autouse=True` fixture that resets all module-level singletons (`_settings`, `_chat_manager`, `_tts`, `_stt`, `_service`, `_garden`) to `None` before each test, and redirects `XDG_CONFIG_HOME` to a `tmp_path` so no test touches `~/.config/Sprout`. `OllamaService._refresh_available_bg` is also patched to a no-op by default to prevent real Ollama network calls; use the `real_ollama_refresh` fixture to restore it. Frontend tests use `src/test/setup.ts` which provides a `MockEventSource` with `.emit()` / `.emitError()` helpers and resets global `fetch` mocks before each test.

## Gotchas

- **Animation key fallback**: Chat.tsx handles `Key: text` colon format when the LLM omits bracket syntax. If you modify message rendering, preserve this fallback or animated responses will break.
- **Payload limits**: `app.py` enforces a 10MB body cap and 1000-message limit on chat writes (HTTP 413 on violation). Don't bypass `_validate_chat_payload()`.
- **SSE abort**: `POST /api/llm/abort` sets a `threading.Event` checked per chunk — not a socket close. If adding new SSE endpoints, use the same pattern.
- **sproutApi.tsx shim**: This file re-exports from `api.ts` for backward compat. New code should import from `api.ts` directly.
- **Character system**: One character — `"sprout"`, the reactive SVG rig (`src/renderer/sprout/`), registered in `src/renderer/character-animations.tsx`. The old `"sprout-classic"` sprite-sheet character and its assets/extract tooling were removed; `CharacterId` is now `"sprout"` only. The animation-token vocabulary the LLM may emit lives in `src/renderer/animation-keys.ts` (derived from the rig's `BRACKET_TOKEN_REACTIONS`), not from a sprite list.
- **hydroMazing field mapping**: `src/python/garden_service.py::HYDRO_FIELD_MAP` maps raw API keys to `GardenState` fields. Verify these key names against the actual hydroMazing response before first production deploy. Set `HYDROMAZING_URL` and `GARDEN_POLL_SEC` env vars to configure the adapter.
- **Reactive rig reduced-motion**: When `prefers-reduced-motion: reduce` is set, idle motion (sway, blink, saccade, talking oscillation) is suppressed but state transitions and one-shot reactions still render. The loop continues running at 30 fps to keep mood smoothing active.
- **Version sync**: `app.py` has a module-level `VERSION` string and `package.json` has a `version` field — they must be updated together. `/api/versions` returns the `app.py` value; mismatches will silently mislead the UI.
- **Dual model catalog**: `src/models.ts` (frontend, 8 models, no quant suffixes) and `src/python/ollama_service.py` `BUILT_IN_MODELS` (backend, 11 models, with quant tags like `gemma3:4b-Q4_K_M`) are independent lists. Adding a new model requires updating both; the backend list is authoritative for what gets pulled.
- **Ollama uses `/api/generate`, not `/api/chat`**: `OllamaService.prompt_streaming()` builds a manual `System: / User: / Assistant:` prompt string and calls `/api/generate`. This is intentional but non-standard — switching to `/api/chat` would require a larger refactor.
- **`.venv` root ownership**: `install.sh` creates `.venv` under `sudo`, so it is root-owned. Running `pip install -r requirements-dev.txt` as the regular user will fail. Either `sudo pip install` into it or create a separate user-owned venv for development.
- **`systemPrompt` substitution is frontend-side**: The default system prompt in `settings_manager.py` contains a `[LIST OF ANIMATIONS]` placeholder. This placeholder is replaced by `ChatContext.tsx` (`getSystemPrompt()`) at session create time — the backend never sees the resolved prompt.

## Key Dependencies

| Package           | Purpose                                       |
| ----------------- | --------------------------------------------- |
| `react-markdown`  | Markdown rendering in chat messages           |
| `flask`           | HTTP server, SSE streaming                    |
| `requests`        | Ollama REST API calls                         |
| `piper-tts`       | Local TTS synthesis from .onnx voice models   |
| `faster-whisper`  | Local STT transcription (CTranslate2 backend) |
| `ffmpeg` (system) | Audio format conversion for STT input         |
