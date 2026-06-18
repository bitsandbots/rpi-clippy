#!/usr/bin/env bash
# setup_voices.sh — Download starter Piper TTS voices to ~/.config/Sprout/voices/
#
# Usage:
#   bash scripts/setup_voices.sh            # download default voices
#   bash scripts/setup_voices.sh all        # download all voices in this script
#   bash scripts/setup_voices.sh <voice_id> # download one specific voice
#
# Voice files come from the official Piper voices repository on HuggingFace.
# Each voice is two files: <id>.onnx and <id>.onnx.json

set -euo pipefail

VOICES_DIR="${HOME}/.config/Sprout/voices"
BASE_URL="https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0"

mkdir -p "$VOICES_DIR"

# ── Voice catalogue ─────────────────────────────────────────────────────────
# Format: voice_id|hf_path|gender|style|description
VOICES=(
  "en_US-amy-medium|en/en_US/amy/medium|female|neutral|Clear American English, general purpose"
  "en_US-lessac-medium|en/en_US/lessac/medium|male|neutral|Warm American English male voice"
  "en_US-ryan-high|en/en_US/ryan/high|male|neutral|High-quality American English male, slower on Pi 5"
  "en_US-kusal-medium|en/en_US/kusal/medium|male|neutral|Friendly American English male"
  "en_GB-alan-medium|en/en_GB/alan/medium|male|neutral|British English male"
)

# Default voices to install when called without arguments
DEFAULT_VOICES=("en_US-amy-medium" "en_US-lessac-medium")

# ── Functions ───────────────────────────────────────────────────────────────

download_voice() {
  local voice_id="$1"
  local hf_path=""
  local gender="" style="" description=""

  # Look up in catalogue
  for entry in "${VOICES[@]}"; do
    IFS='|' read -r id path g s d <<< "$entry"
    if [[ "$id" == "$voice_id" ]]; then
      hf_path="$path"; gender="$g"; style="$s"; description="$d"
      break
    fi
  done

  if [[ -z "$hf_path" ]]; then
    echo "Unknown voice: $voice_id"
    echo "Available: $(for e in "${VOICES[@]}"; do echo "${e%%|*}"; done | tr '\n' ' ')"
    return 1
  fi

  local onnx="${VOICES_DIR}/${voice_id}.onnx"
  local config="${VOICES_DIR}/${voice_id}.onnx.json"
  local meta="${VOICES_DIR}/${voice_id}.meta.json"

  echo "--> Downloading ${voice_id}..."

  if [[ ! -f "$onnx" ]]; then
    curl -fsSL -o "$onnx" "${BASE_URL}/${hf_path}/${voice_id}.onnx"
  else
    echo "    ${voice_id}.onnx already exists, skipping."
  fi

  if [[ ! -f "$config" ]]; then
    curl -fsSL -o "$config" "${BASE_URL}/${hf_path}/${voice_id}.onnx.json"
  fi

  # Write metadata sidecar
  cat > "$meta" <<EOF
{
  "name": "${voice_id//-/ }",
  "description": "${description}",
  "language": "en",
  "gender": "${gender}",
  "style": "${style}"
}
EOF

  echo "    Done: ${voice_id}"
}

# ── Main ─────────────────────────────────────────────────────────────────────

MODE="${1:-default}"

case "$MODE" in
  all)
    for entry in "${VOICES[@]}"; do
      download_voice "${entry%%|*}"
    done
    ;;
  default)
    for voice_id in "${DEFAULT_VOICES[@]}"; do
      download_voice "$voice_id"
    done
    ;;
  *)
    download_voice "$MODE"
    ;;
esac

echo ""
echo "Voices installed to: $VOICES_DIR"
ls -1 "$VOICES_DIR"/*.onnx 2>/dev/null | sed 's|.*/||; s|\.onnx$||' || echo "(none)"
echo ""
echo "Restart Sprout or click 'Rescan Voices' in Settings > Voice to pick them up."
