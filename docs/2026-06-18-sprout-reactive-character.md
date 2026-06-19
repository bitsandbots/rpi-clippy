# Sprout — Reactive Character Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each phase ends with a **VERIFY** gate and carries **INVARIANT**s that must hold at all times. Do not advance a phase until its VERIFY passes.

**Goal:** Replace the sprite-sheet "Sprout" reskin with a _reactive vector character_ — a young plant whose face and body continuously express (a) the live health of the hydroMazing garden and (b) the user's interactions in real time. Architecture is a port of **Godot's** animation concepts into a small, dependency-free TypeScript engine rendering to SVG/Canvas inside the existing React app. No game engine is embedded.

**Why this is not a reskin:** The current `sprout` character (`tools/generate-custom-sprout.py` → `sprout-animations.tsx`) is the same fixed pose set as Clippy with plant art swapped in. Reactions are discrete: the LLM emits bracket tokens like `[Greeting]`, `Clippy.tsx` hard-swaps a PNG sprite sheet for a fixed `length`, then reverts to `Default`. A _face that reacts to the user and their actions_ needs continuous, blendable expression (eye tracking, blink, mood, lip-sync, wilt/perk) that pre-baked sprite strips cannot produce. So the body is replaced with a procedural rig driven by an animation engine.

**The big idea — Sprout _is_ the garden's plant.** Because the avatar is a plant, its health can literally mirror the garden's health. Low soil moisture → leaves droop, color desaturates, "thirsty" face. Pump runs → a relieved "sip," color saturates back. Night/low light → sleepy. Reservoir empty → a persistent worried state. The result is a **glanceable ambient display**: one look at Sprout's face tells you whether the garden is okay. That is genuinely useful (not just cute) and reinforces the hydroMazing/CoreConduit story — the Pi knows your garden, no cloud required.

**Architecture (two-layer reactivity):**

```
                    ┌──────────── Signal Bus (Godot "signals") ────────────┐
 chat status ─────► │  emit/connect, typed events, fully decoupled         │
 user input  ─────► │                                                       │
 TTS playback ────► │   Sources never know who listens.                    │
 GardenState SSE ─► └───────────────────────┬───────────────────────────────┘
                                            │
                              ┌─────────────▼──────────────┐
                              │  SproutBrain (autoload      │
                              │  singleton): mood state +    │
                              │  behavior state machine      │
                              └─────────────┬──────────────┘
                                            │ per-frame _process(delta)
        ┌───────────────────────────────────▼───────────────────────────────────┐
        │  MOOD LAYER (persistent)          +     REACTION LAYER (transient)      │
        │  BlendSpace2D: Vitality × Energy        OneShot overlays: greet, nod,   │
        │  → posture, leaf droop, color,          blink, surprised, celebrate,    │
        │    sway speed, eye openness,            sip, yawn, concern-pulse, talk  │
        │    mouth curve  (eased via Tween)       (filtered: can override mouth   │
        │                                          while mood keeps posture/color)│
        └───────────────────────────────────┬───────────────────────────────────┘
                                            │ writes part transforms
                              ┌─────────────▼──────────────┐
                              │  Sprout rig (scene tree):    │
                              │  pot ▸ stem ▸ leaves ▸ face   │
                              │  (eyes,lids,brows,mouth) ▸    │
                              │  bloom/sparkle  → SVG/Canvas  │
                              └──────────────────────────────┘
```

**Tech Stack:** TypeScript (React 19, Vite) for the engine + rig; SVG (preferred) or Canvas 2D for rendering; Vitest for engine unit tests; Python 3.11+ (Flask, SSE) for the garden telemetry endpoint; existing Piper TTS for lip-sync timing. **No new runtime dependencies, no WASM, no WebGL requirement.**

**Non-negotiable invariants (carry through every phase):**

- **Offline-first / sovereign.** No cloud calls, no new network deps. Telemetry, rendering, and TTS are all local to the Pi.
- **MIT-clean assets.** Sprout is original vector art — unlike the Microsoft-owned Clippy sprites this repo notes it cannot relicense. Add a CoreConduit copyright line for the new original code/art while preserving the upstream Felix Rieseberg notice.
- **Pi-affordable.** Vector rendering, capped frame rate, pauses when hidden, honors `prefers-reduced-motion`, and degrades to a static fallback. Must run acceptably on a Pi 5 browser.
- **Accessibility ≥ the face.** A critical garden alert is never _only_ a facial expression. Mood and alerts are mirrored to an `aria-live` text region (consistent with the portal-v2 ARIA work).
- **Backward compatible.** Clippy still works. Reactive Sprout is selected through the existing `settings.character` plumbing.

