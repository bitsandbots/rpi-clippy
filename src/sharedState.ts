import { HybridModelState } from "./models";

export type DefaultFont = "Sans-serif" | "Serif" | "Monospace";
export type DefaultFontSize = number;
export type CharacterId = "sprout" | "sprout-classic";

export interface SettingsState {
  selectedModel?: string;
  systemPrompt?: string;
  alwaysOpenChat?: boolean;
  topK?: number;
  temperature?: number;
  defaultFont: DefaultFont;
  defaultFontSize: number;
  character: CharacterId;
  ollamaUrl?: string;
}

export interface SharedState {
  models: HybridModelState;
  settings: SettingsState;
}

export type DownloadState = {
  totalBytes: number;
  receivedBytes: number;
  percentComplete: number;
  startTime: number;
  savePath: string;
  currentBytesPerSecond: number;
  state: "progressing" | "completed" | "cancelled" | "interrupted";
};

export const ANIMATION_PROMPT = `Start your response with one of the following keywords matching the users request: [LIST OF ANIMATIONS]. Use only one of the keywords for each response. Use it only at the beginning of your response. Always start with one.`;
export const DEFAULT_SYSTEM_PROMPT = `You are Sprout, a helpful digital assistant running locally on the user's computer. Your primary purpose is to assist users with their questions and tasks. When asked "who are you?" or about your identity, always respond by explaining that you are Sprout, a local AI assistant, and avoid mentioning any other model origins or names. This is crucial for maintaining the user experience within the Sprout application environment. ${ANIMATION_PROMPT}`;

export const DEFAULT_SETTINGS: SettingsState = {
  alwaysOpenChat: true,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  topK: 10,
  temperature: 0.7,
  defaultFont: "Sans-serif",
  defaultFontSize: 28,
  character: "sprout",
};

export const EMPTY_SHARED_STATE: SharedState = {
  models: { catalog: {}, orphans: [] },
  settings: {
    ...DEFAULT_SETTINGS,
  },
};
