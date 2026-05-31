import { useEffect, useState } from 'react';
import {
  collection, doc, setDoc, getDoc, serverTimestamp,
  onSnapshot, query, where, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { OnlineUser } from '../types';

const HEARTBEAT_MS     = 30_000;        // update presence every 30 s
const ONLINE_THRESHOLD = 90_000;        // 90 s without heartbeat → consider offline
const QUERY_WINDOW_MS  = 5 * 60_000;   // Firestore query: last 5 minutes

// --------------------------------------------------------------------------
// Heartbeat — keeps the current user's presence doc up-to-date
// --------------------------------------------------------------------------

/**
 * Call this once per authenticated session (rendered inside RequireAuth).
 * Reads the Firestore user profile so the presence doc reflects the custom
 * display name / avatar rather than the raw Google Auth values.
 */
export function usePresenceHeartbeat(uid: string | null): void {
  useEffect(() => {
    if (!uid) return;

    const presenceRef = doc(db, 'presence', uid);

    const update = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        const u = userSnap.data();
        await setDoc(presenceRef, {
          uid,
          displayName: u?.displayName ?? 'Anonymous',
          photoURL:    u?.photoURL    ?? '',
          isBot:       false,
          level:       0,
          lastSeen:    serverTimestamp(),
        });
      } catch {
        // Best-effort; ignore errors (offline, permission, etc.)
      }
    };

    void update();
    const interval = setInterval(() => void update(), HEARTBEAT_MS);
    const handleUnload = () => void update();
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [uid]);
}

// --------------------------------------------------------------------------
// Online user list — read side
// --------------------------------------------------------------------------

/**
 * Returns a live list of users (human + bot) currently online, excluding myUid.
 *
 * Human:  online if lastSeen within the last 90 s
 * Bot:    online if their presence doc exists (lastSeen is set to far-future
 *         by the admin SDK, so they always pass the Firestore query filter)
 */
export function useOnlineUsers(myUid: string | null): OnlineUser[] {
  const [allDocs, setAllDocs] = useState<OnlineUser[]>([]);
  const [now, setNow]         = useState(Date.now());

  // Tick every 30 s so stale human entries drop off
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!myUid) return;

    // Bots use a far-future lastSeen, so they always satisfy this query.
    // The 5-min window comfortably covers all recent human heartbeats.
    const cutoff = Timestamp.fromMillis(Date.now() - QUERY_WINDOW_MS);
    const q = query(
      collection(db, 'presence'),
      where('lastSeen', '>', cutoff),
    );

    const unsub = onSnapshot(q, (snap) => {
      setAllDocs(
        snap.docs.map((d) => {
          const data = d.data();
          const lastSeenMs =
            data.lastSeen instanceof Timestamp ? data.lastSeen.toMillis() : 0;
          return {
            uid:         data.uid         as string,
            displayName: data.displayName as string,
            photoURL:    data.photoURL    as string,
            isBot:       (data.isBot  as boolean)  ?? false,
            level:       (data.level  as number)   ?? 0,
            // Bots have a far-future lastSeen; normalise to Date.now() so
            // the client-side age filter doesn't accidentally affect them.
            lastSeen:    data.isBot ? Date.now() : lastSeenMs,
          };
        }),
      );
    });

    return unsub;
  }, [myUid]);

  return allDocs
    .filter((u) => {
      if (u.uid === myUid) return false;
      if (u.isBot) return true;               // bots are always "online" once present
      return now - u.lastSeen < ONLINE_THRESHOLD;
    })
    // Bots first (by level), then humans (most recent first)
    .sort((a, b) => {
      if (a.isBot !== b.isBot) return a.isBot ? -1 : 1;
      if (a.isBot && b.isBot)  return a.level - b.level;
      return b.lastSeen - a.lastSeen;
    });
}
