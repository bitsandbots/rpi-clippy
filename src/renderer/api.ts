/**
 * Clippy frontend API — replaces the Electron IPC surface with fetch + EventSource.
 * All paths are relative so Vite's dev proxy (/api → localhost:5080) works
 * the same as the production Flask server.
 */

import type { SharedState } from "../sharedState";
import type { DebugState } from "../debugState";
import type { ChatRecord, ChatWithMessages } from "../types/interfaces";
import type { ModelState } from "../models";

const API = "/api";

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function del(path: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method: "DELETE",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export async function getFullState(): Promise<SharedState> {
  const r = await fetch(`${API}/state`);
  return r.json();
}

export async function setState(key: string, value: unknown): Promise<void> {
  await post("/state", { key, value });
}

export async function getFullDebugState(): Promise<DebugState> {
  const r = await fetch(`${API}/debug-state`);
  return r.json();
}

export async function setDebugState(
  key: string,
  value: unknown,
): Promise<void> {
  await post("/debug-state", { key, value });
}

// ---------------------------------------------------------------------------
// Chats
// ---------------------------------------------------------------------------

export async function getChatRecords(): Promise<Record<string, ChatRecord>> {
  const r = await fetch(`${API}/chats`);
  return r.json();
}

export async function getChatWithMessages(
  chatId: string,
): Promise<ChatWithMessages | null> {
  const r = await fetch(`${API}/chats/${chatId}`);
  if (r.status === 404) return null;
  return r.json();
}

export async function writeChatWithMessages(
  chatWithMessages: ChatWithMessages,
): Promise<void> {
  await post(`/chats/${chatWithMessages.chat.id}`, chatWithMessages);
}

export async function deleteChat(chatId: string): Promise<void> {
  await del(`/chats/${chatId}`);
}

export async function deleteAllChats(): Promise<void> {
  await del("/chats");
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export async function updateModelState(): Promise<ModelState> {
  const r = await post("/models/refresh");
  return r.json();
}

export async function downloadModelByName(name: string): Promise<void> {
  await post("/models/download", { name });
}

export async function deleteModelByName(name: string): Promise<boolean> {
  const r = await post("/models/delete", { name });
  return r.ok;
}

export async function removeModelByName(name: string): Promise<void> {
  await post("/models/remove", { name });
}

export async function deleteAllModels(): Promise<boolean> {
  const r = await post("/models/delete-all");
  return r.ok;
}

// ---------------------------------------------------------------------------
// Ollama connectivity
// ---------------------------------------------------------------------------

export interface OllamaStatus {
  url: string;
  connected: boolean;
  activeModel: string | null;
}

export async function getOllamaStatus(): Promise<OllamaStatus> {
  const r = await fetch(`${API}/ollama/status`);
  return r.json();
}

export async function setOllamaUrl(url: string): Promise<void> {
  await post("/ollama/url", { url });
}

export interface OllamaInstance {
  url: string;
  ip: string;
}

export async function discoverOllama(): Promise<OllamaInstance[]> {
  const r = await fetch(`${API}/ollama/discover`);
  const data = await r.json();
  return data.instances ?? [];
}

/** Subscribe to pull-progress SSE events. Returns an unsubscribe function. */
export function subscribePullProgress(
  onEvent: (event: Record<string, unknown>) => void,
): () => void {
  const es = new EventSource(`${API}/models/pull-progress`);
  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data));
    } catch {
      /* ignore malformed */
    }
  };
  return () => es.close();
}

// ---------------------------------------------------------------------------
// LLM
// ---------------------------------------------------------------------------

export interface LlmCreateOptions {
  modelAlias: string;
  ollamaTag: string;
  systemPrompt: string;
  topK: number;
  temperature: number;
  initialPrompts: Array<{ role: string; type: string; content: string }>;
}

export async function llmCreate(options: LlmCreateOptions): Promise<void> {
  await post("/llm/create", options);
}

export async function llmDestroy(): Promise<void> {
  await post("/llm/destroy");
}

export async function llmAbort(uuid: string): Promise<void> {
  await post("/llm/abort", { uuid });
}

/**
 * Stream an LLM response via SSE. Same callback signature as the old
 * Electron `window.electronAi.promptStreaming`.
 */
export function llmPromptStreaming(
  message: string,
  options: { requestUUID: string },
  callbacks: {
    onChunk: (text: string) => void;
    onDone: () => void;
    onError: (error: string) => void;
  },
): void {
  const { requestUUID } = options;
  const { onChunk, onDone, onError } = callbacks;

  const params = new URLSearchParams({ uuid: requestUUID, message });
  const es = new EventSource(`${API}/llm/stream?${params}`);

  es.onmessage = (e) => {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }
    if (data.type === "chunk" && data.uuid === requestUUID) {
      onChunk(data.text as string);
    } else if (data.type === "done" && data.uuid === requestUUID) {
      es.close();
      onDone();
    } else if (data.type === "error" && data.uuid === requestUUID) {
      es.close();
      onError((data.error as string) || "Unknown error");
    }
  };

  es.onerror = () => {
    es.close();
    onError("SSE connection error");
  };
}

// ---------------------------------------------------------------------------
// Voice — TTS + STT
// ---------------------------------------------------------------------------

export interface VoiceInfo {
  id: string;
  name: string;
  description: string;
  language: string;
  gender: string;
  style: string;
}

export interface VoiceState {
  tts: {
    enabled: boolean;
    currentVoice: string | null;
    voices: Record<string, VoiceInfo>;
  };
  stt: { enabled: boolean; model: string; available_models: string[] };
}

export async function getVoiceState(): Promise<VoiceState> {
  const r = await fetch(`${API}/voice/state`);
  return r.json();
}

export async function toggleTts(
  enabled?: boolean,
): Promise<{ enabled: boolean }> {
  const r = await post(
    "/voice/tts-toggle",
    enabled !== undefined ? { enabled } : {},
  );
  return r.json();
}

export async function toggleStt(
  enabled?: boolean,
): Promise<{ enabled: boolean }> {
  const r = await post(
    "/voice/stt-toggle",
    enabled !== undefined ? { enabled } : {},
  );
  return r.json();
}

export async function setVoice(
  voiceId: string,
): Promise<Record<string, unknown>> {
  const r = await post("/voice/set-voice", { voiceId });
  return r.json();
}

export async function rescanVoices(): Promise<VoiceState["tts"]> {
  const r = await post("/voice/rescan");
  return r.json();
}

/**
 * Speak text via Piper TTS. Returns an audio object URL ready to play.
 * Caller is responsible for revoking the URL after playback.
 */
export async function speakText(
  text: string,
  lengthScale = 1.0,
): Promise<string | null> {
  const r = await post("/voice/speak", { text, lengthScale });
  if (!r.ok) return null;
  const blob = await r.blob();
  return URL.createObjectURL(blob);
}

/**
 * Transcribe a base64-encoded audio blob (WebM/WAV) to text.
 */
export async function transcribeAudio(
  audioBase64: string,
  language?: string,
): Promise<{ text?: string; error?: string; language?: string }> {
  const r = await post("/voice/transcribe", { audio: audioBase64, language });
  return r.json();
}

export async function setSttModel(
  model: string,
): Promise<Record<string, unknown>> {
  const r = await post("/voice/stt-model", { model });
  return r.json();
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export async function getVersions(): Promise<Record<string, string>> {
  const r = await fetch(`${API}/versions`);
  return r.json();
}
