import { useEffect, useState } from 'react';
import {
  collection, query, where, onSnapshot, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Invitation } from '../types';

/**
 * Returns a live list of pending invitations addressed to `myUid`,
 * newest first.
 */
export function useInvitations(myUid: string | null): Invitation[] {
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  useEffect(() => {
    if (!myUid) return;

    const q = query(
      collection(db, 'invitations'),
      where('toUid',  '==', myUid),
      where('status', '==', 'pending'),
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: Invitation[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id:              d.id,
            fromUid:         data.fromUid         as string,
            fromDisplayName: data.fromDisplayName as string,
            fromPicture:     data.fromPicture     as string,
            toUid:           data.toUid           as string,
            gameId:          data.gameId          as string,
            status:          data.status          as Invitation['status'],
            createdAt:       data.createdAt instanceof Timestamp
              ? data.createdAt.toMillis()
              : 0,
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt);
      setInvitations(list);
    });

    return unsub;
  }, [myUid]);

  return invitations;
}
