# SteamBun

Bi-directional streaming RPC for Electrobun using Async Generators and Zod validation.

## Installation

```bash
bun add @thani-sh/steam-bun
```

## Setup

### 1. Define Shared Schema

Create a shared file for your RPC methods:

```ts
// shared/methods.ts
import { z } from 'zod';
import { method } from '@thani-sh/steam-bun';

export const Stopwatch = method('stopwatch', {
  input: z.object({ type: z.enum(['start', 'stop', 'reset']) }),
  output: z.object({ time: z.number() }),
});
```

### 2. Server (Bun) Setup

```ts
import { BrowserView } from 'electrobun/bun';
import { SteamBun } from '@thani-sh/steam-bun/bun';
import { Stopwatch } from './shared/methods';

// Register the handler
SteamBun.register(Stopwatch, async* (events) => {
  for await (const event of events) {
    if (event.type === 'start') {
      // ... process start
    } else if (event.type === 'stop') {
      // ... process stop
    } else if (event.type === 'reset') {
      // ... process reset
    }
  }
});

// Configure SteamBun
SteamBun.configure({ debug: true });

// Configure Electrobun RPC
const myWebviewRPC = BrowserView.defineRPC({
  handlers: {
    requests: {
      ...SteamBun.requests,
    },
    messages: {
      ...SteamBun.messages,
    },
  }
});

const webview = new BrowserView({
  url: 'views://main/index.html',
  rpc: myWebviewRPC
});

// Bind SteamBun to this webview
SteamBun.bind(webview);
```

### 3. Client (Web) Setup

```ts
import { Electroview } from 'electrobun/view';
import { SteamBun } from '@thani-sh/steam-bun/web';
import { Stopwatch } from './shared/methods';

// Configure SteamBun
SteamBun.configure({ debug: true });

// Configure Electrobun RPC
const rpc = Electroview.defineRPC({
  handlers: {
    requests: {
      ...SteamBun.requests,
    },
    messages: {
      ...SteamBun.messages,
    },
  }
});

const electroview = new Electroview({ rpc });

// Bind SteamBun to this electroview
SteamBun.bind(electroview);

// --- Usage ---

const stopwatch = SteamBun.create(Stopwatch);

// Consume server outputs
(async () => {
  try {
    for await (const event of stopwatch.stream()) {
      console.log('Stopwatch time:', event.time);
    }
  } catch (err) {
    console.error('Stopwatch error:', err);
  }
})();

// Send inputs to server
(async () => {
  stopwatch.call({ type: 'start' });
  await new Promise(r => setTimeout(r, 5000));
  stopwatch.call({ type: 'reset' });
  await new Promise(r => setTimeout(r, 5000));
  stopwatch.call({ type: 'stop' });
})();
```
