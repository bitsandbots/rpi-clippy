#!/usr/bin/env bash
# install.sh — set up and enable the Clippy systemd service
# Usage: bash install.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="clippy"
SERVICE_FILE="$SCRIPT_DIR/clippy.service"
SERVICE_DEST="/etc/systemd/system/$SERVICE_NAME.service"

echo "==> Installing Clippy..."

# ── 1. System dependencies ─────────────────────────────────────────────────
echo "--> Installing system dependencies..."
sudo apt-get install -y -q \
  libespeak-ng1 \
  libsndfile1 \
  ffmpeg

# ── 2. Python dependencies ─────────────────────────────────────────────────
echo "--> Installing Python dependencies..."
pip3 install --break-system-packages -q flask requests piper-tts faster-whisper

# ── 3. Node dependencies ───────────────────────────────────────────────────
echo "--> Installing Node dependencies..."
cd "$SCRIPT_DIR"
npm install --silent

# ── 4. Build React frontend ────────────────────────────────────────────────
echo "--> Building frontend..."
npm run build

# ── 5. Install systemd service ─────────────────────────────────────────────
echo "--> Installing systemd service to $SERVICE_DEST..."
sudo cp "$SERVICE_FILE" "$SERVICE_DEST"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

# ── 6. Status ──────────────────────────────────────────────────────────────
echo ""
echo "✓ Clippy installed and running."
echo ""
sudo systemctl status "$SERVICE_NAME" --no-pager -l || true
echo ""
echo "Access Clippy at: http://localhost:5080"
echo "Or from your network at: http://$(hostname -I | awk '{print $1}'):5080"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status clippy"
echo "  sudo journalctl -u clippy -f"
echo "  sudo systemctl restart clippy"
