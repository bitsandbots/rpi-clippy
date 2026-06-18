# Architecture

## High-Level Design

### Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Presentation Layer                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │   Browser → React SPA → 98.css UI                         │  │
│  │   - BubbleWindow.tsx (chat interface)                     │  │
│  │   - Sprout.tsx (animated sprite)                          │  │
│  │   - Settings panels (Appearance, Voice, LLM)              │  │
│  │   - Responsive design with flexbox layout                 │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP + SSE
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Application Layer (Flask)                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │   app.py - Flask server (port 5080)                       │  │
│  │   - REST API routes                                       │  │
│  │   - SSE endpoints for streaming                           │  │
│  │   - Thread-safe singleton managers                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Ollama HTTP + File I/O
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Data Layer (Python + File System)           │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │OllamaService │  │ChatManager   │  │SettingsManager      │  │
│  │(requests)    │  │(JSON files)  │  │(JSON persistence)   │  │
│  └──────────────┘  └──────────────┘  └─────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │TTSManager    │  │STTManager    │                            │
│  │(Piper onnx)  │  │(Faster-Whisper)│                          │
│  └──────────────┘  └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

## Core Modules

### Backend (src/python/)

#### 1. ollama_service.py

**Responsibility**: LLM inference via Ollama HTTP API

```python
class OllamaService:
    def create_session(options) -> None      # Initialize LLM session
    def destroy_session() -> None           # Clear session
    def prompt_streaming(message, uuid)     # Generator for SSE chunks
    def pull_model_by_name(name)            # Download model from Ollama
    def get_model_state() -> dict           # List available models
    def abort(uuid)                         # Cancel in-progress request
```

**Key Features**:

- Streaming inference via `requests` with `stream=True`
- SSE fan-out via `queue.Queue` for pull progress
- Double-checked locking for thread safety
- 40-message conversation history

#### 2. chat_manager.py

**Responsibility**: Chat history persistence

```python
class ChatManager:
    def get_records() -> dict               # List all chats
    def get_with_messages(chat_id) -> dict  # Get chat with messages
    def write(chat_with_messages) -> None   # Save chat
    def delete(chat_id) -> None             # Delete single chat
    def delete_all() -> None                # Clear all chats
```

**Storage Format**:

```json
{
  "chat": {
    "id": "<uuid>",
    "createdAt": 1234567890,
    "updatedAt": 1234567890,
    "preview": "..."
  },
  "messages": [
    {
      "id": "<uuid>",
      "content": "Hello",
      "sender": "user",
      "createdAt": 1234567890
    }
  ]
}
```

#### 3. settings_manager.py

**Responsibility**: App configuration persistence

```python
class SettingsManager:
    def get(key) -> any                     # Get setting (dot notation)
    def set(key, value) -> None             # Set and save setting
    def get_all() -> dict                   # Full settings dict
```

**Settings**:

- `selectedModel` - Current LLM model
- `systemPrompt` - Sprout persona definition
- `temperature`, `topK` - LLM sampling parameters
- `defaultFont`, `defaultFontSize` - UI styling
- `ollamaUrl` - Ollama endpoint (for remote instances)

#### 4. tts_manager.py

**Responsibility**: Piper TTS voice synthesis

```python
class TTSManager:
    def load_voice(voice_id) -> dict        # Load .onnx model
    def synthesize(text, length_scale)      # Text → WAV bytes
    def rescan() -> None                    # Refresh voice registry
    def get_state() -> dict                 # Voice list + status
```

**Features**:

- Lazy loading (first use only)
- Auto-load first available voice if none selected
- Synthesis config for speed control

#### 5. stt_manager.py

**Responsibility**: Faster-Whisper speech-to-text

```python
class STTManager:
    def load_model(model_size) -> dict      # Load Whisper model
    def transcribe(audio_path, language)    # File → text
    def transcribe_base64(audio_b64)        # Base64 → text
    def get_state() -> dict                 # Model + status
```

**Features**:

- Lazy loading (tiny/base/small models)
- CTranslate2 backend for CPU inference
- Temporary file handling for audio conversion

### Frontend (src/renderer/)

#### React Contexts

| Context            | Purpose                         | State                          |
| ------------------ | ------------------------------- | ------------------------------ |
| ChatContext        | Chat messages, status, CRUD     | messages, status, animationKey |
| SharedStateContext | Global state (models, settings) | models, settings               |
| BubbleViewContext  | UI tab switching                | activeView                     |
| VoiceContext       | TTS/STT state                   | ttsEnabled, sttEnabled, voices |
| DebugContext       | Debug flags                     | debug settings                 |

#### API Layer (api.ts)

```typescript
// REST API calls (fetch)
getFullState(), setState(), ...chats..., models...

// SSE subscriptions
subscribePullProgress(onEvent), llmPromptStreaming(...)

// Voice API
getVoiceState(), toggleTts(), toggleStt(),
speakText(), transcribeAudio(), ...
```

