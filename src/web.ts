import { z } from "zod";
import { MethodDef } from "./index.js";
import { Message } from "./shared.js";

// Polyfill ReadableStream[Symbol.asyncIterator] for environments that do not
// yet implement it (e.g. WebKit / WKWebView as of macOS 14).
if (
  typeof ReadableStream !== "undefined" &&
  !(ReadableStream.prototype as unknown as Record<symbol, unknown>)[
    Symbol.asyncIterator
  ]
) {
  (ReadableStream.prototype as unknown as Record<symbol, unknown>)[
    Symbol.asyncIterator
  ] = async function* <T>(this: ReadableStream<T>) {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

/**
 * ElectrobunElectroview represents the minimal RPC interface required by SteamBun.
 */
interface ElectrobunElectroview {
  rpc?: {
    send?: {
      steamBunMessage?: (msg: Message) => void;
    };
  };
}

/**
 * SteamBunWeb manages client-side stream construction, bindings, and active streams.
 */
class SteamBunWeb {
  private activeStreams = new Map<
    string,
    {
      outputController: ReadableStreamDefaultController<unknown>;
      methodDef: MethodDef;
    }
  >();

  private electroview: ElectrobunElectroview | null = null;
  private queuedMessages: Message[] = [];

  /**
   * bind links the SteamBun instance to a specific Electroview.
   */
  bind(electroview: ElectrobunElectroview): void {
    this.electroview = electroview;
    // Flush any messages queued before binding
    if (this.queuedMessages.length > 0) {
      const msgs = [...this.queuedMessages];
      this.queuedMessages = [];
      for (const msg of msgs) {
        this.sendToBun(msg);
      }
    }
  }

  private debug = false;

  /**
   * configure sets configuration options like debug logging for the SteamBun instance.
   */
  configure(config: { debug?: boolean }): void {
    if (config.debug !== undefined) {
      this.debug = config.debug;
    }
  }

  /**
   * requests returns the Electrobun request handlers object to be spread under handlers.requests.
   */
  get requests(): Record<string, never> {
    return {};
  }

  /**
   * messages returns the Electrobun message handlers object to be spread under handlers.messages.
   */
  get messages(): {
    steamBunMessage: (payload: Message) => void;
  } {
    return {
      steamBunMessage: (payload: Message): void => {
        if (this.debug) {
          console.log("[SteamBun Client] Received message:", payload);
        }
        this.handleMessage(payload);
      },
    };
  }

  /**
   * create constructs a stream handle for the given method definition.
   * tx is a WritableStream for sending inputs to the server.
   * rx is a ReadableStream for receiving outputs from the server.
   */
  create<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
    methodDef: MethodDef<I, O>,
  ): {
    rx: ReadableStream<z.infer<O>>;
    tx: WritableStream<z.infer<I>>;
  } {
    const streamId = crypto.randomUUID();

    // rx: output stream from server — controller is driven by incoming messages
    let outputController!: ReadableStreamDefaultController<z.infer<O>>;
    const rx = new ReadableStream<z.infer<O>>({
      start(c) {
        outputController = c;
      },
      cancel: () => {
        // Consumer exited early — notify server to cancel
        this.sendToBun({ stream: streamId, type: "cancel" });
        this.activeStreams.delete(streamId);
      },
    });

    this.activeStreams.set(streamId, {
      outputController:
        outputController as unknown as ReadableStreamDefaultController<unknown>,
      methodDef: methodDef as unknown as MethodDef,
    });

    // Notify server to start the handler
    this.sendToBun({ stream: streamId, type: "start", method: methodDef.name });

    // tx: input stream to server — writes are forwarded as protocol messages
    const tx = new WritableStream<z.infer<I>>({
      write: (chunk) => {
        if (methodDef.input) {
          methodDef.input.parse(chunk);
        }
        this.sendToBun({ stream: streamId, type: "next", content: chunk });
      },
      close: () => {
        this.sendToBun({ stream: streamId, type: "done" });
      },
      abort: (reason) => {
        const errMsg =
          reason instanceof Error ? reason.message : String(reason);
        this.sendToBun({ stream: streamId, type: "error", content: errMsg });
      },
    });

    return { rx, tx };
  }

  /**
   * handleMessage routes incoming protocol messages to correct streams.
   */
  private handleMessage(msg: Message): void {
    const { stream, type, content } = msg;
    const activeStream = this.activeStreams.get(stream);
    if (!activeStream) return;

    if (type === "next") {
      try {
        if (activeStream.methodDef.output) {
          activeStream.methodDef.output.parse(content);
        }
        activeStream.outputController.enqueue(content);
      } catch (err: unknown) {
        activeStream.outputController.error(err);
        this.activeStreams.delete(stream);
      }
    } else if (type === "done") {
      activeStream.outputController.close();
      this.activeStreams.delete(stream);
    } else if (type === "error") {
      const errMsg = typeof content === "string" ? content : String(content);
      activeStream.outputController.error(new Error(errMsg));
      this.activeStreams.delete(stream);
    }
  }

  /**
   * sendToBun transmits a protocol message to the Bun backend process.
   */
  private sendToBun(msg: Message): void {
    if (this.debug) {
      console.log("[SteamBun Client] Sending message:", msg);
    }
    if (
      this.electroview &&
      this.electroview.rpc &&
      this.electroview.rpc.send &&
      this.electroview.rpc.send.steamBunMessage
    ) {
      this.electroview.rpc.send.steamBunMessage(msg);
    } else {
      this.queuedMessages.push(msg);
    }
  }
}

/**
 * SteamBun is the client-side singleton instance for managing streams.
 */
export const SteamBun = new SteamBunWeb();
