# Cleanup: keep reactive gesture rig, remove classic sprite character

Goal: Keep the reactive SVG gesture character (commit `d1abd28` state, now in the
working tree). Remove the superseded classic sprite-sheet character
(`sprout-classic`) and all its assets/tooling. Preserve the shared animation-key
logic the reactive path still imports from the classic-named helper.

## Key coupling (the reason this is a refactor, not a delete)

- `Chat.tsx` + `ChatContext.tsx` import `ANIMATION_KEYS` / `ANIMATION_KEYS_BRACKETS`
  from `sprout-classic-animation-helpers.tsx`. These feed the LLM system prompt
  (the bracket tokens the model may emit). They are currently derived from the
  classic sprite `ANIMATIONS` (~30 keys), but the reactive rig only maps 8 via
  `config/reactions.ts::BRACKET_TOKEN_REACTIONS`.
- So the keys must be re-sourced from the reactive token map before the classic
  files can go, or the LLM contract breaks.

## Decisions (confirm before executing)

- D1: Single character `sprout` (reactive). Drop `sprout-classic` entirely,
  including the documented settings fallback.
- D2: New neutral module `src/renderer/animation-keys.ts` exporting
  `ANIMATION_KEYS` / `ANIMATION_KEYS_BRACKETS` from `BRACKET_TOKEN_REACTIONS`
  (LLM is told only about reactive-supported tokens).
- D3: Land on branch `chore/remove-classic-character` -> PR (main is protected).

## Steps — COMPLETE

- [x] 1. Commit the kept gesture code as its own commit (18d03af).
- [x] 2. Add `src/renderer/animation-keys.ts` (keys from reactive token map).
- [x] 3. Repoint `Chat.tsx` + `Chat.test.ts` + `ChatContext.tsx` imports to it.
- [x] 4. `Sprout.tsx` -> reactive-only (removed `SproutClassic` + selector branch).
- [x] 5. `character-animations.tsx` -> single reactive entry; test rewritten.
- [x] 6. `src/sharedState.ts`: `CharacterId = "sprout"` (backend has no classic ref).
- [x] 7. Deleted `sprout-classic-animations.tsx(+test)`, `sprout-classic-animation-helpers.tsx(+test)`.
- [x] 8. Deleted assets: `images/animations/sprout/` (2.5MB), `assets/animations/sprout/`,
       `tools/extract-animations.sh`, `package.json` `extract-animations` script.
- [x] 8b. Fixed fallout: `Message.tsx` avatar repointed from the deleted classic
       `Default.png` to the reactive `sprout_flower_preview.png`.
- [x] 9. Updated `CLAUDE.md` (character-system + file map). Historical docs/ ADR/spec
       left as point-in-time records.
- [x] 10. Verified: build green, 156 frontend + 200 backend tests green, prettier clean.

## Verification gate — PASSED

Build green; 156 frontend + 200 backend tests green; reactive rig source byte-identical
to the approved gesture state (d1abd28), so the character renders unchanged; LLM is
advertised the 8 reactive-supported tokens via `animation-keys.ts`.
