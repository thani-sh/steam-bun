import "./style.css";
import { Electroview } from "electrobun/view";
import { SteamBun } from "@thani-sh/steam-bun/web";
import { Stopwatch as StopwatchMethod } from "../shared/stopwatch";
import { type WebviewRPCType } from "../shared/types";

SteamBun.configure({ debug: true });

// Initialize Electrobun RPC
const rpc = Electroview.defineRPC<WebviewRPCType>({
  handlers: {
    requests: {
      ...SteamBun.requests,
    },
    messages: {
      ...SteamBun.messages,
    },
  },
});

const electroview = new Electroview({ rpc });
SteamBun.bind(electroview);

// Create the SteamBun stopwatch client
const { rx, tx } = SteamBun.create(StopwatchMethod);
const writer = tx.getWriter();

const app = document.getElementById("app")!;

// Application State
let status: "idle" | "running" | "paused" = "idle";
let currentTime = 0;
let laps: number[] = [];

/**
 * formatTime formats milliseconds into MM:SS.CC (Minutes, Seconds, Centiseconds).
 */
function formatTime(ms: number): string {
  const centiseconds = Math.floor((ms % 1000) / 10);
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor(ms / 60000);

  const pad = (num: number) => num.toString().padStart(2, "0");
  return `${pad(minutes)}:${pad(seconds)}.${pad(centiseconds)}`;
}

/**
 * render renders the premium borderless UI directly into the main viewport.
 */
function render(): void {
  const isIdle = status === "idle";
  const isRunning = status === "running";
  const isPaused = status === "paused";

  const startButtonText = isRunning ? "Stop" : isPaused ? "Resume" : "Start";
  const startButtonClass = isRunning
    ? "bg-rose-600 hover:bg-rose-700"
    : "bg-cyan-600 hover:bg-cyan-700";

  const statusColorClass = isRunning
    ? "text-cyan-500"
    : isPaused
      ? "text-amber-500"
      : "text-slate-500";

  // Render direct main layout filling the window.
  // We apply the electrobun-webkit-app-region-drag class to the main panel so users can drag the window anywhere on the background.
  app.innerHTML = `
    <main class="w-full h-full bg-slate-950 border border-slate-800/80 rounded-2xl p-4 flex flex-col items-center justify-between font-sans relative overflow-hidden select-none electrobun-webkit-app-region-drag">

      <!-- Close Button (Window Control) -->
      <button id="close-btn" class="absolute top-1 right-2 text-slate-500 hover:text-rose-500 transition-all font-sans font-bold text-xs p-1 electrobun-webkit-app-region-no-drag cursor-pointer">
        ✕
      </button>

      <!-- Time & Status Display -->
      <div class="flex flex-col items-center justify-center flex-1 mt-4">
        <div id="time-display" class="text-2xl font-mono font-bold tracking-tight text-white tabular-nums">
          ${formatTime(currentTime)}
        </div>
        <div id="status-label" class="text-[9px] font-bold tracking-widest uppercase mt-0.5 ${statusColorClass}">
          ${status}
        </div>
      </div>

      <!-- Actions (Excluded from drag) -->
      <div class="flex gap-2 w-full mt-3 electrobun-webkit-app-region-no-drag">
        <button id="reset-btn"
          class="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-300 font-semibold rounded-lg text-xs transition-all active:scale-95 cursor-pointer"
          ${isIdle ? "disabled" : ""}>
          Reset
        </button>

        <button id="start-btn"
          class="flex-1 py-1.5 text-white font-semibold rounded-lg text-xs transition-all active:scale-95 cursor-pointer ${startButtonClass}">
          ${startButtonText}
        </button>
      </div>

    </main>
  `;

  // Attach Event Listeners
  document.getElementById("start-btn")!.addEventListener("click", () => {
    if (status === "running") {
      writer.write({ type: "stop" });
      status = "paused";
    } else {
      writer.write({ type: "start" });
      status = "running";
    }
    render();
  });

  document.getElementById("reset-btn")!.addEventListener("click", () => {
    writer.write({ type: "reset" });
    currentTime = 0;
    render();
  });

  document.getElementById("close-btn")!.addEventListener("click", () => {
    electroview.rpc?.send.closeWindow({});
  });
}

// Subscribe to streaming ticks from Bun backend
(async () => {
  try {
    for await (const event of rx) {
      currentTime = event.time;
      const display = document.getElementById("time-display");
      if (display) {
        display.innerText = formatTime(currentTime);
      } else {
        render();
      }
    }
  } catch (err) {
    console.error("Stopwatch stream error:", err);
  }
})();

// Initial render
render();
