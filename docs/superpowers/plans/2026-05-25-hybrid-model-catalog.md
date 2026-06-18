# Hybrid Model Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static BUILT_IN_MODELS-only model catalog with a hybrid system that merges curated catalog entries with live Ollama `/api/tags` discovery, and switches to tag-based model pulling.

**Architecture:** `get_model_state()` merges BUILT_IN_MODELS with Ollama `/api/tags` → returns `{catalog, orphans}`. Frontend uses `actualTag` (resolved variant) for inference instead of hardcoded `ollamaTag`. Pull UI becomes a single tag-input field with catalog quick-select chips.

**Tech Stack:** Python 3.13 (Flask, requests), TypeScript (React, Vite), pytest, Vitest

**Spec:** `docs/superpowers/specs/hybrid-model-catalog.md`

---

## File Map

| File                                        | Action  | Responsibility                                                                |
| ------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| `src/models.ts`                             | Modify  | Add `actualTag` to `ManagedModel`, add `HybridModelState` type                |
| `src/sharedState.ts`                        | Modify  | Change `models` field type in `SharedState`                                   |
| `src/python/ollama_service.py`              | Modify  | Rewrite `get_model_state()`, add `pull_model_by_tag()`, update delete methods |
| `app.py`                                    | Modify  | Update model routes for tag-based pull/delete, change state response format   |
| `src/renderer/api.ts`                       | Modify  | Add `downloadModelByTag()`, update return types                               |
| `src/renderer/contexts/ChatContext.tsx`     | Modify  | Use `actualTag`, navigate `models.catalog`                                    |
| `src/renderer/components/SettingsModel.tsx` | Rewrite | Split catalog/orphans sections, tag-input pull UI                             |
| `src/renderer/components/SettingsLLM.tsx`   | Modify  | Use `actualTag`, navigate `models.catalog`                                    |
| `tests/test_ollama_service.py`              | Modify  | New tests for hybrid state + tag-based pull                                   |
| `tests/test_routes.py`                      | Modify  | New tests for updated endpoints                                               |
| `src/renderer/api.test.ts`                  | Modify  | Tests for `downloadModelByTag()`                                              |

---

### Task 1: Update TypeScript types

**Files:**

- Modify: `src/models.ts:14-22`
- Modify: `src/sharedState.ts:23-27`

- [ ] **Step 1: Add `actualTag` to `ManagedModel` and define `HybridModelState`**

In `src/models.ts`, add `actualTag` field and new type:

```ts
export interface ManagedModel extends Model {
  path: string;
  downloaded?: boolean;
  downloadState?: DownloadState;
  imported?: boolean;
  actualTag?: string;
}

export interface HybridModelState {
  catalog: Record<string, ManagedModel>;
  orphans: ManagedModel[];
}
```

Also update the export at line 21:

```ts
// Remove: export type ModelState = Record<string, ManagedModel>;
// Keep ModelState as alias for backward compat during transition:
export type ModelState = Record<string, ManagedModel>;
```

- [ ] **Step 2: Update `SharedState.models` type**

In `src/sharedState.ts`, line 23-27:

```ts
import { HybridModelState } from "./models";

export interface SharedState {
  models: HybridModelState;
  settings: SettingsState;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: Errors about `models` access patterns in components (will fix in later tasks). No type-definition errors in `models.ts` or `sharedState.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/models.ts src/sharedState.ts
git commit -m "feat: add HybridModelState type and actualTag field for hybrid catalog"
```

---

### Task 2: Backend — `get_model_state()` hybrid format

**Files:**

- Modify: `src/python/ollama_service.py:271-281`
- Modify: `tests/test_ollama_service.py` (add tests after line 107)

- [ ] **Step 1: Write failing tests for new `get_model_state()` format**

Add to `tests/test_ollama_service.py` after line 107:

```python
def test_get_model_state_returns_hybrid_format():
    svc = make_service()
    svc._available = set()
    state = svc.get_model_state()
    assert "catalog" in state
    assert "orphans" in state
    assert isinstance(state["catalog"], dict)
    assert isinstance(state["orphans"], list)


