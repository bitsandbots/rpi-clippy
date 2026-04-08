# Clippy Documentation

A revival of Microsoft Office 97's Clippy as a local LLM chat interface running on Raspberry Pi 5.

## Quick Links

- [Overview](overview.md) - Project purpose and goals
- [Architecture](architecture.md) - High-level design and data flow
- [Tech Stack](tech-stack.md) - Technologies and versions
- [Installation](installation.md) - Setup and running instructions
- [API Reference](api-reference.md) - Backend API documentation
- [Frontend Components](frontend-components.md) - React component documentation
- [Voice Features](voice-features.md) - TTS and STT setup guide

## Project Structure

```
rpi-clippy/
├── docs/              # This documentation
├── src/
│   ├── python/        # Backend Python modules
│   │   ├── ollama_service.py  # LLM inference via Ollama
│   │   ├── chat_manager.py    # Chat history persistence
│   │   ├── settings_manager.py # App settings
│   │   ├── tts_manager.py     # Piper TTS voice synthesis
│   │   └── stt_manager.py     # Faster-Whisper STT
│   └── renderer/      # React frontend
│       ├── api.ts     # Frontend-to-backend API calls
│       ├── contexts/  # React context providers
│       └── components/ # React UI components
├── dist/              # Vite build output
├── assets/            # Static assets (images, sounds)
├── scripts/           # Utility scripts
├── app.py             # Flask entry point
├── clippy.service     # Systemd service definition
└── install.sh         # Installation script
```

## Getting Started

### Prerequisites

- Raspberry Pi 5 (4GB+ RAM recommended)
- Python 3.11+
- Node.js 20+
- Ollama running on port 11434

### Quick Install

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2:1b
git clone https://github.com/CoreConduit/rpi-clippy
cd rpi-clippy
bash install.sh
```

Access at: `http://localhost:5080`

## Development

```bash
# Install dependencies (already done via install.sh)
bash install.sh

# Run in dev mode (hot reload)
npm run dev  # Frontend on :5173

# Build for production
npm run build

# Format code
npm run lint

# Run tests
npm run test
```

## Service Management

```bash
# Status
sudo systemctl status clippy

# Restart after config changes
sudo systemctl restart clippy

# View logs
sudo journalctl -u clippy -f

# Stop
sudo systemctl stop clippy

# Disable auto-start
sudo systemctl disable clippy
```

## Voice Setup

```bash
# Download default voices (~200 MB)
bash scripts/setup_voices.sh

# Download all voices
bash scripts/setup_voices.sh all

# Enable in Settings → Voice
```

## Storage Locations

All data stored in `~/.config/Clippy/`:

- `settings.json` - App configuration
- `debug.json` - Debug flags
- `chats/` - Chat history
- `voices/` - TTS voice models (.onnx files)

## Support

- Report issues: [GitHub Issues](https://github.com/CoreConduit/rpi-clippy/issues)
- Documentation: [GitHub Wiki](https://github.com/CoreConduit/rpi-clippy/wiki)

## License

MIT - See [LICENSE](../LICENSE) file.
