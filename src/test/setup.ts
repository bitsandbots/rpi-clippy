/**
 * Vitest global test setup.
 *
 * - Provides a crypto.getRandomValues polyfill so uuid.ts works in jsdom.
 * - Provides a global EventSource mock for SSE-based tests.
 * - Resets the global fetch mock before each test.
 */

import { vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// crypto polyfill (jsdom does not implement getRandomValues)
// ---------------------------------------------------------------------------

if (
  typeof globalThis.crypto === "undefined" ||
  !globalThis.crypto.getRandomValues
) {
  Object.defineProperty(globalThis, "crypto", {
    value: {
      getRandomValues: <T extends ArrayBufferView>(array: T): T => {
        const bytes = array as unknown as Uint8Array;
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = Math.floor(Math.random() * 256);
        }
        return array;
      },
      randomUUID:
        undefined as unknown as () => `${string}-${string}-${string}-${string}-${string}`,
    },
    writable: true,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Global EventSource mock
// ---------------------------------------------------------------------------

export class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  readyState = 0; // CONNECTING

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    this.readyState = 1; // OPEN
  }

  close() {
    this.readyState = 2; // CLOSED
  }

  /** Helper for tests: simulate a server-sent message. */
  emit(data: unknown) {
    if (this.onmessage) {
      this.onmessage(
        new MessageEvent("message", { data: JSON.stringify(data) }),
      );
    }
  }

  /** Helper for tests: simulate an error. */
  emitError() {
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }
}

vi.stubGlobal("EventSource", MockEventSource);

// ---------------------------------------------------------------------------
// Global fetch mock — reset before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  MockEventSource.instances = [];
});
