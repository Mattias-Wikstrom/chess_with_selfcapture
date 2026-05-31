import {
  doc, updateDoc, getDoc, arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useInvitations } from '../hooks/useInvitations';

/**
 * Fixed overlay shown anywhere in the app when a pending game invitation
 * arrives. Displays the most recent invite; shows a count badge if several
 * are queued.
 */
export default function InvitationBanner() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const invitations = useInvitations(user?.uid ?? null);

  if (invitations.length === 0) return null;

  const inv = invitations[0]; // newest first

  const handleAccept = async () => {
    if (!user) return;
    try {
      const snap    = await getDoc(doc(db, 'users', user.uid));
      const profile = snap.data();

      // Join the game as black
      await updateDoc(doc(db, 'games', inv.gameId), {
        blackUid:         user.uid,
        blackDisplayName: profile?.displayName ?? user.displayName ?? 'Anonymous',
        blackPicture:     profile?.photoURL    ?? user.photoURL    ?? '',
        players:          arrayUnion(user.uid),
        status:           'active',
        updatedAt:        serverTimestamp(),
      });

      await updateDoc(doc(db, 'invitations', inv.id), { status: 'accepted' });
      navigate(`/game/${inv.gameId}`);
    } catch (err) {
      console.error('[InvitationBanner] accept failed:', err);
      // Game may have been cancelled or already joined — decline gracefully
      await updateDoc(doc(db, 'invitations', inv.id), { status: 'declined' }).catch(() => {});
    }
  };

  const handleDecline = async () => {
    await updateDoc(doc(db, 'invitations', inv.id), { status: 'declined' }).catch(console.error);
  };

  return (
    <div className="invitation-banner">
      <div className="invitation-content">
        {inv.fromPicture ? (
          <img src={inv.fromPicture} alt="" className="chip-avatar" />
        ) : (
          <div className="chip-avatar-placeholder" />
        )}
        <span>
          <strong>{inv.fromDisplayName}</strong> invited you to a game
        </span>
        {invitations.length > 1 && (
          <span className="invitation-count">+{invitations.length - 1} more</span>
        )}
      </div>
      <div className="invitation-actions">
        <button className="btn-accept"  onClick={handleAccept}>Accept</button>
        <button className="btn-decline" onClick={handleDecline}>Decline</button>
      </div>
    </div>
  );
}
