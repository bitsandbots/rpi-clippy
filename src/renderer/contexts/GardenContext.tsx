// © CoreConduit Consulting Services — MIT License

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
} from "react";

import type { GardenState } from "../sprout/engine/signals";
import { signalBus } from "../sprout/engine/signals";
import {
  mapGardenState,
  alertToAriaText,
} from "../sprout/config/gardenMapping";
import { fetchGardenState } from "../api";

interface GardenContextValue {
  gardenState: GardenState | null;
  /** Plain-text description of the latest critical alert (for screen readers). */
  ariaAlertText: string;
  ariaAlertLevel: "polite" | "assertive";
}

const GardenContext = createContext<GardenContextValue>({
  gardenState: null,
  ariaAlertText: "",
  ariaAlertLevel: "polite",
});

export function useGarden(): GardenContextValue {
  return useContext(GardenContext);
}

const POLL_FALLBACK_MS = 60_000;

export function GardenProvider({ children }: { children: ReactNode }) {
  const [gardenState, setGardenState] = useState<GardenState | null>(null);
  const [ariaAlertText, setAriaAlertText] = useState("");
  const [ariaAlertLevel, setAriaAlertLevel] = useState<"polite" | "assertive">(
    "polite",
  );

  // Track acknowledged alert IDs so we only fire signals on new ones
  const seenAlertIds = useRef<Set<string>>(new Set());
  const prevVitalityRef = useRef<number>(0.8);

  function applyState(state: GardenState) {
    setGardenState(state);

    const mapping = mapGardenState(state, prevVitalityRef.current);
    prevVitalityRef.current = mapping.moodTarget.vitality;

    // Emit mood update
    signalBus.emit({ type: "GARDEN_STATE_UPDATE", state });

    // Fire derived reactions
    for (const { key } of mapping.reactions) {
      // Reactions are fired via the signal bus token path for loose coupling
      signalBus.emit({ type: "ANIMATION_TOKEN", key });
    }

    // Handle alerts
    const currentIds = new Set(state.alerts.map((a) => a.id));

    for (const alert of state.alerts) {
      if (!seenAlertIds.current.has(alert.id)) {
        seenAlertIds.current.add(alert.id);
        signalBus.emit({ type: "GARDEN_ALERT", alert });
        const { text, level } = alertToAriaText(alert);
        setAriaAlertText(text);
        setAriaAlertLevel(level);
      }
    }

    // Clear resolved alerts
    for (const id of seenAlertIds.current) {
      if (!currentIds.has(id)) {
        seenAlertIds.current.delete(id);
        signalBus.emit({ type: "GARDEN_ALERT_CLEARED", id });
      }
    }
  }

  useEffect(() => {
    let es: EventSource | null = null;
    let pollTimer: number | null = null;
    let closed = false;

    function startSSE() {
      if (closed) return;
      es = new EventSource("/api/garden/stream");

      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "GARDEN_STATE_UPDATE" && msg.state) {
            applyState(msg.state as GardenState);
          }
        } catch {
          // malformed SSE payload — ignore
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          // SSE failed; fall back to polling
          schedulePoll();
        }
      };
    }

    function schedulePoll() {
      if (closed) return;
      pollTimer = window.setTimeout(async () => {
        try {
          const state = await fetchGardenState();
          if (state) applyState(state);
        } catch {
          // network unavailable — stay silent, retry next poll
        }
        // After a poll succeeds try to re-establish SSE
        startSSE();
      }, POLL_FALLBACK_MS);
    }

    startSSE();

    return () => {
      closed = true;
      es?.close();
      if (pollTimer !== null) window.clearTimeout(pollTimer);
    };
  }, []);

  return (
    <GardenContext.Provider
      value={{ gardenState, ariaAlertText, ariaAlertLevel }}
    >
      {children}
      {/* aria-live region: critical garden alerts are announced to screen readers.
          Per the invariant: a critical alert is never face-only. */}
      <div
        role="status"
        aria-live={ariaAlertLevel}
        aria-atomic="true"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {ariaAlertText}
      </div>
    </GardenContext.Provider>
  );
}