**Spec:** `docs/superpowers/specs/sprout-reactive-character.md` (to be written in Phase 0).

---

## Godot concept → Sprout mapping

This is the explicit "use the concepts from Godot" deliverable. We port the _ideas_ (verified against Godot 4 docs); we do **not** embed the engine. Note Godot's AnimationTree API changed significantly from 3 → 4; references below are Godot 4.

| Godot concept                        | What it is in Godot                                                                                | How Sprout uses it                                                                                                                                                                                                                      | Lives in                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Scene tree / Nodes**               | Everything is a tree of single-responsibility nodes                                                | Sprout rig is a tree: `pot ▸ stem ▸ leafL/leafR ▸ face(eyeL,eyeR,lidL,lidR,browL,browR,mouth) ▸ bloom`. Each part is independently drivable and layered.                                                                                | `src/renderer/sprout/rig/`                   |
| **Signals** (observer)               | `signal` / `emit` / `connect`; emitters don't know listeners                                       | A typed event bus. Sources (chat `status`, input, TTS, GardenState) `emit`; `SproutBrain` connects. Replaces brittle bracket-token coupling (kept as one source for back-compat).                                                       | `src/renderer/sprout/engine/signals.ts`      |
| **`_process(delta)`**                | Per-frame update with frame delta                                                                  | One `requestAnimationFrame` driver computes `delta` and advances breathing, blink timers, sway, eye saccades/cursor-follow, and tween updates. Capped ~30 fps; paused when tab hidden.                                                  | `src/renderer/sprout/engine/loop.ts`         |
| **AnimationNodeStateMachine**        | States + transitions; `travel()` walks intermediate states (A\*); SwitchMode IMMEDIATE/SYNC/AT_END | High-level behavior modes: `Sprouting → Idle → Listening → Thinking → Talking → Reacting → Sleeping → Distressed`. Transitions gated by conditions; `travel()`-style API. State selects which base blend + which overlays are eligible. | `src/renderer/sprout/engine/stateMachine.ts` |
| **AnimationNodeBlendSpace2D**        | Blend between animations by a 2D position                                                          | The persistent **mood** layer: axes = **Vitality** (garden health) × **Energy** (recent interaction + light/time). Position → continuous posture, droop, color, sway, eye openness, mouth curve.                                        | `src/renderer/sprout/engine/blendSpace.ts`   |
| **OneShot node + BlendTree filters** | Fire a transient animation over a base; filters pick which tracks it overrides                     | The **reaction** layer: discrete events fire one-shot overlays on top of mood; filters let a reaction own the mouth (e.g. "talking") while mood still drives posture/color.                                                             | `src/renderer/sprout/engine/oneShot.ts`      |
| **Tween / `create_tween`**           | Interpolate a property over time with easing                                                       | Expression transitions ease instead of cut; eye target lerps toward cursor; growth "pop" on sprouting; color saturation eases on watering.                                                                                              | `src/renderer/sprout/engine/tween.ts`        |
| **Autoload singleton**               | Global node available everywhere                                                                   | `SproutBrain` — single owner of mood state + state machine, mounted once, mutates the rig. React only mounts the SVG; the brain drives it.                                                                                              | `src/renderer/sprout/engine/brain.ts`        |
| **Resource / `.tres`** (data-driven) | Data separated from logic, editable without code                                                   | Moods, expressions, reactions, and the **sensor→mood mapping** are declarative data (`sprout.config.ts` / JSON), tunable without touching engine code. Mirrors the existing data-driven `Animation` map.                                | `src/renderer/sprout/config/`                |

---

## Architectural decisions (Phase 0 produces ADR-0002)

