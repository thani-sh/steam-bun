import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { method } from "./index.js";
import { Message } from "./shared.js";
import { SteamBun } from "./web.js";

// buildMockElectroview creates a mock Electroview that captures outgoing messages.
function buildMockElectroview() {
  const sent: Message[] = [];
  const electroview = {
    rpc: {
      send: {
        steamBunMessage(msg: Message) {
          sent.push(structuredClone(msg));
        },
      },
    },
  };
  return { electroview, sent };
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

describe("SteamBunWeb (web.ts)", () => {
  describe("create", () => {
    test("sends a start message with the method name upon creation", () => {
      const { electroview, sent } = buildMockElectroview();
      SteamBun.bind(electroview);

      const m = uniqueMethod(z.string(), z.string());
      SteamBun.create(m);

      const startMsg = sent.find((s) => s.type === "start");
      expect(startMsg).toBeDefined();
      expect(startMsg!.method).toBe(m.name);
    });

    test("returns an object with rx (ReadableStream) and tx (WritableStream)", () => {
      const { electroview } = buildMockElectroview();
      SteamBun.bind(electroview);

      const m = uniqueMethod(z.string(), z.string());
      const { rx, tx } = SteamBun.create(m);

      expect(rx).toBeInstanceOf(ReadableStream);
      expect(tx).toBeInstanceOf(WritableStream);
    });

    test("each call to create uses a unique stream id", () => {
      const { electroview, sent } = buildMockElectroview();
      SteamBun.bind(electroview);

      const m = uniqueMethod(z.string(), z.string());
      SteamBun.create(m);
      SteamBun.create(m);

      const startMsgs = sent.filter((s) => s.type === "start");
      expect(startMsgs).toHaveLength(2);
      expect(startMsgs[0].stream).not.toBe(startMsgs[1].stream);
    });
  });

  describe("tx (sending inputs)", () => {
    test("sends a next message when writing a chunk", async () => {
      const { electroview, sent } = buildMockElectroview();
      SteamBun.bind(electroview);

      const m = uniqueMethod(z.string(), z.string());
      const { tx } = SteamBun.create(m);
      const writer = tx.getWriter();
      await writer.write("hello");

      const nextMsg = sent.find((s) => s.type === "next");
      expect(nextMsg).toBeDefined();
      expect(nextMsg!.content).toBe("hello");
    });

    test("rejects when a chunk fails input schema validation", async () => {
      const { electroview } = buildMockElectroview();
      SteamBun.bind(electroview);

      const m = uniqueMethod(z.number(), z.string());
      const { tx } = SteamBun.create(m);
      const writer = tx.getWriter();

      await expect(
        writer.write("not-a-number" as unknown as number),
      ).rejects.toThrow();
    });

    test("sends a done message when the writer is closed", async () => {
      const { electroview, sent } = buildMockElectroview();
      SteamBun.bind(electroview);

      const m = uniqueMethod(z.string(), z.string());
      const { tx } = SteamBun.create(m);
      const streamId = sent.find((s) => s.type === "start")!.stream;

      const writer = tx.getWriter();
      await writer.close();

      const doneMsg = sent.find((s) => s.type === "done");
      expect(doneMsg).toBeDefined();
      expect(doneMsg!.stream).toBe(streamId);
    });

    test("sends an error message when the writer is aborted with an Error", async () => {
      const { electroview, sent } = buildMockElectroview();
      SteamBun.bind(electroview);

      const m = uniqueMethod(z.string(), z.string());
      const { tx } = SteamBun.create(m);
      const writer = tx.getWriter();
      await writer.abort(new Error("something went wrong"));

      const errorMsg = sent.find((s) => s.type === "error");
      expect(errorMsg).toBeDefined();
      expect(errorMsg!.content).toBe("something went wrong");
    });

    test("sends an error message when the writer is aborted with a non-Error value", async () => {
      const { electroview, sent } = buildMockElectroview();
      SteamBun.bind(electroview);

      const m = uniqueMethod(z.string(), z.string());
      const { tx } = SteamBun.create(m);
      const writer = tx.getWriter();
      await writer.abort("raw string error");

      const errorMsg = sent.find((s) => s.type === "error");
      expect(errorMsg).toBeDefined();
      expect(errorMsg!.content).toBe("raw string error");
    });
  });

  describe("rx (receiving outputs)", () => {
    test("yields values pushed by the server via next messages", async () => {
      const { electroview, sent } = buildMockElectroview();
      SteamBun.bind(electroview);

      const m = uniqueMethod(z.string(), z.string());
      const { rx } = SteamBun.create(m);
      const streamId = sent.find((s) => s.type === "start")!.stream;

      const received: string[] = [];
      const iterPromise = (async () => {
        for await (const val of rx) {
          received.push(val);
        }
      })();

      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "next",
        content: "foo",
      });
      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "next",
        content: "bar",
      });
      SteamBun.messages.steamBunMessage({ stream: streamId, type: "done" });

      await iterPromise;

      expect(received).toEqual(["foo", "bar"]);
    });

    test("terminates the stream on a done message", async () => {
      const { electroview, sent } = buildMockElectroview();
      SteamBun.bind(electroview);

      const m = uniqueMethod(z.string(), z.string());
      const { rx } = SteamBun.create(m);
      const streamId = sent.find((s) => s.type === "start")!.stream;

      const iterPromise = (async () => {
        const values: string[] = [];
        for await (const val of rx) {
          values.push(val);
        }
        return values;
      })();

      SteamBun.messages.steamBunMessage({ stream: streamId, type: "done" });

      expect(await iterPromise).toEqual([]);
    });

    test("errors the stream on an error message", async () => {
      const { electroview, sent } = buildMockElectroview();
      SteamBun.bind(electroview);

      const m = uniqueMethod(z.string(), z.string());
      const { rx } = SteamBun.create(m);
      const streamId = sent.find((s) => s.type === "start")!.stream;

      const iterPromise = (async () => {
        for await (const _ of rx) {
          /* consume */
        }
      })();

      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "error",
        content: "server-error",
      });

      await expect(iterPromise).rejects.toThrow("server-error");
    });

    test("errors the stream when a next message fails output schema validation", async () => {
      const { electroview, sent } = buildMockElectroview();
      SteamBun.bind(electroview);

      const m = uniqueMethod(z.string(), z.number());
      const { rx } = SteamBun.create(m);
      const streamId = sent.find((s) => s.type === "start")!.stream;

      const iterPromise = (async () => {
        for await (const _ of rx) {
          /* consume */
        }
      })();

      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "next",
        content: "not-a-number",
      });

      await expect(iterPromise).rejects.toThrow();
    });
  });

  describe("cancel on rx cleanup", () => {
    test("sends a cancel message when the consumer exits the for-await loop early", async () => {
      const { electroview, sent } = buildMockElectroview();
      SteamBun.bind(electroview);

      const m = uniqueMethod(z.string(), z.string());
      const { rx } = SteamBun.create(m);
      const streamId = sent.find((s) => s.type === "start")!.stream;

      const iterPromise = (async () => {
        for await (const _ of rx) {
          break; // exit early
        }
      })();

      SteamBun.messages.steamBunMessage({
        stream: streamId,
        type: "next",
        content: "first",
      });

      await iterPromise;
      await waitForMessages(sent, 3); // start + next + cancel

      const cancelMsg = sent.find((s) => s.type === "cancel");
      expect(cancelMsg).toBeDefined();
      expect(cancelMsg!.stream).toBe(streamId);
    });
  });

  describe("bind and queued messages", () => {
    test("start message is queued before bind and flushed after", async () => {
      // Re-import to get a fresh singleton instance
      const { SteamBun: freshSteamBun } = await import(
        `./web.js?bust=${Date.now()}`
      );

      const m = uniqueMethod(z.string(), z.string());
      freshSteamBun.create(m);

      const { electroview, sent } = buildMockElectroview();
      freshSteamBun.bind(electroview);

      await waitForMessages(sent, 1);

      expect(
        sent.some((s: Message) => s.type === "start" && s.method === m.name),
      ).toBe(true);
    });
  });

  describe("messages getter", () => {
    test("returns an object with a steamBunMessage handler", () => {
      expect(typeof SteamBun.messages.steamBunMessage).toBe("function");
    });
  });

  describe("requests getter", () => {
    test("returns an empty object", () => {
      expect(SteamBun.requests).toEqual({});
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

  describe("handleMessage ignores unknown stream ids", () => {
    test("ignores next messages for unknown stream ids", () => {
      expect(() =>
        SteamBun.messages.steamBunMessage({
          stream: "nonexistent",
          type: "next",
          content: "data",
        }),
      ).not.toThrow();
    });

    test("ignores done messages for unknown stream ids", () => {
      expect(() =>
        SteamBun.messages.steamBunMessage({
          stream: "nonexistent",
          type: "done",
        }),
      ).not.toThrow();
    });

    test("ignores error messages for unknown stream ids", () => {
      expect(() =>
        SteamBun.messages.steamBunMessage({
          stream: "nonexistent",
          type: "error",
          content: "boom",
        }),
      ).not.toThrow();
    });
  });
});
