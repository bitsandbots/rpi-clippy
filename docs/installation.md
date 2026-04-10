# Installation & Setup

## Prerequisites

### Hardware

| Device         | RAM  | Notes                        |
| -------------- | ---- | ---------------------------- |
| Raspberry Pi 5 | 4GB+ | Recommended 8GB              |
| Raspberry Pi 4 | 4GB+ | Works, slower inference      |
| Other Linux    | -    | Any system with Python 3.11+ |

### Software

#### 1. Python 3.11+

```bash
# Check version
python3 --version

# Install on Debian/Ubuntu
sudo apt-get install -y python3 python3-pip
```

#### 2. Node.js 20+

```bash
# Using NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
sudo apt-get install -y nodejs

# Verify
node --version
npm --version
```

#### 3. Ollama

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama service
sudo systemctl status ollama
```

## Quick Install

### One-Command Installation

```bash
# Pull a model first
ollama pull llama3.2:1b

# Clone and install Clippy
git clone https://github.com/CoreConduit/rpi-clippy
cd rpi-clippy
bash install.sh
```

The `install.sh` script will:

1. Install system dependencies (`libespeak-ng1`, `libsndfile1`, `ffmpeg`)
2. Install Python dependencies
3. Install npm dependencies
4. Build the React frontend
5. Install and start the `clippy` systemd service

### Verify Installation

```bash
# Check service status
sudo systemctl status clippy

# View logs
sudo journalctl -u clippy -f

# Test API (requires Ollama running)
curl http://localhost:5080/api/versions
# Expected: {"clippy": "0.5.0", "python": "3.11.x", "flask": "3.1.3"}

curl http://localhost:5080/api/state
# Expected: {"models": {...}, "settings": {...}}
```

## Post-Installation Setup

### 1. Download Piper Voices (Optional but Recommended)

```bash
# Download default voices
bash scripts/setup_voices.sh

# Or download all voices
bash scripts/setup_voices.sh all

# Verify voices installed
ls -la ~/.config/Clippy/voices/
```

### 2. Enable Voice Features

1. Open `http://localhost:5080`
2. Click the gear icon in the bubble window
3. Go to the **Voice** tab
4. Toggle **Enable TTS** and/or **Enable STT**
5. Select a voice from the dropdown
6. Click **Test Voice** to verify

### 3. Verify Audio Hardware

```bash
# Test audio output
speaker-test -t sine -f 440 -c 2

# List audio devices
aplay -l

# List capture devices
arecord -l
```

### 4. Configure Ollama URL (if needed)

```bash
# For remote Ollama instance
curl -X POST http://localhost:5080/api/ollama/url \
  -H "Content-Type: application/json" \
  -d '{"url": "http://remote-host:11434"}'
```

## Manual Installation

### Step-by-Step (No systemd)

```bash
# 1. System dependencies
sudo apt-get install -y libespeak-ng1 libsndfile1 ffmpeg

# 2. Python dependencies
pip3 install flask requests piper-tts faster-whisper

# 3. Node dependencies
npm install

# 4. Build frontend
npm run build

# 5. Start the server
python3 app.py
```

### Development Mode

```bash
# Terminal 1: Start Flask backend
python3 app.py &

# Terminal 2: Start Vite dev server
npm run dev

# Open http://localhost:5173
```

## Service Management

### Check Status

```bash
sudo systemctl status clippy
```

### Start/Stop

```bash
sudo systemctl start clippy
sudo systemctl stop clippy
sudo systemctl restart clippy
```

### Auto-Start on Boot

```bash
# Already enabled by install.sh
sudo systemctl enable clippy

# To disable
sudo systemctl disable clippy
```

### View Logs

```bash
# All logs
sudo journalctl -u clippy

# Live logs
sudo journalctl -u clippy -f

# Filter by time
sudo journalctl -u clippy --since "2026-04-01"
```

## Troubleshooting

### Service Won't Start

```bash
# Check the service file
cat /etc/systemd/system/clippy.service

# Check for errors
sudo journalctl -u clippy -n 50

# Check Python syntax
python3 -m py_compile /home/coreconduit/rpi-clippy/app.py
```

### Port 5080 Already in Use

```bash
# Find process using port 5080
sudo lsof -i :5080

# Change port in clippy.service (requires manual edit)
# Edit ExecStart line to use different port
```

### Models Not Loading

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Pull a model
ollama pull llama3.2:1b
```

### Audio Issues

```bash
# Check ffmpeg is installed
ffmpeg -version

# Test audio output
speaker-test -c 2 -t wav

# Check volume
alsamixer
```

## Uninstallation

```bash
# Stop and disable service
sudo systemctl stop clippy
sudo systemctl disable clippy

# Remove service file
sudo rm /etc/systemd/system/clippy.service
sudo systemctl daemon-reload

# Remove data (optional)
rm -rf ~/.config/Clippy
```

## Docker (Alternative)

While not officially supported, Clippy can run in Docker:

```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    libespeak-ng1 libsndfile1 ffmpeg nodejs npm

WORKDIR /app
COPY . .

RUN npm install && npm run build

EXPOSE 5080
CMD ["python3", "app.py"]
```

**Note**: Docker requires `--network host` for Ollama access and audio device passthrough.
