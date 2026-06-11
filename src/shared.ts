/**
 * Message defines the structure of protocol messages sent between Bun and Web.
 */
export interface Message {
  type: "start" | "next" | "error" | "done" | "cancel";
  stream: string;
  method?: string;
  content?: unknown;
}
