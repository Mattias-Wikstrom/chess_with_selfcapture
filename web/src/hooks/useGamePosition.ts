import { useMemo } from 'react';
import { Chess } from 'chess.js';
import type { LegalMoves } from '../components/ChessBoard';

export type LocalStatus = 'playing' | 'checkmate' | 'stalemate' | 'draw';

export interface GamePosition {
  fen: string;
  legalMoves: LegalMoves;
  lastMove: [string, string] | null;
  localStatus: LocalStatus;
  /** Side to move: 'w' or 'b' */
  turn: 'w' | 'b';
}

/**
 * Derives the full board state from a list of UCI move strings.
 * Runs synchronously — no engine, no workers.
 *
 * Note: standard chess rules only for now (self-capture support
 * will be added when the server-side engine is ready).
 */
export function useGamePosition(moves: string[]): GamePosition {
  const movesKey = moves.join(',');

  return useMemo(() => {
    const chess = new Chess();

    for (const uci of moves) {
      const from = uci.slice(0, 2);
      const to   = uci.slice(2, 4);
      const promotion = uci[4] as 'q' | 'r' | 'b' | 'n' | undefined;
      try {
        chess.move({ from, to, promotion });
      } catch {
        // Skip invalid moves (shouldn't happen in normal play)
      }
    }

    const fen = chess.fen();
    const turn = chess.turn();

    // Build legal-moves map (from-square → list of UCI destinations)
    const legalMoves: LegalMoves = new Map();
    for (const m of chess.moves({ verbose: true })) {
      const uci = m.from + m.to + (m.promotion ?? '');
      const list = legalMoves.get(m.from) ?? [];
      list.push(uci);
      legalMoves.set(m.from, list);
    }

    // Last move highlight
    const lastMove: [string, string] | null =
      moves.length > 0
        ? [moves[moves.length - 1].slice(0, 2), moves[moves.length - 1].slice(2, 4)]
        : null;

    // Game-over detection
    let localStatus: LocalStatus = 'playing';
    if (chess.isCheckmate()) localStatus = 'checkmate';
    else if (chess.isStalemate()) localStatus = 'stalemate';
    else if (chess.isDraw()) localStatus = 'draw';

    return { fen, legalMoves, lastMove, localStatus, turn };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movesKey]);
}