def test_get_model_state_catalog_entries_have_actual_tag():
    svc = make_service()
    svc._available = {"gemma3:1b"}
    state = svc.get_model_state()
    gemma = state["catalog"].get("Gemma 3 (1B)")
    assert gemma is not None
    assert gemma["actualTag"] == "gemma3:1b"
    assert gemma["downloaded"] is True


def test_get_model_state_actual_tag_fallback_when_not_installed():
    svc = make_service()
    svc._available = set()
    state = svc.get_model_state()
    gemma = state["catalog"]["Gemma 3 (1B)"]
    assert gemma["actualTag"] == gemma["ollamaTag"]
    assert gemma["downloaded"] is False


def test_get_model_state_orphans_from_ollama_tags():
    svc = make_service()
    svc._available = {"nomic-embed-text", "gemma3:1b"}
    state = svc.get_model_state()
    orphan_tags = [m["name"] for m in state["orphans"]]
    assert "nomic-embed-text" in orphan_tags
    # gemma3:1b is consumed by catalog match — not in orphans
    assert "gemma3:1b" not in orphan_tags


def test_get_model_state_no_orphan_duplicates():
    """Tags matching a catalog prefix are excluded from orphans."""
    svc = make_service()
    svc._available = {"qwen3:4b-Q4_K_M", "qwen3:4b-Q4_K_M-40k", "gemma3:1b"}
    state = svc.get_model_state()
    # Both qwen3 variants match catalog prefix "qwen3" — neither is orphan
    orphan_names = [m["name"] for m in state["orphans"]]
    assert "qwen3:4b-Q4_K_M" not in orphan_names
    assert "qwen3:4b-Q4_K_M-40k" not in orphan_names
    # gemma3:1b matches "Gemma 3 (1B)" catalog entry
    assert "gemma3:1b" not in orphan_names


def test_get_model_state_orphans_have_minimal_fields():
    svc = make_service()
    svc._available = {"nomic-embed-text"}
    state = svc.get_model_state()
    orphan = state["orphans"][0]
    assert orphan["name"] == "nomic-embed-text"
    assert orphan["path"] == "nomic-embed-text"
    assert orphan["downloaded"] is True
    assert orphan.get("actualTag") == "nomic-embed-text"


def test_get_model_state_empty_ollama():
    """Empty available set produces no orphans, all catalog downloaded=false."""
    svc = make_service()
    svc._available = set()
    state = svc.get_model_state()
    assert state["orphans"] == []
    assert all(not m["downloaded"] for m in state["catalog"].values())
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_ollama_service.py -q -k "get_model_state_returns_hybrid or get_model_state_catalog_entries or get_model_state_actual_tag or get_model_state_orphans" 2>&1`
Expected: 7 failures — `get_model_state()` doesn't return the new format yet.

- [ ] **Step 3: Rewrite `get_model_state()`**

Replace `src/python/ollama_service.py` lines 271-281:

```python
def get_model_state(self) -> dict:
    """Return {catalog: {name: ManagedModel}, orphans: [ManagedModel]}.

    Catalog entries come from BUILT_IN_MODELS. Each gets an ``actualTag``
    resolved via ``_resolve_tag()`` so the frontend always uses the correct
    Ollama tag for inference.

    Orphans are models from ``/api/tags`` that don't match any catalog entry
    prefix. They appear as simple entries with the tag as both name and path.
    """
    catalog: dict[str, dict] = {}
    matched_tags: set[str] = set()

    for model in BUILT_IN_MODELS:
        suggested_tag = model["ollamaTag"]
        actual_tag = self._resolve_tag(suggested_tag)
        is_downloaded = actual_tag in self._available
        name = model["name"]

        catalog[name] = {
            **model,
            "path": suggested_tag,
            "actualTag": actual_tag,
            "downloaded": is_downloaded,
        }
        # Track all tags consumed by catalog (the actual tag and the base
        # prefix) so we don't show them as orphans.
        matched_tags.add(actual_tag)
        base = suggested_tag.split(":")[0]
        for t in self._available:
            if t.startswith(base):
                matched_tags.add(t)

    orphans: list[dict] = []
    for tag in sorted(self._available):
        if tag not in matched_tags:
            orphans.append({
                "name": tag,
                "path": tag,
                "actualTag": tag,
                "downloaded": True,
                "size": 0,
            })

    return {"catalog": catalog, "orphans": orphans}
