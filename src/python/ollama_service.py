"""
Ollama service — importable class that wraps all Ollama HTTP calls.
Replaces the stdin/stdout subprocess pattern of clippy_llm.py with a
module-level API that Flask routes can call directly.
"""

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
    {"name": "Gemma 3 (1B)",       "company": "Google",    "size": 806,  "ollamaTag": "gemma3:1b"},
    {"name": "Gemma 3 (4B)",       "company": "Google",    "size": 2490, "ollamaTag": "gemma3:4b"},
    {"name": "Gemma 3 (12B)",      "company": "Google",    "size": 5600, "ollamaTag": "gemma3:12b"},
    {"name": "Phi-4 Mini (3.8B)",  "company": "Microsoft", "size": 2490, "ollamaTag": "phi4-mini"},
    {"name": "Qwen3 (4B)",         "company": "Qwen",      "size": 2500, "ollamaTag": "qwen3:4b"},
    {"name": "Llama 3.2 (1B Instruct)", "company": "Meta", "size": 808,  "ollamaTag": "llama3.2:1b"},
    {"name": "Llama 3.2 (3B Instruct)", "company": "Meta", "size": 2020, "ollamaTag": "llama3.2:3b"},
    {"name": "TinyLlama (1.1B)",   "company": "TinyLlama", "size": 637,  "ollamaTag": "tinyllama"},
]


class OllamaService:
    """Manages a single LLM session and proxies calls to a local Ollama server."""

    def __init__(self):
        self._session: dict | None = None
        self._history: list[dict] = []
        self._abort_events: dict[str, threading.Event] = {}
        self._available: set[str] = set()
        self._pull_queues: list[queue.Queue] = []
        self._pull_lock = threading.Lock()

        # Populate available model cache asynchronously
        threading.Thread(target=self._refresh_available_bg, daemon=True).start()

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    def create_session(self, options: dict) -> None:
        """Configure the active model session and seed conversation history."""
        self._session = options
        self._history = []
        for prompt in options.get("initialPrompts", []):
            role = prompt.get("role", "user")
            content = prompt.get("content", "")
            if content:
                self._history.append({"role": role, "content": content})

    def destroy_session(self) -> None:
        """Clear the active session."""
        self._session = None
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
        history_snapshot = list(self._history)

        try:
            messages: list[dict] = []
            system_prompt = session.get("systemPrompt")
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.extend(history_snapshot)
            messages.append({"role": "user", "content": message})

            ollama_tag = session.get("ollamaTag", "llama3.2:1b")
            temperature = float(session.get("temperature", 0.7))
            top_k = int(session.get("topK", 10))

            resp = requests.post(
                f"{OLLAMA_BASE}/api/chat",
                json={
                    "model": ollama_tag,
                    "messages": messages,
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
                data_json = __import__("json").loads(raw)
                if not data_json.get("done"):
                    chunk = data_json.get("message", {}).get("content", "")
                    if chunk:
                        full_response += chunk
                        yield {"type": "chunk", "uuid": uuid, "text": chunk}

            if not abort_event.is_set():
                self._history.append({"role": "user", "content": message})
                self._history.append({"role": "assistant", "content": full_response})

            yield {"type": "done", "uuid": uuid}

        except Exception as exc:
            yield {"type": "error", "uuid": uuid, "error": str(exc)}
        finally:
            self._abort_events.pop(uuid, None)

    def abort(self, uuid: str) -> None:
        """Signal an in-progress streaming request to stop."""
        if uuid in self._abort_events:
            self._abort_events[uuid].set()

    # ------------------------------------------------------------------
    # Model management
    # ------------------------------------------------------------------

    def _refresh_available_bg(self) -> None:
        try:
            resp = requests.get(f"{OLLAMA_BASE}/api/tags", timeout=10)
            resp.raise_for_status()
            tags = {m["name"] for m in resp.json().get("models", [])}
            self._available = tags
        except Exception:
            pass

    def refresh_available(self) -> None:
        """Synchronously refresh the available model cache."""
        self._refresh_available_bg()

    def _is_available(self, tag: str) -> bool:
        base = tag.split(":")[0]
        return tag in self._available or any(m.startswith(base) for m in self._available)

    def get_model_state(self) -> dict:
        """Return a ModelState dict (name → ManagedModel) for the renderer."""
        state = {}
        for model in BUILT_IN_MODELS:
            tag = model["ollamaTag"]
            state[model["name"]] = {
                **model,
                "path": tag,
                "downloaded": self._is_available(tag),
            }
        return state

    def pull_model_by_name(self, name: str) -> None:
        """
        Pull an Ollama model by display name. Runs in the caller's thread.
        Progress events are broadcast to all pull SSE subscribers.
        Call this from a daemon thread started by the Flask route.
        """
        model = next((m for m in BUILT_IN_MODELS if m["name"] == name), None)
        if not model:
            self._broadcast_pull({"type": "pull_error", "tag": name, "error": "Unknown model"})
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
            import json as _json
            for raw in resp.iter_lines():
                if not raw:
                    continue
                data = _json.loads(raw)
                status = data.get("status", "")
                self._broadcast_pull({
                    "type": "pull_progress",
                    "tag": tag,
                    "status": status,
                    "total": data.get("total", 0),
                    "completed": data.get("completed", 0),
                    "elapsed": round(time.time() - start, 1),
                })
                if status == "success":
                    break
            self._available.add(tag)
            self._broadcast_pull({"type": "pull_done", "tag": tag})
        except Exception as exc:
            self._broadcast_pull({"type": "pull_error", "tag": tag, "error": str(exc)})

    def delete_model_by_name(self, name: str) -> None:
        """Delete an Ollama model by display name."""
        model = next((m for m in BUILT_IN_MODELS if m["name"] == name), None)
        tag = model["ollamaTag"] if model else name
        resp = requests.delete(f"{OLLAMA_BASE}/api/delete", json={"name": tag}, timeout=30)
        resp.raise_for_status()
        self._available.discard(tag)

    def remove_model_by_name(self, name: str) -> None:
        """Remove a model from the available cache without deleting from Ollama."""
        model = next((m for m in BUILT_IN_MODELS if m["name"] == name), None)
        if model:
            self._available.discard(model["ollamaTag"])

    def delete_all_models(self) -> None:
        """Delete all known models from Ollama."""
        for model in BUILT_IN_MODELS:
            tag = model["ollamaTag"]
            if self._is_available(tag):
                try:
                    requests.delete(f"{OLLAMA_BASE}/api/delete", json={"name": tag}, timeout=30)
                except Exception:
                    pass
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


def get_ollama_service() -> OllamaService:
    """Return the global OllamaService singleton."""
    global _service
    if _service is None:
        _service = OllamaService()
    return _service
