# ADR-0002: Sprout Reactive Character Engine

**Date:** 2026-06-18
**Status:** Accepted
**Deciders:** Cory (CoreConduit)
**Plan:** `docs/2026-06-18-sprout-reactive-character.md`
**Spec:** `docs/superpowers/specs/sprout-reactive-character.md`

---

## Context

The existing Sprout character (`src/renderer/components/Sprout.tsx`) is a sprite-sheet driver. The LLM emits bracket tokens like `[Greeting]`; the component hard-swaps a PNG sprite sheet for a fixed duration, then reverts to `Default`. This discrete model cannot produce continuous reactivity (eye tracking, blink, mood blends, lip-sync, ambient garden telemetry expression). Four architectural decisions were required before writing any engine code.

---

## Decision 1: Port Godot concepts to TypeScript — do not embed Godot

### Options considered

| Option                            | Description                                                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Port concepts (chosen)**    | Implement the Godot animation idioms (StateMachine, BlendSpace2D, OneShot, Tween, signals, `_process`) as a small pure-TypeScript engine inside the existing React/Vite project. |
| B — Godot HTML5/WASM export       | Export the Sprout scene from Godot editor to WASM+WebGL and embed it in an `<iframe>` or Web Component.                                                                          |
| C — Third-party animation library | Use a library such as GSAP, Motion One, or Anime.js to drive the SVG.                                                                                                            |

### Why Option A

- **Pi-affordable.** A Godot HTML5 export for a simple character is ~10–30 MB of WASM + JS; Pi 5 Chromium handles it but it is disproportionate overhead for a sidebar widget. Our engine fits in ~10 KB minified.
- **WebGL not guaranteed.** Pi 5 Chromium WebGL support is present but limited; Godot's HTML5 renderer requires WebGL 2.0 which may not be available or may have driver quirks on Pi OS's Chromium build.
- **Stack coherence.** Godot fights the existing React/Vite/98.css/Flask/SSE stack: it expects to own the canvas, manages its own event loop, and cannot trivially subscribe to React context or our SSE streams.
- **Offline packaging.** A WASM blob complicates `install.sh` and offline deployment; it is not addressable by `pip install` or `npm install`.
- **Option C rejected** because third-party animation libraries encode their own animation models and would require translating the Godot concepts a second time into their API, adding a runtime dependency with no corresponding reduction in complexity.

**Godot 4 concept references used for the port:**

- AnimationNodeStateMachine: https://docs.godotengine.org/en/stable/classes/class_animationnodestatemachine.html
- AnimationNodeBlendSpace2D: https://docs.godotengine.org/en/stable/classes/class_animationnodeblendspace2d.html
- AnimationNodeOneShot: https://docs.godotengine.org/en/stable/classes/class_animationnodeoneshot.html
- Tween: https://docs.godotengine.org/en/stable/classes/class_tween.html
- Signals: https://docs.godotengine.org/en/stable/getting_started/step_by_step/signals.html
- `_process(delta)`: https://docs.godotengine.org/en/stable/tutorials/scripting/idle_and_physics_processing.html

> Note: This is a _conceptual_ port. API-level parity is not claimed. Godot 3 AnimationTree differs significantly from Godot 4; all references above are Godot 4 stable.

---

## Decision 2: SVG-first rig, Canvas 2D as fallback

### Options considered

| Option               | Description                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------- |
| **A — SVG (chosen)** | Each body part is a named SVG element; the brain mutates attributes via refs each frame. |
| B — Canvas 2D        | A single `<canvas>` element; the brain calls `ctx.draw*` calls each frame.               |
| C — WebGL / Three.js | GPU-accelerated; overkill for a 2D sidebar widget. Rejected outright.                    |

### Why SVG-first

- **Crisp at any size.** Resolution-independent; no blurring at 372 px or higher DPI displays.
- **Easy part addressing.** Named SVG elements (by id or ref) make the brain's attribute writes straightforward. No manual coordinate tracking needed.
- **Cheap on Pi.** SVG DOM mutations for a ~12-part rig are well within Pi 5 Chromium's budget at 30 fps. Canvas would be equally fast but requires more bookkeeping code.
- **Inspectable.** The rig is visible in DevTools as real DOM nodes, which aids debugging.

Canvas 2D remains the **defined fallback path**: if profiling in Phase 6 shows the SVG DOM mutations are unexpectedly expensive, the brain can be rewired to call `ctx.drawImage` / `ctx.save` / `ctx.restore` with the same transform math, using the same `parts.ts` definitions.

---

## Decision 3: Sprite-Sprout becomes `sprout-classic`; reactive Sprout becomes the canonical `sprout`

### Rationale

- The `CharacterId = "sprout"` value is already in production and persisted in user settings. Reusing it for the reactive rig means zero migration work for existing users.
- The sprite assets (`src/renderer/images/animations/sprout/`) and their generation tooling (`tools/generate-sprout-assets.py`) are preserved as the `sprout-classic` character, providing a tested fallback and a `prefers-reduced-motion` / low-power path.
- Renaming (via `git mv`) the four sprite source files to `sprout-classic-*` preserves git history.

### Character ID mapping

| `settings.character` | Renderer            | Source                                           |
| -------------------- | ------------------- | ------------------------------------------------ |
| `"sprout"` (default) | Reactive SVG rig    | `src/renderer/sprout/`                           |
| `"sprout-classic"`   | Sprite-sheet driver | Renamed `sprout-classic-animations.tsx`          |
| `"clippy"`           | Sprite-sheet driver | `src/renderer/clippy-animations.tsx` (unchanged) |

---

## Decision 4: Engine logic is pure TypeScript with no React or DOM imports

### Rationale

- Matches the repo's existing test discipline: `sprout-animation-helpers.test.ts` tests pure functions without a DOM. Engine modules must be equally testable under Vitest without `jsdom`.
- Prevents accidental coupling between the animation math and React's render lifecycle. The brain mutates SVG refs directly via `ref.current.setAttribute()`; React only mounts the SVG once.
- Makes the engine portable: if the renderer ever changes (Canvas fallback, server-side SVG generation), the engine stays untouched.

**Enforcement:** The Phase 1 VERIFY gate runs `grep -r "document\|window\|HTMLElement" src/renderer/sprout/engine/` and requires an empty result.

---

## Telemetry source (Phase 0 open item — resolved 2026-06-18)

**Confirmed: hydroMazing HTTP API.**

`garden_service.py` is a thin HTTP proxy to the existing hydroMazing local service. It normalizes the API response to the stable `GardenState` contract (spec §5) and serves it via Flask at `GET /api/garden/state` and `GET /api/garden/stream` (SSE). No GPIO reads, no MQTT broker, no shared file. Implementation in Phase 5.

---

## Consequences

- A `src/renderer/sprout/` module tree is introduced with engine, rig, and config subdirectories. This is a net addition; no existing paths are removed in Phase 1.
- The sprite Sprout is preserved permanently as `sprout-classic`; the tools that generated it are deprecated (removed in Phase 6 after confirmation).
- `CharacterId` expands from `"sprout"` to `"sprout" | "sprout-classic" | "clippy"`.
- No new entries in `package.json` or `requirements.txt` — the constraint in the non-negotiable invariants.