```

Also remove the old `_is_available` method (lines 251-255) — it's superseded by `_resolve_tag`:

```python
# Delete lines 251-255:
# def _is_available(self, tag: str) -> bool:
#     base = tag.split(":")[0]
#     return tag in self._available or any(
#         m.startswith(base) for m in self._available
#     )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_ollama_service.py -q -k "get_model_state" 2>&1`
Expected: 7 passed (the new tests), plus existing tests still pass.

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `python3 -m pytest tests/ -q 2>&1 | tail -5`
Expected: All pass. Any failures in other tests that called `get_model_state()` need fixing — they'll expect the old flat-dict format.

- [ ] **Step 6: Fix any regressions in existing tests**

The existing test `test_get_model_state_returns_all_builtin_models` (line 93) expects a flat dict. Update it:

```python
def test_get_model_state_returns_all_builtin_models():
    svc = make_service()
    state = svc.get_model_state()
    catalog = state["catalog"]
    assert len(catalog) == len(BUILT_IN_MODELS)
    for name, model in catalog.items():
        assert "downloaded" in model
        assert isinstance(model["downloaded"], bool)
        assert "actualTag" in model
```

And `test_model_state_all_downloaded_false_when_available_empty` (line 103):

```python
def test_model_state_all_downloaded_false_when_available_empty():
    svc = make_service()
    svc._available = set()
    state = svc.get_model_state()
    catalog = state["catalog"]
    assert all(not m["downloaded"] for m in catalog.values())
```

Run: `python3 -m pytest tests/test_ollama_service.py -q 2>&1 | tail -5`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add src/python/ollama_service.py tests/test_ollama_service.py
git commit -m "feat: hybrid get_model_state() with catalog and orphans"
```

---

### Task 3: Backend — `pull_model_by_tag()` and delete model updates

**Files:**

- Modify: `src/python/ollama_service.py` (add method, update delete methods)
- Modify: `tests/test_ollama_service.py` (add tests)

- [ ] **Step 1: Write failing test for `pull_model_by_tag`**

Add to `tests/test_ollama_service.py` after the pull model tests (after line 313):

```python
def test_pull_model_by_tag_starts_pull(mocker):
    """pull_model_by_tag accepts an arbitrary tag string."""
    mock_resp = mocker.MagicMock()
    mock_resp.iter_lines.return_value = [b'{"status":"pulling"}', b'{"status":"success"}']
    mock_post = mocker.patch("requests.post", return_value=mock_resp)

    svc = make_service()
    svc.pull_model_by_tag("llama3.2:1b")

    mock_post.assert_called_once()
    call_body = mock_post.call_args[1]["json"]
    assert call_body["name"] == "llama3.2:1b"


def test_pull_model_by_tag_arbitrary_tag(mocker):
    """Can pull tags not in BUILT_IN_MODELS."""
    mock_resp = mocker.MagicMock()
    mock_resp.iter_lines.return_value = [b'{"status":"success"}']
    mock_post = mocker.patch("requests.post", return_value=mock_resp)

    svc = make_service()
    svc.pull_model_by_tag("nomic-embed-text")

    call_body = mock_post.call_args[1]["json"]
    assert call_body["name"] == "nomic-embed-text"


def test_pull_model_by_tag_adds_to_available_on_success(mocker):
    mock_resp = mocker.MagicMock()
    mock_resp.iter_lines.return_value = [b'{"status":"success"}']
    mocker.patch("requests.post", return_value=mock_resp)

    svc = make_service()
    svc._available = set()
    svc.pull_model_by_tag("new-model:latest")

    assert "new-model:latest" in svc._available


