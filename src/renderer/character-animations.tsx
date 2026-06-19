import { CharacterId } from "../sharedState";

export interface Character {
  id: CharacterId;
  name: string;
  /** True for the reactive SVG rig (the only character). */
  reactive: boolean;
}

export const CHARACTERS: Record<CharacterId, Character> = {
  sprout: {
    id: "sprout",
    name: "Sprout",
    reactive: true,
  },
};

export const DEFAULT_CHARACTER: CharacterId = "sprout";
