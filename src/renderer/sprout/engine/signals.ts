// © CoreConduit Consulting Services — MIT License

export type GardenAlert = {
  id: string;
  severity: "warn" | "error";
  text: string;
};

export type GardenState = {
  ts: number;
  health_score: number;
  moisture: number | null;
  temp_c: number | null;
  temp_comfort: number | null;
  humidity: number | null;
  light: number | null;
  water_level: number | null;
  pump_active: boolean;
  last_event: "watered" | "topped_up" | "light_on" | "light_off" | "none";
  alerts: GardenAlert[];
};

export type SproutSignal =
  | {
      type: "STATUS_CHANGE";
      status: "welcome" | "thinking" | "responding" | "idle";
    }
  | { type: "MESSAGE_SENT" }
  | { type: "MESSAGE_ERROR" }
  | { type: "ANIMATION_TOKEN"; key: string }
  | { type: "INPUT_START" }
  | { type: "INPUT_STOP" }
  | { type: "TTS_START"; durationMs: number }
  | { type: "TTS_STOP" }
  | { type: "GARDEN_STATE_UPDATE"; state: GardenState }
  | { type: "GARDEN_ALERT"; alert: GardenAlert }
  | { type: "GARDEN_ALERT_CLEARED"; id: string }
  | { type: "IDLE_TIMEOUT" }
  | { type: "VISIBILITY_CHANGE"; hidden: boolean };

type Handler<T extends SproutSignal["type"]> = (
  signal: Extract<SproutSignal, { type: T }>,
) => void;

type Handlers = {
  [T in SproutSignal["type"]]?: Set<Handler<T>>;
};

export class SignalBus {
  private handlers: Handlers = {};

  on<T extends SproutSignal["type"]>(type: T, handler: Handler<T>): () => void {
    if (!this.handlers[type]) {
      (this.handlers[type] as Set<Handler<T>>) = new Set();
    }
    (this.handlers[type] as Set<Handler<T>>).add(handler);
    return () => this.off(type, handler);
  }

  off<T extends SproutSignal["type"]>(type: T, handler: Handler<T>): void {
    (this.handlers[type] as Set<Handler<T>> | undefined)?.delete(handler);
  }

  emit<T extends SproutSignal>(signal: T): void {
    const set = this.handlers[signal.type as SproutSignal["type"]] as
      | Set<Handler<SproutSignal["type"]>>
      | undefined;
    if (set) {
      for (const h of set) {
        (h as (s: T) => void)(signal);
      }
    }
  }

  clear(): void {
    this.handlers = {};
  }
}

export const signalBus = new SignalBus();
