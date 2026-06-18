#!/usr/bin/env bash
# install.sh — set up and enable the Sprout systemd service
# Usage: bash install.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="sprout"
SERVICE_DEST="/etc/systemd/system/$SERVICE_NAME.service"
INSTALL_USER="${SUDO_USER:-$(whoami)}"
VENV_DIR="$SCRIPT_DIR/.venv"

VERSION=$(python3 -c "import json; print(json.load(open('$SCRIPT_DIR/package.json'))['version'])" 2>/dev/null || echo "unknown")
echo "==> Installing Sprout v$VERSION"
echo "    User: $INSTALL_USER"
echo "    Dir:  $SCRIPT_DIR"

# ── Prerequisites check ────────────────────────────────────────────────────
python3 -c "import sys; assert sys.version_info >= (3,11), 'Python 3.11+ required'" \
  || { echo "ERROR: Python 3.11+ required"; exit 1; }

node --version &>/dev/null || { echo "ERROR: Node.js not found — install v20+"; exit 1; }

# ── 1. System dependencies ─────────────────────────────────────────────────
echo "--> Installing system dependencies..."
sudo apt-get install -y -q \
  python3-venv \
  libespeak-ng1 \
  libsndfile1 \
  ffmpeg

# ── 2. Python virtual environment ─────────────────────────────────────────
echo "--> Setting up Python virtual environment at $VENV_DIR..."
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --upgrade pip -q
"$VENV_DIR/bin/pip" install -q -r "$SCRIPT_DIR/requirements.txt"

# ── 3. Node dependencies ───────────────────────────────────────────────────
echo "--> Installing Node dependencies..."
cd "$SCRIPT_DIR"
npm install --silent

# ── 4. Build React frontend ────────────────────────────────────────────────
echo "--> Building frontend..."
npm run build

# ── 5. Generate and install systemd service ────────────────────────────────
echo "--> Installing systemd service to $SERVICE_DEST..."
sudo tee "$SERVICE_DEST" > /dev/null << EOF
[Unit]
Description=Sprout — local LLM chat assistant (Flask/Ollama)
After=network.target ollama.service
Wants=ollama.service

[Service]
Type=simple
User=$INSTALL_USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=$VENV_DIR/bin/python3 $SCRIPT_DIR/app.py
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=sprout

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

# ── 6. Status ──────────────────────────────────────────────────────────────
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "✓ Sprout v$VERSION installed and running."
echo ""
sudo systemctl status "$SERVICE_NAME" --no-pager -l || true
echo ""
echo "Access Sprout at:"
echo "  Local:   http://localhost:5080"
echo "  Network: http://$LOCAL_IP:5080"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status sprout"
echo "  sudo journalctl -u sprout -f"
echo "  sudo systemctl restart sprout"
echo ""
echo "Optional: download Piper TTS voice models for text-to-speech:"
echo "  bash scripts/setup_voices.sh        # default voices (~200 MB)"
echo "  bash scripts/setup_voices.sh all    # all available voices"
echo "  Then enable in Settings → Voice."
