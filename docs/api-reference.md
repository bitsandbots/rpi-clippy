# API Reference

## Backend API

All endpoints are prefixed with `/api/`. The Flask server runs on port 5080.

### State Management

#### GET `/api/state`

Return full shared state (models + settings).

```bash
curl http://localhost:5080/api/state
```

**Response**:
```json
{
  "models": {
    "Gemma 3 (1B)": {
      "name": "Gemma 3 (1B)",
      "company": "Google",
      "size": 806,
      "ollamaTag": "gemma3:1b",
      "downloaded": true
    }
  },
  "settings": {
    "selectedModel": "Gemma 3 (1B)",
    "systemPrompt": "You are Clippy...",
    "temperature": 0.7,
    "topK": 10,
    "defaultFont": "Tahoma",
    "defaultFontSize": 16
  }
}
```

#### POST `/api/state`

Set a single setting value.

```bash
curl -X POST http://localhost:5080/api/state \
  -H "Content-Type: application/json" \
  -d '{"key": "defaultFontSize", "value": 18}'
```

**Response**:
```json
{"status": "ok"}
```

### Chats

#### GET `/api/chats`

List all chat records.

```bash
curl http://localhost:5080/api/chats
```

**Response**:
```json
{
  "chat-uuid-1": {
    "id": "chat-uuid-1",
    "createdAt": 1234567890,
    "updatedAt": 1234567890,
    "preview": "Hello Clippy"
  }
}
```

#### POST `/api/chats/<chat_id>`

Write a chat with messages. Max payload: 10MB, max messages: 1000.

```bash
curl -X POST http://localhost:5080/api/chats/chat-uuid-1 \
  -H "Content-Type: application/json" \
  -d '{
    "chat": {"id": "chat-uuid-1", "createdAt": 1234567890, "updatedAt": 1234567890, "preview": "Hello"},
    "messages": [
      {"id": "msg-1", "content": "Hello", "sender": "user", "createdAt": 1234567890}
    ]
  }'
```

#### GET `/api/chats/<chat_id>`

Get a specific chat with all messages.

#### DELETE `/api/chats/<chat_id>`

Delete a specific chat.

#### DELETE `/api/chats`

Delete all chats.

### Models

#### GET `/api/models`

Get model list with download status.

```bash
curl http://localhost:5080/api/models
```

#### POST `/api/models/refresh`

Refresh the available model cache.

#### POST `/api/models/download`

Download a model by display name.

```bash
curl -X POST http://localhost:5080/api/models/download \
  -H "Content-Type: application/json" \
  -d '{"name": "Gemma 3 (1B)"}'
```

#### POST `/api/models/delete`

Delete a model from Ollama.

```bash
curl -X POST http://localhost:5080/api/models/delete \
  -H "Content-Type: application/json" \
  -d '{"name": "Gemma 3 (1B)"}'
```

#### POST `/api/models/remove`

Remove a model from the available cache (without deleting from Ollama).

#### POST `/api/models/delete-all`

Delete all models from Ollama.

### SSE Streams

#### GET `/api/models/pull-progress`

SSE stream for model pull progress events.

```bash
curl -N http://localhost:5080/api/models/pull-progress
```

**Events**:
```json
{"type": "pull_progress", "tag": "gemma3:1b", "status": "Downloading", "total": 1000000, "completed": 500000, "elapsed": 1.2}
{"type": "pull_done", "tag": "gemma3:1b"}
{"type": "pull_error", "tag": "gemma3:1b", "error": "Connection refused"}
```

#### GET `/api/llm/stream`

SSE stream for LLM inference chunks.

**Query Parameters**:
- `uuid` - Request UUID
- `message` - User message

```bash
curl -N "http://localhost:5080/api/llm/stream?uuid=req-123&message=Hello"
```

**Events**:
```json
{"type": "chunk", "uuid": "req-123", "text": "Hello"}
{"type": "chunk", "uuid": "req-123", "text": " there"}
{"type": "done", "uuid": "req-123"}
{"type": "error", "uuid": "req-123", "error": "Model not found"}
```

### LLM Control

#### POST `/api/llm/create`

Create an LLM session with configuration.

```bash
curl -X POST http://localhost:5080/api/llm/create \
  -H "Content-Type: application/json" \
  -d '{
    "modelAlias": "Gemma 3 (1B)",
    "ollamaTag": "gemma3:1b",
    "systemPrompt": "You are Clippy...",
    "topK": 10,
    "temperature": 0.7,
    "initialPrompts": []
  }'
```

#### POST `/api/llm/destroy`

Destroy the current LLM session.

#### POST `/api/llm/abort`

Abort an in-progress streaming request.

```bash
curl -X POST http://localhost:5080/api/llm/abort \
  -H "Content-Type: application/json" \
  -d '{"uuid": "req-123"}'
```

### Ollama Connection

#### GET `/api/ollama/status`

Check Ollama connectivity.

```bash
curl http://localhost:5080/api/ollama/status
```

**Response**:
```json
{
  "url": "http://localhost:11434",
  "connected": true,
  "activeModel": "gemma3:1b"
}
```

#### POST `/api/ollama/url`

Change the Ollama base URL.

