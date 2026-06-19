// © CoreConduit Consulting Services — MIT License

import { StateMachine, type SproutState } from "./stateMachine";
import { BlendSpace2D, type ExpressionParams } from "./blendSpace";
import { OneShotLayer } from "./oneShot";
import { AnimationLoop } from "./loop";
import { signalBus } from "./signals";
import { MOOD_POINTS } from "../config/moods";
import { REACTIONS, BRACKET_TOKEN_REACTIONS } from "../config/reactions";
import type { RigRefs } from "../rig/SproutRig";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const MOOD_TAU_MS = 30_000;

// Blink cadence: random 3–7 s between blinks
const BLINK_MIN_MS = 3_000;
const BLINK_RANGE_MS = 4_000;

// Saccade cadence: random 2–8 s between micro-movements (±3 px x, ±2 px y)
const SACCADE_MIN_MS = 2_000;
const SACCADE_RANGE_MS = 6_000;
const SACCADE_X_RANGE = 6;
const SACCADE_Y_RANGE = 3;

// Talking mouth: sinusoidal period in ms
const TALK_PERIOD_MS = 200;

// Leaf-tip wave: fast waggle while a "wave" overlay is active
const WAVE_PERIOD_MS = 260;
const WAVE_AMPLITUDE_DEG = 14;

// Arms rest ~35° above horizontal. Droop is amplified so even mild droop swings
// the arms toward hanging-down, clamped so heavy droop can't over-rotate them
// behind the stem. Gain 3.2 + 88° cap → ~-53° below horizontal at full wilt.
const ARM_DROOP_GAIN = 3.2;
const ARM_DROOP_MAX_DEG = 88;

export class SproutBrain {
  private sm = new StateMachine("Idle");
  private blendSpace = new BlendSpace2D(MOOD_POINTS);
  private oneShot = new OneShotLayer();
  private loop = new AnimationLoop((dt) => this.tick(dt));

  // Mood (smoothed toward target)
  private vitality = 0.8;
  private energy = 0.5;
  private targetVitality = 0.8;
  private targetEnergy = 0.5;

  // Idle sway
  private swayPhase = 0;

  // Periodic blink
  private blinkTimer = 0;
  private blinkInterval = BLINK_MIN_MS + Math.random() * BLINK_RANGE_MS;

  // Eye saccade
  private saccadeX = 0;
  private saccadeY = 0;
  private saccadeTargetX = 0;
  private saccadeTargetY = 0;
  private saccadeTimer = 0;
  private saccadeInterval = SACCADE_MIN_MS + Math.random() * SACCADE_RANGE_MS;

  // Talking mouth oscillation
  private talkPhase = 0;

  // Leaf-tip wave oscillation
  private wavePhase = 0;

  // Idle timeout
  private lastInputMs = 0;
  private idleTimeoutFired = false;

  // Last-written saturate value — skip DOM write when change < threshold
  private lastSaturate = -1;

  private refs: RigRefs | null = null;
  private unsubscribers: Array<() => void> = [];

  mount(refs: RigRefs): void {
    this.refs = refs;
    this.attachSignals();
    this.loop.start();
    this.sm.travel("Idle");
  }

  unmount(): void {
    this.loop.stop();
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.oneShot.clearAll();
    this.refs = null;
  }

