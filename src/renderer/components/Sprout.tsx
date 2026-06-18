import { useEffect, useState, useRef, useCallback } from "react";

import { Animation } from "../sprout-animations";
import {
  EMPTY_ANIMATION,
  getRandomIdleAnimation,
} from "../sprout-animation-helpers";
import { useChat } from "../contexts/ChatContext";
import { log } from "../logging";
import { useDebugState } from "../contexts/DebugContext";
import { useSharedState } from "../contexts/SharedStateContext";
import { CHARACTERS, DEFAULT_CHARACTER } from "../character-animations";

const WAIT_TIME = 6000;

export function Sprout() {
  const {
    animationKey,
    status,
    setStatus,
    setIsChatWindowOpen,
    isChatWindowOpen,
  } = useChat();
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

        if (animationTimeoutRef.current) {
          window.clearTimeout(animationTimeoutRef.current);
        }

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

  const toggleChat = useCallback(() => {
    setIsChatWindowOpen(!isChatWindowOpen);
  }, [isChatWindowOpen, setIsChatWindowOpen]);

  useEffect(() => {
    const playRandomIdleAnimation = () => {
      if (status !== "idle") return;

      const randomIdleAnimation = getRandomIdleAnimation(animation, animations);
      setAnimation(randomIdleAnimation);

      // Reset back to default after the animation finishes, then schedule next
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
      setTimeout(() => {
        setStatus("idle");
      }, animations.Show.length + 200);
    } else if (status === "idle") {
      if (!animationTimeoutRef.current) {
        playRandomIdleAnimation();
      }
    }

    // Clear any pending timers when status or character changes
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
          height: "140px",
          width: "186px",
          backgroundColor: enableDragDebug ? "blue" : "transparent",
          opacity: 0.5,
          zIndex: 5,
        }}
      >
        <div
          className="app-no-drag"
          style={{
            position: "absolute",
            height: "120px",
            width: "68px",
            backgroundColor: enableDragDebug ? "red" : "transparent",
            zIndex: 10,
            right: "60px",
            top: "3px",
            cursor: "help",
          }}
          onClick={toggleChat}
        ></div>
      </div>
      <img
        className="app-no-select"
        src={animation.src}
        draggable={false}
        alt={character.name}
        style={{ width: "186px" }}
      />
    </div>
  );
}