def test_pull_model_by_tag_broadcasts_error_on_failure(mocker):
    mocker.patch("requests.post", side_effect=ConnectionError("refused"))
    svc = make_service()
    q = svc.subscribe_pull_events()
    svc.pull_model_by_tag("bad-tag")
    event = q.get_nowait()
    assert event["type"] == "pull_error"
    assert event["tag"] == "bad-tag"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_ollama_service.py -q -k "pull_model_by_tag" 2>&1`
Expected: 4 failures — `pull_model_by_tag` doesn't exist.

- [ ] **Step 3: Add `pull_model_by_tag()` method**

Add after `pull_model_by_name` (after line 326) in `src/python/ollama_service.py`:

```python
def pull_model_by_tag(self, tag: str) -> None:
    """
    Pull an Ollama model by its raw tag string (e.g. "llama3.2:1b").
    Runs in the caller's thread. Progress events broadcast to pull SSE
    subscribers. Call from a daemon thread started by the Flask route.
    """
    start = time.time()
    try:
        resp = requests.post(
            f"{OLLAMA_BASE}/api/pull",
            json={"name": tag, "stream": True},
            stream=True,
            timeout=3600,
        )
        resp.raise_for_status()
        for raw in resp.iter_lines():
            if not raw:
                continue
            data = json.loads(raw)
            status = data.get("status", "")
            self._broadcast_pull(
                {
                    "type": "pull_progress",
                    "tag": tag,
                    "status": status,
                    "total": data.get("total", 0),
                    "completed": data.get("completed", 0),
                    "elapsed": round(time.time() - start, 1),
                }
            )
            if status == "success":
                break
        self._available.add(tag)
        self._broadcast_pull({"type": "pull_done", "tag": tag})
    except Exception as exc:
        self._broadcast_pull({"type": "pull_error", "tag": tag, "error": str(exc)})
```

- [ ] **Step 4: Update `delete_model_by_name` to handle orphans**

The current `delete_model_by_name` only looks up BUILT_IN_MODELS by display name. Update it (lines 328-336):

```python
def delete_model_by_name(self, name: str) -> None:
    """Delete an Ollama model by display name or raw tag."""
    model = next((m for m in BUILT_IN_MODELS if m["name"] == name), None)
    tag = model["ollamaTag"] if model else name
    resp = requests.delete(
        f"{OLLAMA_BASE}/api/delete", json={"name": tag}, timeout=30
    )
    resp.raise_for_status()
    self._available.discard(tag)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_ollama_service.py -q -k "pull_model_by_tag" 2>&1`
Expected: 4 passed.

Run full suite: `python3 -m pytest tests/ -q 2>&1 | tail -3`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/python/ollama_service.py tests/test_ollama_service.py
git commit -m "feat: add pull_model_by_tag() for tag-based model pulling"
```

---

### Task 4: Backend — Update Flask routes

**Files:**

- Modify: `app.py` (lines 207-260)
- Modify: `tests/test_routes.py` (add tests)

- [ ] **Step 1: Write failing route tests**

Add to `tests/test_routes.py` after the existing model tests:

```python
def test_get_state_returns_hybrid_format(client):
    resp = client.get("/api/state")
    assert resp.status_code == 200
    data = resp.get_json()
    models = data["models"]
    assert "catalog" in models
    assert "orphans" in models
    assert isinstance(models["catalog"], dict)
    assert isinstance(models["orphans"], list)


def test_download_model_by_tag(client):
    """POST /api/models/download with {tag} instead of {name}."""
    with patch("threading.Thread") as mock_thread:
        resp = post_json(client, "/api/models/download", {"tag": "llama3.2:1b"})
        assert resp.status_code == 200
        mock_thread.assert_called_once()


def test_download_model_missing_tag_returns_400(client):
    resp = post_json(client, "/api/models/download", {})
    assert resp.status_code == 400
    data = resp.get_json()
    assert "error" in data


def test_delete_model_by_tag(client, mocker):
    """Delete works with raw tag string for orphan models."""
    mock_resp = mocker.MagicMock()
    mock_resp.raise_for_status = mocker.MagicMock()
    mocker.patch("requests.delete", return_value=mock_resp)

    resp = post_json(client, "/api/models/delete", {"name": "nomic-embed-text"})
    assert resp.status_code == 200


def test_refresh_models_returns_hybrid_format(client):
    resp = post_json(client, "/api/models/refresh")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "catalog" in data
    assert "orphans" in data
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_routes.py -q -k "hybrid or download_model_by_tag or delete_model_by_tag or refresh_models_returns" 2>&1`
Expected: 5 failures — routes still use old format.