1. **Do not embed Godot.** Godot can export to HTML5/WASM, but embedding a multi-MB WASM+WebGL runtime to render a small plant in the corner of a Pi-served web UI is the wrong trade: heavy payload, Pi-browser WebGL is limited, it fights the React/Vite/98.css/SSE stack, and it complicates offline packaging. Consistent with the house pattern of _adopting patterns, not dependencies_. **Decision: port concepts to lightweight TS.** (Option recorded and rejected, with reasons.)
2. **Procedural vector face, not sprite sheets.** Continuous reactivity (eye tracking, blink, mood blends, lip-sync) requires drivable parts. **Decision: SVG-first rig** (crisp at any size, easy to animate via attributes, cheap on a Pi; Canvas 2D fallback path kept open if profiling demands it).
3. **Keep the sprite Sprout as a static fallback.** Rename the generated sprite character to `sprout-classic` (or keep its assets as the reduced-motion / low-power fallback the renderer falls back to). Reactive Sprout becomes the canonical `sprout`.
4. **Engine logic is pure and DOM-free.** State machine, blend math, mood mapping, and the signal reducer are pure functions, unit-tested under Vitest without a DOM — matching the repo's existing test discipline (`clippy-animation-helpers.test.ts`, etc.).

---

## File Map

> **Legend:** `Migrate` = file exists, content is fully replaced by the new reactive implementation; `Rename` = file moves to a new path (use `git mv`); `Deprecate` = file is deleted once `sprout-classic` is confirmed working.

