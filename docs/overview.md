# Overview

## Project Purpose

Clippy is a revival of Microsoft Office 97's iconic animated assistant, reimagined as a **local LLM chat interface** running on Raspberry Pi 5. This fork replaces the original Electron desktop application with a **Flask + React web application** to enable:

1. **Headless Operation** - No display or desktop environment required
2. **Network Access** - Accessible from any device on the local network
3. **Lower Dependencies** - ~100MB Electron removed in favor of web technologies

## Key Goals

| Goal                           | Status      |
| ------------------------------ | ----------- |
| Local LLM inference via Ollama | ✅ Complete |
| Windows 98-style UI            | ✅ Complete |
| Text-to-Speech (TTS)           | ✅ Complete |
| Speech-to-Text (STT)           | ✅ Complete |
| Persistent chat history        | ✅ Complete |
| Systemd auto-start             | ✅ Complete |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (LAN)                            │
│                  http://<pi>:5080                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Flask Backend (port 5080)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   React SPA  │  │   SSE API    │  │   Voice API     │  │
│  │  (98.css)    │  │  Streaming   │  │  TTS + STT      │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Python Services                               │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ OllamaService│  │ ChatManager  │  │  SettingsManger │  │
│  │ (Ollama HTTP)│  │ (JSON files) │  │  (JSON)         │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │  TTSSManager │  │  STTManager  │                        │
│  │ (Piper TTS)  │  │(Faster-Whisper)│                      │
│  └──────────────┘  └──────────────┘                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Services                        │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   Ollama     │  │   Piper      │  │  Faster-Whisper │  │
│  │   (11434)    │  │   (models)   │  │   (models)      │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Chat Message Flow

1. **User Input** (Browser) → Textarea → Send button
2. **Frontend** (React) → `api.ts` → `fetch('/api/llm/stream')`
3. **Backend** (Flask) → `llm_stream()` → `ollama_service.prompt_streaming()`
4. **LLM** (Ollama) → Streaming JSON response
5. **Response** → SSE → Browser → React → Message display + TTS

### Streaming Architecture

Clippy uses **Server-Sent Events (SSE)** for real-time communication:

| Stream Type       | Endpoint                        | Purpose                    |
| ----------------- | ------------------------------- | -------------------------- |
| Inference         | `GET /api/llm/stream`           | LLM response chunks        |
| Download Progress | `GET /api/models/pull-progress` | Model pull status          |
| Keepalive         | `: keepalive`                   | Prevent connection timeout |

### State Management

State is shared between frontend and backend:

| State Type    | Location         | Sync Mechanism      |
| ------------- | ---------------- | ------------------- |
| Models list   | Backend (Python) | SSE push on changes |
| Settings      | Backend (Python) | Polling (2s) + SSE  |
| Chat messages | Backend (JSON)   | CRUD API            |
| Voice state   | Backend (Python) | SSE push            |

## Storage

All persistent data stored in `~/.config/Clippy/`:

```
~/.config/Clippy/
├── settings.json           # App settings (font, model, etc.)
├── debug.json              # Debug flags
├── chats/                  # Conversation history
│   ├── chats.json          # Index file
│   └── <uuid>.json         # Individual chats
└── voices/                 # TTS voice models
    ├── <voice>.onnx        # Voice model
    ├── <voice>.onnx.json   # Voice config
    └── <voice>.meta.json   # Display metadata
```

## Non-Goals

These are explicitly **out of scope**:

- Cloud LLM integration (OpenAI, Anthropic, etc.)
- Authentication/authorization
- Cross-device sync
- Voice assistant wake-word detection
- Mobile app (web UI only)
