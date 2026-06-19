// © CoreConduit Consulting Services — MIT License
//
// Animation-token vocabulary shared between the chat layer and the reactive
// rig. These are the bracket tokens (e.g. "[Greeting]") the LLM is told it may
// emit in its replies; ChatContext injects them into the system prompt and
// Chat.tsx parses them back out to drive the character. The canonical source is
// the reactive rig's token→reaction map, so the model is only ever advertised
// tokens the rig actually reacts to.

import { BRACKET_TOKEN_REACTIONS } from "./sprout/config/reactions";

export const ANIMATION_KEYS: string[] = Object.keys(BRACKET_TOKEN_REACTIONS);
export const ANIMATION_KEYS_BRACKETS: string[] = ANIMATION_KEYS.map(
  (k) => `[${k}]`,
);
