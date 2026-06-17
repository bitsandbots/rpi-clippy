import { ANIMATIONS, Animation } from "./clippy-animations";

export const ANIMATION_KEYS = Object.keys(ANIMATIONS);
export const ANIMATION_KEYS_BRACKETS = ANIMATION_KEYS.map((k) => `[${k}]`);
export const IDLE_ANIMATION_KEYS = ANIMATION_KEYS.filter((k) =>
  k.startsWith("Idle"),
);

export const EMPTY_ANIMATION: Animation = {
  src: `data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==`,
  length: 0,
};

/**
 * Get a random animation from the given keys'
 *
 * @param keys - The keys of the animations to choose from
 * @param current - The current animation
 * @param animations - The animation map to pick from (defaults to Clippy)
 * @returns A random animation from the given keys
 */
export function getRandomAnimation(
  keys: string[],
  current?: Animation,
  animations: Record<string, Animation> = ANIMATIONS,
) {
  const randomIndex = Math.floor(Math.random() * keys.length);
  const animation = animations[keys[randomIndex]];

  // If the random animation is the same as the current animation, get a new random animation
  if (current && animation === current) {
    return getRandomAnimation(keys, current, animations);
  }

  return animation;
}

/**
 * Get a random idle animation
 *
 * @param current - The current animation
 * @param animations - The animation map to pick from (defaults to Clippy)
 * @returns A random idle animation
 */
export function getRandomIdleAnimation(
  current?: Animation,
  animations: Record<string, Animation> = ANIMATIONS,
) {
  return getRandomAnimation(IDLE_ANIMATION_KEYS, current, animations);
}