| File                                                  | Action                                                           | Responsibility                                                                                                                                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/sprout/engine/signals.ts`               | Create                                                           | Typed event bus (`emit`/`on`), event union type                                                                                                                                                                  |
| `src/renderer/sprout/engine/loop.ts`                  | Create                                                           | rAF driver, delta time, fps cap, visibility/reduced-motion pause                                                                                                                                                 |
| `src/renderer/sprout/engine/tween.ts`                 | Create                                                           | Property tweens with easing                                                                                                                                                                                      |
| `src/renderer/sprout/engine/blendSpace.ts`            | Create                                                           | 2D mood blend → expression parameters                                                                                                                                                                            |
| `src/renderer/sprout/engine/stateMachine.ts`          | Create                                                           | Behavior states + transitions + `travel()`                                                                                                                                                                       |
| `src/renderer/sprout/engine/oneShot.ts`               | Create                                                           | Transient overlays + track filters                                                                                                                                                                               |
| `src/renderer/sprout/engine/brain.ts`                 | Create                                                           | `SproutBrain` singleton: owns state, consumes signals, writes rig                                                                                                                                                |
| `src/renderer/sprout/rig/SproutRig.tsx`               | Create                                                           | SVG scene tree (parts) + ref handles the brain writes to                                                                                                                                                         |
| `src/renderer/sprout/rig/parts.ts`                    | Create                                                           | Part definitions, default transforms, anchor points                                                                                                                                                              |
| `src/renderer/sprout/config/expressions.ts`           | Create                                                           | Expression keyframes (eye openness, mouth curve, brow, droop)                                                                                                                                                    |
| `src/renderer/sprout/config/moods.ts`                 | Create                                                           | Mood points in the 2D blend space                                                                                                                                                                                |
| `src/renderer/sprout/config/reactions.ts`             | Create                                                           | One-shot reaction defs (duration, filtered tracks, curve)                                                                                                                                                        |
| `src/renderer/sprout/config/gardenMapping.ts`         | Create                                                           | GardenState → Vitality/Energy + reaction triggers                                                                                                                                                                |
| `src/renderer/components/Sprout.tsx`                  | Migrate                                                          | **Exists** (sprite-sheet driver). Phase 2 replaces body with reactive rig mount + static fallback branch; the existing `useChat`/`useSharedState` hooks and `playAnimation` logic move to `sprout-classic` path. |
| `src/renderer/components/Clippy.tsx`                  | Modify                                                           | Branch on `character.id`: render `<Sprout/>` for `"sprout"`, keep `<img>` path for `"clippy"` and `"sprout-classic"`                                                                                             |
| `src/sharedState.ts`                                  | Modify                                                           | Add `"sprout-classic"` to `CharacterId` union (currently only `"sprout"`); keep `"sprout"` as reactive                                                                                                           |
| `src/renderer/character-animations.tsx`               | Modify                                                           | Register reactive sprout (no sprite map) + `sprout-classic` (existing sprite map)                                                                                                                                |
| `src/renderer/sprout-animations.tsx`                  | Rename → `src/renderer/sprout-classic-animations.tsx`            | Move during Phase 2 when `sprout-classic` character is registered; update all import sites                                                                                                                       |
| `src/renderer/sprout-animation-helpers.tsx`           | Rename → `src/renderer/sprout-classic-animation-helpers.tsx`     | Paired rename with above                                                                                                                                                                                         |
| `src/renderer/sprout-animations.test.ts`              | Rename → `src/renderer/sprout-classic-animations.test.ts`        | Keeps existing coverage; update import path                                                                                                                                                                      |
| `src/renderer/sprout-animation-helpers.test.ts`       | Rename → `src/renderer/sprout-classic-animation-helpers.test.ts` | Keeps existing coverage; update import path                                                                                                                                                                      |
| `tools/generate-sprout-assets.py`                     | Deprecate                                                        | Generates sprite frames for the old sprite-sheet character. Remove after Phase 6 confirms `sprout-classic` (which uses these assets) is working.                                                                 |
| `tools/generate-custom-sprout.py`                     | Deprecate                                                        | Same — paired with `generate-sprout-assets.py`. Remove in Phase 6 cleanup.                                                                                                                                       |
| `src/renderer/sproutApi.tsx`                          | No change                                                        | Compatibility shim re-exporting `api.ts`. The new rig uses `api.ts` directly; this file is untouched.                                                                                                            |
| `src/renderer/contexts/GardenContext.tsx`             | Create                                                           | Subscribes to `/api/garden/stream`, exposes `GardenState`, emits signals                                                                                                                                         |
| `src/python/garden_service.py`                        | Create                                                           | Adapter: reads hydroMazing sensors / TheDecider → normalized `GardenState`                                                                                                                                       |
| `app.py`                                              | Modify                                                           | Add `GET /api/garden/state` (poll) and `GET /api/garden/stream` (SSE)                                                                                                                                            |
| `src/renderer/sprout/**/*.test.ts`                    | Create                                                           | Vitest: state transitions, blend math, mood mapping, reducer                                                                                                                                                     |
| `tests/test_garden_service.py`                        | Create                                                           | pytest: normalization, clamping, mock-sensor mapping                                                                                                                                                             |
| `docs/superpowers/specs/sprout-reactive-character.md` | Create                                                           | Spec backing this plan (path confirmed: `docs/superpowers/specs/` exists)                                                                                                                                        |

---

## Garden integration seam — the `GardenState` contract

⚠️ **Unverified dependency.** I reviewed the `rpi-clippy` repo only, not the hydroMazing sensor layer or TheDecider. The exact source of these readings (GPIO, a hydroMazing HTTP API, a shared JSON/SQLite file, MQTT) is **not confirmed**. Treat `garden_service.py` as an _adapter_ behind this stable contract; confirm the upstream source before implementing Phase 5. If hydroMazing exposes its own API, this becomes a thin proxy; if it writes a status file, this reads it.

Normalized message (all `0..1` where noted; `null` if a sensor is absent so the face can stay neutral rather than fake data):

```jsonc
{
  "ts": 1718700000,
  "health_score": 0.82, // 0..1 overall, computed from below (drives Vitality)
  "moisture": 0.41, // 0..1 soil moisture
  "temp_c": 23.5, // raw °C
  "temp_comfort": 0.9, // 0..1 distance from ideal band
  "humidity": 0.55, // 0..1
  "light": 0.7, // 0..1 (also drives day/night → Energy + Sleeping)
  "water_level": 0.88, // 0..1 reservoir
  "pump_active": false,
  "last_event": "watered", // enum: watered|topped_up|light_on|light_off|none
  "alerts": [
    // actionable, drive Distressed + aria-live text
    // { "id":"reservoir_low","severity":"warn","text":"Reservoir below 15%" }
  ],
}
```

### Sensor → mood / reaction mapping (data, in `gardenMapping.ts`)

| Condition                         | Mood effect (blend axis)                     | Transient reaction                    | State                     |
| --------------------------------- | -------------------------------------------- | ------------------------------------- | ------------------------- |
| Moisture low                      | Vitality ↓ → leaves droop, color desaturates | "thirsty" look                        | —                         |
| Moisture critical                 | Vitality ↓↓                                  | concern-pulse                         | `Distressed`              |
| `pump_active` / moisture restored | Vitality ↑ (eased)                           | "sip" / refreshed, color re-saturates | brief `Reacting`          |
| Light high (day)                  | Energy ↑, eyes open                          | gentle sun-follow                     | —                         |
| Light low (night)                 | Energy ↓, eyes heavy, slow breathing         | yawn (once)                           | `Sleeping`                |
| Temp too hot                      | comfort ↓ → wilt                             | fan-self                              | —                         |
| Temp too cold                     | comfort ↓ → hunch                            | shiver                                | —                         |
| Reservoir empty                   | Vitality ↓ persistent                        | periodic concern-pulse                | `Distressed` + alert text |
| Sustained good health milestone   | Vitality high, plateau                       | grow a leaf / small bloom (reward)    | brief `Reacting`          |

### Interaction → reaction mapping (uses signals that already exist in the app)

| App signal (source)                                       | Reaction                              | State            |
| --------------------------------------------------------- | ------------------------------------- | ---------------- |
| `status: thinking` (Chat.tsx)                             | "thinking" — eyes up, slow blink      | `Thinking`       |
| `status: responding` + TTS playing                        | lip-sync mouth (filtered overlay)     | `Talking`        |
| User typing / STT listening                               | perk, attentive eyes, brows up        | `Listening`      |
| Message sent                                              | quick nod                             | brief `Reacting` |
| Bracket token `[Greeting]`/`[Congratulate]` (back-compat) | mapped to greet / celebrate overlay   | brief `Reacting` |
| Long idle / no events                                     | breathe + occasional idle micro-moves | `Idle`           |
| Error event                                               | concern overlay + aria-live text      | brief `Reacting` |

---

## Phase 0 — Audit & decisions

**Goal:** Lock approach and contract before writing engine code.

- [ ] Write `docs/superpowers/specs/sprout-reactive-character.md` (states, signals, blend axes, reaction list, GardenState contract).
- [ ] **Confirm the hydroMazing telemetry source** (GPIO vs HTTP vs file vs MQTT). Record the answer in the spec. This unblocks Phase 5.
- [ ] Write `docs/superpowers/adr/ADR-0002-sprout-reactive-engine.md` recording: port-not-embed Godot, SVG-first rig, sprite-Sprout-as-fallback, pure-engine-logic. Include citations to the Godot 4 docs used: [AnimationNodeStateMachine](https://docs.godotengine.org/en/stable/classes/class_animationnodestatemachine.html), [AnimationNodeBlendSpace2D](https://docs.godotengine.org/en/stable/classes/class_animationnodeblendspace2d.html), [AnimationNodeOneShot](https://docs.godotengine.org/en/stable/classes/class_animationnodeoneshot.html), [Tween](https://docs.godotengine.org/en/stable/classes/class_tween.html), [Signals](https://docs.godotengine.org/en/stable/getting_started/step_by_step/signals.html).
- [ ] Decide rig art direction: seedling silhouette, two cotyledon leaves, expressive eyes, simple mouth, optional bloom. Produce a **named-anchor table** in the spec: each SVG part (pot, stem, leafL, leafR, eyeL, eyeR, lidL, lidR, browL, browR, mouth, bloom) listed with its anchor point (x, y as % of bounding box), rotation origin, and the attributes the brain will write (transform, opacity, d, fill). This table is the contract `parts.ts` is built from.
- [ ] Confirm cursor-follow is in or out for Phase 3. Decision criteria: include if the Pi 5 browser renders a 30 fps rAF loop at <5% CPU headroom with the feature on; defer to Phase 6 otherwise. Record the decision in the spec.
- [ ] Confirm feature-flag strategy: `settings.character = "sprout"` maps to reactive rig; `settings.character = "sprout-classic"` maps to existing sprite behavior. Existing users with `"sprout"` in persisted settings will upgrade automatically to the reactive rig when Phase 2 ships.

**VERIFY:** Spec + ADR committed; telemetry source named; anchor table present; CharacterId change agreed; cursor-follow decision recorded.
**INVARIANT:** No cloud dependency appears in any decision.

## Phase 1 — Engine core (pure TS, no rendering)

**Goal:** A tested, DOM-free mini-engine implementing the Godot concepts.

- [ ] `signals.ts`: typed `emit`/`on`, exhaustive event union.
- [ ] `loop.ts`: rAF driver, `delta`, fps cap (default 30), pause on `document.hidden` and on `prefers-reduced-motion`.
- [ ] `tween.ts`: numeric tween with easing (`easeInOutQuad` default), completion callbacks.
- [ ] `stateMachine.ts`: states, transitions, conditions, `travel()` (shortest path; teleport if none).
- [ ] `blendSpace.ts`: map a 2D point → expression parameter set (bilinear blend across mood points).
- [ ] `oneShot.ts`: fire overlay with duration + filtered track set; compose over base.
- [ ] Unit tests for each (transition correctness, blend interpolation endpoints/midpoint, one-shot expiry, tween easing bounds).

**VERIFY:** `npm run test -- src/renderer/sprout/engine` green; zero DOM imports in engine files (`grep -r "document\|window\|HTMLElement" src/renderer/sprout/engine/` returns empty); full suite (`npm run test`) still green (renamed classic tests included).
**INVARIANT:** Engine modules are pure and import no React/DOM.

## Phase 2 — Sprout rig & renderer (static)

**Goal:** Draw Sprout and let the brain move its parts; no behavior yet.

- [ ] `git mv` the four existing sprite files to their `sprout-classic` names (see File Map); update all import sites. Confirm `npm run test` still passes before proceeding.
- [ ] Add `"sprout-classic"` to `CharacterId` in `src/sharedState.ts`; register it in `character-animations.tsx` pointing to the renamed `sprout-classic-animations.tsx` sprite map.
- [ ] `parts.ts` + `SproutRig.tsx`: SVG scene tree with named parts and ref handles (set transform/opacity/path per part). Part names and anchor points are taken directly from the Phase 0 anchor table in the spec.
- [ ] `brain.ts`: `SproutBrain` singleton that, given an expression parameter set, writes part transforms each frame.
- [ ] `expressions.ts`: define `neutral`, `happy`, `sleepy`, `surprised`, `concerned`, `thirsty` as parameter sets.
- [ ] **Migrate `Sprout.tsx`**: replace the current sprite-sheet driver body with: (a) reactive rig mount + brain start when `character.id === "sprout"`, (b) existing `playAnimation` / `useChat` logic preserved as the `sprout-classic` branch. The existing logic should not be deleted — it moves inside the `sprout-classic` conditional.
- [ ] Modify `Clippy.tsx` to render `<Sprout/>` when `character.id === "sprout"`; keep `<img>` path for `clippy` and `sprout-classic`.
- [ ] Add CoreConduit copyright header to every new file in `src/renderer/sprout/`: `// © CoreConduit Consulting Services — MIT License`; preserve existing Felix Rieseberg notice in unchanged files.

