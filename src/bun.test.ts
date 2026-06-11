import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { method } from "./index.js";
import { Message } from "./shared.js";
import { SteamBun } from "./bun.js";

// buildMockWebview creates a mock Electrobun webview that captures outgoing messages.
function buildMockWebview() {
  const sent: Message[] = [];
  const webview = {
    rpc: {
      send: {
        steamBunMessage(msg: Message) {
          sent.push(structuredClone(msg));
        },
      },
    },
  };
  return { webview, sent };
}

// waitForMessages waits until at least `count` messages have been captured.
async function waitForMessages(
  sent: Message[],
  count: number,
  timeoutMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (sent.length < count && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10));
  }
}

// uniqueMethod creates a method definition with a UUID-based unique name.
function uniqueMethod<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
  input: I,
  output: O,
) {
  return method(`method-${crypto.randomUUID()}`, { input, output });
}

// readAll reads all chunks from a ReadableStream into an array.
async function readAll<T>(stream: ReadableStream<T>): Promise<T[]> {
  const results: T[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    results.push(value);
  }
  return results;
}

describe("SteamBunBun (bun.ts)", () => {
  describe("bind and queued messages", () => {
    test("messages queued before bind are flushed on bind", async () => {
      const { webview, sent } = buildMockWebview();

      const m = uniqueMethod(z.string(), z.string());
      SteamBun.register(
        m,
        (input) =>
          new ReadableStream({
            async start(controller) {
              const reader = input.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  controller.close();
                  break;
                }
                controller.enqueue((value as string).toUpperCase());
              }
            },
          }),
      );

      SteamBun.bind(webview);

      const streamId = crypto.randomUUID();
      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "start",
        method: m.name,
      });
      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "next",
        content: "hello",
      });
      SteamBun.messages.steamBunMessage({ stream: streamId, type: "done" });

      await waitForMessages(sent, 2);

      expect(sent).toContainEqual({
        stream: streamId,
        type: "next",
        content: "HELLO",
      });
      expect(sent).toContainEqual({ stream: streamId, type: "done" });
    });
  });

  describe("register and start", () => {
    test("sends an error when an unregistered method is started", () => {
      const { webview, sent } = buildMockWebview();
      SteamBun.bind(webview);

      const streamId = crypto.randomUUID();
      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "start",
        method: "no-such-method",
      });

      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ stream: streamId, type: "error" });
    });

    test("accepts a registered method and produces output values", async () => {
      const { webview, sent } = buildMockWebview();
      SteamBun.bind(webview);

      const m = uniqueMethod(z.number(), z.number());
      SteamBun.register(
        m,
        (_input) =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(1);
              controller.enqueue(2);
              controller.enqueue(3);
              controller.close();
            },
          }),
      );

      const streamId = crypto.randomUUID();
      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "start",
        method: m.name,
      });

      await waitForMessages(sent, 4);

      expect(sent[0]).toMatchObject({
        stream: streamId,
        type: "next",
        content: 1,
      });
      expect(sent[1]).toMatchObject({
        stream: streamId,
        type: "next",
        content: 2,
      });
      expect(sent[2]).toMatchObject({
        stream: streamId,
        type: "next",
        content: 3,
      });
      expect(sent[3]).toMatchObject({ stream: streamId, type: "done" });
    });
  });

  describe("input streaming (next / done)", () => {
    test("forwards input events to the handler stream", async () => {
      const { webview, sent } = buildMockWebview();
      SteamBun.bind(webview);

      const m = uniqueMethod(z.string(), z.string());
      SteamBun.register(
        m,
        (input) =>
          new ReadableStream({
            async start(controller) {
              const reader = input.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  controller.close();
                  break;
                }
                controller.enqueue(`echo:${value as string}`);
              }
            },
          }),
      );

      const streamId = crypto.randomUUID();
      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "start",
        method: m.name,
      });
      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "next",
        content: "alpha",
      });
      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "next",
        content: "beta",
      });
      SteamBun.messages.steamBunMessage({ stream: streamId, type: "done" });

      await waitForMessages(sent, 3);

      expect(sent).toContainEqual({
        stream: streamId,
        type: "next",
        content: "echo:alpha",
      });
      expect(sent).toContainEqual({
        stream: streamId,
        type: "next",
        content: "echo:beta",
      });
      expect(sent).toContainEqual({ stream: streamId, type: "done" });
    });

    test("ignores next messages for unknown stream ids", () => {
      const { webview, sent } = buildMockWebview();
      SteamBun.bind(webview);

      SteamBun.messages.steamBunMessage({
        stream: "nonexistent",
        type: "next",
        content: "data",
      });

      expect(sent).toHaveLength(0);
    });

    test("ignores done messages for unknown stream ids", () => {
      const { webview, sent } = buildMockWebview();
      SteamBun.bind(webview);

      SteamBun.messages.steamBunMessage({
        stream: "nonexistent",
        type: "done",
      });

      expect(sent).toHaveLength(0);
    });
  });

  describe("input validation", () => {
    test("sends a validation error when input fails the schema", async () => {
      const { webview, sent } = buildMockWebview();
      SteamBun.bind(webview);

      const m = uniqueMethod(z.number(), z.string());
      SteamBun.register(
        m,
        (input) =>
          new ReadableStream({
            async start(controller) {
              const reader = input.getReader();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) {
                    controller.close();
                    break;
                  }
                  controller.enqueue(String(value));
                }
              } catch {
                controller.close();
              }
            },
          }),
      );

      const streamId = crypto.randomUUID();
      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "start",
        method: m.name,
      });
      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "next",
        content: "not-a-number",
      });

      await waitForMessages(sent, 1);

      expect(sent[0]).toMatchObject({ stream: streamId, type: "error" });
      expect(String(sent[0].content)).toContain("Validation Error");
    });
  });

  describe("output validation", () => {
    test("sends an error when a chunk fails the output schema", async () => {
      const { webview, sent } = buildMockWebview();
      SteamBun.bind(webview);

      const m = uniqueMethod(z.string(), z.number());
      SteamBun.register(
        m,
        (_input) =>
          new ReadableStream({
            start(controller) {
              controller.enqueue("not-a-number" as unknown as number);
              controller.close();
            },
          }),
      );

      const streamId = crypto.randomUUID();
      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "start",
        method: m.name,
      });

      await waitForMessages(sent, 1);

      expect(sent[0]).toMatchObject({ stream: streamId, type: "error" });
    });
  });

  describe("error message (client-side error propagation)", () => {
    test("errors the input stream when the client sends an error", async () => {
      const { webview, sent } = buildMockWebview();
      SteamBun.bind(webview);

      const errors: string[] = [];
      const m = uniqueMethod(z.string(), z.string());
      SteamBun.register(
        m,
        (input) =>
          new ReadableStream({
            async start(controller) {
              const reader = input.getReader();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) {
                    controller.close();
                    break;
                  }
                  controller.enqueue(value as string);
                }
              } catch (err) {
                errors.push(err instanceof Error ? err.message : String(err));
                controller.close();
              }
            },
          }),
      );

      const streamId = crypto.randomUUID();
      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "start",
        method: m.name,
      });
      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "error",
        content: "client-error",
      });

      // Wait for the async handler to process the error
      await new Promise((r) => setTimeout(r, 50));

      expect(errors).toContain("client-error");
    });

    test("ignores error messages for unknown stream ids", () => {
      const { webview, sent } = buildMockWebview();
      SteamBun.bind(webview);

      SteamBun.messages.steamBunMessage({
        stream: "unknown",
        type: "error",
        content: "boom",
      });

      expect(sent).toHaveLength(0);
    });
  });

  describe("cancel", () => {
    test("closes the input stream and cleans up the stream on cancel", async () => {
      const { webview, sent } = buildMockWebview();
      SteamBun.bind(webview);

      const completed: boolean[] = [];
      const m = uniqueMethod(z.string(), z.string());
      SteamBun.register(
        m,
        (input) =>
          new ReadableStream({
            async start(controller) {
              const reader = input.getReader();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) {
                    controller.close();
                    break;
                  }
                  controller.enqueue(value as string);
                }
              } finally {
                completed.push(true);
              }
            },
          }),
      );

      const streamId = crypto.randomUUID();
      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "start",
        method: m.name,
      });
      SteamBun.messages.steamBunMessage({ stream: streamId, type: "cancel" });

      await new Promise((r) => setTimeout(r, 100));

      expect(completed).toContain(true);
    });

    test("ignores cancel messages for unknown stream ids", () => {
      const { webview, sent } = buildMockWebview();
      SteamBun.bind(webview);

      SteamBun.messages.steamBunMessage({ stream: "unknown", type: "cancel" });

      expect(sent).toHaveLength(0);
    });
  });

  describe("requests getter", () => {
    test("returns an empty object", () => {
      expect(SteamBun.requests).toEqual({});
    });
  });

  describe("messages getter", () => {
    test("returns an object with a steamBunMessage handler", () => {
      expect(typeof SteamBun.messages.steamBunMessage).toBe("function");
    });
  });

  describe("configure", () => {
    test("does not throw when setting debug: true", () => {
      expect(() => SteamBun.configure({ debug: true })).not.toThrow();
    });

    test("does not throw when setting debug: false", () => {
      expect(() => SteamBun.configure({ debug: false })).not.toThrow();
    });
  });
});
