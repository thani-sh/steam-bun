# SteamBun Advanced Usage Guide

This document covers the advanced capabilities, deep integration patterns, and configuration options of **SteamBun**. It serves as a comprehensive reference guide for building robust, type-safe, streaming applications using Electrobun.

---

## Electrobun Integration Setup

To use SteamBun, you must integrate its RPC message handlers into your Electrobun setup. This enables the underlying communication channel between the Bun backend and the Webview.

### 1. Server-Side Setup (Bun Backend)

Import the server-side `SteamBun` singleton, register your methods, spread its message handlers into the `defineRPC` call, and bind it to the view.

```typescript
import { BrowserView } from "electrobun/bun";
import { SteamBun } from "@thani-sh/steam-bun/bun";
import { uppercase } from "./shared/methods";

// 1. Register handlers for your streaming methods
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

// 2. Spread SteamBun message handlers when defining the Webview RPC
const myWebviewRPC = BrowserView.defineRPC({
  handlers: {
    requests: {
      ...SteamBun.requests, // (Optional but recommended)
    },
    messages: {
      ...SteamBun.messages, // Enables message handling for SteamBun
    },
  },
});

const webview = new BrowserView({
  url: "views://main/index.html",
  rpc: myWebviewRPC,
});

// 3. Bind SteamBun to the webview instance
SteamBun.bind(webview);
```

### 2. Client-Side Setup (Webview)

Import the client-side `SteamBun` singleton, spread its handlers, and bind it to the view.

```typescript
import { Electroview } from "electrobun/view";
import { SteamBun } from "@thani-sh/steam-bun/web";

// 1. Spread SteamBun message handlers when defining the Electroview RPC
const rpc = Electroview.defineRPC({
  handlers: {
    requests: {
      ...SteamBun.requests,
    },
    messages: {
      ...SteamBun.messages, // Enables message handling for SteamBun
    },
  },
});

const electroview = new Electroview({ rpc });

// 2. Bind SteamBun to the electroview instance
SteamBun.bind(electroview);
```

---

## Runtime Schema Validation

SteamBun relies on [Zod](https://zod.dev) to validate the shape of data sent through streams at runtime.

### How Validation Works

1. **Input Validation (Client-Side)**: When writing a chunk to the client-side `tx` (WritableStream), Zod parses the value using `methodDef.input`. If validation fails, an error is immediately thrown on the client before transmitting the data.
2. **Input Validation (Server-Side)**: If the backend receives an input chunk, it parses it using `methodDef.input` before enqueuing it in the backend `input` stream. If it fails validation, an error is sent back to the webview, closing the stream with a validation error.
3. **Output Validation (Server-Side)**: Values produced by the server handler are parsed via `methodDef.output` before transmission. If validation fails, a validation error is propagated to the webview.
4. **Output Validation (Client-Side)**: The client validates received chunks against `methodDef.output` before enqueuing them to `rx`.

### Error Propagation

If Zod validation fails, the stream is terminated, and a standard `ZodError` or error event is raised on the readable stream.

---

## Stream Control and Lifecycle

SteamBun maps RPC streams directly to standard Web Streams. You can manage the lifecycle of a stream using standard Web API conventions.

### Closing a Stream

- **From the Client**: Calling `await writer.close()` on the client's `tx` writer signals to the server that no more inputs will be sent. The server's `input` stream will end (`done: true`), allowing the server to clean up or close the output stream.
- **From the Server**: The server handler closes the client's output by calling `controller.close()` on its return stream controller. This resolves the client's `rx` loop.

### Stream Cancellation

- If a client stops consuming the stream early, calling `await rx.cancel()` notifies the server to terminate the handler. The server's output reader is cancelled, and the `input` stream controller is closed to free resources.

### Error Handling

- **From the Client**: Calling `writer.abort(reason)` notifies the server of a client-side exception.
- **From the Server**: If the server handler encounters an error, it can propagate it by calling `controller.error(err)`. This terminates the client's `rx` stream and throws an error inside the client's `for await` loop.

---

## Configuration Options

Both the Bun (server) and Web (client) singletons support configuration options via `.configure()`.

```typescript
// Enable verbose debug logging in console
SteamBun.configure({
  debug: true,
});
```

When `debug` is enabled, SteamBun logs all incoming and outgoing protocol messages with prefixes:

- `[SteamBun Server] Received message: ...`
- `[SteamBun Client] Sending message: ...`

---

## API Reference

### Global Functions

#### `method<I, O>(name: string, config: { input: I; output: O }): MethodDef<I, O>`

Defines a streaming RPC method.

- **`name`**: A unique string identifying the method.
- **`input`**: A Zod schema representing the input type (client-to-server).
- **`output`**: A Zod schema representing the output type (server-to-client).

---

### Server Class (`SteamBun` in `@thani-sh/steam-bun/bun`)

#### `.register<I, O>(methodDef, handler)`

Registers the server-side implementation for a method.

- **`methodDef`**: The `MethodDef` returned by `method()`.
- **`handler`**: A function `(input: ReadableStream<I>) => ReadableStream<O>`. Receives a stream of client inputs and must return a stream of server outputs.

#### `.bind(webview)`

Binds SteamBun to the Electrobun `BrowserView` instance.

#### `.configure(config)`

Updates configurations.

- **`config`**: `{ debug?: boolean }`

#### `.requests` / `.messages`

Getters to spread into your Electrobun `defineRPC` call.

---

### Client Class (`SteamBun` in `@thani-sh/steam-bun/web`)

#### `.create<I, O>(methodDef)`

Initiates a new streaming connection to the server.

- **`methodDef`**: The `MethodDef` returned by `method()`.
- **Returns**: `{ rx: ReadableStream<O>, tx: WritableStream<I> }`
  - **`rx`**: A readable stream of outputs from the server.
  - **`tx`**: A writable stream to send inputs to the server.

#### `.bind(electroview)`

Binds SteamBun to the Electrobun `Electroview` instance.

#### `.configure(config)`

Updates configurations.

- **`config`**: `{ debug?: boolean }`

#### `.requests` / `.messages`

Getters to spread into your Electrobun `defineRPC` call.
