# Spec: Sprout Reactive Character

> **Status:** Phase 0 draft — telemetry source TBD (see §Garden telemetry source).
> **Plan:** `docs/2026-06-18-sprout-reactive-character.md` > **ADR:** `docs/superpowers/adr/ADR-0002-sprout-reactive-engine.md`

---

## 1. Behavior States

The `SproutBrain` state machine (`src/renderer/sprout/engine/stateMachine.ts`) recognizes these states. Transitions are listed as `SOURCE → TARGET : condition`.

| State        | Description                                      | Entry condition                                           | Exit condition                                   |
| ------------ | ------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------ |
| `Sprouting`  | Boot/mount animation                             | App cold-start                                            | Animation complete → `Idle`                      |
| `Idle`       | Breathes, blinks, occasional micro-move          | Default; returned to after any transient                  | Any signal                                       |
| `Listening`  | Perked, attentive; brows up                      | User typing OR STT mic active                             | Input stops → `Idle`; message sent → `Reacting`  |
| `Thinking`   | Eyes up, slow blink                              | `status === "thinking"`                                   | `status !== "thinking"` → `Responding` or `Idle` |
| `Talking`    | Lip-sync overlay active                          | `status === "responding"` AND TTS playing                 | TTS ends → `Idle`                                |
| `Reacting`   | One-shot overlay (greet, nod, celebrate, sip, …) | Signal emitted                                            | Overlay duration expires → `Idle`                |
| `Sleeping`   | Eyes closed, slow breathing, minimal sway        | Light sensor low (night) OR long idle (≥ 15 min no input) | Any user input OR light high → `Idle`            |
| `Distressed` | Persistent worry; aria-live alert text active    | Garden alert with `severity: "error"`                     | Alert cleared → `Idle`                           |

**`travel()` shortest-path table (key transitions):**

```
Idle      → Listening   : user input starts
Idle      → Thinking    : status=thinking
Idle      → Sleeping    : light<0.1 OR idle≥15min
Listening → Reacting    : message sent (nod overlay)
Thinking  → Talking     : status=responding + TTS
Thinking  → Idle        : status=idle (no TTS)
Talking   → Idle        : TTS playback ends
Reacting  → Idle        : overlay expires
Any       → Distressed  : garden alert severity=error
Distressed→ Idle        : alert cleared
Sleeping  → Idle        : user input OR light≥0.3
```

---

## 2. Signal (Event) Union

Defined in `src/renderer/sprout/engine/signals.ts`. Sources emit; `SproutBrain` connects. Emitters never import the brain.

```typescript
type SproutSignal =
  // Chat / LLM
  | {
      type: "STATUS_CHANGE";
      status: "welcome" | "thinking" | "responding" | "idle";
    }
  | { type: "MESSAGE_SENT" }
  | { type: "MESSAGE_ERROR" }
  | { type: "ANIMATION_TOKEN"; key: string } // bracket token back-compat: [Greeting], etc.

  // Input
  | { type: "INPUT_START" } // user starts typing or STT mic opens
  | { type: "INPUT_STOP" }

  // TTS
  | { type: "TTS_START"; durationMs: number }
  | { type: "TTS_STOP" }

  // Garden
  | { type: "GARDEN_STATE_UPDATE"; state: GardenState }
  | { type: "GARDEN_ALERT"; alert: GardenAlert }
  | { type: "GARDEN_ALERT_CLEARED"; id: string }

  // System
  | { type: "IDLE_TIMEOUT" } // fired by loop after 15 min no user signal
  | { type: "VISIBILITY_CHANGE"; hidden: boolean };
```

---

## 3. Blend Axes

The mood layer is a 2D `BlendSpace2D` with axes:

| Axis         | Range     | Meaning                                                                                                                                  |
| ------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Vitality** | 0.0 – 1.0 | Garden health. 1.0 = thriving, 0.0 = wilting. Driven by `GardenState.health_score` (smoothed, τ = 30 s).                                 |
| **Energy**   | 0.0 – 1.0 | Alertness. Driven by: light sensor (0.4 weight), recent interaction within last 5 min (0.4 weight), time-of-day sine curve (0.2 weight). |

### Mood points in the blend space

