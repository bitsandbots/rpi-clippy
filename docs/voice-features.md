# Voice Features Guide

## Overview

Clippy supports two voice features:

1. **Text-to-Speech (TTS)** - Voice responses via Piper TTS
2. **Speech-to-Text (STT)** - Voice input via Faster-Whisper STT

## Prerequisites

### System Dependencies

```bash
# Required for both TTS and STT
sudo apt-get install -y libespeak-ng1 libsndfile1 ffmpeg
```

### Ollama Setup

```bash
# Pull a model for LLM responses
ollama pull llama3.2:1b
```

## Text-to-Speech (TTS)

### How It Works

1. Clippy receives LLM response text
2. `TTSManager.synthesize()` converts text to WAV audio
3. Audio plays via browser's Web Audio API
4. Uses Piper `.onnx` voice models

### Voice Models

Voices are stored in `~/.config/Clippy/voices/`

| Voice                 | Gender | Description            | File Size |
| --------------------- | ------ | ---------------------- | --------- |
| `en_US-amy-medium`    | Female | Clear American English | ~63 MB    |
| `en_US-lessac-medium` | Male   | Warm American English  | ~63 MB    |
| `en_US-ryan-high`     | Male   | High-quality, slower   | ~63 MB    |
| `en_US-kusal-medium`  | Male   | Friendly American      | ~63 MB    |
| `en_GB-alan-medium`   | Male   | British English        | ~63 MB    |

### Download Voices

```bash
# Download default voices
bash scripts/setup_voices.sh

# Download specific voice
bash scripts/setup_voices.sh en_US-amy-medium

# Download all voices
bash scripts/setup_voices.sh all
```

### Configure TTS

1. Open Settings → Voice
2. Enable "Enable TTS"
3. Select a voice from dropdown
4. Click "Test Voice" to verify

### API Endpoint

```bash
# Synthesize text to WAV
curl -X POST http://localhost:5080/api/voice/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, world!", "lengthScale": 1.0}'
```

**Length Scale**:

- `< 1.0` - Faster speech
- `= 1.0` - Normal speed (default)
- `> 1.0` - Slower speech

## Speech-to-Text (STT)

### How It Works

1. Browser records audio via `MediaRecorder`
2. Audio sent to `/api/voice/transcribe` as base64
3. `STTManager` transcribes using Whisper model
4. Result returned as text

### Whisper Models

| Model    | Size     | Accuracy | Speed   |
| -------- | -------- | -------- | ------- |
| `tiny`   | ~39 MB   | Basic    | Fastest |
| `base`   | ~74 MB   | Good     | Fast    |
| `small`  | ~243 MB  | Good     | Medium  |
| `medium` | ~769 MB  | High     | Slow    |
| `large`  | ~1550 MB | Highest  | Slowest |

### Configure STT

1. Open Settings → Voice
2. Enable "Enable STT"
3. Select Whisper model
4. Click mic button in chat input to record

### Audio Format Requirements

- Browser records: **WebM** (Opus codec)
- Required: **ffmpeg** for format conversion
- Sample rate: 16 kHz (Mono)

### API Endpoint

```bash
# Transcribe base64 audio
curl -X POST http://localhost:5080/api/voice/transcribe \
  -H "Content-Type: application/json" \
  -d '{"audio": "base64encodeddata...", "language": "en"}'
```

**Language Codes**: `en`, `fr`, `es`, `de`, `ja`, `zh`, etc.

## Troubleshooting

### TTS Not Working

```bash
# Check voice files exist
ls -la ~/.config/Clippy/voices/*.onnx

# Check piper-tts is installed
python3 -c "from piper import PiperVoice; print('OK')"

# Test voice loading
python3 -c "
from src.python.tts_manager import get_tts_manager
tts = get_tts_manager()
tts.load_voice('en_US-amy-medium')
result = tts.synthesize('Hello')
print(f'WAV bytes: {len(result) if result else 0}')
"
```

### STT Not Working

