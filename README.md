# SteamBun

Bi-directional streaming RPC for Electrobun using Web Streams and Zod validation.

## Getting Started

Install the library using Bun:

```bash
bun add @thani-sh/steam-bun
```

For full Electrobun boilerplate setup and advanced configuration details, see the [Advanced Usage Guide](docs/USAGE.md).

### Example: Uppercaser

#### 1. Define the Method Schema (`shared.ts`)

```ts
import { z } from "zod";
import { method } from "@thani-sh/steam-bun";

export const uppercase = method("uppercase", {
  input: z.string(),
  output: z.string(),
});
```

#### 2. Register the Server Handler (`server.ts`)

```ts
import { SteamBun } from "@thani-sh/steam-bun/bun";
import { uppercase } from "./shared";

SteamBun.register(uppercase, (input) => {
  return new ReadableStream({
    async start(controller) {
      const reader = input.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value.toUpperCase());
      }
      controller.close();
    },
  });
});
```

#### 3. Stream from the Client (`client.ts`)

```ts
import { SteamBun } from "@thani-sh/steam-bun/web";
import { uppercase } from "./shared";

const { rx, tx } = SteamBun.create(uppercase);

// Send inputs to server
const writer = tx.getWriter();
writer.write("hello");
writer.write("world");

// Consume outputs from server
for await (const chunk of rx) {
  console.log(chunk); // "HELLO", "WORLD"
}
```
