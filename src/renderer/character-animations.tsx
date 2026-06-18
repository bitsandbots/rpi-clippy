import { SPROUT_ANIMATIONS, Animation } from "./sprout-animations";
import { CharacterId } from "../sharedState";

export interface Character {
  id: CharacterId;
  name: string;
  animations: Record<string, Animation>;
}

export const CHARACTERS: Record<CharacterId, Character> = {
  sprout: {
    id: "sprout",
    name: "Sprout",
    animations: SPROUT_ANIMATIONS,
  },
};

export const DEFAULT_CHARACTER: CharacterId = "sprout";