```bash
# Check ffmpeg is installed
ffmpeg -version

# Check faster-whisper is installed
python3 -c "from faster_whisper import WhisperModel; print('OK')"

# Test transcription
python3 -c "
import base64
import wave
from src.python.stt_manager import get_stt_manager

# Create a test WAV file
with wave.open('/tmp/test.wav', 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(16000)
    w.writeframes(b'\\x00' * 16000)  # 1 sec silence

stt = get_stt_manager()
stt.load_model('tiny')
result = stt.transcribe('/tmp/test.wav')
print(result)
"
```

### Audio Not Playing

```bash
# Test system audio
speaker-test -t sine -f 440 -c 2

# Check audio devices
aplay -l
arecord -l

# Check volume levels
alsamixer
```

### Browser Permissions

- Allow microphone access when prompted
- Check browser settings: Settings → Privacy → Microphone
- Some browsers require HTTPS for microphone access (localhost OK)

## Customization

### Add Custom Voice

1. Download `.onnx` and `.onnx.json` from the [Piper repository](https://github.com/rhasspy/piper)
2. Place both files in `~/.config/Clippy/voices/`
3. Optionally create a `.meta.json` alongside for display metadata:

```json
{
  "name": "Custom Voice",
  "description": "My custom voice",
  "language": "en",
  "gender": "female",
  "style": "narrative"
}
```

4. Click **Rescan Voices** in Settings → Voice

> **Note**: Voice files smaller than 1 KB are automatically skipped as likely corrupted (e.g. a failed or partial download). Ensure the `.onnx` file is complete before rescanning. A warning is logged to the server console for any skipped files.

### Adjust Voice Settings

**Speed Control**:

- In code: `length_scale` parameter in `synthesize()`
- In UI: Modify `settings_manager.py` DEFAULT_SETTINGS

**Voice Priority**:

- Voices loaded on first access
- First available voice auto-loads if none selected

## Performance Notes

### TTS Performance

| Model         | Memory | CPU Usage | Latency |
| ------------- | ------ | --------- | ------- |
| Piper (.onnx) | ~50 MB | Low       | < 1s    |

### STT Performance

| Model         | Memory  | CPU Usage   | Latency     |
| ------------- | ------- | ----------- | ----------- |
| Whisper tiny  | ~150 MB | Low-Medium  | ~2x audio   |
| Whisper base  | ~300 MB | Medium      | ~1.5x audio |
| Whisper small | ~600 MB | Medium-High | ~1x audio   |

### Optimization Tips

1. **Use tiny model for STT on Pi 5 (4GB)**
2. **Load only one TTS voice at a time**
3. **Pre-load models on startup via Settings**

## Examples

### Programmatic TTS

```python
from src.python.tts_manager import get_tts_manager

tts = get_tts_manager()
tts.enabled = True
tts.load_voice("en_US-amy-medium")

wav_bytes = tts.synthesize("Hello, this is Clippy!")
print(f"Generated {len(wav_bytes)} bytes of audio")
```

### Programmatic STT

```python
from src.python.stt_manager import get_stt_manager
import base64

stt = get_stt_manager()
stt.enabled = True
stt.load_model("tiny")

# From audio file
result = stt.transcribe("/path/to/audio.webm")
print(result["text"])

# From base64
with open("audio.webm", "rb") as f:
    audio_b64 = base64.b64encode(f.read()).decode()
result = stt.transcribe_base64(audio_b64)
print(result["text"])
```

## File Locations

```
~/.config/Clippy/
├── settings.json          # TTS/STT enabled flags
├── voices/                # TTS models
│   ├── en_US-amy-medium.onnx
│   ├── en_US-amy-medium.onnx.json
│   ├── en_US-amy-medium.meta.json
│   └── ...
└── stt_cache/            # Whisper model cache (auto-managed)
```

## Related Files

| File                                        | Purpose               |
| ------------------------------------------- | --------------------- |
| `src/python/tts_manager.py`                 | TTS voice management  |
| `src/python/stt_manager.py`                 | STT transcription     |
| `src/renderer/contexts/VoiceContext.tsx`    | Voice state           |
| `src/renderer/components/SettingsVoice.tsx` | Voice settings UI     |
| `scripts/setup_voices.sh`                   | Voice download script |
