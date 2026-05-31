import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import ChessBoard from '../components/ChessBoard';
import GameChat from '../components/GameChat';
import { useCloudEngine } from '../hooks/useCloudEngine';
import { useOnlineGame } from '../hooks/useOnlineGame';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';

// --------------------------------------------------------------------------
// Player chip
// --------------------------------------------------------------------------

interface PlayerChipProps {
  name: string | null;
  picture: string | null;
  color: 'w' | 'b';
  isActive: boolean;
}

function PlayerChip({ name, picture, color, isActive }: PlayerChipProps) {
  return (
    <div className={`game-player-chip${isActive ? ' active-player' : ''}`}>
      {picture ? (
        <img src={picture} alt="" className="chip-avatar" />
      ) : (
        <div className="chip-avatar-placeholder" />
      )}
      <span>{name ?? (color === 'b' ? 'Waiting for opponent…' : 'Unknown')}</span>
      <span
        className={`color-dot ${color === 'w' ? 'white-dot' : 'black-dot'}`}
        title={color === 'w' ? 'White' : 'Black'}
      >●</span>
    </div>
  );
}

// --------------------------------------------------------------------------
// Main component
// --------------------------------------------------------------------------

export default function OnlineGamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { game, loading, error, submitMove, finishGame } = useOnlineGame(gameId!);

  // Board state from the cloud engine (modified Stockfish — supports self-capture)
  const { fen, legalMoves, lastMove, localStatus, turn, gameResult, engineLoading, engineError } =
    useCloudEngine(game?.moves ?? []);

  // Firestore user profile (for the chat display name / avatar)
  const [myProfile, setMyProfile] = useState<{ displayName?: string; photoURL?: string } | null>(null);
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (snap.exists()) setMyProfile(snap.data() as { displayName?: string; photoURL?: string });
    });
  }, [user]);

  // --------------------------------------------------------------------------
  // Write game result to Firestore when the local position reaches game over
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (game?.status !== 'active') return;
    if (localStatus === 'playing' || engineLoading) return;
    finishGame(gameResult ?? 'draw');
  }, [localStatus, engineLoading, gameResult, game?.status, finishGame]);

  // --------------------------------------------------------------------------
  // Derived
  // --------------------------------------------------------------------------

  const myColor =
    game?.whiteUid === user?.uid ? 'w'
    : game?.blackUid === user?.uid ? 'b'
    : null;

  const isMyTurn =
    game?.status === 'active' &&
    localStatus === 'playing' &&
    myColor !== null &&
    turn === myColor;

  // --------------------------------------------------------------------------
  // Move handler — writes to Firestore
  // --------------------------------------------------------------------------

  const handleMove = useCallback(
    (uciMove: string) => {
      if (!isMyTurn) return;
      submitMove(uciMove);
    },
    [isMyTurn, submitMove],
  );

  // --------------------------------------------------------------------------
  // Join game (when arriving via a direct share link)
  // --------------------------------------------------------------------------

  const handleJoin = async () => {
    if (!user || !game) return;
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
  };

  // --------------------------------------------------------------------------
  // Status message
  // --------------------------------------------------------------------------

  let statusMsg = '';
  if (game) {
    if (game.status === 'waiting') {
      statusMsg = 'Waiting for opponent to join…';
    } else if (game.status === 'finished') {
      statusMsg =
        game.result === 'draw' ? 'Draw!'
        : game.result === 'white' ? `${game.whiteDisplayName} wins!`
        : game.result === 'black' ? `${game.blackDisplayName} wins!`
        : 'Game over';
    } else if (localStatus === 'checkmate') {
      const winner = turn === 'w' ? game.blackDisplayName : game.whiteDisplayName;
      statusMsg = `${winner} wins by checkmate!`;
    } else if (localStatus === 'stalemate') {
      statusMsg = 'Stalemate — draw!';
    } else if (localStatus === 'draw') {
      statusMsg = 'Draw!';
    } else if (isMyTurn) {
      statusMsg = 'Your turn';
    } else {
      const opp = myColor === 'w' ? game.blackDisplayName : game.whiteDisplayName;
      statusMsg = `${opp ?? 'Opponent'}'s turn`;
    }
  }

  const isGameOver = game?.status === 'finished' || localStatus !== 'playing';
  const flipped = myColor === 'b';

  // Top = opponent, bottom = me (or white/black for spectators)
  const topPlayer = flipped
    ? { name: game?.whiteDisplayName ?? null, pic: game?.whitePicture ?? null, color: 'w' as const }
    : { name: game?.blackDisplayName ?? null, pic: game?.blackPicture ?? null, color: 'b' as const };

  const bottomPlayer = flipped
    ? { name: game?.blackDisplayName ?? null, pic: game?.blackPicture ?? null, color: 'b' as const }
    : { name: game?.whiteDisplayName ?? null, pic: game?.whitePicture ?? null, color: 'w' as const };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  if (loading) {
    return <div className="app"><span className="loading">Loading game…</span></div>;
  }

  if (error || !game) {
    return (
      <div className="app">
        <p className="gameover">Game not found.</p>
        <button onClick={() => navigate('/')}>Back to Lobby</button>
      </div>
    );
  }

  const canJoin = myColor === null && game.status === 'waiting' && user !== null;

  return (
    <div className="app">
      {/* Opponent (top of board) */}
      <div className="game-players">
        <PlayerChip
          name={topPlayer.name}
          picture={topPlayer.pic}
          color={topPlayer.color}
          isActive={!isGameOver && turn === topPlayer.color}
        />
      </div>

      {/* Status bar */}
      <div className="status-row">
        {engineLoading && <span className="loading">Engine thinking… </span>}
        {engineError && <span className="gameover">Engine error — reload to retry </span>}
        {!engineLoading && !engineError && (
          <span className={isGameOver ? 'gameover' : isMyTurn ? 'thinking' : ''}>
            {statusMsg}
          </span>
        )}
        {!engineLoading && game.status === 'waiting' && (
          <span className="share-link">
            {' · '}Share:{' '}
            <a href={window.location.href} className="share-url">
              {window.location.href}
            </a>
          </span>
        )}
      </div>

      {canJoin && (
        <button className="btn-primary" onClick={handleJoin}>
          Join this game as Black
        </button>
      )}

      <ChessBoard
        fen={fen}
        legalMoves={isMyTurn && game.status === 'active' ? legalMoves : new Map()}
        lastMove={lastMove}
        onMove={handleMove}
        flipped={flipped}
      />

      {/* Local player (bottom of board) */}
      <div className="game-players">
        <PlayerChip
          name={bottomPlayer.name}
          picture={bottomPlayer.pic}
          color={bottomPlayer.color}
          isActive={!isGameOver && turn === bottomPlayer.color}
        />
      </div>

      <div className="controls" style={{ width: 'min(80vmin, 560px)' }}>
        <div className="control-row">
          <button onClick={() => navigate('/')}>← Back to Lobby</button>
        </div>
      </div>

      {/* Chat — available in all active or finished games */}
      {user && game && (
        <GameChat
          game={game}
          myUid={user.uid}
          myDisplayName={myProfile?.displayName ?? user.displayName ?? 'Anonymous'}
          myPhotoURL={myProfile?.photoURL ?? user.photoURL ?? ''}
          isBot={
            game.whiteUid.startsWith('bot_') ||
            (game.blackUid?.startsWith('bot_') ?? false)
          }
          botName={
            game.whiteUid.startsWith('bot_')
              ? game.whiteDisplayName
              : game.blackUid?.startsWith('bot_')
                ? (game.blackDisplayName ?? '')
                : ''
          }
          botPicture={
            game.whiteUid.startsWith('bot_')
              ? game.whitePicture
              : (game.blackPicture ?? '')
          }
          moves={game.moves}
          myColor={myColor ?? 'w'}
          fen={fen}
        />
      )}
    </div>
  );
}
