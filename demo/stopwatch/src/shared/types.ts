import { type RPCSchema } from "electrobun";
import { type SteamBunMessage } from "@thani-sh/steam-bun";

/**
 * WebviewRPCType defines the Electrobun RPC schema for the stopwatch demo application.
 */
export type WebviewRPCType = {
  bun: RPCSchema<{
    requests: {};
    messages: {
      steamBunMessage: SteamBunMessage;
      closeWindow: {};
    };
  }>;
  webview: RPCSchema<{
    requests: {};
    messages: {
      steamBunMessage: SteamBunMessage;
    };
  }>;
};
