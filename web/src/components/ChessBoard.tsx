import React, { useCallback, useState } from 'react';
import styles from './ChessBoard.module.css';

// --------------------------------------------------------------------------
// FEN parsing helpers
// --------------------------------------------------------------------------

/** Parse a FEN board section into an 8×8 array [rank0..rank7][file0..file7].
 *  rank 0 = rank 1 (bottom), rank 7 = rank 8 (top). */
export function parseFenBoard(fen: string): (string | null)[][] {
  const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  const [position] = fen.split(' ');
  const rows = position.split('/');
  // rows[0] = rank 8 (top), rows[7] = rank 1 (bottom)
  rows.forEach((row, rowIdx) => {
    let fileIdx = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        fileIdx += parseInt(ch, 10);
      } else {
        const rank = 7 - rowIdx; // rank 0 = rank-1
        board[rank][fileIdx] = ch;
        fileIdx++;
      }
    }
  });
  return board;
}

/** Return the side to move from the FEN ('w' or 'b'). */
export function fenSideToMove(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

// Map FEN piece character → SVG filename base (e.g. 'K' → 'wK', 'k' → 'bK')
function pieceImage(piece: string): string {
  const upper = piece.toUpperCase();
  const color = piece === upper ? 'w' : 'b';
  return `${import.meta.env.BASE_URL}pieces/${color}${upper}.svg`;
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Map from UCI from-square (e.g. "e2") to list of UCI to-squares. */
export type LegalMoves = Map<string, string[]>;

export interface Props {
  fen: string;
  legalMoves: LegalMoves;
  /** Last move [fromSq, toSq] for highlighting, or null. */
  lastMove: [string, string] | null;
  /** Called when the user completes a move; receives UCI move string, e.g. "e2e4". */
  onMove: (uciMove: string) => void;
  /** Flip the board so Black plays at the bottom. */
  flipped?: boolean;
}

// --------------------------------------------------------------------------
// Coordinate helpers
// --------------------------------------------------------------------------

function sqToFileRank(sq: string): [number, number] {
  return [sq.charCodeAt(0) - 97, parseInt(sq[1], 10) - 1];
}

function fileRankToSq(file: number, rank: number): string {
  return String.fromCharCode(97 + file) + String(rank + 1);
}

function pieceColor(piece: string): 'w' | 'b' {
  return piece === piece.toUpperCase() ? 'w' : 'b';
}

function pieceAtSquare(board: (string | null)[][], sq: string): string | null {
  const [file, rank] = sqToFileRank(sq);
  return board[rank]?.[file] ?? null;
}

function isSelfCapture(board: (string | null)[][], fromSq: string, toSq: string): boolean {
  const movingPiece = pieceAtSquare(board, fromSq);
  const targetPiece = pieceAtSquare(board, toSq);

  return movingPiece !== null
    && targetPiece !== null
    && pieceColor(movingPiece) === pieceColor(targetPiece);
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'];

export default function ChessBoard({ fen, legalMoves, lastMove, onMove, flipped = false }: Props) {
  const board = parseFenBoard(fen);

  const [selected, setSelected] = useState<string | null>(null);

  const displayFiles = flipped ? [...FILES].reverse() : FILES;
  const displayRanks = flipped ? RANKS : [...RANKS].reverse();

  const handleSquareClick = useCallback(
    (sq: string) => {
      if (selected === null) {
        // First click: select the piece if it has legal moves
        if (legalMoves.has(sq)) {
          setSelected(sq);
        }
      } else {
        if (sq === selected) {
          // Deselect
          setSelected(null);
          return;
        }
        const targets = legalMoves.get(selected) ?? [];
        // targets are full UCI strings like "e2e4" or "e7e8q"
        const promoTargets = targets.filter(
          (t) => t.length === 5 && t.slice(0, 4) === selected + sq,
        );
        if (promoTargets.length > 0) {
          if (isSelfCapture(board, selected, sq)
            && !window.confirm('Capture your own piece on this square?')) {
            return;
          }

          // Auto-promote to queen
          onMove(promoTargets.find((t) => t.endsWith('q')) ?? promoTargets[0]);
          setSelected(null);
        } else if (targets.some((t) => t.slice(2, 4) === sq)) {
          if (isSelfCapture(board, selected, sq)
            && !window.confirm('Capture your own piece on this square?')) {
            return;
          }

          onMove(selected + sq);
          setSelected(null);
        } else if (legalMoves.has(sq)) {
          // Clicked a different piece that has moves — reselect
          setSelected(sq);
        } else {
          setSelected(null);
        }
      }
    },
    [selected, legalMoves, onMove, board],
  );

  const [lastFrom, lastTo] = lastMove ?? [null, null];

  return (
    <div className={styles.board} role="grid" aria-label="Chess board">
      {displayRanks.map((rankLabel) => {
        const rank = parseInt(rankLabel, 10) - 1;
        return displayFiles.map((fileLabel) => {
          const file = fileLabel.charCodeAt(0) - 97;
          const sq = fileRankToSq(file, rank);
          const piece = board[rank][file];
          const isLight = (file + rank) % 2 === 1;
          const isSelected = selected === sq;
          const isTarget = selected !== null && (legalMoves.get(selected) ?? []).some(
            (t) => t.slice(2, 4) === sq,
          );
          const isLastMove = sq === lastFrom || sq === lastTo;

          return (
            <div
              key={sq}
              className={[
                styles.square,
                isLight ? styles.light : styles.dark,
                isSelected ? styles.selected : '',
                isTarget ? styles.target : '',
                isLastMove ? styles.lastMove : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleSquareClick(sq)}
              role="gridcell"
              aria-label={sq}
            >
              {piece && (
                <img
                  src={pieceImage(piece)}
                  alt={piece}
                  className={styles.piece}
                  draggable={false}
                />
              )}
              {isTarget && !piece && <div className={styles.dot} />}
            </div>
          );
        });
      })}
    </div>
  );
}
