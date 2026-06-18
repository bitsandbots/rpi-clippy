"""
Ollama service — importable class that wraps all Ollama HTTP calls.
Replaces the stdin/stdout subprocess pattern of sprout_llm.py with a
module-level API that Flask routes can call directly.
"""

import json
import queue
import threading
import time
from typing import Iterator

import requests

OLLAMA_BASE = "http://localhost:11434"


def set_ollama_base(url: str) -> None:
    """Update the Ollama base URL at runtime (e.g. when user changes it in settings)."""
    global OLLAMA_BASE
    OLLAMA_BASE = url.rstrip("/")


BUILT_IN_MODELS = [
    {
        "name": "Gemma 3 (1B)",
        "company": "Google",
        "size": 806,
        "ollamaTag": "gemma3:1b",
    },
    {
        "name": "Gemma 3 (4B)",
        "company": "Google",
        "size": 2490,
        "ollamaTag": "gemma3:4b-Q4_K_M",
    },
    {
        "name": "Gemma 3 (12B)",
        "company": "Google",
        "size": 5600,
        "ollamaTag": "gemma3:12b",
    },
    {
        "name": "Phi-4 Mini (3.8B)",
        "company": "Microsoft",
        "size": 2490,
        "ollamaTag": "phi4-mini",
    },
    {
        "name": "Qwen3 (4B)",
        "company": "Qwen",
        "size": 2500,
        "ollamaTag": "qwen3:4b-Q4_K_M",
    },
    {
        "name": "Llama 3.2 (1B Instruct)",
        "company": "Meta",
        "size": 808,
        "ollamaTag": "llama3.2:1b",
    },
    {
        "name": "Llama 3.2 (3B Instruct)",
        "company": "Meta",
        "size": 2020,
        "ollamaTag": "llama3.2:3b",
    },
    {
        "name": "TinyLlama (1.1B)",
        "company": "TinyLlama",
        "size": 637,
        "ollamaTag": "tinyllama",
    },
    {
        "name": "Llama 3.1 (8B Instruct)",
        "company": "Meta",
        "size": 8060,
        "ollamaTag": "llama3.1:8b-instruct-q8_0",
    },
    {
        "name": "Qwen2.5 Coder (0.5B)",
        "company": "Qwen",
        "size": 500,
        "ollamaTag": "qwen2.5-coder:0.5b",
    },
    {
        "name": "Qwen3 (1.7B)",
        "company": "Qwen",
        "size": 1700,
        "ollamaTag": "qwen3:1.7b",
    },
]


