# Hybrid Model Catalog — Spec

**Status:** Design approved (architecture, backend, frontend) — remaining sections below
**Date:** 2026-05-25

## Problem

`BUILT_IN_MODELS` hardcodes specific Ollama tags (e.g., `qwen3:4b-Q4_K_M`) that often
don't match what's actually installed (e.g., `qwen3:4b`). The `_resolve_tag()` quick fix
works at inference time but doesn't address the root cause: the catalog is static while
Ollama's model store is dynamic.

## Design Summary

**Hybrid approach:** Keep `BUILT_IN_MODELS` as a curated "suggested models" catalog, but
augment it with live discovery from Ollama's `/api/tags`. Models that exist in Ollama
but not in the catalog appear as "orphans." Users can pull any model by arbitrary tag.

### Architecture (approved)

`get_model_state()` becomes the single integration point:

```
BUILT_IN_MODELS ─────────┐
                         ├──▶ get_model_state() ──▶ {catalog, orphans}
Ollama /api/tags ────────┘
```

### Backend (approved)

- `get_model_state()` returns `{catalog: {...}, orphans: [...]}` instead of flat dict
- Each catalog entry gets `actualTag` (resolved via `_resolve_tag()`)
- New `pull_model_by_tag(tag: str)` replaces `pull_model_by_name(name: str)`
- `/api/state` response format changes accordingly

### Frontend (approved)

- `ChatContext.tsx` uses `actualTag` instead of `ollamaTag` for inference
- `SettingsModel.tsx` shows catalog entries first, then "Other Models" section for orphans
- Pull UI: single text input with catalog quick-select chips

---

## Remaining Design Sections

### 1. Component-Level Changes

#### 1.1 `SettingsModel.tsx` — Model Browser Tab

**Current state:** Renders a flat `TableView` from `models` dict. Download button calls
`downloadModelByName(name)` with the display name. Delete/Remove work on display name.

**Target state:**

```
┌──────────────────────────────────────────────┐
│ Suggested Models                             │
│ ┌──────┬──────────────┬──────┬─────────────┐ │
│ │Loaded│ Name         │ Size │ Downloaded  │ │
│ │  ｘ   │ Gemma 3 (1B) │ 806  │ Yes         │ │
│ │      │ Qwen3 (4B)   │ 2500 │ No          │ │
│ └──────┴──────────────┴──────┴─────────────┘ │
│                                              │
│ ── Selected: Gemma 3 (1B)                    │
│    Tag: gemma3:1b  [Make Default] [Delete]   │
│                                              │
│ Other Models (from Ollama)                   │
│ ┌──────┬──────────────┬──────┬─────────────┐ │
│ │Loaded│ Name         │ Size │ Downloaded  │ │
│ │      │ nomic-embed… │ 137  │ Yes         │ │
│ └──────┴──────────────┴──────┴─────────────┘ │
│                                              │
│ ── Pull New Model ─────────────────────────  │
│ Tag: [________________] [Pull]               │
│ Quick: [gemma3:1b] [qwen3:4b] [llama3.2:3b] │
└──────────────────────────────────────────────┘
```

Key changes:

- Split into two `TableView` sections: catalog first, orphans second
- Orphan section hidden when there are no orphans
- Catalog rows show display name; orphan rows show the Ollama tag as name
- "Download Model" button removed — replaced by pull input at bottom
- Pull input: text field + Pull button, with quick-select chips for catalog `ollamaTag` values
- Delete/Remove operations on orphans use the raw tag string

**Data flow:** Component receives `SharedState.models` which is now `{catalog: ModelState, orphans: ManagedModel[]}`. The `ModelState` type changes (see section 4).

#### 1.2 `SettingsLLM.tsx` — LLM Connection Tab

**Current state:** Shows `loadedModel.ollamaTag` as a `<code>` element next to the model name.

**Target state:** Shows `loadedModel.actualTag` instead. No structural changes needed — just the field reference.

Line 118-123 currently:

```tsx
{
  loadedModel.ollamaTag && (
    <code style={{ marginLeft: "8px", color: "#555" }}>
      {loadedModel.ollamaTag}
    </code>
  );
}
```

Changes to `actualTag`.

#### 1.3 `ChatContext.tsx` — Model Loading

**Current state (line 146-147):**

```tsx
const ollamaTag =
  (selectedModelData as any)?.ollamaTag ?? settings.selectedModel ?? "";
```

**Target state:** Uses `actualTag` from the catalog entry. The `actualTag` is the resolved
tag that actually exists in Ollama (or falls back to suggested tag if not installed).

```tsx
const ollamaTag =
  (selectedModelData as any)?.actualTag ?? settings.selectedModel ?? "";
```

