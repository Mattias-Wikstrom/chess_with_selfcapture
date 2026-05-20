#!/usr/bin/env bash
# Build the self-capture Stockfish engine as WebAssembly.
#
# Prerequisites:
#   - Emscripten SDK installed at ~/emsdk  (already done)
#   - Python 3.10 via pyenv                (already done)
#   - Run from the repo root
#
# Output:
#   web/public/stockfish.js   — Emscripten JS glue (loaded by the Web Worker)
#   web/public/stockfish.wasm — WebAssembly binary
#
# The build uses:
#   - USE_PTHREADS: Stockfish's search thread pool runs as Emscripten pthreads
#     (each becomes a nested Web Worker).  The main UI must be served with the
#     headers:
#         Cross-Origin-Opener-Policy: same-origin
#         Cross-Origin-Embedder-Policy: require-corp
#     The Vite dev server sets these automatically (see web/vite.config.ts).
#   - NNUE_EMBEDDING_OFF: skips embedding the ~50 MB NNUE weight file so the
#     binary stays small.  The engine still plays chess; evaluation falls back
#     to classical heuristics (weaker, but fine for casual play and correct for
#     legal-move generation which the UI depends on).

set -euo pipefail

# Source Emscripten, then override EMSDK_PYTHON with the pyenv Python 3.10
# (emsdk_env.sh clears EMSDK_PYTHON so we must set it afterwards).
source "${EMSDK:-$HOME/emsdk}/emsdk_env.sh"
if [ -f "$HOME/.pyenv/versions/3.10.15/bin/python3.10" ]; then
    export EMSDK_PYTHON="$HOME/.pyenv/versions/3.10.15/bin/python3.10"
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$REPO_ROOT/src"
OUT_DIR="$REPO_ROOT/web/public"

mkdir -p "$OUT_DIR"

# Source files — mirror the Makefile SRCS list, minus main.cpp/alt_main.cpp,
# plus our wasm_main.cpp entry point.
SRCS=(
    benchmark.cpp
    bitboard.cpp
    evaluate.cpp
    misc.cpp
    movegen.cpp
    movepick.cpp
    position.cpp
    search.cpp
    thread.cpp
    timeman.cpp
    tt.cpp
    uci.cpp
    ucioption.cpp
    tune.cpp
    score.cpp
    memory.cpp
    engine.cpp
    syzygy/tbprobe.cpp
    nnue/nnue_accumulator.cpp
    nnue/nnue_misc.cpp
    nnue/features/half_ka_v2_hm.cpp
    nnue/network.cpp
    wasm_main.cpp
)

# Build the absolute path list
ABS_SRCS=()
for f in "${SRCS[@]}"; do
    ABS_SRCS+=("$SRC_DIR/$f")
done

echo "Building Stockfish WASM..."

emcc \
    -O2 \
    -std=c++17 \
    -DNNUE_EMBEDDING_OFF \
    -DNDEBUG \
    -DIS_64BIT \
    -s MODULARIZE=1 \
    -s EXPORT_NAME=Stockfish \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=268435456 \
    -s STACK_SIZE=8388608 \
    -s EXPORTED_FUNCTIONS='["_stockfish_init","_stockfish_cmd","_main"]' \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","FS"]' \
    -s EXIT_RUNTIME=0 \
    -I"$SRC_DIR" \
    "${ABS_SRCS[@]}" \
    -o "$OUT_DIR/stockfish.js"

echo "Done. Output:"
echo "  $OUT_DIR/stockfish.js"
echo "  $OUT_DIR/stockfish.wasm"
