// © CoreConduit Consulting Services — MIT License (reactive rig)
// Original sprite-sheet driver: Felix Rieseberg / rpi-clippy contributors

import { useEffect, useRef, useCallback, useState } from "react";

import { useChat } from "../contexts/ChatContext";
import { useVoice } from "../contexts/VoiceContext";
import { log } from "../logging";
import { useDebugState } from "../contexts/DebugContext";
import { useSharedState } from "../contexts/SharedStateContext";
import { CHARACTERS, DEFAULT_CHARACTER } from "../character-animations";

// Reactive rig imports
import { SproutRig, type SproutRigHandle } from "../sprout/rig/SproutRig";
import { sproutBrain } from "../sprout/engine/brain";
import { signalBus } from "../sprout/engine/signals";

// Classic sprite imports
import { type Animation } from "../sprout-classic-animations";
import {
  EMPTY_ANIMATION,
  getRandomIdleAnimation,
} from "../sprout-classic-animation-helpers";

const WAIT_TIME = 6000;

// ---------------------------------------------------------------------------
// Classic sprite-sheet driver (used when character.reactive !== true)
// ---------------------------------------------------------------------------

function SproutClassic() {
  const { animationKey, status, setStatus } = useChat();
  const { enableDragDebug } = useDebugState();
  const { settings } = useSharedState();
  const character =
    CHARACTERS[settings.character || DEFAULT_CHARACTER] ||
    CHARACTERS[DEFAULT_CHARACTER];
  const animations = character.animations;
  const [animation, setAnimation] = useState<Animation>(EMPTY_ANIMATION);
  const animationTimeoutRef = useRef<number | undefined>(undefined);

  const playAnimation = useCallback(
    (key: string) => {
      if (animations[key]) {
        log(`Playing animation`, { key, character: character.id });
        if (animationTimeoutRef.current)
          window.clearTimeout(animationTimeoutRef.current);
        setAnimation(animations[key]);
        animationTimeoutRef.current = window.setTimeout(() => {
          animationTimeoutRef.current = undefined;
          setAnimation(animations.Default);
        }, animations[key].length + 200);
      } else {
        log(`Animation not found`, { key, character: character.id });
      }
    },
    [animations, character.id],
  );

  useEffect(() => {
    const playRandomIdleAnimation = () => {
      if (status !== "idle") return;
      const randomIdleAnimation = getRandomIdleAnimation(animation, animations);
      setAnimation(randomIdleAnimation);
      animationTimeoutRef.current = window.setTimeout(() => {
        setAnimation(animations.Default);
        animationTimeoutRef.current = window.setTimeout(
          playRandomIdleAnimation,
          WAIT_TIME,
        );
      }, randomIdleAnimation.length);
    };

    if (status === "welcome" && animation === EMPTY_ANIMATION) {
      setAnimation(animations.Show);
      setTimeout(() => setStatus("idle"), animations.Show.length + 200);
    } else if (status === "idle") {
      if (!animationTimeoutRef.current) playRandomIdleAnimation();
    }

    return () => {
      if (animationTimeoutRef.current) {
        window.clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = undefined;
      }
    };
  }, [status, animations]);

  useEffect(() => {
    if (animationTimeoutRef.current) {
      window.clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = undefined;
    }
    setAnimation(animations.Default);
  }, [character.id, animations]);

  useEffect(() => {
    log(`New animation key`, { animationKey, character: character.id });
    playAnimation(animationKey);
  }, [animationKey, playAnimation]);

  return (
    <div>
      <div
        className="app-drag"
        style={{
          position: "absolute",
          height: "420px",
          width: "372px",
          backgroundColor: enableDragDebug ? "blue" : "transparent",
          opacity: 0.5,
          zIndex: 5,
        }}
      >
        <div
          className="app-no-drag"
          style={{
            position: "absolute",
            height: "360px",
            width: "204px",
            backgroundColor: enableDragDebug ? "red" : "transparent",
            zIndex: 10,
            right: "180px",
            top: "9px",
          }}
        />
      </div>
      <img
        className="app-no-select"
        src={animation.src}
        draggable={false}
        alt={character.name}
        style={{ width: "372px" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reactive SVG rig driver (character.reactive === true)
// ---------------------------------------------------------------------------

function SproutReactive() {
  const { status, animationKey } = useChat();
  const { isSpeaking } = useVoice();
  const { enableDragDebug } = useDebugState();
  const rigRef = useRef<SproutRigHandle>(null);
  const ttsStartTimeRef = useRef<number>(0);
  const [debugVitality, setDebugVitality] = useState(0.8);
  const [debugEnergy, setDebugEnergy] = useState(0.5);

  // Bridge chat status → signal bus
  useEffect(() => {
    signalBus.emit({ type: "STATUS_CHANGE", status });
  }, [status]);

  // Bridge bracket-token animation keys → signal bus
  useEffect(() => {
    if (animationKey)
      signalBus.emit({ type: "ANIMATION_TOKEN", key: animationKey });
  }, [animationKey]);

  // Bridge TTS playback → signal bus
  useEffect(() => {
    if (isSpeaking) {
      ttsStartTimeRef.current = Date.now();
      // Cap at 60 s; TTS_STOP will interrupt early if playback ends sooner
      signalBus.emit({ type: "TTS_START", durationMs: 60_000 });
    } else {
      signalBus.emit({ type: "TTS_STOP" });
    }
  }, [isSpeaking]);

  // Bridge page visibility → signal bus
  useEffect(() => {
    const handler = () =>
      signalBus.emit({ type: "VISIBILITY_CHANGE", hidden: document.hidden });
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const [stateAnnouncement, setStateAnnouncement] = useState("");

  // Mount/unmount the brain; subscribe to state changes for aria-live
  useEffect(() => {
    if (!rigRef.current) return;
    sproutBrain.mount(rigRef.current.refs);
    const unsub = sproutBrain.onStateChange((_from, to) => {
      const label: Record<string, string> = {
        Idle: "Sprout is relaxing",
        Listening: "Sprout is listening",
        Thinking: "Sprout is thinking",
        Talking: "Sprout is speaking",
        Reacting: "Sprout is reacting",
        Sleeping: "Sprout is sleeping",
        Distressed: "Sprout needs attention",
        Sprouting: "Sprout is sprouting",
      };
      setStateAnnouncement(label[to] ?? "");
    });
    return () => {
      unsub();
      sproutBrain.unmount();
    };
  }, []);

  return (
    <div style={{ width: "372px", height: "279px", position: "relative" }}>
      <SproutRig ref={rigRef} style={{ width: "372px", height: "279px" }} />
      {/* Visually-hidden aria-live region for state changes */}
      <div
        role="status"
        aria-live="polite"
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
        {stateAnnouncement}
      </div>
      {enableDragDebug && (
        <div
          style={{
            position: "absolute",
            bottom: 4,
            left: 4,
            right: 4,
            background: "rgba(0,0,0,0.7)",
            padding: "4px 8px",
            borderRadius: 4,
            fontSize: 11,
            color: "#e8eaed",
            zIndex: 20,
          }}
        >
          <label
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              marginBottom: 2,
            }}
          >
            <span style={{ width: 52 }}>Vitality</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={debugVitality}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setDebugVitality(v);
                sproutBrain.setMoodDebug(v, debugEnergy);
              }}
              style={{ flex: 1 }}
            />
            <span style={{ width: 28, textAlign: "right" }}>
              {debugVitality.toFixed(2)}
            </span>
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ width: 52 }}>Energy</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={debugEnergy}
              onChange={(e) => {
                const e2 = parseFloat(e.target.value);
                setDebugEnergy(e2);
                sproutBrain.setMoodDebug(debugVitality, e2);
              }}
              style={{ flex: 1 }}
            />
            <span style={{ width: 28, textAlign: "right" }}>
              {debugEnergy.toFixed(2)}
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export — picks reactive vs classic based on character registry flag
// ---------------------------------------------------------------------------

export function Sprout() {
  const { settings } = useSharedState();
  const character =
    CHARACTERS[settings.character || DEFAULT_CHARACTER] ||
    CHARACTERS[DEFAULT_CHARACTER];

  if (character.reactive) {
    return <SproutReactive />;
  }
  return <SproutClassic />;
}
