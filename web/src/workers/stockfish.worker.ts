/**
 * Web Worker hosting the Stockfish Wasm module.
 *
 * Protocol:
 *   main  → worker:  UCI command string  (e.g. "go movetime 1000")
 *   worker → main:   UCI output line     (e.g. "bestmove e2e4 ponder d7d5")
 *
 * Special output posted to main thread:
 *   "stockfish-ready"  — engine initialised, uciok received, ready for commands
 */

// Emscripten Stockfish factory — loaded via importScripts from /public/stockfish.js
declare function Stockfish(opts: {
  print: (line: string) => void;
  printErr: (line: string) => void;
  locateFile?: (path: string, prefix: string) => string;
}): Promise<{
  cwrap: (name: string, ret: string | null, argTypes: string[]) => (...args: unknown[]) => unknown;
  FS: { writeFile: (path: string, data: Uint8Array) => void };
}>;

let sfCmd: ((cmd: string) => void) | null = null;
let engineReady = false;
const pendingCmds: string[] = [];

function send(cmd: string) {
  if (sfCmd) sfCmd(cmd);
}

// Buffer commands received before the engine is ready.
self.onmessage = (e: MessageEvent<string>) => {
  if (engineReady) {
    send(e.data);
  } else {
    pendingCmds.push(e.data);
  }
};

(async () => {
  // Load Emscripten glue from /public (served as a static asset).
  importScripts('/stockfish.js');

  const mod = await Stockfish({
    print(line: string) {
      self.postMessage(line);

      // Detect the engine handshake and flush the pending queue.
      if (!engineReady && line === 'uciok') {
        engineReady = true;
        self.postMessage('stockfish-ready');
        for (const cmd of pendingCmds.splice(0)) {
          sfCmd!(cmd);
        }
        // Re-install the live message handler.
        self.onmessage = (e: MessageEvent<string>) => sfCmd!(e.data);
      }
    },
    printErr(line: string) {
      console.warn('[stockfish]', line);
    },
    // Emscripten resolves file paths relative to the worker's URL, which Vite
    // maps to an internal build URL.  Force all generated assets to the public root.
    locateFile(path: string) {
      return '/' + path;
    },
  });

  // Load NNUE network files into the virtual filesystem before init.
  // The engine's load_networks() will find them there on startup.
  self.postMessage('stockfish-loading-networks');
  const nnueFiles = ['nn-1c0000000000.nnue', 'nn-37f18f62d772.nnue'];
  await Promise.all(
    nnueFiles.map(async (name) => {
      try {
        const resp = await fetch('/' + name);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = new Uint8Array(await resp.arrayBuffer());
        mod.FS.writeFile('/' + name, data);
      } catch (e) {
        console.warn(`[sf worker] could not load ${name}:`, e);
      }
    }),
  );

  const stockfish_init = mod.cwrap('stockfish_init', null, []) as () => void;
  sfCmd = mod.cwrap('stockfish_cmd', null, ['string']) as (cmd: string) => void;

  stockfish_init();

  // Force-load networks from the absolute paths we wrote above.
  // load_networks() during init uses a CWD-relative path and may miss them.
  sfCmd('setoption name EvalFile value /nn-1c0000000000.nnue');
  sfCmd('setoption name EvalFileSmall value /nn-37f18f62d772.nnue');

  sfCmd('uci');
})();
