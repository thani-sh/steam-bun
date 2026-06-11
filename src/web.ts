import { z } from "zod";
import { MethodDef } from "./index.js";
import { Message } from "./shared.js";
import { createAsyncIterable } from "@thani-sh/iterables";

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
      outputIterable: ReturnType<typeof createAsyncIterable<unknown>>;
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
   * create constructs a stream client instance for the given method definition.
   */
  create<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
    methodDef: MethodDef<I, O>,
  ): {
    stream: () => AsyncGenerator<z.infer<O>, void, unknown>;
    call: (payload: z.infer<I>) => void;
    done: () => void;
    error: (err: unknown) => void;
  } {
    const stream = crypto.randomUUID();

    // Create the output iterable. On cleanup (exiting for await loop), notify server to cancel
    const outputIterable = createAsyncIterable<z.infer<O>>({
      onCleanup: () => {
        this.sendToBun({
          stream,
          type: "cancel",
        });
        this.activeStreams.delete(stream);
      },
    });

    this.activeStreams.set(stream, {
      outputIterable: outputIterable as unknown as ReturnType<
        typeof createAsyncIterable<unknown>
      >,
      methodDef: methodDef as unknown as MethodDef,
    });

    // Notify server to start the handler
    this.sendToBun({
      stream,
      type: "start",
      method: methodDef.name,
    });

    return {
      stream(): AsyncGenerator<z.infer<O>, void, unknown> {
        return outputIterable.iterable;
      },
      call: (payload: z.infer<I>): void => {
        // Validate inputs using Zod input schema
        if (methodDef.input) {
          methodDef.input.parse(payload);
        }
        this.sendToBun({
          stream,
          type: "next",
          content: payload,
        });
      },
      done: (): void => {
        this.sendToBun({
          stream,
          type: "done",
        });
      },
      error: (err: unknown): void => {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.sendToBun({
          stream,
          type: "error",
          content: errMsg,
        });
      },
    };
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
        activeStream.outputIterable.push(content);
      } catch (err: unknown) {
        activeStream.outputIterable.reject(err);
        this.activeStreams.delete(stream);
      }
    } else if (type === "done") {
      activeStream.outputIterable.complete();
      this.activeStreams.delete(stream);
    } else if (type === "error") {
      const errMsg = typeof content === "string" ? content : String(content);
      activeStream.outputIterable.reject(new Error(errMsg));
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
