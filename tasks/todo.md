# Sprout character — FULL REDESIGN (2026-06-19) — Phases 1-2 SHIPPED

Goal: replace the "lollipop on a wire" rig with a cohesive plant character whose
animation poses (mood + wave + droop) stay structurally intact. Driven by
screenshots of all 6 live poses (harness/ below), which exposed structural bugs,
not just proportion problems.

## STATUS
- DONE: head-detach bug fixed (body group), arms re-rigged as raised limbs,
  proportions/collar/leaflets redesigned, brain+parts+tests synced, 6 poses
  re-verified. 170 tests green, build clean.
- DEFERRED: true wilt-BOW (stem currently leans rigidly about the base, which
  reads acceptably as wilt now that the head stays attached + arms hang down — a
  curving stem is a future polish, see Phase 3 below).
- Verification: harness/capture.py re-run after each change; live DOM probe
  confirmed face-center tracks the body lean (x 186→208→230 at lean 0→3→6°), so
  the head provably no longer detaches.

## Findings (from harness/capture.py — 6 live poses)
- BUG: head detaches from stem under any stemLean (wilting/tired/sleepy/alarmed).
  Face+features are at fixed coords; only `stem` rotates about (100,249), so the
  stem-top swings ~16px away from the head. Most visible in wilting.
- BUG: arms collapse into an "X" under the chin; leaf-blades fly off-frame after
  default ±25° + leafDroop. Never read as limbs.
- BUG: wilt stem rigid-rotates (tilts) instead of bowing — a single rotate() about
  the base can't bend the line.
- Wave gesture has no visual read (arms barely visible).
- Proportion: oversized head (r34) on thin (6px) over-long trunk; arms at "waist".
- Accent leaflets float disconnected on the lower stem.

## Tooling (DONE — keep for the iterate loop)
- [x] harness/poses.html + poses.tsx — mounts real SproutRig + sproutBrain, exposes
      window.brain / window.bus / window.settle for driving poses.
- [x] harness/capture.py — Playwright (reduced-motion) screenshots 6 poses to /tmp.
      Run: `node node_modules/.bin/vite --port 5173 &` then `python3 harness/capture.py`.
- NOTE: harness/ is a dev-only tool; now in .gitignore (kept for the iterate loop).

## Phase 1 — Fix structural coupling (these were bugs) — DONE
- [x] Wrapped stem+arms+collar+head+bloom+leaflets in one `body` group; brain
      rotates it about the pot base (100,250) for stemLean+sway, so head/stem/arms
      move as one unit and the head can never detach. (Added `body` PartId + ref.)
- [x] Re-rigged arms as shoulder-mounted raised limbs (rest ~35° up, baked into
      geometry); recomputed shoulder (92/108,126) + wrist (66/134,108) pivots.

## Phase 2 — Redesign silhouette / proportions — DONE
- [x] Head r 34→30, lowered (cy 81→90) onto a shorter, thicker trunk (6→9px);
      neck gap closed (arms just below the head).
- [x] Trunk heavier stroke + gentle S-curve.
- [x] Collar reads as a green calyx seam (larger sepals, dark outline).
- [x] Accent leaflets re-homed onto the stem as lower foliage.

## Phase 3 — Brain transforms — DONE (except wilt-bow)
- [x] Updated every pivot (body 100,250; arms 92/108,126; blades 66/134,108),
      eye origins (88), mouth baseline (104).
- [x] Arm droop gain 3.2 + 88° cap so mild droop hangs arms, heavy droop can't
      over-rotate; lowered `alarmed` leafDroop 10→5 so it raises arms (alert).
- [x] Wave reads now that arms are visible/raised.
- [ ] DEFERRED: wilt-BOW (curve the stem `d`) — current rigid lean reads OK.

## Phase 4 — Sync anchors + tests — DONE
- [x] parts.ts PARTS anchors + `body` PartId updated to new geometry.
- [x] brain.test.ts updated (body lean assertion, mouth baseline, body ref stub).
- [x] `npm run build` green; `npm run test` 170/170 green; prettier applied.

## Phase 5 — Visual verification (gate) — DONE
- [x] Re-ran harness/capture.py across all 6 poses: head attached, arms read as
      limbs and stay in frame, wave distinct, proportions cohesive. DOM probe
      confirmed face-center tracks body lean.

Verification: a phase is not done until `npm run test` passes AND the re-captured
pose set shows the targeted fix (not "looks correct" — the screenshot proves it).