  private attachSignals(): void {
    this.unsubscribers = [
      signalBus.on("STATUS_CHANGE", ({ status }) => {
        if (status === "thinking") this.sm.travel("Thinking");
        else if (status === "responding") this.sm.travel("Talking");
        else if (status === "idle" || status === "welcome") {
          if (this.sm.state !== "Sleeping" && this.sm.state !== "Distressed") {
            this.sm.travel("Idle");
          }
        }
      }),
      signalBus.on("MESSAGE_SENT", () => {
        this.touchInput();
        this.oneShot.fire(REACTIONS.nod);
      }),
      signalBus.on("MESSAGE_ERROR", () => {
        this.oneShot.fire(REACTIONS.concern);
      }),
      signalBus.on("INPUT_START", () => {
        this.touchInput();
        this.sm.travel("Listening");
        this.oneShot.fire(REACTIONS.perk);
      }),
      signalBus.on("INPUT_STOP", () => {
        this.touchInput();
        if (this.sm.state === "Listening") this.sm.travel("Idle");
      }),
      signalBus.on("TTS_START", ({ durationMs }) => {
        this.talkPhase = 0;
        this.oneShot.fire({ ...REACTIONS.talk, durationMs });
      }),
      signalBus.on("TTS_STOP", () => {
        this.talkPhase = 0;
        // Only clear the talk overlay, not any concurrent reactions
        this.oneShot.fire({ ...REACTIONS.talk, durationMs: 1 });
        if (this.sm.state === "Talking") this.sm.travel("Idle");
      }),
      signalBus.on("ANIMATION_TOKEN", ({ key }) => {
        const reactionKey = BRACKET_TOKEN_REACTIONS[key];
        if (reactionKey && REACTIONS[reactionKey]) {
          this.oneShot.fire(REACTIONS[reactionKey]);
          // A greeting/goodbye also waves the leaves hello.
          if (reactionKey === "greet") this.oneShot.fire(REACTIONS.wave);
        }
      }),
      signalBus.on("GARDEN_STATE_UPDATE", ({ state }) => {
        const newVitality = state.health_score ?? this.targetVitality;
        const newEnergy = state.light ?? this.targetEnergy;
        this.setMoodTarget(newVitality, newEnergy);
        if (state.pump_active && this.vitality < 0.5) {
          this.oneShot.fire(REACTIONS.sip);
        }
      }),
      signalBus.on("GARDEN_ALERT", ({ alert }) => {
        if (alert.severity === "error") this.sm.travel("Distressed");
        else this.oneShot.fire(REACTIONS.concern);
      }),
      signalBus.on("GARDEN_ALERT_CLEARED", () => {
        if (this.sm.state === "Distressed") this.sm.travel("Idle");
      }),
      signalBus.on("IDLE_TIMEOUT", () => {
        if (this.sm.state === "Idle") {
          this.sm.travel("Sleeping");
          this.oneShot.fire(REACTIONS.yawn);
        }
      }),
      signalBus.on("VISIBILITY_CHANGE", ({ hidden }) => {
        if (hidden) this.loop.stop();
        else this.loop.start();
      }),
    ];
  }

  private touchInput(): void {
    this.lastInputMs = 0;
    this.idleTimeoutFired = false;
    if (this.sm.state === "Sleeping") this.sm.travel("Idle");
  }

  private setMoodTarget(vitality: number, energy: number): void {
    this.targetVitality = Math.max(0, Math.min(1, vitality));
    this.targetEnergy = Math.max(0, Math.min(1, energy));
  }

