import { useCallback, useEffect, useRef, useState } from 'react';
import ChessBoard, { fenSideToMove, LegalMoves } from './components/ChessBoard';
import { useStockfish } from './hooks/useStockfish';
import './App.css';

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

type GameMode = 'white-vs-engine' | 'black-vs-engine' | 'pvp' | 'eve';
type GameStatus = 'playing' | 'checkmate' | 'stalemate' | 'draw';

// --------------------------------------------------------------------------
// Perft-1 output parser
// "a2a3: 1\na2a4: 1\n...\nNodes searched: 20"
// --------------------------------------------------------------------------

function parsePerft1(lines: string[]): LegalMoves {
  const moves: LegalMoves = new Map();
  for (const line of lines) {
    const m = line.match(/^([a-h][1-8][a-h][1-8][qrbnQRBN]?): \d+$/);
    if (!m) continue;
    const uci = m[1].toLowerCase();
    const from = uci.slice(0, 2);
    const existing = moves.get(from) ?? [];
    existing.push(uci);
    moves.set(from, existing);
  }
  return moves;
}

// --------------------------------------------------------------------------
// App
// --------------------------------------------------------------------------

export default function App() {
  const { isReady, isLoadingNetworks, send, subscribe } = useStockfish();

  const [mode, setMode] = useState<GameMode>('white-vs-engine');
  const [fen, setFen] = useState(START_FEN);
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [legalMoves, setLegalMoves] = useState<LegalMoves>(new Map());
  const [lastMove, setLastMove] = useState<[string, string] | null>(null);
  const [status, setStatus] = useState<GameStatus>('playing');
  const [statusMsg, setStatusMsg] = useState('White to move');
  const [fenInput, setFenInput] = useState('');
  const [engineThinking, setEngineThinking] = useState(false);

  // We accumulate perft output lines until we see "Nodes searched:"
  const perftLinesRef = useRef<string[]>([]);
  const awaitingPerft = useRef(false);
  const awaitingBestmove = useRef(false);
  const awaitingGameOver = useRef(false); // set when perft returns 0 — waiting for "d" output
  const latestFen = useRef(START_FEN);   // mirrors fen state but readable inside callbacks

  // The FEN at the time we last requested perft/bestmove (for matching responses)
  const pendingFen = useRef(START_FEN);
  const pendingHistory = useRef<string[]>([]);

  // --------------------------------------------------------------------------
  // Build UCI position command from current state
  // --------------------------------------------------------------------------
  function buildPositionCmd(history: string[]): string {
    if (history.length === 0) return 'position startpos';
    return `position startpos moves ${history.join(' ')}`;
  }

  // --------------------------------------------------------------------------
  // Request legal moves via "go perft 1"
  // --------------------------------------------------------------------------
  const requestLegalMoves = useCallback(
    (history: string[]) => {
      perftLinesRef.current = [];
      awaitingPerft.current = true;
      pendingHistory.current = history;
      send(buildPositionCmd(history));
      send('go perft 1');
    },
    [send],
  );

  // --------------------------------------------------------------------------
  // Request engine best move via "go depth 12"
  // --------------------------------------------------------------------------
  const requestEngineMove = useCallback(
    (history: string[]) => {
      setEngineThinking(true);
      awaitingBestmove.current = true;
      send(buildPositionCmd(history));
      send('go depth 12');
    },
    [send],
  );

  // --------------------------------------------------------------------------
  // Determine whose turn it is and whether the engine should play
  // --------------------------------------------------------------------------
  function engineShouldPlay(side: 'w' | 'b', m: GameMode): boolean {
    if (m === 'pvp') return false;
    if (m === 'eve') return true;
    if (m === 'white-vs-engine') return side === 'b';
    if (m === 'black-vs-engine') return side === 'w';
    return false;
  }

  // --------------------------------------------------------------------------
  // Handle a completed move (human or engine)
  // --------------------------------------------------------------------------
  const applyMove = useCallback(
    (uciMove: string, currentHistory: string[], currentFen: string) => {
      const newHistory = [...currentHistory, uciMove];
      const from = uciMove.slice(0, 2) as string;
      const to = uciMove.slice(2, 4) as string;
      setLastMove([from, to]);
      setMoveHistory(newHistory);
      pendingHistory.current = newHistory;

      // Request legal moves in the new position (also gives us the FEN via perft)
      perftLinesRef.current = [];
      awaitingPerft.current = true;
      send(buildPositionCmd(newHistory));
      send('go perft 1');
      // We'll update fen & status once perft output arrives
      pendingFen.current = currentFen; // will be updated from "d" if needed
    },
    [send],
  );

  // --------------------------------------------------------------------------
  // Subscribe to Stockfish output
  // --------------------------------------------------------------------------
  useEffect(() => {
    return subscribe((line) => {
      // --- Perft output ---
      if (awaitingPerft.current) {
        if (line.startsWith('Nodes searched:')) {
          awaitingPerft.current = false;
          const moves = parsePerft1(perftLinesRef.current);
          const nodeCount = parseInt(line.split(':')[1].trim(), 10);

          if (nodeCount === 0) {
            // No legal moves — checkmate or stalemate.
            // Send "d" to get the final FEN and Checkers line to distinguish the two.
            setLegalMoves(new Map());
            setEngineThinking(false);
            awaitingGameOver.current = true;
            send(buildPositionCmd(pendingHistory.current));
            send('d');
          } else {
            setLegalMoves(moves);
            setStatus('playing');

            // Request the board FEN via "d" to update our fen state
            send(buildPositionCmd(pendingHistory.current));
            send('d');
          }

          // After legal moves, trigger engine if needed
          // (We do it AFTER we get the node count so we know the game isn't over)
          if (nodeCount > 0) {
            // We handle engine triggering after we get the new FEN (in the "d" handler)
          }
        } else {
          perftLinesRef.current.push(line);
        }
      }

      // --- "d" command FEN line ---
      if (line.startsWith('Fen: ')) {
        const newFen = line.slice(5).trim();
        latestFen.current = newFen;
        setFen(newFen);

        if (!awaitingGameOver.current) {
          const side = fenSideToMove(newFen);
          const turnStr = side === 'w' ? 'White' : 'Black';
          setStatusMsg(`${turnStr} to move`);

          if (engineShouldPlay(side, mode) && status === 'playing') {
            requestEngineMove(pendingHistory.current);
          } else {
            setEngineThinking(false);
          }
        }
      }

      // --- "d" command: detect check (appears as "Checkers: <squares>") ---
      if (line.startsWith('Checkers: ') && awaitingGameOver.current) {
        awaitingGameOver.current = false;
        const inCheck = line.trim() !== 'Checkers:';
        const loserSide = fenSideToMove(latestFen.current);
        setStatus(inCheck ? 'checkmate' : 'stalemate');
        setStatusMsg(
          inCheck
            ? `${loserSide === 'w' ? 'White' : 'Black'} is checkmated`
            : 'Stalemate — draw',
        );
      }

      // --- Best move ---
      if (awaitingBestmove.current && line.startsWith('bestmove ')) {
        awaitingBestmove.current = false;
        setEngineThinking(false);
        const parts = line.split(' ');
        const bm = parts[1];
        if (bm && bm !== '(none)') {
          applyMove(bm, pendingHistory.current, fen);
        }
      }
    });
  }, [subscribe, mode, status, fen, requestEngineMove, applyMove, send]);

  // --------------------------------------------------------------------------
  // Initialise once the engine is ready
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isReady) return;
    send('ucinewgame');
    send('setoption name Threads value 1');
    requestLegalMoves([]);
    send('position startpos');
    send('d');
  }, [isReady, requestLegalMoves, send]);

  // --------------------------------------------------------------------------
  // New game
  // --------------------------------------------------------------------------
  const handleNewGame = useCallback(() => {
    setFen(START_FEN);
    latestFen.current = START_FEN;
    setMoveHistory([]);
    pendingHistory.current = [];
    setLegalMoves(new Map());
    setLastMove(null);
    setStatus('playing');
    setStatusMsg('White to move');
    setEngineThinking(false);
    perftLinesRef.current = [];
    awaitingPerft.current = false;
    awaitingBestmove.current = false;
    awaitingGameOver.current = false;
    if (isReady) {
      send('stop');
      send('ucinewgame');
      send('setoption name Threads value 1');
      requestLegalMoves([]);
      send('position startpos');
      send('d');
    }
  }, [isReady, send, requestLegalMoves]);

  // --------------------------------------------------------------------------
  // Set position from FEN
  // --------------------------------------------------------------------------
  const handleSetPosition = useCallback(() => {
    const trimmed = fenInput.trim();
    if (!trimmed) return;
    // We can't easily "position fen ..." + keep a move history, so we reset
    // history and treat the FEN as the start.
    // Stockfish supports "position fen <FEN> moves ..." but we'd need a way to
    // convert the FEN into a startpos-relative history. Simplest: just use
    // "position fen <FEN>" and empty move history, but store the FEN as the
    // base. For this we rely on a slightly different flow.
    setFen(trimmed);
    setMoveHistory([]);
    pendingHistory.current = [];
    setLegalMoves(new Map());
    setLastMove(null);
    setStatus('playing');
    setEngineThinking(false);
    perftLinesRef.current = [];
    awaitingPerft.current = true;
    awaitingGameOver.current = false;
    send(`position fen ${trimmed}`);
    send('go perft 1');
    send(`position fen ${trimmed}`);
    send('d');
    setFenInput('');
  }, [fenInput, send]);

  // --------------------------------------------------------------------------
  // Mode change
  // --------------------------------------------------------------------------
  const handleModeChange = useCallback(
    (newMode: GameMode) => {
      setMode(newMode);
      // If engine should now play, trigger it
      if (status === 'playing') {
        const side = fenSideToMove(fen);
        if (engineShouldPlay(side, newMode)) {
          requestEngineMove(pendingHistory.current);
        }
      }
    },
    [fen, status, requestEngineMove],
  );

  // --------------------------------------------------------------------------
  // Human move
  // --------------------------------------------------------------------------
  const handleMove = useCallback(
    (uciMove: string) => {
      if (status !== 'playing' || engineThinking) return;
      applyMove(uciMove, pendingHistory.current, fen);
    },
    [status, engineThinking, applyMove, fen],
  );

  const flipped = mode === 'black-vs-engine';
  const side = fenSideToMove(fen);

  return (
    <div className="app">
      <h1>Self-Capture Chess</h1>

      <div className="controls">
        <div className="control-row">
          <label htmlFor="mode-select">Mode:</label>
          <select
            id="mode-select"
            value={mode}
            onChange={(e) => handleModeChange(e.target.value as GameMode)}
          >
            <option value="white-vs-engine">Play as White vs Engine</option>
            <option value="black-vs-engine">Play as Black vs Engine</option>
            <option value="pvp">Player vs Player</option>
            <option value="eve">Engine vs Engine</option>
          </select>
        </div>

        <div className="control-row">
          <button onClick={handleNewGame}>New Game</button>
        </div>

        <div className="control-row fen-row">
          <input
            type="text"
            placeholder="Paste FEN to set position…"
            value={fenInput}
            onChange={(e) => setFenInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSetPosition()}
          />
          <button onClick={handleSetPosition}>Set Position</button>
        </div>

        <div className="status-row">
          {!isReady && !isLoadingNetworks && <span className="loading">Loading engine…</span>}
          {isLoadingNetworks && <span className="loading">Loading neural network…</span>}
          {isReady && engineThinking && <span className="thinking">Engine thinking…</span>}
          {isReady && !engineThinking && (
            <span className={status !== 'playing' ? 'gameover' : ''}>{statusMsg}</span>
          )}
        </div>
      </div>

      <ChessBoard
        fen={fen}
        legalMoves={status === 'playing' && !engineThinking && !engineShouldPlay(side, mode) ? legalMoves : new Map()}
        lastMove={lastMove}
        onMove={handleMove}
        flipped={flipped}
      />
    </div>
  );
}