#### Components

**Core UI**:

- `Sprout.tsx` - Animated sprite with CSS position
- `BubbleWindow.tsx` - Chat bubble container
- `App.tsx` - Root component with all providers

**Chat Interface**:

- `Chat.tsx` - Message list + input
- `ChatInput.tsx` - Textarea + mic + mic button
- `Message.tsx` - Individual message rendering

**Settings**:

- `Settings.tsx` - Main settings panel
- `SettingsAppearance.tsx` - Font size/family
- `SettingsVoice.tsx` - TTS/STT configuration
- `SettingsLLM.tsx` - Model selection

## Data Flow Details

### Request Flow

```
Browser Request
    │
    ├─ GET  /                          → serve_spa() → dist/index.html
    ├─ GET  /assets/*                  → send_from_directory(dist, ...)
    ├─ GET  /api/state                 → jsonify(models + settings)
    ├─ POST /api/state                 → settings_manager.set()
    ├─ GET  /api/chats                 → chat_manager.get_records()
    ├─ GET  /api/chats/<id>            → chat_manager.get_with_messages()
    ├─ POST /api/chats/<id>            → chat_manager.write()
    ├─ GET  /api/models                → ollama_service.get_model_state()
    ├─ POST /api/models/download       → pull_model_by_name() in thread
    ├─ GET  /api/models/pull-progress  → pull_progress_sse() → Queue
    ├─ POST /api/llm/create            → ollama_service.create_session()
    ├─ GET  /api/llm/stream            → prompt_streaming() generator
    ├─ POST /api/voice/speak           → tts_manager.synthesize()
    ├─ POST /api/voice/transcribe      → stt_manager.transcribe_base64()
    └─ GET  /api/versions              → jsonify(version info)
```

### Streaming Inference

```python
# Backend (app.py)
@app.route("/api/llm/stream")
def llm_stream():
    def generate():
        for event in ollama_service.prompt_streaming(message, uuid):
            yield f"data: {json.dumps(event)}\n\n"
    return Response(generate(), mimetype="text/event-stream")
```

```typescript
// Frontend (api.ts)
function llmPromptStreaming(message, options, callbacks) {
  const es = new EventSource(
    `${API}/llm/stream?uuid=${uuid}&message=${message}`,
  );
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === "chunk") callbacks.onChunk(data.text);
    else if (data.type === "done") callbacks.onDone();
  };
}
```

### SSE Fan-Out (Pull Progress)

```python
# Multiple clients can subscribe to pull-progress
def subscribe_pull_events():
    q = Queue()
    with self._pull_lock:
        self._pull_queues.append(q)
    return q

def _broadcast_pull(event):
    for q in list(self._pull_queues):
        q.put(event)
```

## Thread Safety

### Singleton Pattern with Double-Checked Locking

```python
# All managers use this pattern

def get_tts_manager() -> TTSManager:
    global _tts
    if _tts is None:
        with _tts_lock:
            if _tts is None:
                _tts = TTSManager()
    return _tts
```

### Lock Usage

| Resource        | Lock Type                        | Purpose                          |
| --------------- | -------------------------------- | -------------------------------- |
| `_history`      | `_history_lock` (threading.Lock) | Prevent race in chat history     |
| `_loaded_voice` | `_lock` (threading.Lock)         | Prevent concurrent TTS synthesis |
| `_pull_queues`  | `_pull_lock` (threading.Lock)    | Thread-safe queue management     |

## Build Pipeline

### Development Mode

```bash
python3 app.py &      # Flask on :5080
npm run dev           # Vite on :5173, proxy /api → :5080
```

### Production Build

```bash
npm run build         # Vite → dist/ (minified, hashed)
python3 app.py        # Flask serves dist/
```

### Vite Configuration

```typescript
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
  server: {
    proxy: { "/api": "http://127.0.0.1:5080" },
  },
});
```

## Security Considerations

| Concern            | Mitigation                                       |
| ------------------ | ------------------------------------------------ |
| Path traversal     | `_valid_chat_id()` uses regex `^[A-Za-z0-9_-]+$` |
| Payload size       | 32KB message limit, 10MB chat write limit        |
| Input validation   | Length checks before processing                  |
| No secrets in code | Settings from `~/.config/Sprout/`                |

## Performance Characteristics

| Metric         | Target         | Notes                   |
| -------------- | -------------- | ----------------------- |
| Startup time   | < 3s           | Lazy-loaded models      |
| Chat streaming | 20-50 tokens/s | Depends on model size   |
| TTS latency    | < 2s           | First call (model load) |
| STT latency    | < 3s           | Depends on audio length |

## Scaling Considerations

- **Single instance**: Designed for single Pi deployment
- **No horizontal scaling**: Chat history is file-based (local only)
- **Concurrent users**: SSE fan-out supports multiple simultaneous subscribers
- **Memory**: ~100-200MB for Whisper model, ~50MB per Piper voice