| Mood label | Vitality | Energy | Posture / visual                                              |
| ---------- | -------- | ------ | ------------------------------------------------------------- |
| `thriving` | 1.0      | 1.0    | Upright, bright green, eyes wide, gentle sway                 |
| `content`  | 0.8      | 0.5    | Relaxed upright, normal color, slow blink                     |
| `sleepy`   | 0.6      | 0.1    | Slight lean, eyes half-closed, slow breathing                 |
| `tired`    | 0.4      | 0.2    | Lean, desaturated, drooping leaves                            |
| `wilting`  | 0.1      | 0.2    | Significant droop, very desaturated, concern micro-expression |
| `alarmed`  | 0.2      | 0.8    | Upright but pale, wide eyes, fast breathing                   |

Bilinear interpolation between the 6 points produces the continuous expression parameter set.

### Expression parameters (output of BlendSpace2D)

| Parameter         | Range          | Effect                              |
| ----------------- | -------------- | ----------------------------------- |
| `leafDroop`       | 0 – 40°        | Leaf rotation below horizontal      |
| `stemLean`        | -10 – +10°     | Stem skew                           |
| `colorSaturation` | 0.3 – 1.0      | SVG filter saturation               |
| `swayAmplitude`   | 0 – 6°         | Idle breathing sway magnitude       |
| `swayPeriod`      | 2000 – 5000 ms | Sway cycle time                     |
| `eyeOpenness`     | 0.2 – 1.0      | Lid scale-y (1.0 = fully open)      |
| `browOffsetY`     | -4 – +4 px     | Brow raise/furrow                   |
| `mouthCurve`      | -1.0 – +1.0    | -1 = frown, 0 = neutral, +1 = smile |

---

## 4. Reaction (One-Shot Overlay) List

Defined in `src/renderer/sprout/config/reactions.ts`. Each reaction fires via `oneShot.ts` and composes over the mood base.

| Reaction key | Trigger signal                                                       | Duration                 | Filtered tracks (overrides mood) | Curve                  |
| ------------ | -------------------------------------------------------------------- | ------------------------ | -------------------------------- | ---------------------- |
| `greet`      | `ANIMATION_TOKEN: [Greeting]`                                        | 1200 ms                  | mouth, browL, browR              | ease-in-out            |
| `nod`        | `MESSAGE_SENT`                                                       | 600 ms                   | stem, leafL, leafR               | ease-in-out            |
| `celebrate`  | `ANIMATION_TOKEN: [Congratulate]`                                    | 2000 ms                  | all                              | spring                 |
| `surprised`  | `ANIMATION_TOKEN: [LookAround]`                                      | 800 ms                   | eyeL, eyeR, browL, browR         | ease-out               |
| `concern`    | `MESSAGE_ERROR` or periodic during `Distressed`                      | 1000 ms                  | browL, browR, mouth              | ease-in-out            |
| `sip`        | `GARDEN_STATE_UPDATE` where moisture was critical and is now rising  | 1500 ms                  | stem, leafL, leafR, mouth        | ease-in-out            |
| `yawn`       | Transition into `Sleeping`                                           | 2000 ms                  | mouth, eyeL, eyeR, lidL, lidR    | ease-out               |
| `talk`       | `TTS_START`                                                          | `durationMs` from signal | mouth                            | sinusoidal oscillation |
| `perk`       | `INPUT_START`                                                        | 400 ms                   | stem, browL, browR               | ease-out               |
| `grow-leaf`  | Garden sustained high vitality milestone (≥ 5 min at vitality > 0.9) | 3000 ms                  | bloom                            | spring + fade-in       |

---

## 5. GardenState Contract

Normalized JSON sent by `GET /api/garden/state` and the `GARDEN_STATE_UPDATE` SSE event. All numeric fields are `0.0..1.0` unless noted. `null` means the sensor is absent — the brain leaves that aspect of mood unchanged rather than inferring a value.

