import { useState, useEffect, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';
import type { LegalMoves } from '../components/ChessBoard';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type LocalStatus = 'playing' | 'checkmate' | 'stalemate' | 'draw';

export interface CloudEngineState {
  fen: string;
  legalMoves: LegalMoves;
  lastMove: [string, string] | null;
  localStatus: LocalStatus;
  turn: 'w' | 'b';
  /** Result as determined by the engine — only set when isGameOver */
  gameResult: 'white' | 'black' | 'draw' | null;
  /** True while waiting for the cloud function to respond */
  engineLoading: boolean;
  engineError: string | null;
}

interface GetLegalMovesResult {
  legalMoves: Record<string, string[]>;
  fen: string;
  isGameOver: boolean;
  result: 'white' | 'black' | 'draw' | null;
}

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const INITIAL_STATE: CloudEngineState = {
  fen: START_FEN,
  legalMoves: new Map(),
  lastMove: null,
  localStatus: 'playing',
  turn: 'w',
  gameResult: null,
  engineLoading: true,
  engineError: null,
};

// Lazily initialised — getFunctions() is cheap but we only need one instance
let functionsInstance: ReturnType<typeof getFunctions> | null = null;
function getFunctionsInstance() {
  if (!functionsInstance) functionsInstance = getFunctions(app);
  return functionsInstance;
}

// --------------------------------------------------------------------------
// Hook
// --------------------------------------------------------------------------

/**
 * Calls the `getLegalMoves` Cloud Function whenever the move list changes.
 * Returns board state including self-capture moves (courtesy of the modified
 * Stockfish running server-side).
 */
export function useCloudEngine(moves: string[]): CloudEngineState {
  const [state, setState] = useState<CloudEngineState>(INITIAL_STATE);
  const movesKey = moves.join(',');
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (movesKey === lastKey.current) return;
    lastKey.current = movesKey;

    setState(prev => ({ ...prev, engineLoading: true, engineError: null }));

    const currentMoves = movesKey ? movesKey.split(',') : [];

    const fn = httpsCallable<{ moves: string[] }, GetLegalMovesResult>(
      getFunctionsInstance(),
      'getLegalMoves',
    );

    fn({ moves: currentMoves })
      .then(({ data }) => {
        const legalMoves: LegalMoves = new Map(Object.entries(data.legalMoves));

        const lastMove: [string, string] | null =
          currentMoves.length > 0
            ? [
                currentMoves[currentMoves.length - 1].slice(0, 2),
                currentMoves[currentMoves.length - 1].slice(2, 4),
              ]
            : null;

        const turn = data.fen.split(' ')[1] as 'w' | 'b';

        let localStatus: LocalStatus = 'playing';
        if (data.isGameOver) {
          localStatus = (data.result === 'white' || data.result === 'black')
            ? 'checkmate'
            : 'stalemate';
        }

        setState({
          fen: data.fen,
          legalMoves,
          lastMove,
          localStatus,
          turn,
          gameResult: data.result,
          engineLoading: false,
          engineError: null,
        });
      })
      .catch((err: Error) => {
        console.error('[useCloudEngine]', err);
        setState(prev => ({
          ...prev,
          engineLoading: false,
          engineError: err.message,
        }));
      });
  }, [movesKey]);

  return state;
}
