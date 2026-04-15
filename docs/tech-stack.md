# Tech Stack

## Frontend

| Technology     | Version | Purpose                        |
| -------------- | ------- | ------------------------------ |
| React          | 19.0.0  | UI rendering                   |
| React DOM      | 19.1.0  | Browser DOM                    |
| TypeScript     | 5.8.3   | Type safety                    |
| Vite           | 5.4.14  | Build tool + dev server        |
| Vitest         | 2.0.0   | Testing framework              |
| 98.css         | 0.1.21  | Windows 98 styling             |
| React Markdown | 10.1.0  | Markdown rendering in messages |
| date-fns       | 4.1.0   | Date formatting utilities      |

### Development Tools

| Tool                 | Purpose                         |
| -------------------- | ------------------------------- |
| Prettier             | Code formatting (.ts, .tsx)     |
| jsdom                | Headless browser testing        |
| @vitejs/plugin-react | Vite React/JSX transform plugin |

## Backend (Python)

| Library        | Version | Purpose                         |
| -------------- | ------- | ------------------------------- |
| Flask          | 3.1.3   | Web server, routing, SSE        |
| Requests       | 2.32.3  | Ollama HTTP client              |
| piper-tts      | 1.4.2   | TTS synthesis (.onnx)           |
| faster-whisper | 1.2.1   | STT transcription (CTranslate2) |

### System Dependencies (via apt)

| Package       | Purpose                                      |
| ------------- | -------------------------------------------- |
| libespeak-ng1 | TTS voice synthesis engine                   |
| libsndfile1   | Audio file I/O                               |
| ffmpeg        | Audio format conversion (WebM → WAV for STT) |

## Infrastructure

| Technology   | Version | Purpose                |
| ------------ | ------- | ---------------------- |
| Python       | 3.11+   | Runtime                |
| Node.js      | 20+     | Frontend build         |
| Ollama       | -       | Local LLM server       |
| Systemd      | -       | Service management     |
| nginx/Apache | -       | Optional reverse proxy |

## Model Dependencies

### LLM Models (Ollama)

| Model      | Tag           | Size    | Recommended For |
| ---------- | ------------- | ------- | --------------- |
| TinyLlama  | `tinyllama`   | ~637 MB | Pi 5 (4GB)      |
| Llama 3.2  | `llama3.2:1b` | ~808 MB | Pi 5 (4GB)      |
| Gemma 3    | `gemma3:1b`   | ~806 MB | Pi 5 (4GB)      |
| Llama 3.2  | `llama3.2:3b` | ~2.0 GB | Pi 5 (8GB)      |
| Phi-4 Mini | `phi4-mini`   | ~2.5 GB | Pi 5 (8GB)      |
| Qwen3      | `qwen3:4b`    | ~2.5 GB | Pi 5 (8GB)      |
| Gemma 3    | `gemma3:4b`   | ~2.5 GB | Pi 5 (8GB)      |
| Gemma 3    | `gemma3:12b`  | ~5.6 GB | Pi 5 (16GB)     |

### TTS Voices (Piper)

| Voice               | Gender | Language        | File Size |
| ------------------- | ------ | --------------- | --------- |
| en_US-amy-medium    | Female | US English      | ~63 MB    |
| en_US-lessac-medium | Male   | US English      | ~63 MB    |
| en_US-ryan-high     | Male   | US English      | ~63 MB    |
| en_US-kusal-medium  | Male   | US English      | ~63 MB    |
| en_GB-alan-medium   | Male   | British English | ~63 MB    |

### STT Models (Faster-Whisper)

| Model  | Size     | Accuracy | Speed   |
| ------ | -------- | -------- | ------- |
| tiny   | ~39 MB   | Basic    | Fastest |
| base   | ~74 MB   | Good     | Fast    |
| small  | ~243 MB  | Good     | Medium  |
| medium | ~769 MB  | High     | Slow    |
| large  | ~1550 MB | Highest  | Slowest |

## Dependencies Tree

```
rpi-clippy/
├── Flask (Python)
│   ├── requests (for Ollama)
│   └── threading (concurrency)
├── React (JavaScript)
│   ├── react-markdown (Markdown rendering)
│   └── 98.css (styling)
├── Vite
│   ├── @vitejs/plugin-react
│   └── vitest (testing)
└── Python Voice Libraries
    ├── piper-tts (Piper TTS)
    └── faster-whisper (Whisper STT)
        └── ctranslate2 (CPU backend)
            └── libsndfile1, ffmpeg (system)
```

## Version Compliance

### Minimum Versions

| Component | Minimum | Why                        |
| --------- | ------- | -------------------------- |
| Python    | 3.11    | Type hints, pathlib        |
| Node.js   | 20      | Modern JavaScript features |
| Ollama    | 0.1.0   | Required API endpoints     |

### Version Checking

```bash
# Verify versions
python3 --version    # 3.11+
node --version       # 20+
ollama --version     # Any recent
```

## License Compliance

| Component      | License    | Note                      |
| -------------- | ---------- | ------------------------- |
| React          | MIT        | OK for commercial use     |
| 98.css         | MIT        | OK                        |
| Flask          | BSD-3      | OK                        |
| piper-tts      | MIT        | OK                        |
| faster-whisper | Apache-2.0 | OK with attribution       |
| Ollama         | EULA       | Requires separate install |