This is the critical fix — it's the reason `_resolve_tag()` was needed in the first place.
By surfacing the resolved tag through the state API, the frontend always uses the correct
tag for inference without needing its own resolution logic.

#### 1.4 `SharedStateContext.tsx`

No structural changes. The `SharedState` type changes (models field format), but the
context provider just passes it through. The polling and SSE subscription remain identical.

---

### 2. Error Handling & Edge Cases

#### 2.1 Ollama Unreachable

**Scenario:** `/api/tags` fails (Ollama not running, wrong URL, network issue).

**Behavior:**

- `get_model_state()` returns catalog-only: `{catalog: {...}, orphans: []}`
- All catalog entries have `downloaded: false`, `actualTag` falls back to `ollamaTag`
- Frontend shows "Ollama not connected" warning in SettingsLLM (existing behavior)
- Pull input still visible but Pull button disabled with tooltip "Ollama not connected"

#### 2.2 Empty Catalog + No Orphans

**Scenario:** All BUILT_IN_MODELS removed, nothing installed in Ollama.

**Behavior:**

- Both sections show empty state messages
- Catalog: "No suggested models available."
- Orphans: hidden (empty array)
- Pull input remains active — user can bootstrap by pulling their first model

#### 2.3 Tag Resolution Failure

**Scenario:** `_resolve_tag()` finds no match — catalog says `qwen3:4b-Q4_K_M` but
nothing starting with `qwen3` exists in Ollama.

**Behavior:**

- `actualTag` falls back to `ollamaTag` (the suggested tag)
- `downloaded: false`
- Inference with this model will fail with "model not found" — Ollama returns that
  error, which surfaces through the existing SSE error handling
- Catalog entry shows "Not installed" status; pull chip pre-fills the suggested tag

#### 2.4 Multiple Variant Match

**Scenario:** Both `qwen3:4b-Q4_K_M` and `qwen3:4b-Q4_K_M-40k` are installed.
Prefix match on `qwen3:4b` finds both.

**Behavior (decision A from design):**

- `_resolve_tag()` picks first match (set iteration order)
- Logs warning: `"Multiple tags match prefix 'qwen3:4b': ['qwen3:4b-Q4_K_M', 'qwen3:4b-Q4_K_M-40k']. Using 'qwen3:4b-Q4_K_M'."`
- This is logged server-side only (not exposed to UI)
- The 40k variant would appear as an orphan if its exact name doesn't match any catalog entry

#### 2.5 Orphan with Same Base as Catalog

**Scenario:** Ollama has `qwen3:4b` installed. Catalog has `Qwen3 (4B)` with
`ollamaTag: "qwen3:4b-Q4_K_M"`. `_resolve_tag("qwen3:4b-Q4_K_M")` matches `qwen3:4b`
(via prefix `qwen3`).

**Behavior:**

- `qwen3:4b` is NOT shown as an orphan — it's consumed by the catalog match
- Orphan filter: exclude any tag that matches a catalog `ollamaTag` prefix
- This prevents duplicate entries

#### 2.6 Pull Failure

