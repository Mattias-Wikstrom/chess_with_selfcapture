import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, onSnapshot,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

// --------------------------------------------------------------------------
// Bot roster — ordered by level, matches botPersonalities.ts
// --------------------------------------------------------------------------

interface BotEntry { name: string; level: number }

const BOTS: BotEntry[] = [
  { name: 'Bot Patzer',      level: 1 },
  { name: 'Bot Blunderbuss', level: 1 },
  { name: 'Bot Peasant',     level: 1 },
  { name: 'Bot Bamboozle',   level: 2 },
  { name: 'Bot Desperado',   level: 2 },
  { name: 'Bot PawnStorm',   level: 2 },
  { name: 'Bot Gambit',      level: 3 },
  { name: 'Bot Fork',        level: 3 },
  { name: 'Bot Hedgehog',    level: 3 },
  { name: 'Bot Skewer',      level: 4 },
  { name: 'Bot Fortress',    level: 4 },
  { name: 'Bot Fianchetto',  level: 4 },
  { name: 'Bot Zugzwang',    level: 5 },
  { name: 'Bot NullMove',    level: 5 },
  { name: 'Bot Silicon',     level: 5 },
  { name: 'Bot Enigma',      level: 6 },
  { name: 'Bot Eclipse',     level: 6 },
  { name: 'Bot Tempest',     level: 6 },
  { name: 'Bot Nemesis',     level: 7 },
  { name: 'Bot Leviathan',   level: 7 },
  { name: 'Bot Caissa',      level: 7 },
  { name: 'Bot Sovereign',   level: 8 },
  { name: 'Bot Grandmaster', level: 8 },
  { name: 'Bot Checkmate',   level: 8 },
];

const LEVEL_LABELS: Record<number, string> = {
  1: 'Level 1 · ~1400',
  2: 'Level 2 · ~1600',
  3: 'Level 3 · ~1800',
  4: 'Level 4 · ~2000',
  5: 'Level 5 · ~2200',
  6: 'Level 6 · ~2400',
  7: 'Level 7 · ~2650',
  8: 'Level 8 · Max',
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function botUid(name: string) {
  return `bot_${name.replace(/\s+/g, '_')}`;
}

function botAvatarUrl(name: string) {
  return `/avatars/${name.replace(/\s+/g, '_')}.svg`;
}

let fnInstance: ReturnType<typeof getFunctions> | null = null;
function getFn() {
  if (!fnInstance) fnInstance = getFunctions(app);
  return fnInstance;
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------

export default function AdminPage() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  // Set of UIDs that currently have a presence doc (i.e. are "online")
  const [onlineUids, setOnlineUids] = useState<Set<string>>(new Set());
  // Per-bot loading state while the Cloud Function is in flight
  const [pending, setPending] = useState<Set<string>>(new Set());

  // Redirect non-admins immediately
  useEffect(() => {
    if (!isAdmin) navigate('/', { replace: true });
  }, [isAdmin, navigate]);

  // Live listener on bot presence docs
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'presence'), where('isBot', '==', true));
    return onSnapshot(q, (snap) => {
      setOnlineUids(new Set(snap.docs.map((d) => d.id)));
    });
  }, [isAdmin]);

  const toggle = async (bot: BotEntry) => {
    const uid = botUid(bot.name);
    const goOnline = !onlineUids.has(uid);

    setPending((s) => new Set(s).add(uid));
    try {
      const fn = httpsCallable(getFn(), 'toggleBot');
      await fn({ botName: bot.name, online: goOnline });
    } catch (err) {
      console.error('[AdminPage] toggleBot failed:', err);
      alert(`Failed to ${goOnline ? 'sign in' : 'sign out'} ${bot.name}`);
    } finally {
      setPending((s) => { const n = new Set(s); n.delete(uid); return n; });
    }
  };

  if (!user || !isAdmin) return null;

  // Group bots by level
  const grouped = Array.from({ length: 8 }, (_, i) => ({
    level: i + 1,
    bots:  BOTS.filter((b) => b.level === i + 1),
  }));

  return (
    <div className="admin-page">
      <header className="lobby-header">
        <h1 className="site-title">Bot Management</h1>
        <button className="btn-text" onClick={() => navigate('/')}>← Lobby</button>
      </header>

      <main className="admin-main">
        {grouped.map(({ level, bots }) => (
          <div key={level} className="admin-level-group">
            <h2 className="admin-level-heading">{LEVEL_LABELS[level]}</h2>
            <div className="admin-bot-row">
              {bots.map((bot) => {
                const uid       = botUid(bot.name);
                const isOnline  = onlineUids.has(uid);
                const isLoading = pending.has(uid);
                return (
                  <div key={bot.name} className={`admin-bot-card${isOnline ? ' bot-online' : ''}`}>
                    <img src={botAvatarUrl(bot.name)} alt="" className="admin-bot-avatar" />
                    <span className="admin-bot-name">{bot.name}</span>
                    <span className={`bot-status-dot ${isOnline ? 'online' : 'offline'}`} />
                    <button
                      className={`btn-toggle ${isOnline ? 'toggle-on' : 'toggle-off'}`}
                      onClick={() => void toggle(bot)}
                      disabled={isLoading}
                    >
                      {isLoading ? '…' : isOnline ? 'Sign out' : 'Sign in'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