**VERIFY:** Selecting `"sprout"` shows the vector plant; manually setting each expression visibly changes the face; selecting `"clippy"` or `"sprout-classic"` is unchanged and all existing sprite-based tests pass under their new names.
**INVARIANT:** Existing Clippy behavior and tests untouched. The rename commit is atomic — no test should be broken mid-rename.

## Phase 3 — Interaction reactivity (uses only existing app signals)

**Goal:** A reactive face driven by chat/input/TTS — independent of garden hookup.

- [ ] Bridge existing `status` (`welcome/thinking/responding/idle`) + input + TTS playback into the signal bus.
- [ ] Wire `reactions.ts` overlays: greet, nod, blink, surprised, talk (lip-sync to Piper playback timing), concern.
- [ ] Idle micro-behaviors: breathing, periodic blink, eye saccades. Cursor-follow: implement only if Phase 0 decision recorded it as in-scope; otherwise skip entirely (do not leave a stub).
- [ ] Keep bracket-token mapping (`ANIMATION_KEYS_BRACKETS`) as one signal source for back-compat.

**VERIFY:** Typing → attentive; thinking → eyes-up; TTS → mouth moves with speech; idle → breathes/blinks; `[Congratulate]` → celebrate.
**INVARIANT:** Lip-sync uses local Piper timing only; no audio leaves the Pi.