```jsonc
{
  "ts": 1718700000, // Unix timestamp (seconds)
  "health_score": 0.82, // 0..1 overall (drives Vitality axis)
  "moisture": 0.41, // 0..1 soil moisture; null if no sensor
  "temp_c": 23.5, // raw °C; null if no sensor
  "temp_comfort": 0.9, // 0..1 distance from ideal band (22–26°C → 1.0)
  "humidity": 0.55, // 0..1; null if no sensor
  "light": 0.7, // 0..1 (drives Energy axis + Sleeping trigger)
  "water_level": 0.88, // 0..1 reservoir; null if no sensor
  "pump_active": false, // boolean
  "last_event": "watered", // "watered"|"topped_up"|"light_on"|"light_off"|"none"
  "alerts": [
    // empty array if no alerts
    // { "id": "reservoir_low", "severity": "warn"|"error", "text": "Reservoir below 15%" }
  ],
}
```

### Garden telemetry source

**Confirmed 2026-06-18: hydroMazing HTTP API.**

`garden_service.py` is a thin proxy: it calls the hydroMazing local HTTP API, normalizes the response to the `GardenState` schema above (clamping to 0..1, inserting `null` for absent sensors), and serves the result via Flask. No GPIO, no MQTT, no file polling needed. See ADR-0002 §Telemetry source.

---

## 6. SVG Rig — Named Anchor Table

ViewBox convention: `0 0 200 300` (portrait). All positions are percentages of width × height. The brain writes these attributes per-frame without React re-renders (refs only).

| Part    | SVG element                 | Center (x%, y%) | Rotation origin (x%, y%) | Brain-writable attributes                            |
| ------- | --------------------------- | --------------- | ------------------------ | ---------------------------------------------------- |
| `pot`   | `<path>`                    | 50, 90          | 50, 90                   | `fill` (color), `opacity`                            |
| `stem`  | `<path>` (cubic bezier)     | 50, 57          | 50, 83                   | `transform: skewX` (lean), `stroke` (color)          |
| `leafL` | `<ellipse>`                 | 27, 52          | 47, 52                   | `transform: rotate` around origin, `fill`, `opacity` |
| `leafR` | `<ellipse>`                 | 73, 52          | 53, 52                   | `transform: rotate` around origin, `fill`, `opacity` |
| `eyeL`  | `<ellipse>`                 | 43, 27          | 43, 27                   | `transform: scaleY` (squint / wide), `fill`          |
| `eyeR`  | `<ellipse>`                 | 57, 27          | 57, 27                   | `transform: scaleY`, `fill`                          |
| `lidL`  | `<path>` (arc)              | 43, 25          | 43, 24                   | `transform: translateY + rotate` (droop angle)       |
| `lidR`  | `<path>` (arc)              | 57, 25          | 57, 24                   | `transform: translateY + rotate`                     |
| `browL` | `<path>` (short arc)        | 43, 20          | 43, 20                   | `transform: translateY + rotate`, `stroke-width`     |
| `browR` | `<path>` (short arc)        | 57, 20          | 57, 20                   | `transform: translateY + rotate`, `stroke-width`     |
| `mouth` | `<path>` (quadratic bezier) | 50, 33          | 50, 33                   | `d` (smile/frown control point Y), `stroke`          |
| `bloom` | `<g>` (petals + sparkle)    | 50, 10          | 50, 10                   | `opacity`, `transform: scale` (pop-in), `fill`       |

**Face circle:** centered at (50%, 27%), radius 16% of height (= 48 px in a 300 px viewBox). The face is a separate `<circle>` element; the brain writes `fill` only (color shifts with mood).

---

## 7. Cursor-Follow Decision

**Decision: Deferred to Phase 6.**

Rationale: the Phase 0 decision criteria require a measured CPU headroom figure (≤5% at 30 fps on Pi 5 Chromium with cursor-follow active). No profiling data exists yet. Cursor-follow will be implemented in Phase 6 if the remaining CPU budget after Phase 3 allows it; otherwise it is dropped permanently. No stub code should be left in Phase 3.

---

## 8. Feature-Flag / Settings Migration

`CharacterId` in `src/sharedState.ts` becomes `"sprout" | "sprout-classic" | "clippy"`.

- **Existing users** with `settings.character = "sprout"` (the only current value) automatically get the reactive rig when Phase 2 ships. No migration script needed.
- **Rollback path**: users or admins can set `character: "sprout-classic"` in Settings → Appearance to revert to sprite behavior at any time, with no server restart.
- **Default** remains `"sprout"` (reactive).
