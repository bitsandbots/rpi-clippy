import { SPROUT_ANIMATIONS, Animation } from "./sprout-classic-animations";
import { CharacterId } from "../sharedState";

export interface Character {
  id: CharacterId;
  name: string;
  /** Reactive rig has no sprite map; sprite characters populate this. */
  animations: Record<string, Animation>;
  /** True for the reactive SVG rig; false for sprite-sheet characters. */
  reactive?: boolean;
}

export const CHARACTERS: Record<CharacterId, Character> = {
  sprout: {
    id: "sprout",
    name: "Sprout",
    animations: {},
    reactive: true,
  },
  "sprout-classic": {
    id: "sprout-classic",
    name: "Sprout (Classic)",
    animations: SPROUT_ANIMATIONS,
    reactive: false,
  },
};

export const DEFAULT_CHARACTER: CharacterId = "sprout";
