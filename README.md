# Clippy — Pi 5 / Ollama Fork

A revival of Microsoft Office 97's Clippy as a local LLM chat interface, rebuilt for the Raspberry Pi 5. This fork replaces the original Electron desktop app with a **Flask web server** so Clippy runs headlessly, needs no display, and is accessible from any device on your local network.

All inference runs locally through [Ollama](https://ollama.com) — no cloud, no C++ compilation, no GPU required.

---

## Features

- Classic Windows 98 chat interface (via [98.css](https://jdan.github.io/98.css/))
- Fully offline — all LLM inference through Ollama on the Pi
- Accessible from any browser on your LAN (`http://<pi-ip>:5080`)
- Runs as a systemd service, starts on boot
- One-click model download/delete from the Settings panel
- Streaming responses with animation cues
- Chat history saved to disk
- **Text-to-Speech** via [Piper TTS](https://github.com/rhasspy/piper) — local `.onnx` voice models
- **Speech-to-Text** via [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper) — offline transcription
- Configurable font size and family (Settings → Appearance)

---

## Requirements

| Dependency                                  | Notes                                              |
| ------------------------------------------- | -------------------------------------------------- |
| Raspberry Pi 5 (4 GB+ RAM)                  | Also works on Pi 4, other Linux                    |
| [Ollama](https://ollama.com/download/linux) | Must be running (`ollama serve`)                   |
| Python 3.11+                                | `flask`, `requests`, `piper-tts`, `faster-whisper` |
| Node.js 20+                                 | For building the frontend                          |
| `ffmpeg` + `libespeak-ng1` + `libsndfile1`  | Required for TTS/STT (`install.sh` handles this)   |
| At least one pulled model                   | e.g. `ollama pull llama3.2:1b`                     |

---

## Quick Start

### 1. Install Ollama and pull a model

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2:1b   # fast, ~800 MB
```

### 2. Clone and install

```bash
git clone https://github.com/CoreConduit/rpi-clippy
cd rpi-clippy
bash install.sh
```

`install.sh` will:

- Install system deps (`libespeak-ng1`, `libsndfile1`, `ffmpeg`)
- Install Python deps (`flask`, `requests`, `piper-tts`, `faster-whisper`)
- Run `npm install` and `npm run build`
- Install and start the `clippy` systemd service

### 3. (Optional) Download Piper TTS voices

```bash
bash scripts/setup_voices.sh        # default voices (~200 MB)
bash scripts/setup_voices.sh all    # all available voices
```

Voices are saved to `~/.config/Clippy/voices/`. Enable TTS in **Settings → Voice**.

### 4. Open in your browser

```
http://localhost:5080
# or from another device on the LAN:
http://<your-pi-ip>:5080
```

---

## Manual Usage (without systemd)

```bash
# Build the frontend once
npm run build

# Start the server
python3 app.py
```

```bash
# Hot-reload development (Vite dev server on :5173, proxies /api → :5080)
python3 app.py &
npm run dev
# Open http://localhost:5173
```

---

## Supported Models

These models are available in the Settings → Model panel. Download them with one click or via `ollama pull <tag>`.

| Model                   | Tag                 | Size    |
| ----------------------- | ------------------- | ------- |
| TinyLlama (1.1B)        | `tinyllama`         | ~637 MB |
| Llama 3.2 (1B Instruct) | `llama3.2:1b`       | ~808 MB |
| Gemma 3 (1B)            | `gemma3:1b`         | ~806 MB |
| Llama 3.2 (3B Instruct) | `llama3.2:3b`       | ~2.0 GB |
| Phi-4 Mini (3.8B)       | `phi4-mini`         | ~2.5 GB |
| Qwen3 (4B)              | `qwen3:4b-Q4_K_M`   | ~2.5 GB |
| Gemma 3 (4B)            | `gemma3:4b-Q4_K_M`  | ~2.5 GB |
| Gemma 3 (12B)           | `gemma3:12b`        | ~5.6 GB |
| Llama 3.1 (8B Instruct) | `llama3.1:8b-instruct-q8_0` | ~8.0 GB |
| Qwen2.5 Coder (0.5B)    | `qwen2.5-coder:0.5b` | ~500 MB |
| Qwen3 (1.7B)            | `qwen3:1.7b`        | ~1.7 GB |

**Recommended for Pi 5 (8 GB):** Llama 3.2 3B or Qwen3 4B.  
**Recommended for Pi 5 (4 GB):** Llama 3.2 1B or TinyLlama.

### Hybrid catalog

The Settings → Model panel uses a **hybrid catalog**: curated entries above match any installed Ollama tag with the same prefix (so `llama3.2:3b-instruct-q4_K_M` satisfies the `llama3.2:3b` entry), and any other models you have pulled with `ollama pull` appear underneath as **orphans**. You don't need to pull the exact tag listed in the table — any compatible variant works, and you can use models the catalog has never heard of.

---

## Service Management

```bash
sudo systemctl status clippy       # current status
sudo systemctl restart clippy      # restart after config changes
sudo systemctl stop clippy         # stop
sudo systemctl disable clippy      # don't start on boot
sudo journalctl -u clippy -f       # live logs
```

---

## Architecture

```
Browser (port 5080)
  └─ React SPA (98.css UI)
       └─ src/renderer/api.ts  — fetch + EventSource

Flask app.py (port 5080)
  ├─ GET  /                        — serves dist/index.html
  ├─ GET/POST  /api/state          — settings read/write
  ├─ GET/POST/DELETE /api/chats/<id>
  ├─ POST /api/models/download|delete|refresh
  ├─ GET  /api/models/pull-progress  — SSE stream (download progress)
  ├─ POST /api/llm/create|destroy|abort
  ├─ GET  /api/llm/stream          — SSE stream (inference chunks)
  ├─ POST /api/voice/speak         — TTS: text → WAV bytes
  ├─ POST /api/voice/transcribe    — STT: base64 audio → text
  └─ GET/POST /api/voice/*         — voice state, toggle, load, rescan

src/python/
  ├─ ollama_service.py   — LLM sessions, model management, Ollama HTTP client
  ├─ chat_manager.py     — chat JSON files (~/.config/Clippy/chats/)
  ├─ settings_manager.py — settings JSON (~/.config/Clippy/settings.json)
  ├─ tts_manager.py      — Piper TTS, lazy-loads .onnx voice models
  └─ stt_manager.py      — Faster-Whisper STT, lazy-loads Whisper model
```

Streaming uses **Server-Sent Events (SSE)** — one persistent connection per active stream, no websockets needed.

---

## Storage

All data lives in `~/.config/Clippy/`:

```
~/.config/Clippy/
  settings.json        — app settings
  debug.json           — debug flags
  chats/
    chats.json         — chat index
    <id>.json          — one file per conversation
  voices/
    <voice-id>.onnx          — Piper TTS voice model
    <voice-id>.onnx.json     — voice config (required by Piper)
    <voice-id>.meta.json     — display metadata (optional)
```

---

## Configuration

Settings are persisted to `~/.config/Clippy/settings.json`. The most useful keys:

| Key               | Default          | Description                                      |
| ----------------- | ---------------- | ------------------------------------------------ |
| `selectedModel`   | `null`           | Display name of the active model                 |
| `systemPrompt`    | (Clippy persona) | System prompt sent to the LLM                    |
| `temperature`     | `0.7`            | Sampling temperature                             |
| `topK`            | `10`             | Top-K sampling                                   |
| `defaultFont`     | `Tahoma`         | UI font (changeable in Settings → Appearance)    |
| `defaultFontSize` | `16`             | UI font size in px (8–24, Settings → Appearance) |

---

## Smoke Tests

```bash
# Python bridge (requires Ollama running)
python3 -c "
from src.python.ollama_service import get_ollama_service
svc = get_ollama_service()
import time; time.sleep(1)
print(svc.get_model_state())
"

# Flask API
curl http://localhost:5080/api/versions
curl http://localhost:5080/api/state
```

---

## Acknowledgements

- Original Clippy app by [Felix Rieseberg](https://github.com/felixrieseberg)
- Windows 98 styling by [Jordan Scales](https://github.com/jdan) (98.css)
- Clippy character designed by [Kevan Atteberry](https://www.kevanatteberry.com/)
- Pi 5 / Ollama port by [CoreConduit](https://github.com/CoreConduit)

Clippy and all visual assets are owned by Microsoft. This project is not affiliated with Microsoft.
