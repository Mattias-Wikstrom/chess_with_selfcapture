/*
  Emscripten entry point for the self-capture chess engine.
  Exposes two C functions to JavaScript:
    stockfish_init()       — initialise the engine (call once)
    stockfish_cmd(cmd)     — dispatch a single UCI command

  stdout is routed via Module.print so the JS Worker receives each
  output line as a postMessage'd string.

  Build with scripts/build_wasm.sh.
*/

#include <emscripten/emscripten.h>

#include <cstring>
#include <string>

#include "bitboard.h"
#include "misc.h"
#include "position.h"
#include "tune.h"
#include "uci.h"

using namespace Stockfish;

static UCIEngine* g_uci = nullptr;

extern "C" {

EMSCRIPTEN_KEEPALIVE
void stockfish_init() {
    fprintf(stderr, "[sf] stockfish_init: start\n"); fflush(stderr);
    static char name[] = "stockfish";
    static char* argv[]  = {name, nullptr};
    int          argc    = 1;

    Bitboards::init();
    fprintf(stderr, "[sf] Bitboards done\n"); fflush(stderr);
    Position::init();
    fprintf(stderr, "[sf] Position done\n"); fflush(stderr);

    g_uci = new UCIEngine(argc, argv);
    fprintf(stderr, "[sf] UCIEngine created\n"); fflush(stderr);
    Tune::init(g_uci->engine_options());
    fprintf(stderr, "[sf] Tune done\n"); fflush(stderr);
}

EMSCRIPTEN_KEEPALIVE
void stockfish_cmd(const char* cmd) {
    fprintf(stderr, "[sf] stockfish_cmd: %s\n", cmd); fflush(stderr);
    if (!g_uci) { fprintf(stderr, "[sf] g_uci is null!\n"); fflush(stderr); return; }
    fprintf(stderr, "[sf] calling dispatch\n"); fflush(stderr);
    try {
        g_uci->dispatch(std::string(cmd));
    } catch (const std::exception& e) {
        fprintf(stderr, "[sf] dispatch threw: %s\n", e.what()); fflush(stderr);
    } catch (...) {
        fprintf(stderr, "[sf] dispatch threw unknown exception\n"); fflush(stderr);
    }
    fprintf(stderr, "[sf] stockfish_cmd: done\n"); fflush(stderr);
}

}  // extern "C"

// No main() — JS calls stockfish_init() then stockfish_cmd() directly.
// Emscripten requires a main; provide a no-op so the module loads cleanly.
int main() { return 0; }
