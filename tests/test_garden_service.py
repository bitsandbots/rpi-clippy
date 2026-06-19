"""
GardenService unit tests.

All tests patch `requests.get` so no real hydroMazing server is needed.
The GardenService singleton is reset between tests via the autouse
isolate_config fixture in conftest.py, which also redirects XDG_CONFIG_HOME.
"""

from __future__ import annotations

import queue
import threading
import time
from unittest.mock import MagicMock, patch

import pytest

# conftest.py injects src/python into sys.path
import garden_service as _gsvc
from garden_service import GardenService, _clamp


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_response(json_body: dict) -> MagicMock:
    """Build a mock requests.Response with `.json()` returning json_body."""
    r = MagicMock()
    r.raise_for_status = MagicMock()
    r.json.return_value = json_body
    return r


@pytest.fixture(autouse=True)
def reset_garden_singleton(monkeypatch):
    """Reset the GardenService singleton before each test."""
    monkeypatch.setattr(_gsvc, "_garden", None)


@pytest.fixture
def stopped_service():
    """Return a GardenService whose background thread is patched to a no-op."""
    with patch.object(GardenService, "_poll_loop", lambda self: None):
        svc = GardenService(base_url="http://fake", poll_sec=9999)
    return svc


# ---------------------------------------------------------------------------
# Normalisation tests
# ---------------------------------------------------------------------------

class TestNormalise:
    def test_fraction_clamped_above_1(self, stopped_service):
        raw = {"health_score": 1.5, "pump_active": False, "alerts": []}
        state = stopped_service._normalize(raw)
        assert state["health_score"] == 1.0

    def test_fraction_clamped_below_0(self, stopped_service):
        raw = {"health_score": -0.5, "pump_active": False, "alerts": []}
        state = stopped_service._normalize(raw)
        assert state["health_score"] == 0.0

    def test_moisture_normalised_from_percent(self, stopped_service):
        """Raw moisture 50 → 0.50 after /100."""
        raw = {"moisture": 50.0, "pump_active": False, "alerts": []}
        state = stopped_service._normalize(raw)
        assert abs(state["moisture"] - 0.5) < 1e-6

    def test_moisture_clamped_above_100(self, stopped_service):
        raw = {"moisture": 150.0, "pump_active": False, "alerts": []}
        state = stopped_service._normalize(raw)
        assert state["moisture"] == 1.0

    def test_temp_comfort_ideal_band(self, stopped_service):
        """Temperatures 22–26 °C map to comfort 1.0."""
        raw = {"temperature": 24.0, "pump_active": False, "alerts": []}
        state = stopped_service._normalize(raw)
        assert state["temp_comfort"] == 1.0

    def test_temp_comfort_outside_band(self, stopped_service):
        raw = {"temperature": 0.0, "pump_active": False, "alerts": []}
        state = stopped_service._normalize(raw)
        assert 0.0 <= state["temp_comfort"] < 1.0

    def test_absent_field_yields_none(self, stopped_service):
        raw = {"pump_active": False, "alerts": []}
        state = stopped_service._normalize(raw)
        assert state["moisture"] is None
        assert state["light"] is None

    def test_health_score_derived_when_absent(self, stopped_service):
        """If health_score absent, derive from moisture + temp_comfort + reservoir."""
        raw = {
            "moisture": 80.0,   # → 0.80
            "temperature": 24.0,  # temp_comfort → 1.0
            "reservoir": 0.9,
            "pump_active": False,
            "alerts": [],
        }
        state = stopped_service._normalize(raw)
        assert state["health_score"] is not None
        assert 0.0 <= state["health_score"] <= 1.0

    def test_pump_active_true(self, stopped_service):
        raw = {"pump_active": True, "alerts": []}
        state = stopped_service._normalize(raw)
        assert state["pump_active"] is True

    def test_unknown_last_event_defaults_to_none_string(self, stopped_service):
        raw = {"last_event": "exploded", "pump_active": False, "alerts": []}
        state = stopped_service._normalize(raw)
        assert state["last_event"] == "none"

    def test_known_last_event_preserved(self, stopped_service):
        raw = {"last_event": "watered", "pump_active": False, "alerts": []}
        state = stopped_service._normalize(raw)
        assert state["last_event"] == "watered"

    def test_alert_list_parsed(self, stopped_service):
        raw = {
            "pump_active": False,
            "alerts": [
                {"id": "a1", "severity": "warning", "text": "low moisture"},
            ],
        }
        state = stopped_service._normalize(raw)
        assert len(state["alerts"]) == 1
        assert state["alerts"][0]["id"] == "a1"
        assert state["alerts"][0]["severity"] == "warning"

    def test_malformed_alert_ignored(self, stopped_service):
        raw = {
            "pump_active": False,
            "alerts": [
                {"id": "a1"},  # missing severity + text
                "not-a-dict",
            ],
        }
        state = stopped_service._normalize(raw)
        assert state["alerts"] == []

    def test_ts_is_integer(self, stopped_service):
        raw = {"pump_active": False, "alerts": []}
        state = stopped_service._normalize(raw)
        assert isinstance(state["ts"], int)