## Phase 4 — Mood / blend layer

**Goal:** Persistent emotional baseline via the 2D blend space.

- [ ] `moods.ts`: place mood points (e.g. thriving, content, tired, wilting, alarmed) in Vitality × Energy.
- [ ] Drive blend position from a smoothed mood state; ease expression changes via tween.
- [ ] Compose: mood sets the base; reactions overlay on top (filters preserve mood posture/color when a reaction owns the mouth).

**VERIFY:** Moving the mood point (debug control) smoothly morphs posture/color/eyes; a reaction overlay plays without snapping the base.
**INVARIANT:** Mood transitions are eased, never hard-cut.

## Phase 5 — hydroMazing garden integration

**Goal:** The garden drives Sprout's mood; alerts drive Distressed + text.

- [ ] `garden_service.py`: adapter from the **confirmed** source → normalized `GardenState`, with clamping and `null` for absent sensors.
- [ ] `app.py`: add `GET /api/garden/state` (poll) and `GET /api/garden/stream` (SSE), mirroring the existing SSE pattern.
- [ ] `GardenContext.tsx`: subscribe, expose state, emit garden signals.
- [ ] `gardenMapping.ts`: implement the sensor→mood/reaction table; wire critical alerts to `Distressed` and to an `aria-live` text region.
- [ ] Optional: growth milestone → grow-a-leaf/bloom reward.
- [ ] `tests/test_garden_service.py`: normalization, clamping, mock-sensor → expected mood inputs.

