import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  arrayUnion, serverTimestamp, doc, getDoc, Timestamp, type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineUsers } from '../hooks/usePresence';
import type { OnlineGame, OnlineUser } from '../types';

function toMillis(v: unknown): number {
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === 'number') return v;
  return 0;
}

function timeAgo(ms: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function snapToGame(d: DocumentData, id: string): OnlineGame {
  return {
    id,
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
  };
}

// --------------------------------------------------------------------------
// Online user chip
// --------------------------------------------------------------------------

interface OnlineUserCardProps {
  onlineUser: OnlineUser;
  onInvite: () => void;
}

function OnlineUserCard({ onlineUser, onInvite }: OnlineUserCardProps) {
  return (
    <div className={`online-user-card${onlineUser.isBot ? ' bot-card' : ''}`}>
      <div className="player-chip">
        {onlineUser.photoURL ? (
          <img src={onlineUser.photoURL} alt="" className="chip-avatar" />
        ) : (
          <div className={`chip-avatar-placeholder${onlineUser.isBot ? ' bot-avatar' : ''}`}>
            {onlineUser.isBot && <span className="bot-avatar-icon">♟</span>}
          </div>
        )}
        <span>{onlineUser.displayName}</span>
        {onlineUser.isBot && (
          <span className="bot-level-badge" title={`Strength level ${onlineUser.level}`}>
            Lv{onlineUser.level}
          </span>
        )}
        <span className="online-dot" title="Online" />
      </div>
      <button className="btn-invite" onClick={onInvite}>Invite</button>
    </div>
  );
}

// --------------------------------------------------------------------------
// Game card
// --------------------------------------------------------------------------

interface GameCardProps {
  game: OnlineGame;
  myUid: string;
  onJoin?: () => void;
}

function GameCard({ game, myUid, onJoin }: GameCardProps) {
  const navigate = useNavigate();
  const amWhite = game.whiteUid === myUid;
  const isMyGame = game.players.includes(myUid);

  const isMyTurn =
    game.status === 'active' &&
    ((game.moves.length % 2 === 0 && amWhite) ||
      (game.moves.length % 2 === 1 && !amWhite));

  const statusLabel =
    game.status === 'waiting'
      ? 'Waiting'
      : game.status === 'finished'
        ? game.result === 'draw'
          ? 'Draw'
          : game.result === 'white'
            ? `${game.whiteDisplayName} won`
            : `${game.blackDisplayName} won`
        : isMyTurn
          ? 'Your turn'
          : "Opponent's turn";

  return (
    <div
      className={`game-card${isMyTurn ? ' your-turn' : ''}`}
      onClick={() => isMyGame && navigate(`/game/${game.id}`)}
      style={{ cursor: isMyGame ? 'pointer' : 'default' }}
    >
      <div className="game-card-players">
        <div className="player-chip">
          {game.whitePicture && (
            <img src={game.whitePicture} alt="" className="chip-avatar" />
          )}
          <span>{game.whiteDisplayName}</span>
          <span className="color-dot white-dot" title="White">●</span>
        </div>
        <span className="vs">vs</span>
        {game.blackDisplayName ? (
          <div className="player-chip">
            {game.blackPicture && (
              <img src={game.blackPicture} alt="" className="chip-avatar" />
            )}
            <span>{game.blackDisplayName}</span>
            <span className="color-dot black-dot" title="Black">●</span>
          </div>
        ) : (
          <span className="waiting-text">Waiting for opponent…</span>
        )}
      </div>
      <div className="game-card-meta">
        <span className={`game-status-badge ${game.status}${isMyTurn ? ' my-turn' : ''}`}>
          {statusLabel}
        </span>
        <span className="game-time">{timeAgo(game.updatedAt || game.createdAt)}</span>
      </div>
      {onJoin && (
        <button
          className="btn-join"
          onClick={(e) => { e.stopPropagation(); onJoin(); }}
        >
          Join
        </button>
      )}
    </div>
  );
}

export default function LobbyPage() {
  const { user, signOutUser, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [myGames, setMyGames] = useState<OnlineGame[]>([]);
  const [openGames, setOpenGames] = useState<OnlineGame[]>([]);
  const onlineUsers = useOnlineUsers(user?.uid ?? null);

  useEffect(() => {
    if (!user) return;

    const unsubMy = onSnapshot(
      query(collection(db, 'games'), where('players', 'array-contains', user.uid)),
      (snap) => {
        const games = snap.docs
          .map((d) => snapToGame(d.data()!, d.id))
          .sort((a, b) => b.updatedAt - a.updatedAt);
        setMyGames(games);
      },
    );

    const unsubOpen = onSnapshot(
      query(collection(db, 'games'), where('status', '==', 'waiting')),
      (snap) => {
        const games = snap.docs
          .map((d) => snapToGame(d.data()!, d.id))
          .filter((g) => g.whiteUid !== user.uid)
          .sort((a, b) => b.createdAt - a.createdAt);
        setOpenGames(games);
      },
    );

    return () => { unsubMy(); unsubOpen(); };
  }, [user]);

  const handleNewGame = async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, 'users', user.uid));
    const profile = snap.data();
    const ref = await addDoc(collection(db, 'games'), {
      whiteUid: user.uid,
      blackUid: null,
      whiteDisplayName: profile?.displayName ?? user.displayName ?? 'Anonymous',
      blackDisplayName: null,
      whitePicture: profile?.photoURL ?? user.photoURL ?? '',
      blackPicture: null,
      players: [user.uid],
      status: 'waiting',
      moves: [],
      result: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    navigate(`/game/${ref.id}`);
  };

  const handleInvite = async (target: OnlineUser) => {
    if (!user) return;
    const snap    = await getDoc(doc(db, 'users', user.uid));
    const profile = snap.data();

    if (target.isBot) {
      // Bots are always ready — create the game active immediately, no invitation needed.
      // Human plays White, bot plays Black.
      const gameRef = await addDoc(collection(db, 'games'), {
        whiteUid:         user.uid,
        blackUid:         target.uid,
        whiteDisplayName: profile?.displayName ?? user.displayName ?? 'Anonymous',
        blackDisplayName: target.displayName,
        whitePicture:     profile?.photoURL    ?? user.photoURL    ?? '',
        blackPicture:     target.photoURL      ?? '',
        players:          [user.uid, target.uid],
        status:           'active',
        moves:            [],
        result:           null,
        createdAt:        serverTimestamp(),
        updatedAt:        serverTimestamp(),
      });
      navigate(`/game/${gameRef.id}`);
      return;
    }

    // Human opponent: create a waiting game and send an invitation
    const gameRef = await addDoc(collection(db, 'games'), {
      whiteUid:         user.uid,
      blackUid:         null,
      whiteDisplayName: profile?.displayName ?? user.displayName ?? 'Anonymous',
      blackDisplayName: null,
      whitePicture:     profile?.photoURL    ?? user.photoURL    ?? '',
      blackPicture:     null,
      players:          [user.uid],
      status:           'waiting',
      moves:            [],
      result:           null,
      createdAt:        serverTimestamp(),
      updatedAt:        serverTimestamp(),
    });

    await addDoc(collection(db, 'invitations'), {
      fromUid:         user.uid,
      fromDisplayName: profile?.displayName ?? user.displayName ?? 'Anonymous',
      fromPicture:     profile?.photoURL    ?? user.photoURL    ?? '',
      toUid:           target.uid,
      gameId:          gameRef.id,
      status:          'pending',
      createdAt:       serverTimestamp(),
    });

    navigate(`/game/${gameRef.id}`);
  };

  const handleJoin = async (game: OnlineGame) => {
    if (!user) return;
    const snap = await getDoc(doc(db, 'users', user.uid));
    const profile = snap.data();
    await updateDoc(doc(db, 'games', game.id), {
      blackUid: user.uid,
      blackDisplayName: profile?.displayName ?? user.displayName ?? 'Anonymous',
      blackPicture: profile?.photoURL ?? user.photoURL ?? '',
      players: arrayUnion(user.uid),
      status: 'active',
      updatedAt: serverTimestamp(),
    });
    navigate(`/game/${game.id}`);
  };

  const activeGames = myGames.filter((g) => g.status !== 'finished');
  const finishedGames = myGames.filter((g) => g.status === 'finished');

  return (
    <div className="lobby-page">
      <header className="lobby-header">
        <h1 className="site-title">Self-Capture Chess</h1>
        <div className="header-user">
          {user?.photoURL && (
            <img
              src={user.photoURL}
              alt={user.displayName ?? ''}
              className="header-avatar"
              onClick={() => navigate('/profile')}
            />
          )}
          <span className="header-name">{user?.displayName}</span>
          <button className="btn-text" onClick={() => navigate('/profile')}>Profile</button>
          {isAdmin && (
            <button className="btn-text" onClick={() => navigate('/admin')}>Bots</button>
          )}
          <button className="btn-text" onClick={signOutUser}>Sign out</button>
        </div>
      </header>

      <main className="lobby-main">
        <div className="lobby-section">
          <button className="btn-primary" onClick={handleNewGame}>+ New Game</button>
        </div>

        {onlineUsers.length > 0 && (
          <div className="lobby-section">
            <h2>Online Now</h2>
            <div className="online-users-list">
              {onlineUsers.map((u) => (
                <OnlineUserCard
                  key={u.uid}
                  onlineUser={u}
                  onInvite={() => handleInvite(u)}
                />
              ))}
            </div>
          </div>
        )}

        {activeGames.length > 0 && (
          <div className="lobby-section">
            <h2>My Games</h2>
            <div className="game-list">
              {activeGames.map((g) => (
                <GameCard key={g.id} game={g} myUid={user!.uid} />
              ))}
            </div>
          </div>
        )}

        {openGames.length > 0 && (
          <div className="lobby-section">
            <h2>Open Games</h2>
            <div className="game-list">
              {openGames.map((g) => (
                <GameCard key={g.id} game={g} myUid={user!.uid} onJoin={() => handleJoin(g)} />
              ))}
            </div>
          </div>
        )}

        {finishedGames.length > 0 && (
          <div className="lobby-section">
            <h2>Recent Games</h2>
            <div className="game-list">
              {finishedGames.slice(0, 5).map((g) => (
                <GameCard key={g.id} game={g} myUid={user!.uid} />
              ))}
            </div>
          </div>
        )}

        {myGames.length === 0 && openGames.length === 0 && (
          <p className="lobby-empty">
            No games yet. Create a new game or wait for someone to post one!
          </p>
        )}
      </main>
    </div>
  );
}
