import { BrowserWindow, BrowserView, Updater } from "electrobun/bun";
import { SteamBun, createAsyncIterable } from "steam-bun/bun";
import { Stopwatch } from "../shared/stopwatch";
import { type WebviewRPCType } from "../shared/types";

// Register the Stopwatch streaming handler
SteamBun.register(Stopwatch, async function* (events) {
  const outputQueue = createAsyncIterable<{ time: number }>();
  let time = 0;
  let intervalId: Timer | null = null;

  // Process client commands in a background task
  (async () => {
    try {
      for await (const event of events) {
        if (event.type === "start") {
          if (!intervalId) {
            intervalId = setInterval(() => {
              time += 10; // Increment by 10ms (1 centisecond)
              outputQueue.push({ time });
            }, 10);
          }
        } else if (event.type === "stop") {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        } else if (event.type === "reset") {
          time = 0;
          outputQueue.push({ time });
        }
      }
      outputQueue.complete();
    } catch (err) {
      outputQueue.reject(err);
    } finally {
      if (intervalId) {
        clearInterval(intervalId);
      }
    }
  })();

  try {
    for await (const tick of outputQueue.generator) {
      yield tick;
    }
  } finally {
    // Clean up interval timer if the client cancels the stream
    if (intervalId) {
      clearInterval(intervalId);
    }
  }
});

// Configure Electrobun and local server options
const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log(
        "Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
      );
    }
  }
  return "views://mainview/index.html";
}

const url = await getMainViewUrl();

// Configure SteamBun server
SteamBun.configure({ debug: true });

const myWebviewRPC = BrowserView.defineRPC<WebviewRPCType>({
  handlers: {
    requests: {
      ...SteamBun.requests,
    },
    messages: {
      ...SteamBun.messages,
      closeWindow: () => {
        mainWindow.close();
      },
    },
  },
});

const mainWindow = new BrowserWindow({
  title: "SteamBun Stopwatch 🥟",
  url,
  frame: {
    width: 180,
    height: 180,
    x: 400,
    y: 200,
  },
  // Make the window borderless and transparent
  styleMask: {
    Borderless: true,
    Titled: false,
    Closable: true,
    Resizable: true,
    Miniaturizable: true,
  },
  transparent: true,
  rpc: myWebviewRPC,
});

// Bind SteamBun to the mainWindow's default defaultWebview
SteamBun.bind(mainWindow.webview);

console.log("SteamBun Stopwatch server started!");
