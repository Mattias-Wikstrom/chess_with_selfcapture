import { useState, useEffect, useCallback } from 'react';
import {
  doc, onSnapshot, runTransaction, updateDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { OnlineGame, GameResult } from '../types';

function toMillis(v: unknown): number {
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === 'number') return v;
  return 0;
}

export function useOnlineGame(gameId: string) {
  const [game, setGame] = useState<OnlineGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      doc(db, 'games', gameId),
      (snap) => {
        if (!snap.exists()) {
          setError('Game not found');
          setLoading(false);
          return;
        }
        const d = snap.data();
        setGame({
          id: snap.id,
          whiteUid: d.whiteUid,
          blackUid: d.blackUid ?? null,
          whiteDisplayName: d.whiteDisplayName,
          blackDisplayName: d.blackDisplayName ?? null,
          whitePicture: d.whitePicture ?? '',
          blackPicture: d.blackPicture ?? null,
          players: d.players ?? [],
          status: d.status,
          moves: d.moves ?? [],
          result: d.result ?? null,
          createdAt: toMillis(d.createdAt),
          updatedAt: toMillis(d.updatedAt),
        });
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
  }, [gameId]);

  // Use a transaction so the same UCI string can appear multiple times in the
  // moves array (e.g. a rook oscillating between two squares). arrayUnion would
  // silently deduplicate such moves, causing the player to be unable to submit.
  const submitMove = useCallback(
    (move: string) =>
      runTransaction(db, async (txn) => {
        const gameRef = doc(db, 'games', gameId);
        const snap = await txn.get(gameRef);
        if (!snap.exists()) throw new Error('Game not found');
        const current = (snap.data().moves as string[]) ?? [];
        txn.update(gameRef, {
          moves:     [...current, move],
          updatedAt: serverTimestamp(),
        });
      }),
    [gameId],
  );

  const finishGame = useCallback(
    (result: GameResult) =>
      updateDoc(doc(db, 'games', gameId), {
        status: 'finished',
        result,
        updatedAt: serverTimestamp(),
      }),
    [gameId],
  );

  return { game, loading, error, submitMove, finishGame };
}