  private tick(deltaMs: number): void {
    // Idle timeout
    this.lastInputMs += deltaMs;
    if (!this.idleTimeoutFired && this.lastInputMs >= IDLE_TIMEOUT_MS) {
      this.idleTimeoutFired = true;
      signalBus.emit({ type: "IDLE_TIMEOUT" });
    }

    // Smooth mood toward target
    const moodAlpha = 1 - Math.exp(-deltaMs / MOOD_TAU_MS);
    this.vitality += (this.targetVitality - this.vitality) * moodAlpha;
    this.energy += (this.targetEnergy - this.energy) * moodAlpha;

    const reducedMotion = this.loop.isReducedMotion;

    // Periodic blink — suppressed under reduced-motion and while sleeping
    if (!reducedMotion && this.sm.state !== "Sleeping") {
      this.blinkTimer += deltaMs;
      if (this.blinkTimer >= this.blinkInterval) {
        this.blinkTimer = 0;
        this.blinkInterval = BLINK_MIN_MS + Math.random() * BLINK_RANGE_MS;
        this.oneShot.fire(REACTIONS.blink);
      }
    }

    // Eye saccade — suppressed under reduced-motion and when deeply focused
    if (
      !reducedMotion &&
      this.sm.state !== "Sleeping" &&
      this.sm.state !== "Distressed"
    ) {
      this.saccadeTimer += deltaMs;
      if (this.saccadeTimer >= this.saccadeInterval) {
        this.saccadeTimer = 0;
        this.saccadeInterval =
          SACCADE_MIN_MS + Math.random() * SACCADE_RANGE_MS;
        this.saccadeTargetX = (Math.random() - 0.5) * SACCADE_X_RANGE;
        this.saccadeTargetY = (Math.random() - 0.5) * SACCADE_Y_RANGE;
      }
      const saccadeAlpha = 1 - Math.exp(-deltaMs / 80);
      this.saccadeX += (this.saccadeTargetX - this.saccadeX) * saccadeAlpha;
      this.saccadeY += (this.saccadeTargetY - this.saccadeY) * saccadeAlpha;
    }

    // Talking mouth phase — suppressed under reduced-motion
    if (!reducedMotion && this.sm.state === "Talking") {
      this.talkPhase += deltaMs;
    } else {
      this.talkPhase = 0;
    }

    // Leaf-tip wave phase — runs while a "wave" overlay is active. Under
    // reduced-motion the tips still ease up (one-shot target) but don't waggle.
    if (!reducedMotion && this.oneShot.isActive("wave")) {
      this.wavePhase += deltaMs;
    } else {
      this.wavePhase = 0;
    }

    // Advance overlays then write rig (state expression always written)
    this.oneShot.advance(deltaMs);

    const base = this.blendSpace.sample(this.vitality, this.energy);
    const expr = this.oneShot.compose(base);

    if (!reducedMotion) this.swayPhase += deltaMs;
    this.writeRig(expr);
  }