**VERIFY:** Simulated low moisture → Sprout wilts + desaturates; simulated pump → "sip" + re-saturate; simulated night → Sleeping; reservoir-empty → Distressed _and_ a screen-reader-visible alert.
**INVARIANT:** Telemetry is local; a critical alert always appears as text, not face-only.

## Phase 6 — Polish, performance, accessibility, packaging

**Goal:** Ship-ready on a Pi.

- [ ] Profile on Pi 5 browser; confirm fps cap and CPU headroom; tune part count if needed. Target: ≤ 5% CPU at 30 fps idle on Pi 5 Chromium.
- [ ] `prefers-reduced-motion`: freeze idle motion, keep discrete state changes; confirm `sprout-classic` static-sprite fallback path still works end-to-end.
- [ ] `aria-live` region announces mood changes + alerts in plain language.
- [ ] Confirm rollback path: if the reactive rig is too expensive on Pi, a user can set `character: "sprout-classic"` in settings to revert to sprite behavior without any server changes. Verify this works.
- [ ] Remove deprecated tools (`tools/generate-sprout-assets.py`, `tools/generate-custom-sprout.py`) only after confirming `sprout-classic` loads correctly from existing pre-generated assets in `src/renderer/images/animations/sprout/`.
- [ ] Audit all new files in `src/renderer/sprout/` for the `// © CoreConduit Consulting Services — MIT License` header; audit unchanged files to confirm the Felix Rieseberg notice is untouched.
- [ ] Update `README.md` (character selection, garden integration), `docs/architecture.md`, `CLAUDE.md` (new module map under `src/renderer/sprout/`).
- [ ] Full suite green (`npm run test`, `python3 -m pytest -q`), `npm run lint` clean, systemd unchanged.

**VERIFY:** Clean install via `install.sh`, Sprout selectable, garden-reactive, accessible, within Pi budget; `sprout-classic` rollback confirmed working; no runtime deps added.
**INVARIANT:** No new runtime dependency added to `package.json` or `requirements.txt` beyond what's already present.

---

## Performance & accessibility budget

- Target ≤ 30 fps; pause render when `document.hidden`; throttle to event-driven updates when no animation is active.
- SVG part count kept modest; avoid per-frame React re-renders (brain mutates refs/attributes, React only mounts).
- `prefers-reduced-motion` → no looping motion; expression still changes on state, just without tweened idle.
- Static sprite fallback (`sprout-classic` assets) if SVG path is disabled or the device is constrained.
- Every garden alert is mirrored to an `aria-live="polite"` (or `assertive` for critical) text node.

## Risks & open questions (flagged honestly)

- **Garden telemetry source is unverified.** I only saw `rpi-clippy`, not hydroMazing's sensor code or TheDecider. Phase 5 depends on confirming whether readings come via GPIO, an HTTP API, a status file, or MQTT. The `GardenState` contract is designed so only `garden_service.py` changes once that's known.
- **Lip-sync fidelity.** True phoneme-accurate lip-sync from Piper may be more than is worth it; an amplitude/duration-driven mouth ("talking" oscillation gated by playback) is the cheaper first target. Marked as the default.
- **Godot concept fidelity.** Godot 4 constructs (AnimationNodeStateMachine, BlendSpace2D, OneShot, signals, `_process`, Tween) verified against the Godot 4 stable docs (links in ADR-0002). This is a _conceptual_ port — API-level parity is not claimed, and Godot 3 differs significantly (particularly AnimationTree API).
- **I have not built or run any of this.** Estimates and shapes are design intent, not measured results; the VERIFY gates exist precisely to catch where reality diverges.

## License note

Original Sprout vector art and engine code can be MIT-licensed and copyrighted by CoreConduit — a cleaner position than the inherited Clippy assets, which the repo notes are Microsoft-owned and cannot be relicensed. Add a CoreConduit copyright line to new files; keep the existing Felix Rieseberg notice intact.
