import {
  ANIMATIONS as CLIPPY_ANIMATIONS,
  Animation,
} from "./clippy-animations";
import { SPROUT_ANIMATIONS } from "./sprout-animations";
import { CharacterId } from "../sharedState";

export interface Character {
  id: CharacterId;
  name: string;
  animations: Record<string, Animation>;
}

export const CHARACTERS: Record<CharacterId, Character> = {
  clippy: {
    id: "clippy",
    name: "Clippy",
    animations: CLIPPY_ANIMATIONS,
  },
  sprout: {
    id: "sprout",
    name: "Sprout",
    animations: SPROUT_ANIMATIONS,
  },
};

export const DEFAULT_CHARACTER: CharacterId = "clippy";