  private writeRig(expr: ExpressionParams): void {
    if (!this.refs) return;

    const {
      root,
      body,
      leafL,
      leafR,
      leafBladeL,
      leafBladeR,
      eyeL,
      eyeR,
      lidL,
      lidR,
      browL,
      browR,
      mouth,
    } = this.refs;

    // Color saturation — only write when value shifts enough to avoid
    // forcing GPU recomposition every frame on slow hardware (Pi 5).
    if (root && Math.abs(expr.colorSaturation - this.lastSaturate) > 0.005) {
      this.lastSaturate = expr.colorSaturation;
      root.style.filter = `saturate(${expr.colorSaturation.toFixed(3)})`;
    }

    const swayAngle =
      Math.sin((this.swayPhase / expr.swayPeriod) * Math.PI * 2) *
      expr.swayAmplitude;

    // Whole body: lean + sway rotated about the pot base. This carries the
    // stem, arms, and head together so the head can never detach from the stem.
    if (body) {
      body.setAttribute(
        "transform",
        `rotate(${(expr.stemLean + swayAngle).toFixed(2)}, 100, 250)`,
      );
    }

    // Arms: rest angle is baked into the rig geometry, so the brain only adds
    // droop (lowers the raised arms) and a gentle counter-sway lag. Signs are
    // mirrored per side. Negative left / positive right lowers each arm.
    const armDroop = Math.min(
      expr.leafDroop * ARM_DROOP_GAIN,
      ARM_DROOP_MAX_DEG,
    );
    if (leafL) {
      leafL.setAttribute(
        "transform",
        `rotate(${(-armDroop - swayAngle * 0.5).toFixed(2)}, 92, 126)`,
      );
    }
    if (leafR) {
      leafR.setAttribute(
        "transform",
        `rotate(${(armDroop + swayAngle * 0.5).toFixed(2)}, 108, 126)`,
      );
    }

    // Leaf-blade tip curl at the wrist joint. Mirrored per side so positive
    // values droop both tips; the wave overlay drives a fast symmetric waggle.
    const waveOsc =
      this.wavePhase > 0
        ? Math.sin((this.wavePhase / WAVE_PERIOD_MS) * Math.PI * 2) *
          WAVE_AMPLITUDE_DEG
        : 0;
    const tipCurl = expr.leafTipCurl + waveOsc;
    if (leafBladeL) {
      leafBladeL.setAttribute(
        "transform",
        `rotate(${(-tipCurl).toFixed(2)}, 66, 108)`,
      );
    }
    if (leafBladeR) {
      leafBladeR.setAttribute(
        "transform",
        `rotate(${tipCurl.toFixed(2)}, 134, 108)`,
      );
    }

    // Eyes: scaleY (openness) + saccade translate
    const eyeScaleY = expr.eyeOpenness.toFixed(3);
    const sx = this.saccadeX.toFixed(2);
    const sy = this.saccadeY.toFixed(2);

    if (eyeL) {
      eyeL.setAttribute(
        "style",
        `transform-origin: 88px 88px; transform: translate(${sx}px, ${sy}px) scaleY(${eyeScaleY})`,
      );
    }
    if (eyeR) {
      eyeR.setAttribute(
        "style",
        `transform-origin: 112px 88px; transform: translate(${sx}px, ${sy}px) scaleY(${eyeScaleY})`,
      );
    }

    // Lids: follow saccade + droop downward as openness decreases
    if (lidL) {
      lidL.setAttribute(
        "style",
        `transform: translate(${sx}px, ${(this.saccadeY + (1 - expr.eyeOpenness) * 5).toFixed(2)}px)`,
      );
    }
    if (lidR) {
      lidR.setAttribute(
        "style",
        `transform: translate(${sx}px, ${(this.saccadeY + (1 - expr.eyeOpenness) * 5).toFixed(2)}px)`,
      );
    }

    // Brows
    const browY = expr.browOffsetY.toFixed(2);
    if (browL) browL.setAttribute("transform", `translate(0, ${browY})`);
    if (browR) browR.setAttribute("transform", `translate(0, ${browY})`);

    // Mouth: sinusoidal oscillation while talking, blend curve otherwise
    if (mouth) {
      let cpY: number;
      if (this.sm.state === "Talking") {
        // Fast oscillation (open/close with speech rhythm)
        const talkCurve = Math.sin(
          (this.talkPhase / TALK_PERIOD_MS) * Math.PI * 2,
        );
        cpY = 104 + talkCurve * 8 + 2; // bias slightly open
      } else {
        cpY = 104 + expr.mouthCurve * 10;
      }
      mouth.setAttribute("d", `M88,104 Q100,${cpY.toFixed(1)} 112,104`);
    }
  }

  // ---------------------------------------------------------------------------
  // Debug / test API
  // ---------------------------------------------------------------------------

  get state() {
    return this.sm.state;
  }

  /** Subscribe to state machine transitions. Returns an unsubscribe function. */
  onStateChange(cb: (from: SproutState, to: SproutState) => void): () => void {
    return this.sm.onStateChange(cb);
  }

  get currentVitality() {
    return this.vitality;
  }

  get currentEnergy() {
    return this.energy;
  }

  /**
   * Bypass mood smoothing and jump directly to (vitality, energy).
   * Only call this from debug controls or tests — production uses setMoodTarget
   * via garden signals so transitions are always eased.
   */
  setMoodDebug(vitality: number, energy: number): void {
    this.vitality = Math.max(0, Math.min(1, vitality));
    this.energy = Math.max(0, Math.min(1, energy));
    this.targetVitality = this.vitality;
    this.targetEnergy = this.energy;
  }

  tickOnce(deltaMs: number): void {
    this.tick(deltaMs);
  }
}

export const sproutBrain = new SproutBrain();
