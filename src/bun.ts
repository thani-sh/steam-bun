import { z } from "zod";
import { MethodDef } from "./index.js";
import { Message } from "./shared.js";

/**
 * ElectrobunWebview represents the minimal RPC interface required by SteamBun.
 */
interface ElectrobunWebview {
  rpc?: {
    send?: {
      steamBunMessage?: (msg: Message) => void;
    };
  };
}

/**
 * SteamBunBun manages server-side registrations, bindings, and active streams.
 */
class SteamBunBun {
  private handlers = new Map<
    string,
    {
      methodDef: MethodDef;
      handler: (input: ReadableStream<unknown>) => ReadableStream<unknown>;
    }
  >();

  private activeStreams = new Map<
    string,
    {
      inputController: ReadableStreamDefaultController<unknown>;
      outputReader: ReadableStreamDefaultReader<unknown>;
    }
  >();

  private activeStreamMethodNames = new Map<string, string>();
  private webview: ElectrobunWebview | null = null;
  private queuedMessages: Message[] = [];

  /**
   * bind links the SteamBun instance to a specific Electrobun webview.
   */
  bind(webview: ElectrobunWebview): void {
    this.webview = webview;
    // Flush any messages queued before binding
    if (this.queuedMessages.length > 0) {
      const msgs = [...this.queuedMessages];
      this.queuedMessages = [];
      for (const msg of msgs) {
        this.sendToWebview(msg);
      }
    }
  }

  /**
   * register associates a stream method definition with its server handler.
   */
  register<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
    methodDef: MethodDef<I, O>,
    handler: (input: ReadableStream<z.infer<I>>) => ReadableStream<z.infer<O>>,
  ): void {
    this.handlers.set(methodDef.name, {
      methodDef: methodDef as unknown as MethodDef,
      handler: handler as unknown as (
        input: ReadableStream<unknown>,
      ) => ReadableStream<unknown>,
    });
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
          console.log("[SteamBun Server] Received message:", payload);
        }
        this.handleMessage(payload);
      },
    };
  }

  /**
   * handleMessage routes incoming protocol messages to correct streams.
   */
  private handleMessage(msg: Message): void {
    const { stream, type, method, content } = msg;

    if (type === "start") {
      const handlerConfig = this.handlers.get(method!);
      if (!handlerConfig) {
        this.sendToWebview({
          stream,
          type: "error",
          content: `SteamBun: Method "${method}" is not registered on the server.`,
        });
        return;
      }

      const { methodDef, handler } = handlerConfig;

      // Create a push-controlled ReadableStream to feed client inputs to the handler
      let inputController!: ReadableStreamDefaultController<unknown>;
      const inputStream = new ReadableStream<unknown>({
        start(c) {
          inputController = c;
        },
      });

      this.activeStreamMethodNames.set(stream, method!);

      let outputStream: ReadableStream<unknown>;
      try {
        outputStream = handler(inputStream);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.sendToWebview({
          stream,
          type: "error",
          content: `Error instantiating stream: ${errMsg}`,
        });
        return;
      }

      const outputReader = outputStream.getReader();
      this.activeStreams.set(stream, { inputController, outputReader });

      // Start consuming the output stream and forwarding chunks to the webview
      (async () => {
        try {
          while (true) {
            const { done, value } = await outputReader.read();
            if (done) {
              this.sendToWebview({ stream, type: "done" });
              break;
            }
            // Validate outputs at runtime using the output Zod schema
            if (methodDef.output) {
              methodDef.output.parse(value);
            }
            this.sendToWebview({ stream, type: "next", content: value });
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.sendToWebview({ stream, type: "error", content: errMsg });
        } finally {
          this.activeStreams.delete(stream);
          this.activeStreamMethodNames.delete(stream);
        }
      })();
    } else if (type === "next") {
      const activeStream = this.activeStreams.get(stream);
      if (activeStream) {
        const name = this.activeStreamMethodNames.get(stream);
        const handlerConfig = name ? this.handlers.get(name) : null;
        try {
          if (handlerConfig?.methodDef.input) {
            handlerConfig.methodDef.input.parse(content);
          }
          activeStream.inputController.enqueue(content);
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.sendToWebview({
            stream,
            type: "error",
            content: `Validation Error: ${errMsg}`,
          });
          activeStream.inputController.error(err);
        }
      }
    } else if (type === "done") {
      const activeStream = this.activeStreams.get(stream);
      if (activeStream) {
        activeStream.inputController.close();
      }
    } else if (type === "error") {
      const activeStream = this.activeStreams.get(stream);
      if (activeStream) {
        const errMsg = typeof content === "string" ? content : String(content);
        activeStream.inputController.error(new Error(errMsg));
      }
    } else if (type === "cancel") {
      const activeStream = this.activeStreams.get(stream);
      if (activeStream) {
        activeStream.inputController.close();
        activeStream.outputReader.cancel().catch(() => {});
        this.activeStreams.delete(stream);
        this.activeStreamMethodNames.delete(stream);
      }
    }
  }

  /**
   * sendToWebview transmits a protocol message to the bound webview.
   */
  private sendToWebview(msg: Message): void {
    if (this.debug) {
      console.log("[SteamBun Server] Sending message:", msg);
    }
    if (
      this.webview &&
      this.webview.rpc &&
      this.webview.rpc.send &&
      this.webview.rpc.send.steamBunMessage
    ) {
      this.webview.rpc.send.steamBunMessage(msg);
    } else {
      this.queuedMessages.push(msg);
    }
  }
}

/**
 * SteamBun is the server-side singleton instance for managing streams.
 */
export const SteamBun = new SteamBunBun();
