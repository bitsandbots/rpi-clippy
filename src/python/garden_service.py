"""
GardenService — thin HTTP adapter from the hydroMazing local API to the
normalized GardenState contract defined in:
  docs/superpowers/specs/sprout-reactive-character.md §5

Usage:
  from garden_service import get_garden_service
  svc = get_garden_service()
  state = svc.get_state()          # latest cached GardenState dict
  q = svc.subscribe_events()       # receive SSE event dicts
  svc.unsubscribe_events(q)

Configuration (environment variables):
  HYDROMAZING_URL   Base URL of the hydroMazing HTTP API
                    (default: http://localhost:8080)
  GARDEN_POLL_SEC   Poll interval in seconds (default: 30)

⚠️  Field mapping (HYDRO_FIELD_MAP below) must be verified against the
    actual hydroMazing API response when it is first inspected.
"""

from __future__ import annotations

import logging
import os
import queue
import threading
import time
from typing import Any

import requests

log = logging.getLogger(__name__)

HYDROMAZING_URL = os.environ.get("HYDROMAZING_URL", "http://localhost:8080").rstrip("/")
GARDEN_POLL_SEC = float(os.environ.get("GARDEN_POLL_SEC", "30"))

# ---------------------------------------------------------------------------
# Field mapping — adjust keys to match the actual hydroMazing response.
# Values are (source_key, normalise_fn) pairs.  normalise_fn receives the raw
# value and returns a float in [0, 1] or None if the value is absent/invalid.
# ---------------------------------------------------------------------------

def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _moisture_norm(raw: Any) -> float | None:
    """Assumed: raw is a float 0..100 (% volumetric water content)."""
    if raw is None:
        return None
    return _clamp(float(raw) / 100.0)


def _temp_comfort(raw: Any) -> float | None:
    """Distance from ideal band 22–26 °C → 0..1 (1 = ideal)."""
    if raw is None:
        return None
    t = float(raw)
    if 22 <= t <= 26:
        return 1.0
    return _clamp(1.0 - abs(t - 24) / 12)


def _fraction(raw: Any) -> float | None:
    """Raw already 0..1."""
    if raw is None:
        return None
    return _clamp(float(raw))


def _percent(raw: Any) -> float | None:
    """Raw is 0..100 → normalise to 0..1."""
    if raw is None:
        return None
    return _clamp(float(raw) / 100.0)


# ⚠️  Verify these key names against the actual hydroMazing API response.
HYDRO_FIELD_MAP: dict[str, tuple[str, Any]] = {
    "health_score":  ("health_score",  _fraction),
    "moisture":      ("moisture",      _moisture_norm),
    "temp_c":        ("temperature",   lambda v: float(v) if v is not None else None),
    "temp_comfort":  ("temperature",   _temp_comfort),
    "humidity":      ("humidity",      _percent),
    "light":         ("light_level",   _fraction),
    "water_level":   ("reservoir",     _fraction),
}

LAST_EVENT_VALUES = {"watered", "topped_up", "light_on", "light_off", "none"}


class GardenService:
    """Polls the hydroMazing HTTP API and fans out normalized GardenState events."""

    def __init__(self, base_url: str = HYDROMAZING_URL, poll_sec: float = GARDEN_POLL_SEC) -> None:
        self._base_url = base_url
        self._poll_sec = poll_sec
        self._lock = threading.Lock()
        self._state: dict[str, Any] | None = None
        self._subscribers: list[queue.Queue] = []
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_state(self) -> dict[str, Any] | None:
        """Return the last successfully fetched GardenState, or None."""
        with self._lock:
            return dict(self._state) if self._state else None

    def force_refresh(self) -> dict[str, Any] | None:
        """Fetch immediately, update cache, push to subscribers."""
        raw = self._fetch_raw()
        if raw is not None:
            state = self._normalize(raw)
            self._update(state)
            return state
        return None

    def subscribe_events(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=64)
        with self._lock:
            self._subscribers.append(q)
        return q

    def unsubscribe_events(self, q: queue.Queue) -> None:
        with self._lock:
            try:
                self._subscribers.remove(q)
            except ValueError:
                pass

    def shutdown(self) -> None:
        self._stop.set()

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _poll_loop(self) -> None:
        while not self._stop.is_set():
            try:
                raw = self._fetch_raw()
                if raw is not None:
                    state = self._normalize(raw)
                    self._update(state)
            except Exception:
                log.exception("GardenService poll error")
            self._stop.wait(self._poll_sec)

    def _fetch_raw(self) -> dict[str, Any] | None:
        try:
            resp = requests.get(f"{self._base_url}/api/status", timeout=5)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            log.debug("hydroMazing fetch failed: %s", exc)
            return None

    def _normalize(self, raw: dict[str, Any]) -> dict[str, Any]:
        """Map raw hydroMazing response → GardenState contract."""
        state: dict[str, Any] = {"ts": int(time.time())}

        for dest_key, (src_key, fn) in HYDRO_FIELD_MAP.items():
            raw_val = raw.get(src_key)
            try:
                state[dest_key] = fn(raw_val)
            except Exception:
                state[dest_key] = None

        # health_score: derive from moisture + temp_comfort + reservoir if absent
        if state.get("health_score") is None:
            components = [
                v for k, v in state.items()
                if k in ("moisture", "temp_comfort", "water_level") and v is not None
            ]
            state["health_score"] = _clamp(sum(components) / len(components)) if components else None

        state["pump_active"] = bool(raw.get("pump_active", False))

        last = raw.get("last_event", "none")
        state["last_event"] = last if last in LAST_EVENT_VALUES else "none"

        raw_alerts = raw.get("alerts", [])
        alerts = []
        for a in raw_alerts if isinstance(raw_alerts, list) else []:
            if isinstance(a, dict) and "id" in a and "severity" in a and "text" in a:
                alerts.append({
                    "id": str(a["id"]),
                    "severity": str(a["severity"]),
                    "text": str(a["text"]),
                })
        state["alerts"] = alerts

        return state

    def _update(self, state: dict[str, Any]) -> None:
        with self._lock:
            self._state = state
            subs = list(self._subscribers)
        event = {"type": "GARDEN_STATE_UPDATE", "state": state}
        for q in subs:
            try:
                q.put_nowait(event)
            except queue.Full:
                pass


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_garden: GardenService | None = None
_garden_lock = threading.Lock()


def get_garden_service() -> GardenService:
    """Return the global GardenService singleton (double-checked locking)."""
    global _garden
    if _garden is None:
        with _garden_lock:
            if _garden is None:
                _garden = GardenService()
    return _garden