```bash
curl -X POST http://localhost:5080/api/ollama/url \
  -H "Content-Type: application/json" \
  -d '{"url": "http://remote-host:11434"}'
```

#### GET `/api/ollama/discover`

Scan local subnet for Ollama instances.

```bash
curl http://localhost:5080/api/ollama/discover
```

**Response**:
```json
{
  "instances": [
    {"url": "http://192.168.1.100:11434", "ip": "192.168.1.100"},
    {"url": "http://192.168.1.105:11434", "ip": "192.168.1.105"}
  ]
}
```

### Voice (TTS + STT)

#### GET `/api/voice/state`

Get TTS and STT state.

```bash
curl http://localhost:5080/api/voice/state
```

**Response**:
```json
{
  "tts": {
    "enabled": true,
    "currentVoice": "en_US-amy-medium",
    "voices": {
      "en_US-amy-medium": {
        "id": "en_US-amy-medium",
        "name": "en US amy medium",
        "description": "Clear American English",
        "language": "en",
        "gender": "female",
        "style": "neutral"
      }
    }
  },
  "stt": {
    "enabled": true,
    "model": "tiny",
    "available_models": ["tiny", "base", "small", "medium", "large"]
  }
}
```

#### POST `/api/voice/tts-toggle`

Toggle TTS on/off.

```bash
curl -X POST http://localhost:5080/api/voice/tts-toggle \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

#### POST `/api/voice/stt-toggle`

Toggle STT on/off.

#### POST `/api/voice/set-voice`

Load a specific voice model.

```bash
curl -X POST http://localhost:5080/api/voice/set-voice \
  -H "Content-Type: application/json" \
  -d '{"voiceId": "en_US-amy-medium"}'
```

#### POST `/api/voice/rescan`

Rescan the voices directory for new voices.

#### POST `/api/voice/speak`

Synthesize text to WAV audio.

```bash
curl -X POST http://localhost:5080/api/voice/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, world!", "lengthScale": 1.0}'
```

**Response**: `audio/wav` bytes

#### POST `/api/voice/transcribe`

Transcribe audio to text.

```bash
curl -X POST http://localhost:5080/api/voice/transcribe \
  -H "Content-Type: application/json" \
  -d '{"audio": "base64encodedaudio...", "language": "en"}'
```

**Response**:
```json
{"text": "Hello world", "language": "en", "probability": 0.99}
```

#### POST `/api/voice/stt-model`

Change the STT model.

```bash
curl -X POST http://localhost:5080/api/voice/stt-model \
  -H "Content-Type: application/json" \
  -d '{"model": "base"}'
```

### Utility

#### GET `/api/versions`

Get version information.

```bash
curl http://localhost:5080/api/versions
```

**Response**:
```json
{
  "clippy": "0.5.0",
  "python": "3.11.2",
  "flask": "3.1.3"
}
```

## Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| 400 | `invalid chat_id` | Chat ID contains invalid characters |
| 400 | `key required` | POST without key field |
| 400 | `uuid and message required` | Missing SSE stream params |
| 400 | `name required` | Missing model name |
| 400 | `voiceId required` | Missing voice ID |
| 400 | `audio (base64) required` | Missing audio in transcribe |
| 400 | `text required` | Missing text in speak |
| 400 | `model required` | Missing STT model |
| 413 | `payload too large` | Request exceeds size limit |
| 413 | `message too long` | Message exceeds 32000 chars |
| 413 | `audio payload too large` | Audio exceeds ~7MB |
| 500 | `<exception>` | Internal error |
| 503 | `TTS not available` | No voice loaded |

## Frontend API (clippyApi.tsx)

The frontend uses the same REST API but exposes it through TypeScript.

```typescript
import { clippyApi, electronAi } from "./clippyApi";

// Get full state
const state = await clippyApi.getFullState();

// Set a setting
await clippyApi.setState("settings.defaultFontSize", 18);

// Create LLM session
await clippyApi.llmCreate({
  modelAlias: "Gemma 3 (1B)",
  ollamaTag: "gemma3:1b",
  systemPrompt: "You are Clippy...",
  topK: 10,
  temperature: 0.7,
  initialPrompts: []
});

// Start streaming prompt
electronAi.promptStreaming(
  "Hello",
  { requestUUID: "req-123" },
  {
    onChunk: (text) => console.log(text),
    onDone: () => console.log("done"),
    onError: (error) => console.error(error)
  }
);
```

## SSE Event Types

### Pull Progress Events

| Type | Fields | Description |
|------|--------|-------------|
| `pull_progress` | tag, status, total, completed, elapsed | Model download in progress |
| `pull_done` | tag | Model download completed |
| `pull_error` | tag, error | Model download failed |

### LLM Stream Events

| Type | Fields | Description |
|------|--------|-------------|
| `chunk` | uuid, text | Inference chunk |
| `done` | uuid | Inference completed |
| `error` | uuid, error | Inference error |

### Voice State Events

| Field | Type | Description |
|-------|------|-------------|
| enabled | boolean | TTS/STT enabled |
| currentVoice | string | Active TTS voice ID |
| voices | object | Available voices |
| model | string | Active STT model |
| available_models | array | Available STT models |
