#!/usr/bin/env bash
# release.sh — bump version, run tests, build, tag, and push a Clippy release
# Usage: bash release.sh <major|minor|patch>
#   bash release.sh patch   # 0.5.0 → 0.5.1
#   bash release.sh minor   # 0.5.0 → 0.6.0
#   bash release.sh major   # 0.5.0 → 1.0.0

set -euo pipefail

BUMP="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -z "$BUMP" || ! "$BUMP" =~ ^(major|minor|patch)$ ]]; then
  echo "Usage: bash release.sh <major|minor|patch>"
  exit 1
fi

# ── Guard: clean working tree ──────────────────────────────────────────────
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Working tree is dirty. Commit or stash changes first."
  git status --short
  exit 1
fi

CURRENT=$(python3 -c "import json; print(json.load(open('package.json'))['version'])")
echo "==> Current version: $CURRENT"

# ── Bump version ───────────────────────────────────────────────────────────
IFS='.' read -r MAJ MIN PAT <<< "$CURRENT"
case "$BUMP" in
  major) MAJ=$((MAJ + 1)); MIN=0; PAT=0 ;;
  minor) MIN=$((MIN + 1)); PAT=0 ;;
  patch) PAT=$((PAT + 1)) ;;
esac
NEW_VERSION="$MAJ.$MIN.$PAT"
echo "==> Bumping to: $NEW_VERSION"

# Update package.json
python3 -c "
import json
with open('package.json') as f: d = json.load(f)
d['version'] = '$NEW_VERSION'
with open('package.json', 'w') as f: json.dump(d, f, indent=2)
print('  package.json updated')
"

# Update app.py version if present
if grep -q "CLIPPY_VERSION" app.py; then
  sed -i "s/CLIPPY_VERSION = \"[^\"]*\"/CLIPPY_VERSION = \"$NEW_VERSION\"/" app.py
  echo "  app.py updated"
fi

# ── Run tests ──────────────────────────────────────────────────────────────
echo "--> Running Python tests..."
python3 -m pytest -q || { echo "ERROR: Python tests failed — aborting release"; exit 1; }

echo "--> Running frontend tests..."
node node_modules/vitest/dist/cli.js run --reporter=verbose 2>&1 | tail -8
# Check exit code
node node_modules/vitest/dist/cli.js run --silent || { echo "ERROR: Frontend tests failed — aborting release"; exit 1; }

# ── Build frontend ─────────────────────────────────────────────────────────
echo "--> Building frontend..."
npm run build

# ── Commit + tag ───────────────────────────────────────────────────────────
echo "--> Committing version bump..."
git add package.json app.py 2>/dev/null || git add package.json
git commit -m "chore: bump version to $NEW_VERSION"

echo "--> Tagging v$NEW_VERSION..."
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

# ── Push ───────────────────────────────────────────────────────────────────
echo "--> Pushing to origin..."
git push origin main
git push origin "v$NEW_VERSION"

echo ""
echo "✓ Released v$NEW_VERSION"
echo "  Tag:    v$NEW_VERSION"
echo "  Commit: $(git rev-parse --short HEAD)"
echo ""
echo "To deploy on the Pi:"
echo "  git pull && bash install.sh"
