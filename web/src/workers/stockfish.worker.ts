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

  console.log('[sf worker] module ready, cwrapping…');
  const stockfish_init = mod.cwrap('stockfish_init', null, []) as () => void;
  sfCmd = mod.cwrap('stockfish_cmd', null, ['string']) as (cmd: string) => void;

  console.log('[sf worker] calling stockfish_init…');
  stockfish_init();
  console.log('[sf worker] stockfish_init returned, sending uci…');
  sfCmd('uci');
  console.log('[sf worker] uci sent');
})();