class OllamaService:
    """Manages a single LLM session and proxies calls to a local Ollama server."""

    _MAX_HISTORY = 40  # max messages retained (20 turns)

    def __init__(self):
        self._session: dict | None = None
        self._history: list[dict] = []
        self._history_lock = threading.Lock()
        self._abort_events: dict[str, threading.Event] = {}
        self._available: set[str] = set()
        self._pull_queues: list[queue.Queue] = []
        self._pull_lock = threading.Lock()
        self._available_lock = threading.Lock()

        # Populate available model cache asynchronously
        threading.Thread(target=self._refresh_available_bg, daemon=True).start()

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    def create_session(self, options: dict) -> None:
        """Configure the active model session and seed conversation history."""
        self._session = options
        with self._history_lock:
            self._history = []
            for prompt in options.get("initialPrompts", []):
                role = prompt.get("role", "user")
                content = prompt.get("content", "")
                if content:
                    self._history.append({"role": role, "content": content})

    def destroy_session(self) -> None:
        """Clear the active session."""
        self._session = None
        with self._history_lock:
            self._history = []

    # ------------------------------------------------------------------
    # Inference (synchronous generator — Flask SSE iterates it)
    # ------------------------------------------------------------------

    def prompt_streaming(self, message: str, uuid: str) -> Iterator[dict]:
        """
        Synchronous generator that yields chunk/done/error dicts.
        Call from a Flask SSE route on its own request thread.
        """
        abort_event = threading.Event()
        self._abort_events[uuid] = abort_event

        session = self._session or {}
        with self._history_lock:
            history_snapshot = list(self._history)

        try:
            messages: list[dict] = []
            system_prompt = session.get("systemPrompt")
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.extend(history_snapshot)
            messages.append({"role": "user", "content": message})

            ollama_tag = self._resolve_tag(session.get("ollamaTag", "llama3.2:1b"))
            temperature = float(session.get("temperature", 0.7))
            top_k = int(session.get("topK", 10))

            # Format prompt with conversation history for generate endpoint
            # Ollama's /api/generate expects a single prompt string
            prompt_lines = []
            if system_prompt:
                prompt_lines.append(f"System: {system_prompt}")
            for msg in history_snapshot:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if content:
                    if role == "assistant":
                        prompt_lines.append(f"Assistant: {content}")
                    else:
                        prompt_lines.append(f"User: {content}")
            prompt_lines.append(f"User: {message}")
            prompt = "\n\n".join(prompt_lines)

            resp = requests.post(
                f"{OLLAMA_BASE}/api/generate",
                json={
                    "model": ollama_tag,
                    "prompt": prompt,
                    "stream": True,
                    "options": {
                        "temperature": temperature,
                        "top_k": top_k,
                        "num_thread": 3,
                    },
                },
                stream=True,
                timeout=180,
            )
            resp.raise_for_status()

            full_response = ""
            for raw in resp.iter_lines():
                if abort_event.is_set():
                    break
                if not raw:
                    continue
                try:
                    data_json = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if not data_json.get("done"):
                    # Ollama returns "response" for text and "thinking" for thinking
                    chunk = data_json.get("response", "") or data_json.get(
                        "thinking", ""
                    )
                    if chunk:
                        full_response += chunk
                        yield {"type": "chunk", "uuid": uuid, "text": chunk}

            if not abort_event.is_set():
                with self._history_lock:
                    self._history.append({"role": "user", "content": message})
                    self._history.append(
                        {"role": "assistant", "content": full_response}
                    )
                    if len(self._history) > self._MAX_HISTORY:
                        self._history = self._history[-self._MAX_HISTORY :]

            yield {"type": "done", "uuid": uuid}

        except Exception as exc:
            yield {"type": "error", "uuid": uuid, "error": str(exc)}
        finally:
            self._abort_events.pop(uuid, None)

    def abort(self, uuid: str) -> None:
        """Signal an in-progress streaming request to stop."""
        event = self._abort_events.get(uuid)
        if event is not None:
            event.set()

    # ------------------------------------------------------------------
    # Model management
    # ------------------------------------------------------------------

    def _refresh_available_bg(self, clear_on_failure: bool = False) -> None:
        try:
            resp = requests.get(f"{OLLAMA_BASE}/api/tags", timeout=3)
            resp.raise_for_status()
            tags = {m["name"] for m in resp.json().get("models", [])}
            with self._available_lock:
                self._available = tags
        except Exception:
            if clear_on_failure:
                with self._available_lock:
                    self._available = set()

    def refresh_available(self) -> None:
        """Synchronously refresh the available model cache after an explicit URL change."""
        self._refresh_available_bg(clear_on_failure=True)

    def _resolve_tag(self, tag: str, available: set[str] | None = None) -> str:
        """Return the actual installed tag matching the given tag prefix.

        If the exact tag exists, return it. Otherwise search available models
        for one starting with the same base name. Falls back to the given tag.
        """
        if available is None:
            with self._available_lock:
                available = set(self._available)
        if tag in available:
            return tag
        base = tag.split(":")[0]
        for m in available:
            if m.startswith(base):
                return m
        return tag

    def get_model_state(self) -> dict:
        """Return {catalog: {name: ManagedModel}, orphans: [ManagedModel]}.

        Catalog entries come from BUILT_IN_MODELS. Each gets an ``actualTag``
        resolved via ``_resolve_tag()`` so the frontend always uses the correct
        Ollama tag for inference.

        Orphans are models from ``/api/tags`` that don't match any catalog entry
        prefix. They appear as simple entries with the tag as both name and path.
        """
        with self._available_lock:
            available = set(self._available)

        catalog: dict[str, dict] = {}
        matched_tags: set[str] = set()

        for model in BUILT_IN_MODELS:
            suggested_tag = model["ollamaTag"]
            actual_tag = self._resolve_tag(suggested_tag, available)
            is_downloaded = actual_tag in available
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
            for t in available:
                if t.startswith(base):
                    matched_tags.add(t)

        orphans: list[dict] = []
        for tag in sorted(available):
            if tag not in matched_tags:
                orphans.append(
                    {
                        "name": tag,
                        "path": tag,
                        "actualTag": tag,
                        "downloaded": True,
                        "size": 0,
                    }
                )

        return {"catalog": catalog, "orphans": orphans}

    def pull_model_by_name(self, name: str) -> None:
        """
        Pull an Ollama model by display name. Runs in the caller's thread.
        Progress events are broadcast to all pull SSE subscribers.
        Call this from a daemon thread started by the Flask route.
        """
        model = next((m for m in BUILT_IN_MODELS if m["name"] == name), None)
        if not model:
            self._broadcast_pull(
                {"type": "pull_error", "tag": name, "error": "Unknown model"}
            )
            return

        tag = model["ollamaTag"]
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
            with self._available_lock:
                self._available.add(tag)
            self._broadcast_pull({"type": "pull_done", "tag": tag})
        except Exception as exc:
            self._broadcast_pull({"type": "pull_error", "tag": tag, "error": str(exc)})

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
            with self._available_lock:
                self._available.add(tag)
            self._broadcast_pull({"type": "pull_done", "tag": tag})
        except Exception as exc:
            self._broadcast_pull({"type": "pull_error", "tag": tag, "error": str(exc)})

    def delete_model_by_name(self, name: str) -> None:
        """Delete an Ollama model by display name."""
        model = next((m for m in BUILT_IN_MODELS if m["name"] == name), None)
        tag = model["ollamaTag"] if model else name
        resp = requests.delete(
            f"{OLLAMA_BASE}/api/delete", json={"name": tag}, timeout=30
        )
        resp.raise_for_status()
        with self._available_lock:
            self._available.discard(tag)

    def remove_model_by_name(self, name: str) -> None:
        """Remove a model from the available cache without deleting from Ollama."""
        model = next((m for m in BUILT_IN_MODELS if m["name"] == name), None)
        if model:
            with self._available_lock:
                self._available.discard(model["ollamaTag"])

    def delete_all_models(self) -> None:
        """Delete all known models from Ollama."""
        with self._available_lock:
            available_snapshot = set(self._available)
        for model in BUILT_IN_MODELS:
            tag = model["ollamaTag"]
            if tag in available_snapshot:
                try:
                    requests.delete(
                        f"{OLLAMA_BASE}/api/delete", json={"name": tag}, timeout=30
                    )
                except Exception:
                    pass
        with self._available_lock:
            self._available.clear()

    # ------------------------------------------------------------------
    # Pull SSE fan-out
    # ------------------------------------------------------------------

    def subscribe_pull_events(self) -> queue.Queue:
        """Return a new Queue that will receive pull progress dicts."""
        q: queue.Queue = queue.Queue()
        with self._pull_lock:
            self._pull_queues.append(q)
        return q

    def unsubscribe_pull_events(self, q: queue.Queue) -> None:
        """Remove a subscriber queue."""
        with self._pull_lock:
            try:
                self._pull_queues.remove(q)
            except ValueError:
                pass

    def _broadcast_pull(self, event: dict) -> None:
        with self._pull_lock:
            for q in list(self._pull_queues):
                q.put(event)


_service: OllamaService | None = None
_service_lock = threading.Lock()


def get_ollama_service() -> OllamaService:
    """Return the global OllamaService singleton."""
    global _service
    if _service is None:
        with _service_lock:
            if _service is None:
                _service = OllamaService()
    return _service
