import { type RPCSchema } from "electrobun";
import { type Message } from "@thani-sh/steam-bun";

/**
 * WebviewRPCType defines the Electrobun RPC schema for the stopwatch demo application.
 */
export type WebviewRPCType = {
  bun: RPCSchema<{
    requests: {};
    messages: {
      steamBunMessage: Message;
      closeWindow: {};
    };
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      steamBunMessage: Message;
    };
  }>;
};
