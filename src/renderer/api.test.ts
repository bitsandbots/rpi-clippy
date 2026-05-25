/**
 * Tests for src/renderer/api.ts
 *
 * fetch is replaced with a vi.fn() stub in setup.ts before each test.
 * EventSource is replaced with MockEventSource from setup.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockEventSource } from "../test/setup";
import type { LlmCreateOptions } from "./api";

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
  downloadModelByTag,
  deleteModelByName,
  removeModelByName,
  deleteAllModels,
  llmCreate,
  llmDestroy,
  llmAbort,
  llmPromptStreaming,
  getVoiceState,
  toggleTts,
  toggleStt,
  setVoice,
  rescanVoices,
  speakText,
  transcribeAudio,
  setSttModel,
  getVersions,
  subscribePullProgress,
} from "./api";
import type { MessageRecord } from "../types/interfaces";

// ---------------------------------------------------------------------------
// Helper: build a successful fetch mock response
// ---------------------------------------------------------------------------

function mockFetch(body: unknown, ok = true, status = 200) {
  const response = {
    ok,
    status,
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob([JSON.stringify(body)])),
  };
  (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(response);
  return response;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

describe("getFullState", () => {
  it("calls GET /api/state and returns JSON", async () => {
    mockFetch({ models: {}, settings: {} });
    const result = await getFullState();
    expect(fetch).toHaveBeenCalledWith("/api/state");
    expect(result).toEqual({ models: {}, settings: {} });
  });
});

describe("setState", () => {
  it("calls POST /api/state with key and value", async () => {
    mockFetch({ status: "ok" });
    await setState("topK", 42);
    expect(fetch).toHaveBeenCalledWith(
      "/api/state",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ key: "topK", value: 42 }),
      }),
    );
  });
});

describe("getFullDebugState", () => {
  it("calls GET /api/debug-state", async () => {
    mockFetch({ simulateDownload: false });
    await getFullDebugState();
    expect(fetch).toHaveBeenCalledWith("/api/debug-state");
  });
});

describe("setDebugState", () => {
  it("calls POST /api/debug-state", async () => {
    mockFetch({ status: "ok" });
    await setDebugState("simulateDownload", true);
    expect(fetch).toHaveBeenCalledWith(
      "/api/debug-state",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ key: "simulateDownload", value: true }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Chats
// ---------------------------------------------------------------------------

describe("getChatRecords", () => {
  it("calls GET /api/chats", async () => {
    mockFetch({});
    await getChatRecords();
    expect(fetch).toHaveBeenCalledWith("/api/chats");
  });
});

describe("getChatWithMessages", () => {
  it("returns JSON for a known chat", async () => {
    const chat = { chat: { id: "abc" }, messages: [] as MessageRecord[] };
    mockFetch(chat, true, 200);
    const result = await getChatWithMessages("abc");
    expect(result).toEqual(chat);
  });

  it("returns null on 404", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve(null),
    });
    const result = await getChatWithMessages("missing");
    expect(result).toBeNull();
  });
});

describe("writeChatWithMessages", () => {
  it("POSTs to /api/chats/:id", async () => {
    mockFetch({ status: "ok" });
    const cwm: { chat: any; messages: MessageRecord[] } = {
      chat: { id: "c1", createdAt: 0, updatedAt: 0, preview: "" },
      messages: [],
    };
    await writeChatWithMessages(cwm);
    expect(fetch).toHaveBeenCalledWith(
      "/api/chats/c1",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});

describe("deleteChat", () => {
  it("calls DELETE /api/chats/:id", async () => {
    mockFetch({ status: "ok" });
    await deleteChat("c1");
    expect(fetch).toHaveBeenCalledWith(
      "/api/chats/c1",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });
});

describe("deleteAllChats", () => {
  it("calls DELETE /api/chats", async () => {
    mockFetch({ status: "ok" });
    await deleteAllChats();
    expect(fetch).toHaveBeenCalledWith(
      "/api/chats",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

describe("updateModelState", () => {
  it("calls POST /api/models/refresh", async () => {
    mockFetch({});
    await updateModelState();
    expect(fetch).toHaveBeenCalledWith(
      "/api/models/refresh",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});

describe("downloadModelByName", () => {
  it("POSTs name to /api/models/download", async () => {
    mockFetch({ status: "ok" });
    await downloadModelByName("TinyLlama (1.1B)");
    expect(fetch).toHaveBeenCalledWith(
      "/api/models/download",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "TinyLlama (1.1B)" }),
      }),
    );
  });
});

describe("deleteModelByName", () => {
  it("returns true on ok response", async () => {
    mockFetch({ status: "ok" }, true, 200);
    const result = await deleteModelByName("TinyLlama (1.1B)");
    expect(result).toBe(true);
  });

  it("returns false on error response", async () => {
    mockFetch({ error: "fail" }, false, 500);
    const result = await deleteModelByName("TinyLlama (1.1B)");
    expect(result).toBe(false);
  });
});

describe("removeModelByName", () => {
  it("POSTs to /api/models/remove", async () => {
    mockFetch({ status: "ok" });
    await removeModelByName("TinyLlama (1.1B)");
    expect(fetch).toHaveBeenCalledWith(
      "/api/models/remove",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("deleteAllModels", () => {
  it("returns true on ok", async () => {
    mockFetch({ status: "ok" }, true, 200);
    const result = await deleteAllModels();
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// LLM
// ---------------------------------------------------------------------------

describe("llmCreate", () => {
  it("POSTs options to /api/llm/create", async () => {
    mockFetch({ status: "ok" });
    const opts: LlmCreateOptions = {
      modelAlias: "TinyLlama",
      ollamaTag: "tinyllama",
      systemPrompt: "Be helpful",
      topK: 10,
      temperature: 0.7,
      initialPrompts: [] as any[],
    };
    await llmCreate(opts);
    expect(fetch).toHaveBeenCalledWith(
      "/api/llm/create",
      expect.objectContaining({ method: "POST", body: JSON.stringify(opts) }),
    );
  });
});

describe("llmDestroy", () => {
  it("POSTs to /api/llm/destroy", async () => {
    mockFetch({ status: "ok" });
    await llmDestroy();
    expect(fetch).toHaveBeenCalledWith(
      "/api/llm/destroy",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("llmAbort", () => {
  it("POSTs uuid to /api/llm/abort", async () => {
    mockFetch({ status: "ok" });
    await llmAbort("test-uuid");
    expect(fetch).toHaveBeenCalledWith(
      "/api/llm/abort",
      expect.objectContaining({ body: JSON.stringify({ uuid: "test-uuid" }) }),
    );
  });
});

describe("llmPromptStreaming", () => {
  it("opens EventSource with correct URL params", () => {
    llmPromptStreaming(
      "hello",
      { requestUUID: "uuid-1" },
      { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
    );
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain("uuid=uuid-1");
    expect(MockEventSource.instances[0].url).toContain("message=hello");
  });

  it("calls onChunk for chunk events", () => {
    const onChunk = vi.fn();
    llmPromptStreaming(
      "hi",
      { requestUUID: "uuid-2" },
      { onChunk, onDone: vi.fn(), onError: vi.fn() },
    );
    const es = MockEventSource.instances[0];
    es.emit({ type: "chunk", uuid: "uuid-2", text: "Hello" });
    expect(onChunk).toHaveBeenCalledWith("Hello");
  });

  it("calls onDone and closes on done event", () => {
    const onDone = vi.fn();
    llmPromptStreaming(
      "hi",
      { requestUUID: "uuid-3" },
      { onChunk: vi.fn(), onDone, onError: vi.fn() },
    );
    const es = MockEventSource.instances[0];
    es.emit({ type: "done", uuid: "uuid-3" });
    expect(onDone).toHaveBeenCalled();
    expect(es.readyState).toBe(2); // CLOSED
  });

  it("calls onError and closes on error event", () => {
    const onError = vi.fn();
    llmPromptStreaming(
      "hi",
      { requestUUID: "uuid-4" },
      { onChunk: vi.fn(), onDone: vi.fn(), onError },
    );
    const es = MockEventSource.instances[0];
    es.emit({ type: "error", uuid: "uuid-4", error: "model crashed" });
    expect(onError).toHaveBeenCalledWith("model crashed");
    expect(es.readyState).toBe(2);
  });

  it("calls onError on SSE connection failure", () => {
    const onError = vi.fn();
    llmPromptStreaming(
      "hi",
      { requestUUID: "uuid-5" },
      { onChunk: vi.fn(), onDone: vi.fn(), onError },
    );
    const es = MockEventSource.instances[0];
    es.emitError();
    expect(onError).toHaveBeenCalledWith("SSE connection error");
  });

  it("ignores events for other UUIDs", () => {
    const onChunk = vi.fn();
    llmPromptStreaming(
      "hi",
      { requestUUID: "uuid-mine" },
      { onChunk, onDone: vi.fn(), onError: vi.fn() },
    );
    const es = MockEventSource.instances[0];
    es.emit({ type: "chunk", uuid: "uuid-other", text: "sneaky" });
    expect(onChunk).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

describe("getVoiceState", () => {
  it("calls GET /api/voice/state", async () => {
    mockFetch({ tts: {}, stt: {} });
    await getVoiceState();
    expect(fetch).toHaveBeenCalledWith("/api/voice/state");
  });
});

describe("toggleTts", () => {
  it("POSTs to /api/voice/tts-toggle", async () => {
    mockFetch({ enabled: true });
    await toggleTts(true);
    expect(fetch).toHaveBeenCalledWith(
      "/api/voice/tts-toggle",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ enabled: true }),
      }),
    );
  });

  it("POSTs empty body when enabled is undefined", async () => {
    mockFetch({ enabled: false });
    await toggleTts();
    const callBody = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body;
    expect(callBody).toBe(JSON.stringify({}));
  });
});

describe("toggleStt", () => {
  it("POSTs to /api/voice/stt-toggle", async () => {
    mockFetch({ enabled: false });
    await toggleStt(false);
    expect(fetch).toHaveBeenCalledWith(
      "/api/voice/stt-toggle",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("setVoice", () => {
  it("POSTs voiceId to /api/voice/set-voice", async () => {
    mockFetch({ status: "loaded" });
    await setVoice("en-us-amy");
    expect(fetch).toHaveBeenCalledWith(
      "/api/voice/set-voice",
      expect.objectContaining({
        body: JSON.stringify({ voiceId: "en-us-amy" }),
      }),
    );
  });
});

describe("rescanVoices", () => {
  it("POSTs to /api/voice/rescan", async () => {
    mockFetch({ enabled: false, currentVoice: null, voices: {} });
    await rescanVoices();
    expect(fetch).toHaveBeenCalledWith(
      "/api/voice/rescan",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("speakText", () => {
  it("returns an object URL on success", async () => {
    const mockUrl = "blob:http://localhost/abc";
    global.URL.createObjectURL = vi.fn().mockReturnValue(mockUrl);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(["wav-data"])),
    });

    const result = await speakText("Hello");
    expect(result).toBe(mockUrl);
    expect(fetch).toHaveBeenCalledWith(
      "/api/voice/speak",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns null on error response", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 503,
    });
    const result = await speakText("Hello");
    expect(result).toBeNull();
  });
});

describe("transcribeAudio", () => {
  it("POSTs base64 audio to /api/voice/transcribe", async () => {
    mockFetch({ text: "hello", language: "en", probability: 0.99 });
    await transcribeAudio("base64data");
    expect(fetch).toHaveBeenCalledWith(
      "/api/voice/transcribe",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ audio: "base64data", language: undefined }),
      }),
    );
  });

  it("includes language hint when provided", async () => {
    mockFetch({ text: "bonjour" });
    await transcribeAudio("base64data", "fr");
    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(body.language).toBe("fr");
  });
});

describe("setSttModel", () => {
  it("POSTs model to /api/voice/stt-model", async () => {
    mockFetch({ status: "loaded", model: "base" });
    await setSttModel("base");
    expect(fetch).toHaveBeenCalledWith(
      "/api/voice/stt-model",
      expect.objectContaining({ body: JSON.stringify({ model: "base" }) }),
    );
  });
});

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

describe("getVersions", () => {
  it("calls GET /api/versions", async () => {
    mockFetch({ clippy: "0.4.3", python: "3.11", flask: "3.0" });
    const result = await getVersions();
    expect(fetch).toHaveBeenCalledWith("/api/versions");
    expect(result.clippy).toBe("0.4.3");
  });
});

// ---------------------------------------------------------------------------
// subscribePullProgress
// ---------------------------------------------------------------------------

describe("subscribePullProgress", () => {
  it("opens an EventSource to /api/models/pull-progress", () => {
    const unsubscribe = subscribePullProgress(vi.fn());
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain(
      "/api/models/pull-progress",
    );
    unsubscribe();
  });

  it("calls the callback with parsed event data", () => {
    const cb = vi.fn();
    subscribePullProgress(cb);
    const es = MockEventSource.instances[0];
    es.emit({ type: "pull_progress", tag: "tinyllama" });
    expect(cb).toHaveBeenCalledWith({
      type: "pull_progress",
      tag: "tinyllama",
    });
  });

  it("unsubscribe closes the EventSource", () => {
    const unsubscribe = subscribePullProgress(vi.fn());
    const es = MockEventSource.instances[0];
    unsubscribe();
    expect(es.readyState).toBe(2); // CLOSED
  });
});

// ---------------------------------------------------------------------------
// downloadModelByTag
// ---------------------------------------------------------------------------

describe("downloadModelByTag", () => {
  it("posts tag to /models/download", async () => {
    mockFetch({ status: "ok" });
    await downloadModelByTag("llama3.2:1b");
    expect(fetch).toHaveBeenCalledWith(
      "/api/models/download",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ tag: "llama3.2:1b" }),
      }),
    );
  });
});