- [ ] **Step 3: Update `/api/models/download` route**

Replace `app.py` lines 219-227:

```python
@app.route("/api/models/download", methods=["POST"])
def download_model():
    body = request.get_json(force=True) or {}
    tag = body.get("tag", "")
    if not tag:
        return jsonify({"error": "tag required"}), 400
    svc = get_ollama_service()
    threading.Thread(target=svc.pull_model_by_tag, args=(tag,), daemon=True).start()
    return jsonify({"status": "ok"})
```

- [ ] **Step 4: Update `/api/state` response format**

The `/api/state` route (line 108-118) already calls `svc.get_model_state()` and passes it through — no change needed since `get_model_state()` now returns the hybrid format.

The `/api/ollama/url` POST route (line 313-325) also calls `svc.get_model_state()` — same, no change needed.

The `/api/models` GET (line 207-209) and `/api/models/refresh` POST (line 212-216) routes already pass through `get_model_state()` — no changes needed.

- [ ] **Step 5: Run tests to verify they pass**

Run: `python3 -m pytest tests/test_routes.py -q -k "hybrid or download_model_by_tag or delete_model_by_tag or refresh_models_returns or get_state" 2>&1`
Expected: All new tests pass.

Run full suite: `python3 -m pytest tests/ -q 2>&1 | tail -3`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add app.py tests/test_routes.py
git commit -m "feat: update model routes for tag-based pull and hybrid state format"
```

---

### Task 5: Frontend — Update `api.ts` for new types and endpoints

**Files:**

- Modify: `src/renderer/api.ts`
- Modify: `src/renderer/api.test.ts`

- [ ] **Step 1: Add `downloadModelByTag` function**

Add after `downloadModelByName` (line 98) in `src/renderer/api.ts`:

```ts
export async function downloadModelByTag(tag: string): Promise<void> {
  await post("/models/download", { tag });
}
```

- [ ] **Step 2: Update `getFullState` return type**

Line 34-37 — the return type should match `SharedState` which now has `HybridModelState`. The `SharedState` import already covers this since we updated the type in Task 1.

- [ ] **Step 3: Update `updateModelState` return type**

Line 90-93 — change return type from `ModelState` to `HybridModelState`:

```ts
import type { HybridModelState } from "../models";

export async function updateModelState(): Promise<HybridModelState> {
  const r = await post("/models/refresh");
  return r.json();
}
```

Remove the `ModelState` import if it's no longer used elsewhere.

- [ ] **Step 4: Write API tests**

Add to `src/renderer/api.test.ts`:

```ts
import { downloadModelByTag } from "./api";

describe("downloadModelByTag", () => {
  it("posts tag to /models/download", async () => {
    mockFetch({ status: "ok" });
    await downloadModelByTag("llama3.2:1b");
    expect(fetch).toHaveBeenCalledWith(
      "/api/models/download",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ tag: "llama3.2:1b" }),
      }),
    );
  });
});
```

- [ ] **Step 5: Run frontend tests**

Run: `npm run test 2>&1 | tail -10`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/api.ts src/renderer/api.test.ts
git commit -m "feat: add downloadModelByTag() and update API types for hybrid catalog"
```

---

### Task 6: Frontend — Update `ChatContext.tsx` for catalog navigation

**Files:**

- Modify: `src/renderer/contexts/ChatContext.tsx`

- [ ] **Step 1: Update model lookup to navigate `models.catalog`**

Lines 145-147 — change from `models[settings.selectedModel]` to `models.catalog[settings.selectedModel]` and use `actualTag`:

```tsx
const loadModel = useCallback(
  async (initialPrompts: LanguageModelPrompt[] = []) => {
    setIsModelLoaded(false);

    const selectedModelData = settings.selectedModel
      ? models.catalog[settings.selectedModel]
      : undefined;
    const ollamaTag =
      (selectedModelData as any)?.actualTag ?? settings.selectedModel ?? "";

    const options = {
      modelAlias: settings.selectedModel,
      ollamaTag,
      systemPrompt: getSystemPrompt(),
      topK: settings.topK,
      temperature: settings.temperature,
      initialPrompts,
    };

    try {
      await electronAi.create(options);
      setIsModelLoaded(true);
    } catch (error) {
      console.error(error);

      addMessage({
        id: randomUUID(),
        children: <ErrorLoadModelMessageContent error={error} />,
        sender: "sprout",
        createdAt: Date.now(),
      });
    }
  },
  [
    settings.selectedModel,
    settings.systemPrompt,
    settings.topK,
    settings.temperature,
    messages,
  ],
);
```