**Scenario:** User pulls an invalid tag (typo, doesn't exist in Ollama registry).

**Behavior:**

- Ollama's `/api/pull` returns an error via SSE (existing pull-progress mechanism)
- Error broadcasts as `pull_error` event with the tag and error message
- Frontend shows the error in the pull progress area (existing `SettingsModelDownload` component)
- No state change — model doesn't appear in catalog or orphans

#### 2.7 Concurrent Pull + State Refresh

**Scenario:** User starts a pull, then the 2s polling interval fetches state mid-pull.

**Behavior:**

- Existing behavior preserved: pull progress SSE triggers `fetchState()` in `SharedStateContext`
- Mid-pull, the model won't appear in `/api/tags` yet (Ollama only reports it after pull completes)
- After pull completes, `_available` set is updated, next state refresh picks it up
- No race condition because `/api/tags` and `_available` are updated synchronously in `pull_model_by_tag`

#### 2.8 settings.json `selectedModel` Points to Orphan

**Scenario:** User selects an orphan model, then that model is deleted from Ollama.

**Behavior:**

- `selectedModel` stores the tag name (e.g., `"nomic-embed-text"`)
- On next state refresh, the orphan disappears from the list
- `ChatContext.tsx` fallback logic (lines 254-268) already handles this:
  finds the first downloaded catalog model and selects it
- If no models are downloaded at all, `selectedModel` becomes undefined
- The `WelcomeMessageContent` triggers auto-download of Gemma 3 (1B)

---

### 3. Migration Path

#### 3.1 Backward Compatibility

The `/api/state` response format changes. Since frontend and backend are deployed
together (same Flask server serving the React build), there's no version skew concern.
No API versioning needed.

#### 3.2 settings.json

**No migration required.** The only model-related setting is `selectedModel`, which
stores a display name string. Display names in the catalog remain unchanged. Orphan
model names are their Ollama tags — these are valid strings that `ChatContext.tsx`
already handles as fallback values.

#### 3.3 Type Changes

**`src/models.ts` — `ModelState`:**

```ts
// Before
export type ModelState = Record<string, ManagedModel>;

// After
export interface HybridModelState {
  catalog: Record<string, ManagedModel>;
  orphans: ManagedModel[];
}
```

**`src/sharedState.ts` — `SharedState`:**

```ts
// Before
export interface SharedState {
  models: ModelState;
  settings: SettingsState;
}

// After
export interface SharedState {
  models: HybridModelState;
  settings: SettingsState;
}
```

All components that access `models` need updating:

- `SettingsModel.tsx` — split catalog/orphans rendering
- `SettingsLLM.tsx` — `models` → `models.catalog`
- `ChatContext.tsx` — model lookup path changes
- `SettingsParameters.tsx` — if it references models

#### 3.4 `ManagedModel` Addition

A new field `actualTag?: string` is added to `ManagedModel`:

```ts
export interface ManagedModel extends Model {
  path: string;
  downloaded?: boolean;
  downloadState?: DownloadState;
  imported?: boolean;
  actualTag?: string; // NEW: resolved Ollama tag for inference
}
```

---

### 4. Test Plan

#### 4.1 Backend Tests (`tests/test_routes.py` or new `tests/test_ollama_service.py`)

| Test                                         | What it verifies                                                      |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `test_get_model_state_hybrid_format`         | Response has `catalog` dict and `orphans` list                        |
| `test_get_model_state_catalog_entries`       | Each catalog entry has `name`, `ollamaTag`, `actualTag`, `downloaded` |
| `test_get_model_state_orphans`               | Models in `/api/tags` not matching catalog appear in orphans          |
| `test_get_model_state_no_orphan_duplicates`  | Tag matching catalog prefix excluded from orphans                     |
| `test_get_model_state_ollama_unreachable`    | Returns catalog-only when `/api/tags` fails                           |
| `test_get_model_state_actual_tag_resolved`   | `actualTag` matches installed variant, not suggested tag              |
| `test_get_model_state_actual_tag_fallback`   | `actualTag` falls back to `ollamaTag` when nothing installed          |
| `test_pull_model_by_tag_success`             | POST `/api/models/download` with `{tag: "llama3.2:1b"}` starts pull   |
| `test_pull_model_by_tag_empty_rejected`      | Missing tag returns 400                                               |
| `test_pull_model_by_tag_arbitrary`           | Can pull tags not in BUILT_IN_MODELS                                  |
| `test_delete_model_by_tag`                   | Delete orphan model by raw tag string                                 |
| `test_get_state_full_includes_hybrid_models` | `/api/state` returns new format                                       |
| `test_refresh_models_clears_cache`           | `/api/models/refresh` re-fetches and returns updated state            |
| `test_multiple_variant_warning_logged`       | Warning logged when multiple tags match prefix                        |

#### 4.2 Frontend Tests (Vitest, `src/renderer/`)

| Test                                     | What it verifies                                    |
| ---------------------------------------- | --------------------------------------------------- |
| `SettingsModel renders catalog section`  | Catalog entries displayed in first table            |
| `SettingsModel renders orphans section`  | Orphans displayed in second table when present      |
| `SettingsModel hides orphans when empty` | No "Other Models" section when orphans is `[]`      |
| `SettingsModel pull input accepts tag`   | Text input + Pull button functional                 |
| `SettingsModel quick-select chips`       | Clicking chip fills input with that tag             |
| `SettingsModel empty state`              | Helpful message when catalog and orphans both empty |
| `ChatContext uses actualTag`             | `loadModel` passes `actualTag` not `ollamaTag`      |
| `SharedStateContext parses new format`   | Provider handles `{catalog, orphans}` response      |

#### 4.3 Integration Tests (manual QA)

| Scenario                    | Steps                                                                       |
| --------------------------- | --------------------------------------------------------------------------- |
| Fresh install — no models   | Verify catalog shows, orphans hidden, pull input active                     |
| Pull a catalog model        | Click chip, Pull, verify appears as downloaded                              |
| Pull arbitrary tag          | Type `nomic-embed-text`, Pull, verify appears in orphans                    |
| Delete orphan model         | Select orphan, Delete, verify removed from list                             |
| Change Ollama URL           | Switch to different server, verify catalog updates with new server's models |
| Inference with resolved tag | Select model with variant mismatch, send message, verify correct tag used   |
