/**
 * clippyApi.tsx — compatibility shim.
 *
 * Re-exports all API functions from api.ts using the same names the rest of
 * the codebase already imports. No call sites need updating.
 */

import type { SharedState } from "../sharedState";
import type { DebugState } from "../debugState";
import type { ChatRecord, ChatWithMessages } from "../types/interfaces";
import type { BubbleView } from "./contexts/BubbleViewContext";

import {
  getFullState,
  setState,
  getFullDebugState,
  setDebugState,
  getChatRecords,
  getChatWithMessages,
  writeChatWithMessages,
  deleteChat,
  deleteAllChats,
  updateModelState,
  downloadModelByName,
  deleteModelByName,
  removeModelByName,
  deleteAllModels,
  llmCreate,
  llmDestroy,
  llmAbort,
  llmPromptStreaming,
  getVersions,
  type LlmCreateOptions,
} from "./api";

export type { LlmCreateOptions };

/** Python/Ollama-backed LLM interface (same shape as the old Electron bridge). */
export interface ClippyElectronAi {
  create(options: LlmCreateOptions): Promise<void>;
  destroy(): Promise<void>;
  abortRequest(uuid: string): Promise<void>;
  promptStreaming(
    message: string,
    options: { requestUUID: string },
    callbacks: {
      onChunk: (text: string) => void;
      onDone: () => void;
      onError: (error: string) => void;
    },
  ): void;
}

export type ClippyApi = {
  // Window (no-ops in web mode)
  toggleChatWindow: () => Promise<void>;
  minimizeChatWindow: () => Promise<void>;
  maximizeChatWindow: () => Promise<void>;
  onSetBubbleView: (callback: (bubbleView: BubbleView) => void) => void;
  offSetBubbleView: () => void;
  popupAppMenu: () => void;
  // Models
  updateModelState: () => Promise<void>;
  downloadModelByName: (name: string) => Promise<void>;
  removeModelByName: (name: string) => Promise<void>;
  deleteModelByName: (name: string) => Promise<boolean>;
  deleteAllModels: () => Promise<boolean>;
  addModelFromFile: () => Promise<void>;
  // State
  offStateChanged: () => void;
  onStateChanged: (callback: (state: SharedState) => void) => void;
  getFullState: () => Promise<SharedState>;
  getState: (key: string) => Promise<unknown>;
  setState: (key: string, value: unknown) => Promise<void>;
  openStateInEditor: () => Promise<void>;
  // Debug
  offDebugStateChanged: () => void;
  onDebugStateChanged: (callback: (state: DebugState) => void) => void;
  getFullDebugState: () => Promise<DebugState>;
  getDebugState: (key: string) => Promise<unknown>;
  setDebugState: (key: string, value: unknown) => Promise<void>;
  openDebugStateInEditor: () => Promise<void>;
  getDebugInfo(): Promise<unknown>;
  // App
  getVersions: () => Promise<Record<string, string>>;
  checkForUpdates: () => Promise<void>;
  // Chats
  getChatRecords: () => Promise<Record<string, ChatRecord>>;
  getChatWithMessages: (chatId: string) => Promise<ChatWithMessages | null>;
  writeChatWithMessages: (chatWithMessages: ChatWithMessages) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  deleteAllChats: () => Promise<void>;
  onNewChat: (callback: () => void) => void;
  offNewChat: () => void;
  // Clipboard
  clipboardWrite: (data: unknown) => Promise<void>;
};

const noop = async () => {};
const noopSync = () => {};

export const clippyApi: ClippyApi = {
  // Window — no native windows in web mode
  toggleChatWindow: noop,
  minimizeChatWindow: noop,
  maximizeChatWindow: noop,
  onSetBubbleView: noopSync,
  offSetBubbleView: noopSync,
  popupAppMenu: noopSync,
  // Models
  updateModelState: async () => {
    await updateModelState();
  },
  downloadModelByName,
  removeModelByName,
  deleteModelByName,
  deleteAllModels,
  addModelFromFile: noop,
  // State
  offStateChanged: noopSync,
  onStateChanged: noopSync,
  getFullState,
  getState: async (key: string) => {
    const state = await getFullState();
    return (state as unknown as Record<string, unknown>)[key];
  },
  setState,
  openStateInEditor: noop,
  // Debug
  offDebugStateChanged: noopSync,
  onDebugStateChanged: noopSync,
  getFullDebugState,
  getDebugState: async (key: string) => {
    const state = await getFullDebugState();
    return (state as unknown as Record<string, unknown>)[key];
  },
  setDebugState,
  openDebugStateInEditor: noop,
  getDebugInfo: async () => ({}),
  // App
  getVersions,
  checkForUpdates: noop,
  // Chats
  getChatRecords,
  getChatWithMessages,
  writeChatWithMessages,
  deleteChat,
  deleteAllChats,
  onNewChat: noopSync,
  offNewChat: noopSync,
  // Clipboard
  clipboardWrite: noop,
};

export const electronAi: ClippyElectronAi = {
  create: llmCreate,
  destroy: llmDestroy,
  abortRequest: llmAbort,
  promptStreaming: llmPromptStreaming,
};