- [ ] **Step 2: Update fallback model selection (lines 254-268)**

```tsx
useEffect(() => {
  if (
    !settings.selectedModel ||
    !models.catalog[settings.selectedModel] ||
    !models.catalog[settings.selectedModel].downloaded
  ) {
    const downloadedModel = Object.values(models.catalog).find(
      (model) => model.downloaded,
    );

    if (downloadedModel) {
      sproutApi.setState("settings.selectedModel", downloadedModel.name);
    }
  }
}, [models]);
```

- [ ] **Step 3: Verify TypeScript compiles for this file**

Run: `npx tsc --noEmit src/renderer/contexts/ChatContext.tsx 2>&1 | head -20`
Expected: No errors. (Other files may still error — that's fine for now.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/contexts/ChatContext.tsx
git commit -m "feat: ChatContext uses actualTag from catalog for inference"
```

---

### Task 7: Frontend — Update `SettingsLLM.tsx` for catalog navigation

**Files:**

- Modify: `src/renderer/components/SettingsLLM.tsx`

- [ ] **Step 1: Update model references to use `models.catalog`**

Lines 69-73:

```tsx
const { models } = useSharedState();
const catalog = models?.catalog ?? {};
const modelKeys = Object.keys(catalog);
const loadedModel = modelKeys
  .map((k) => catalog[k])
  .find((m) => m?.name === settings.selectedModel);
```

- [ ] **Step 2: Update tag display to use `actualTag`**

Lines 118-123:

```tsx
{
  loadedModel.actualTag && (
    <code style={{ marginLeft: "8px", color: "#555" }}>
      {loadedModel.actualTag}
    </code>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles for this file**

Run: `npx tsc --noEmit src/renderer/components/SettingsLLM.tsx 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/SettingsLLM.tsx
git commit -m "feat: SettingsLLM uses catalog.actualTag instead of ollamaTag"
```

---

### Task 8: Frontend — Rewrite `SettingsModel.tsx` with catalog/orphans + tag input

**Files:**

- Rewrite: `src/renderer/components/SettingsModel.tsx`

- [ ] **Step 1: Write the new component**

Replace `src/renderer/components/SettingsModel.tsx` entirely:

```tsx
import { Column, TableView } from "./TableView";
import { Progress } from "./Progress";
import React, { useState } from "react";
import { useSharedState } from "../contexts/SharedStateContext";
import { sproutApi } from "../sproutApi";
import { downloadModelByTag } from "../api";
import { prettyDownloadSpeed } from "../helpers/convert-download-speed";
import { ManagedModel } from "../../models";
import { isModelDownloading } from "../../helpers/model-helpers";

export const SettingsModel: React.FC = () => {
  const { models, settings } = useSharedState();
  const catalog = models?.catalog ?? {};
  const orphans = models?.orphans ?? [];
  const catalogKeys = Object.keys(catalog);

  const [selectedSection, setSelectedSection] = useState<"catalog" | "orphans">(
    "catalog",
  );
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [pullTag, setPullTag] = useState("");
  const [isPulling, setIsPulling] = useState(false);

  const columns: Array<Column> = [
    { key: "default", header: "Loaded", width: 50 },
    { key: "name", header: "Name" },
    {
      key: "size",
      header: "Size",
      render: (row) => `${row.size.toLocaleString()} MB`,
    },
    { key: "company", header: "Company" },
    { key: "downloaded", header: "Downloaded" },
  ];

  // Build catalog table data
  const catalogData = catalogKeys.map((key) => {
    const model = catalog[key];
    return {
      default: model?.name === settings.selectedModel ? "ｘ" : "",
      name: model?.name,
      company: model?.company ?? "",
      size: model?.size ?? 0,
      downloaded: model?.downloaded ? "Yes" : "No",
    };
  });

  // Build orphans table data
  const orphanData = orphans.map((m) => ({
    default: m.name === settings.selectedModel ? "ｘ" : "",
    name: m.name,
    company: "-",
    size: m.size ?? 0,
    downloaded: m.downloaded ? "Yes" : "No",
  }));

  // Currently selected model
  const selectedModel: ManagedModel | null =
    selectedSection === "catalog" && catalogKeys.length > 0
      ? (catalog[catalogKeys[selectedIndex]] ?? null)
      : selectedSection === "orphans" && orphans.length > 0
        ? (orphans[selectedIndex] ?? null)
        : null;

  const isDownloading = isModelDownloading(selectedModel);
  const isDefaultModel = selectedModel?.name === settings.selectedModel;

  const handleCatalogSelect = (index: number) => {
    setSelectedSection("catalog");
    setSelectedIndex(index);
  };

  const handleOrphanSelect = (index: number) => {
    setSelectedSection("orphans");
    setSelectedIndex(index);
  };

  const handlePull = async () => {
    const tag = pullTag.trim();
    if (!tag) return;
    setIsPulling(true);
    try {
      await downloadModelByTag(tag);
    } finally {
      setIsPulling(false);
      setPullTag("");
    }
  };

  const handleQuickSelect = (tag: string) => {
    setPullTag(tag);
  };

  const handleDeleteOrRemove = async () => {
    if (!selectedModel) return;
    if (selectedModel.imported) {
      await sproutApi.removeModelByName(selectedModel.name);
    } else {
      await sproutApi.deleteModelByName(selectedModel.name);
    }
  };

  const handleMakeDefault = async () => {
    if (selectedModel) {
      await sproutApi.setState("settings.selectedModel", selectedModel.name);
    }
  };

  // Collect quick-select tags from catalog
  const quickTags = catalogKeys
    .map((k) => catalog[k]?.ollamaTag)
    .filter(Boolean) as string[];

  return (
    <div>
      <p>
        Select the model you want to use for your chat. The larger the model,
        the more powerful the chat, but the slower it will be - and the more
        memory it will use. Sprout uses models in the GGUF format.{" "}
        <a
          href="https://github.com/felixrieseberg/sprout?tab=readme-ov-file#downloading-more-models"
          target="_blank"
        >
          More information.
        </a>
      </p>

      {/* ── Suggested Models ─────────────────────────── */}
      <fieldset>
        <legend>Suggested Models</legend>
        {catalogData.length > 0 ? (
          <TableView
            columns={columns}
            data={catalogData}
            onRowSelect={handleCatalogSelect}
            initialSelectedIndex={
              selectedSection === "catalog" ? selectedIndex : 0
            }
          />
        ) : (
          <p style={{ color: "#888" }}>No suggested models available.</p>
        )}
      </fieldset>

      {/* ── Other Models (Orphans) ───────────────────── */}
      {orphanData.length > 0 && (
        <fieldset>
          <legend>Other Models (from Ollama)</legend>
          <TableView
            columns={columns}
            data={orphanData}
            onRowSelect={handleOrphanSelect}
            initialSelectedIndex={
              selectedSection === "orphans" ? selectedIndex : 0
            }
          />
        </fieldset>
      )}

      {/* ── Selected Model Details ───────────────────── */}
      {selectedModel && (
        <div
          className="model-details sunken-panel"
          style={{ marginTop: "20px", padding: "15px" }}
        >
          <strong>{selectedModel.name}</strong>

          {selectedModel.actualTag && (
            <div style={{ marginTop: "4px" }}>
              <code style={{ color: "#555" }}>{selectedModel.actualTag}</code>
            </div>
          )}

          <div style={{ marginTop: "15px", display: "flex", gap: "10px" }}>
            {!selectedModel.downloaded ? (
              <button
                disabled={isDownloading}
                onClick={() => {
                  if (selectedModel.actualTag) {
                    setPullTag(selectedModel.actualTag);
                  }
                }}
              >
                Download Model
              </button>
            ) : (
              <>
                <button
                  disabled={isDownloading || isDefaultModel}
                  onClick={handleMakeDefault}
                >
                  {isDefaultModel
                    ? "Sprout uses this model"
                    : "Make Sprout use this model"}
                </button>
                <button onClick={handleDeleteOrRemove}>
                  {selectedModel?.imported ? "Remove" : "Delete"} Model
                </button>
              </>
            )}
          </div>
          <SettingsModelDownload model={selectedModel} />
        </div>
      )}

      {/* ── Pull New Model ───────────────────────────── */}
      <fieldset style={{ marginTop: "15px" }}>
        <legend>Pull New Model</legend>
        <div className="field-row">
          <label style={{ width: 50 }}>Tag:</label>
          <input
            type="text"
            value={pullTag}
            onChange={(e) => setPullTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePull()}
            placeholder="e.g. llama3.2:1b"
            style={{ flex: 1, marginRight: "6px" }}
          />
          <button onClick={handlePull} disabled={isPulling || !pullTag.trim()}>
            {isPulling ? "Pulling..." : "Pull"}
          </button>
        </div>
        {quickTags.length > 0 && (
          <div
            style={{
              marginTop: "6px",
              display: "flex",
              gap: "4px",
              flexWrap: "wrap",
            }}
          >
            {quickTags.map((tag) => (
              <button
                key={tag}
                onClick={() => handleQuickSelect(tag)}
                style={{ fontSize: "0.85em", padding: "2px 6px" }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
};

const SettingsModelDownload: React.FC<{
  model?: ManagedModel;
}> = ({ model }) => {
  if (!model || !isModelDownloading(model)) {
    return null;
  }

  const downloadSpeed = prettyDownloadSpeed(
    model?.downloadState?.currentBytesPerSecond || 0,
  );

  return (
    <div style={{ marginTop: "15px" }}>
      <p>
        Downloading {model.name}... ({downloadSpeed}/s)
      </p>
      <Progress progress={model.downloadState?.percentComplete || 0} />
    </div>
  );
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No errors across the entire project (all components now updated).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/SettingsModel.tsx
git commit -m "feat: rewrite SettingsModel with catalog/orphans sections and tag-based pull"
```

---

### Task 9: Integration — Build, test, and verify

**Files:**

- No new files — verification only.

- [ ] **Step 1: Run full backend test suite**

Run: `python3 -m pytest tests/ -q 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 2: Run frontend test suite**

Run: `npm run test 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 3: Build the frontend**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds, no TypeScript or Vite errors.

- [ ] **Step 4: Start the server and do a smoke test**

```bash
python3 app.py &
sleep 2
curl -s http://localhost:5080/api/state | python3 -m json.tool | head -20
```

Expected: Response contains `"catalog"` and `"orphans"` keys. Kill the server after.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: final integration verification"
```

---

## Self-Review

**1. Spec coverage check:**

- Architecture: `get_model_state()` hybrid format — Task 2
- Backend: `actualTag` field, `pull_model_by_tag()` — Tasks 2, 3
- Frontend: `ChatContext` uses `actualTag` — Task 6
- Component details: `SettingsModel.tsx` rewrite — Task 8
- Component details: `SettingsLLM.tsx` update — Task 7
- Error handling: Ollama unreachable (Task 2 — empty orphans, all downloaded=false), pull failure (Task 3 — broadcast pull_error), tag resolution fallback (Task 2 — `_resolve_tag` already exists)
- Migration: Type changes (Task 1), no settings.json migration needed
- Test plan: 13 backend tests + 1 frontend API test covered across Tasks 2-5

**2. Placeholder scan:** No TBDs, TODOs, or "implement later" patterns found. All steps have concrete code or commands.

**3. Type consistency:**

- `HybridModelState` defined in Task 1, used in Tasks 5-8
- `actualTag` defined in Task 1, used in Tasks 2, 6, 7, 8
- `pull_model_by_tag(tag: str)` defined in Task 3, called by route in Task 4, called via `downloadModelByTag(tag: string)` in Task 5
- `models.catalog` accessed in Tasks 6, 7, 8 — consistent property name
- `models.orphans` accessed in Task 8 — matches `HybridModelState.orphans`