# ---------------------------------------------------------------------------
# Subscriber fan-out tests
# ---------------------------------------------------------------------------

class TestSubscriberFanOut:
    def test_subscribe_returns_queue(self, stopped_service):
        q = stopped_service.subscribe_events()
        assert isinstance(q, queue.Queue)

    def test_unsubscribe_removes_queue(self, stopped_service):
        q = stopped_service.subscribe_events()
        stopped_service.unsubscribe_events(q)
        assert q not in stopped_service._subscribers

    def test_unsubscribe_idempotent(self, stopped_service):
        q = stopped_service.subscribe_events()
        stopped_service.unsubscribe_events(q)
        stopped_service.unsubscribe_events(q)  # second call must not raise

    def test_update_pushes_to_all_subscribers(self, stopped_service):
        q1 = stopped_service.subscribe_events()
        q2 = stopped_service.subscribe_events()
        state = {"ts": 0, "health_score": 0.9, "alerts": [], "pump_active": False}
        stopped_service._update(state)
        ev1 = q1.get_nowait()
        ev2 = q2.get_nowait()
        assert ev1["type"] == "GARDEN_STATE_UPDATE"
        assert ev2["state"]["health_score"] == 0.9

    def test_full_queue_drops_silently(self, stopped_service):
        q = queue.Queue(maxsize=1)
        stopped_service._subscribers.append(q)
        # Fill it first
        stopped_service._update({"ts": 0, "alerts": [], "pump_active": False})
        # Second update should not raise even though queue is full
        stopped_service._update({"ts": 1, "alerts": [], "pump_active": False})


# ---------------------------------------------------------------------------
# HTTP fetch + force_refresh tests
# ---------------------------------------------------------------------------

class TestFetch:
    def test_fetch_raw_calls_correct_endpoint(self, stopped_service):
        mock_resp = make_response({"pump_active": False, "alerts": []})
        with patch("requests.get", return_value=mock_resp) as mock_get:
            raw = stopped_service._fetch_raw()
        mock_get.assert_called_once_with("http://fake/api/status", timeout=5)
        assert raw is not None

    def test_fetch_raw_returns_none_on_error(self, stopped_service):
        with patch("requests.get", side_effect=ConnectionRefusedError):
            raw = stopped_service._fetch_raw()
        assert raw is None

    def test_force_refresh_updates_cached_state(self, stopped_service):
        raw = {"health_score": 0.75, "pump_active": False, "alerts": []}
        mock_resp = make_response(raw)
        with patch("requests.get", return_value=mock_resp):
            state = stopped_service.force_refresh()
        assert state is not None
        assert abs(state["health_score"] - 0.75) < 1e-6
        cached = stopped_service.get_state()
        assert cached is not None

    def test_force_refresh_returns_none_when_unreachable(self, stopped_service):
        with patch("requests.get", side_effect=ConnectionRefusedError):
            state = stopped_service.force_refresh()
        assert state is None


# ---------------------------------------------------------------------------
# Sensor → expected mood mapping (integration with garden_service normalise)
# ---------------------------------------------------------------------------

class TestSensorToMoodMapping:
    """Verify that specific mock-sensor payloads produce expected GardenState values
    that GardenContext / gardenMapping.ts would interpret correctly."""

    def test_low_moisture_sensor(self, stopped_service):
        """Moisture 10% → 0.10 (below MOISTURE_CRITICAL=0.15 threshold)."""
        raw = {"moisture": 10.0, "pump_active": False, "alerts": []}
        state = stopped_service._normalize(raw)
        assert state["moisture"] < 0.15

    def test_empty_reservoir(self, stopped_service):
        """Reservoir 0.05 stays as 0.05 (below RESERVOIR_EMPTY=0.10)."""
        raw = {"reservoir": 0.05, "pump_active": False, "alerts": []}
        state = stopped_service._normalize(raw)
        assert state["water_level"] < 0.10

    def test_night_light_level(self, stopped_service):
        """Light 0.05 → 0.05, below LIGHT_NIGHT=0.15 → low energy."""
        raw = {"light_level": 0.05, "pump_active": False, "alerts": []}
        state = stopped_service._normalize(raw)
        assert state["light"] < 0.15

    def test_healthy_plant(self, stopped_service):
        """Full health_score, good moisture, ideal temp → all metrics high."""
        raw = {
            "health_score": 0.95,
            "moisture": 70.0,
            "temperature": 23.0,
            "humidity": 60.0,
            "light_level": 0.8,
            "reservoir": 0.9,
            "pump_active": False,
            "alerts": [],
        }
        state = stopped_service._normalize(raw)
        assert state["health_score"] >= 0.9
        assert state["moisture"] >= 0.6
        assert state["light"] >= 0.7
